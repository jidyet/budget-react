/**
 * One-time script: set founderAccount custom claim on a Firebase user.
 *
 * Usage:
 *   1. Go to Firebase Console -> Project Settings -> Service Accounts
 *   2. Click "Generate new private key" and save it outside the repo
 *   3. Run:
 *      FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\key.json node scripts/set-founder-claim.mjs your@email.com
 *
 * Optional:
 *   node scripts/set-founder-claim.mjs your@email.com C:\path\to\key.json
 *
 * The claim { founderAccount: true } is what the app now checks instead of
 * comparing email addresses baked into the JS bundle.
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const email = process.argv[2];
const explicitKeyPath = process.argv[3];

if (!email) {
  console.error("Usage: node scripts/set-founder-claim.mjs your@email.com [service-account-key-path]");
  process.exit(1);
}

const keyPath = explicitKeyPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";

if (!keyPath) {
  console.error("Missing service account key path.");
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH or pass the JSON path as the second argument.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  console.error(`Could not read ${keyPath}`);
  console.error("Download it from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.");
  process.exit(1);
}

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const auth = admin.auth();

try {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { founderAccount: true });
  console.log(`OK founderAccount claim set on ${email} (uid: ${user.uid})`);
  console.log("  The user must sign out and back in (or wait ~1hr) for the claim to take effect.");
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
}
