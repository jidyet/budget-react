import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { spawnSync } from "node:child_process";

// Long-running local dev emulators for TrackToZero V2 "local beta" mode -
// distinct from scripts/run-firestore-v2-tests.mjs, which starts short-lived,
// dynamically-ported emulators for automated test runs and exits. This one
// stays up on FIXED ports (matching .env.v2-local) until you Ctrl+C it, for
// interactive local development: `npm run emulators:v2` in one terminal,
// `npm run dev:v2-local` in another.
//
// Always uses firestore.rules (the exact file firebase.json deploys to
// production) - never an allow-all fallback - so local behavior matches what
// will actually be enforced once deployed.

const workspaceRoot = resolve(process.cwd());
const configHome = resolve(workspaceRoot, ".firebase-config-v2");
const firebaseBinDir = resolve(workspaceRoot, ".firebase-bin-v2");
const javaHome = process.env.JAVA_HOME || [
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.9.10-hotspot",
  "C:\\Program Files\\Android\\Android Studio1\\jbr",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.15.6-hotspot",
].find((candidate) => existsSync(candidate));
const javaBinPath = javaHome ? resolve(javaHome, "bin") : undefined;
mkdirSync(configHome, { recursive: true });
mkdirSync(firebaseBinDir, { recursive: true });

if (process.platform === "win32" && javaBinPath) {
  writeFileSync(resolve(firebaseBinDir, "java.cmd"), `@"${resolve(javaBinPath, "java.exe")}" %*\r\n`, "utf8");
}

const FIRESTORE_PORT = 8090;
const AUTH_PORT = 9199;

const configPath = resolve(configHome, "firebase.v2-local-beta.json");
const baseConfig = JSON.parse(readFileSync(resolve(workspaceRoot, "firebase.json"), "utf8"));
const config = {
  ...baseConfig,
  firestore: { rules: resolve(workspaceRoot, "firestore.rules") },
  emulators: {
    firestore: { port: FIRESTORE_PORT },
    auth: { port: AUTH_PORT },
    ui: { enabled: false },
    singleProjectMode: true,
  },
};
writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

console.log(`TrackToZero V2 local emulators starting on fixed ports (firestore.rules loaded from ${resolve(workspaceRoot, "firestore.rules")}):`);
console.log(`  Firestore: 127.0.0.1:${FIRESTORE_PORT}`);
console.log(`  Auth:      127.0.0.1:${AUTH_PORT}`);
console.log("Starts empty every time - no seed users/workspaces are created automatically.");
console.log("Ctrl+C to stop.\n");

const basePath = process.env.PATH ?? process.env.Path ?? "";
const runnerPath = [firebaseBinDir, javaBinPath, basePath].filter(Boolean).join(delimiter);
const env = {
  ...process.env,
  XDG_CONFIG_HOME: configHome,
  PATH: runnerPath,
  Path: runnerPath,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
};

const command = `emulators:start --config "${configPath}" --project demo-budget-react-v2 --only firestore,auth`;
const result = process.platform === "win32"
  ? spawnSync("powershell.exe", ["-NoProfile", "-Command", `firebase ${command}`], { cwd: workspaceRoot, stdio: "inherit", env })
  : spawnSync("firebase", command.split(" "), { cwd: workspaceRoot, stdio: "inherit", env });

process.exit(result.status ?? 1);
