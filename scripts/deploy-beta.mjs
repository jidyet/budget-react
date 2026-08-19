import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// BETA-3: the ONLY script in this repo allowed to deploy
// firestore.beta.rules - never firestore.rules (production's file, what
// `firebase deploy` ships to budgetapp-c9306 by default). Deploys
// EXCLUSIVELY to the `beta` alias (tracktozero-beta), never to `default`
// (budgetapp-c9306) or any project id passed on the command line - there
// is no --project flag read here at all, deliberately, so this script
// cannot be pointed anywhere else without editing its own source.
//
// Usage: node scripts/deploy-beta.mjs [rules|hosting|indexes|all]
// Defaults to "all" (rules + indexes + hosting) if no target is given.

const workspaceRoot = resolve(process.cwd());
const target = process.argv[2] || "all";
if (!["rules", "hosting", "indexes", "all"].includes(target)) {
  console.error(`Unknown deploy target "${target}". Expected one of: rules, hosting, indexes, all.`);
  process.exit(1);
}

// ── Gate 1: explicit project-id verification, BEFORE anything else runs ──
// This reads .firebaserc directly rather than trusting a CLI flag, so a
// stale/tampered/renamed alias fails loudly here instead of silently
// deploying to the wrong project.
const firebaseRcPath = resolve(workspaceRoot, ".firebaserc");
if (!existsSync(firebaseRcPath)) {
  console.error("FATAL: .firebaserc not found - cannot verify the `beta` project alias. Refusing to deploy.");
  process.exit(1);
}
const firebaseRc = JSON.parse(readFileSync(firebaseRcPath, "utf8"));
const betaProjectId = firebaseRc.projects?.beta;
const defaultProjectId = firebaseRc.projects?.default;
const EXPECTED_BETA_PROJECT_ID = "tracktozero-beta";
const EXPECTED_PRODUCTION_PROJECT_ID = "budgetapp-c9306";

if (betaProjectId !== EXPECTED_BETA_PROJECT_ID) {
  console.error(`FATAL: .firebaserc's "beta" alias resolves to "${betaProjectId}", not the expected "${EXPECTED_BETA_PROJECT_ID}". Refusing to deploy - this is exactly the kind of drift this check exists to catch.`);
  process.exit(1);
}
if (defaultProjectId !== EXPECTED_PRODUCTION_PROJECT_ID) {
  console.error(`FATAL: .firebaserc's "default" alias resolves to "${defaultProjectId}", not the expected "${EXPECTED_PRODUCTION_PROJECT_ID}". Refusing to deploy - if production's alias has moved, "beta" may have moved with it.`);
  process.exit(1);
}
if (betaProjectId === defaultProjectId) {
  console.error("FATAL: the \"beta\" and \"default\" aliases resolve to the SAME project id. Refusing to deploy under any circumstances - this would mean a beta-only deploy could land on production.");
  process.exit(1);
}
console.log(`Verified: .firebaserc "beta" -> ${betaProjectId} (distinct from "default" -> ${defaultProjectId}).`);

// ── Gate 2: firestore.beta.rules must exist and must still be an
// isolated superset of firestore.rules (never the other way around, and
// never identical - identical would mean the beta-only allowlist gate
// was accidentally lost). This is a cheap sanity check, not a substitute
// for the emulator test suite (npm run test:firestore:beta), which must
// still be run and pass before this script is ever invoked.
const rulesPath = resolve(workspaceRoot, "firestore.rules");
const betaRulesPath = resolve(workspaceRoot, "firestore.beta.rules");
if (!existsSync(betaRulesPath)) {
  console.error("FATAL: firestore.beta.rules not found.");
  process.exit(1);
}
const rulesContent = readFileSync(rulesPath, "utf8");
const betaRulesContent = readFileSync(betaRulesPath, "utf8");
if (rulesContent === betaRulesContent) {
  console.error("FATAL: firestore.beta.rules is byte-identical to firestore.rules - the beta_allowlist gate appears to be missing. Refusing to deploy.");
  process.exit(1);
}
if (!betaRulesContent.includes("beta_allowlist") || !betaRulesContent.includes("v2BetaApproved")) {
  console.error("FATAL: firestore.beta.rules does not contain the expected beta_allowlist gate. Refusing to deploy.");
  process.exit(1);
}
console.log("Verified: firestore.beta.rules contains the beta_allowlist gate and differs from firestore.rules.");

// ── Build a temp firebase.json that points "firestore.rules" at
// firestore.beta.rules for THIS deploy only - the real firebase.json on
// disk (which firestore-emulator tests and every other command use) is
// never modified.
const configHome = resolve(workspaceRoot, ".firebase-config-beta-deploy");
mkdirSync(configHome, { recursive: true });
const tempConfigPath = resolve(configHome, "firebase.beta.deploy.json");
const baseConfig = JSON.parse(readFileSync(resolve(workspaceRoot, "firebase.json"), "utf8"));
// firebase resolves every relative path in --config relative to the
// config FILE's own directory, not the repo root or cwd - since this temp
// config lives in a subdirectory, every path firebase.json normally
// carries relative to the repo root must be made absolute here, or the
// deploy will look for firestore.beta.rules/firestore.indexes.json/dist
// inside .firebase-config-beta-deploy itself and fail to find them.
const betaConfig = {
  ...baseConfig,
  firestore: {
    ...(baseConfig.firestore || {}),
    rules: betaRulesPath,
    indexes: resolve(workspaceRoot, baseConfig.firestore?.indexes || "firestore.indexes.json"),
  },
  hosting: {
    ...(baseConfig.hosting || {}),
    public: resolve(workspaceRoot, baseConfig.hosting?.public || "dist"),
  },
};
writeFileSync(tempConfigPath, JSON.stringify(betaConfig, null, 2), "utf8");

// ── Gate 3 (hosting only): verify dist/ was actually BUILT with the beta
// env file (`npm run build:beta`, which loads .env.beta), not the default
// `npm run build` (which loads .env - production's Firebase config). Gates
// 1-2 above verify the DEPLOY TARGET is correct; this verifies the BUNDLE
// CONTENT being uploaded to that target is correct too - a plain `npm run
// build` run before this script, with no error of its own, produces a
// dist/ folder that looks completely normal but silently bakes in
// production's Firebase apiKey/projectId. Deploying that to tracktozero-
// beta's public Hosting URL would make the LIVE beta site's client SDK
// connect to production Firestore/Auth for every visitor - discovered as
// a real near-miss during GATE-10A live rehearsal. Checks the built JS for
// the beta env's own expected API key (proof it WAS used) and confirms
// the production env's API key is NOT present as an active Firebase
// config value (the production PROJECT ID string alone is expected and
// safe - it's also used as a hardcoded guard-comparison constant in
// repositoryRuntime.js, unrelated to which config is actually active).
if (target === "hosting" || target === "all") {
  const distDir = resolve(workspaceRoot, baseConfig.hosting?.public || "dist");
  if (!existsSync(distDir)) {
    console.error(`FATAL: ${distDir} not found. Run "npm run build:beta" before deploying hosting.`);
    process.exit(1);
  }
  const readEnvKey = (envPath, key) => {
    if (!existsSync(envPath)) return null;
    const match = readFileSync(envPath, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : null;
  };
  const betaApiKey = readEnvKey(resolve(workspaceRoot, ".env.beta"), "VITE_FIREBASE_API_KEY");
  const productionApiKey = readEnvKey(resolve(workspaceRoot, ".env"), "VITE_FIREBASE_API_KEY");
  if (!betaApiKey) {
    console.error("FATAL: could not read VITE_FIREBASE_API_KEY from .env.beta - cannot verify dist/ was built correctly.");
    process.exit(1);
  }
  const assetsDir = resolve(distDir, "assets");
  const jsFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith(".js")) : [];
  let foundBetaKey = false;
  let foundProductionKey = false;
  for (const file of jsFiles) {
    const content = readFileSync(resolve(assetsDir, file), "utf8");
    if (content.includes(betaApiKey)) foundBetaKey = true;
    if (productionApiKey && content.includes(productionApiKey)) foundProductionKey = true;
  }
  if (!foundBetaKey) {
    console.error('FATAL: dist/ does not contain the expected beta Firebase API key. It was not built with "npm run build:beta" (.env.beta). Refusing to deploy hosting - rebuild with the correct command first.');
    process.exit(1);
  }
  if (foundProductionKey) {
    console.error("FATAL: dist/ contains PRODUCTION's Firebase API key. This build would connect live beta visitors to production Firebase. Refusing to deploy.");
    process.exit(1);
  }
  console.log("Verified: dist/ was built with the beta Firebase config (npm run build:beta), not production's.");
}

const onlyFlags = {
  rules: "firestore:rules",
  indexes: "firestore:indexes",
  hosting: "hosting",
  all: "firestore:rules,firestore:indexes,hosting",
}[target];

console.log(`\n=== Deploying [${onlyFlags}] to ${betaProjectId} (verified literal project id) using firestore.beta.rules ===\n`);
// Pass the LITERAL, already-verified project id (betaProjectId), not the
// "beta" alias string - firebase's --project alias resolution looks for
// .firebaserc relative to where it thinks the project root is, which is
// unreliable once --config points at a file outside the repo root (as
// this temp config does). Using the literal id sidesteps that resolution
// entirely: this deploy targets exactly what Gate 1 above verified,
// nothing else.
// Windows: this repo's path contains spaces ("My Projects"), which
// spawnSync's shell:true mode does not reliably quote for firebase's own
// .cmd shim - route through PowerShell with explicit quoting instead,
// matching the exact pattern scripts/run-firestore-v2-tests.mjs already
// uses for the same reason.
const result = process.platform === "win32"
  ? spawnSync("powershell.exe", ["-NoProfile", "-Command", `firebase deploy --config "${tempConfigPath}" --project "${betaProjectId}" --only ${onlyFlags}`], { cwd: workspaceRoot, stdio: "inherit" })
  : spawnSync("firebase", ["deploy", "--config", tempConfigPath, "--project", betaProjectId, "--only", onlyFlags], { cwd: workspaceRoot, stdio: "inherit" });

if (result.status !== 0) {
  console.error("\nFAILED: firebase deploy exited non-zero. See output above.");
  process.exit(result.status ?? 1);
}

console.log("\nDeploy to tracktozero-beta complete.");
