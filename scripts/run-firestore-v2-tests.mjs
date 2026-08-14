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

const basePath = process.env.PATH ?? process.env.Path ?? "";
const runnerPath = [firebaseBinDir, javaBinPath, basePath].filter(Boolean).join(delimiter);
const command = "node --test --test-concurrency=1 tests/firestore.v2.rules.test.js tests/firestore.v2.repository.test.js tests/firestore.v2.ui-runtime.test.js tests/firestore.v2.migration.test.js";

// Rules-source parity guard: firebase.json deploys firestore.rules to production
// (the combined legacy + v2 ruleset), never firestore.v2.rules. Running the V2
// security/atomicity suite against firestore.v2.rules alone would prove nothing
// about what's actually deployed. So firestore.rules is the PRIMARY, CI-blocking
// run - the suite must pass against the exact file `firebase deploy` would ship.
// firestore.v2.rules is kept only as an emulator-only reference file; it is run
// as a SECOND pass with the same tests so any drift between the two rulesets
// (a behavior allowed/denied differently) shows up as a failing parity run
// instead of silently diverging from what's actually enforced in production.
const runSuiteAgainst = async (rulesFile, { label }) => {
  const firestorePort = await findOpenPort(8080);
  const tempFirebaseConfigPath = resolve(configHome, `firebase.v2.${label}.test.json`);
  const firebaseConfig = JSON.parse(readFileSync(resolve(workspaceRoot, "firebase.json"), "utf8"));
  firebaseConfig.firestore = { ...(firebaseConfig.firestore || {}), rules: resolve(workspaceRoot, rulesFile) };
  firebaseConfig.emulators = firebaseConfig.emulators || {};
  firebaseConfig.emulators.firestore = { ...(firebaseConfig.emulators.firestore || {}), host: "127.0.0.1", port: firestorePort };
  writeFileSync(tempFirebaseConfigPath, JSON.stringify(firebaseConfig, null, 2), "utf8");

  const env = {
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
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };

  console.log(`\n=== Running V2 Firestore suite against ${rulesFile} (${label}) ===\n`);
  const result = process.platform === "win32"
    ? spawnSync("powershell.exe", ["-NoProfile", "-Command", `$testCommand = '${command}'; firebase emulators:exec --config "${tempFirebaseConfigPath}" --project demo-budget-react-v2 --only firestore -- $testCommand`], { cwd: workspaceRoot, stdio: "inherit", env })
    : spawnSync("firebase", ["emulators:exec", "--config", tempFirebaseConfigPath, "--project", "demo-budget-react-v2", "--only", "firestore", "--", command], { cwd: workspaceRoot, stdio: "inherit", env });
  return result.status ?? 1;
};

const productionStatus = await runSuiteAgainst("firestore.rules", { label: "production-parity" });
if (productionStatus !== 0) {
  console.error("\nFAILED: V2 security/atomicity suite failed against the PRODUCTION firestore.rules file. This is the authoritative check - fix firestore.rules directly.");
  process.exit(productionStatus);
}

const referenceStatus = await runSuiteAgainst("firestore.v2.rules", { label: "reference" });
if (referenceStatus !== 0) {
  console.error("\nFAILED: firestore.rules and firestore.v2.rules have drifted - the same test suite passes against production firestore.rules but fails against the firestore.v2.rules reference file. Bring firestore.v2.rules back in sync (or remove it if it's no longer needed as a reference).");
  process.exit(referenceStatus);
}

console.log("\nRules parity guard: PASS - identical V2 security/atomicity suite passed against both firestore.rules (production, authoritative) and firestore.v2.rules (reference). No drift detected.\n");
process.exit(0);
