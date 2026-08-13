import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";

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

const findOpenPort = (preferredPort) => new Promise((resolvePort) => {
  const server = net.createServer();
  server.unref();
  server.on("error", () => {
    const retry = net.createServer();
    retry.unref();
    retry.listen(0, "127.0.0.1", () => {
      const address = retry.address();
      retry.close(() => resolvePort(typeof address === "object" && address ? address.port : preferredPort));
    });
  });
  server.listen(preferredPort, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolvePort(typeof address === "object" && address ? address.port : preferredPort));
  });
});

if (process.platform === "win32" && javaBinPath) {
  writeFileSync(resolve(firebaseBinDir, "java.cmd"), `@"${resolve(javaBinPath, "java.exe")}" %*\r\n`, "utf8");
}

const firestorePort = await findOpenPort(8080);
const authPort = await findOpenPort(9099);
const tempFirebaseConfigPath = resolve(configHome, "firebase.phase3c.test.json");
const firebaseConfig = JSON.parse(readFileSync(resolve(workspaceRoot, "firebase.json"), "utf8"));
firebaseConfig.firestore = { ...(firebaseConfig.firestore || {}), rules: resolve(workspaceRoot, "firestore.v2.rules") };
firebaseConfig.emulators = firebaseConfig.emulators || {};
firebaseConfig.emulators.firestore = { ...(firebaseConfig.emulators.firestore || {}), host: "127.0.0.1", port: firestorePort };
firebaseConfig.emulators.auth = { ...(firebaseConfig.emulators.auth || {}), host: "127.0.0.1", port: authPort };
writeFileSync(tempFirebaseConfigPath, JSON.stringify(firebaseConfig, null, 2), "utf8");

const basePath = process.env.PATH ?? process.env.Path ?? "";
const runnerPath = [firebaseBinDir, javaBinPath, basePath].filter(Boolean).join(delimiter);
const env = {
  ...process.env,
  CI: "1",
  XDG_CONFIG_HOME: configHome,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
  GCLOUD_PROJECT: "demo-budget-react-v2",
  PATH: runnerPath,
  Path: runnerPath,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
};

const command = "node scripts/phase3c-browser-qa.mjs";
const result = process.platform === "win32"
  ? spawnSync("powershell.exe", ["-NoProfile", "-Command", `$testCommand = '${command}'; firebase emulators:exec --config "${tempFirebaseConfigPath}" --project demo-budget-react-v2 --only "firestore,auth" -- $testCommand`], { cwd: workspaceRoot, stdio: "inherit", env })
  : spawnSync("firebase", ["emulators:exec", "--config", tempFirebaseConfigPath, "--project", "demo-budget-react-v2", "--only", "firestore,auth", "--", command], { cwd: workspaceRoot, stdio: "inherit", env });

process.exit(result.status ?? 1);
