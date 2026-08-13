import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";

const workspaceRoot = resolve(process.cwd());
const configHome = resolve(workspaceRoot, ".firebase-config");
const firebaseBinDir = resolve(workspaceRoot, ".firebase-bin");
const preferredJavaHomes = [
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.9.10-hotspot",
  "C:\\Program Files\\Android\\Android Studio1\\jbr",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.15.6-hotspot",
];
const javaHome =
  process.env.JAVA_HOME ||
  preferredJavaHomes.find((candidate) => existsSync(candidate));
const javaBinPath = javaHome ? resolve(javaHome, "bin") : undefined;

mkdirSync(configHome, { recursive: true });
mkdirSync(firebaseBinDir, { recursive: true });

const findOpenPort = (preferredPort) => new Promise((resolvePort) => {
  const server = net.createServer();
  server.unref();
  server.on("error", () => {
    const retry = net.createServer();
    retry.unref();
    retry.on("error", () => resolvePort(preferredPort));
    retry.listen(0, "127.0.0.1", () => {
      const address = retry.address();
      const port = typeof address === "object" && address ? address.port : preferredPort;
      retry.close(() => resolvePort(port));
    });
  });
  server.listen(preferredPort, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : preferredPort;
    server.close(() => resolvePort(port));
  });
});

if (process.platform === "win32" && javaBinPath) {
  const javaShim = resolve(firebaseBinDir, "java.cmd");
  const javaExecutable = resolve(javaBinPath, "java.exe");
  writeFileSync(javaShim, `@"${javaExecutable}" %*\r\n`, "utf8");
}

const testCommand = "node --test tests/firestore.rules.test.js";
const firestorePort = await findOpenPort(8080);
const firebaseConfigPath = resolve(workspaceRoot, "firebase.json");
const tempFirebaseConfigPath = resolve(configHome, "firebase.test.json");
const firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, "utf8"));
firebaseConfig.emulators = firebaseConfig.emulators || {};
firebaseConfig.firestore = {
  ...(firebaseConfig.firestore || {}),
  rules: resolve(workspaceRoot, "firestore.rules"),
};
firebaseConfig.emulators.firestore = {
  ...(firebaseConfig.emulators.firestore || {}),
  host: "127.0.0.1",
  port: firestorePort,
};
writeFileSync(tempFirebaseConfigPath, JSON.stringify(firebaseConfig, null, 2), "utf8");

const basePath = process.env.PATH ?? process.env.Path ?? "";
const runnerPath = [firebaseBinDir, javaBinPath, basePath].filter(Boolean).join(delimiter);

const sanitizedEnv = {
  CI: "1",
  XDG_CONFIG_HOME: configHome,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
  PATH: runnerPath,
  Path: runnerPath,
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
  ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
  ...(process.env.TMP ? { TMP: process.env.TMP } : {}),
  ...(process.env.USERPROFILE ? { USERPROFILE: process.env.USERPROFILE } : {}),
  ...(process.env.COMSPEC ? { COMSPEC: process.env.COMSPEC } : {}),
  ...(process.env.PATHEXT ? { PATHEXT: process.env.PATHEXT } : {}),
  ...(process.env.PSModulePath ? { PSModulePath: process.env.PSModulePath } : {}),
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
};

const env = {
  ...sanitizedEnv,
};

const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$testCommand = '${testCommand.replace(/'/g, "''")}'; firebase emulators:exec --config "${tempFirebaseConfigPath}" --project demo-budget-react --only firestore -- $testCommand`,
        ],
        {
          cwd: workspaceRoot,
          stdio: "inherit",
          env,
        }
      )
    : spawnSync(
        "firebase",
        [
          "emulators:exec",
          "--config",
          tempFirebaseConfigPath,
          "--project",
          "demo-budget-react",
          "--only",
          "firestore",
          "--",
          testCommand,
        ],
        {
          cwd: workspaceRoot,
          stdio: "inherit",
          env,
        }
      );

if (result.error) {
  throw result.error;
}

if ((result.status ?? 1) !== 0) {
  console.error("Firestore rules test runner failed.");
  console.error(`Status: ${result.status ?? "unknown"}`);
  console.error(`Signal: ${result.signal ?? "none"}`);
}

process.exit(result.status ?? 1);
