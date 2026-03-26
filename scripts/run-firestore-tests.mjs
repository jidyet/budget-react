import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = resolve(process.cwd());
const configHome = resolve(workspaceRoot, ".firebase-config");
const firebaseBinDir = resolve(workspaceRoot, ".firebase-bin");
const preferredJavaHomes = [
  "C:\\Program Files\\Android\\Android Studio1\\jbr",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.15.6-hotspot",
];
const javaHome =
  process.env.JAVA_HOME ||
  preferredJavaHomes.find((candidate) => existsSync(candidate));
const javaBinPath = javaHome ? resolve(javaHome, "bin") : undefined;

mkdirSync(configHome, { recursive: true });
mkdirSync(firebaseBinDir, { recursive: true });

if (process.platform === "win32" && javaBinPath) {
  const javaShim = resolve(firebaseBinDir, "java.cmd");
  const javaExecutable = resolve(javaBinPath, "java.exe");
  writeFileSync(javaShim, `@"${javaExecutable}" %*\r\n`, "utf8");
}

const testCommand = "node --test tests/firestore.rules.test.js";
const env = {
  ...process.env,
  CI: "1",
  XDG_CONFIG_HOME: configHome,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  PATH: `${firebaseBinDir};${javaBinPath ? `${javaBinPath};` : ""}${process.env.PATH ?? ""}`,
};

const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$testCommand = '${testCommand.replace(/'/g, "''")}'; firebase emulators:exec --project demo-budget-react --only firestore -- $testCommand`,
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
