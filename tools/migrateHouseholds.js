/**
 * migrateHouseholds.js
 *
 * One-off migration script for TrackToZero / budget-react.
 *
 * What it does:
 *  1. Stamps `active: true` on every household root doc that's missing it
 *  2. Creates a `householdDirectory` entry for every household that doesn't have one
 *
 * How to run:
 *  1. Go to Firebase Console → Project Settings → Service Accounts
 *  2. Click "Generate new private key" → save the JSON file
 *  3. Place the JSON file next to this script (or anywhere you like)
 *  4. Run:
 *       node tools/migrateHouseholds.js path/to/serviceAccountKey.json
 *
 * Safe to run multiple times — uses merge writes, skips already-correct docs.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

// ── Bootstrap ──────────────────────────────────────────────────────────────
const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node tools/migrateHouseholds.js path/to/serviceAccountKey.json");
  process.exit(1);
}

const absoluteKeyPath = path.resolve(keyPath);
if (!fs.existsSync(absoluteKeyPath)) {
  console.error(`Service account key not found: ${absoluteKeyPath}`);
  process.exit(1);
}

initializeApp({ credential: cert(absoluteKeyPath) });
const db = getFirestore();

// ── Helpers ────────────────────────────────────────────────────────────────
const normalizeHouseholdDirectory = (householdId, data) => ({
  householdId: String(householdId),
  name: String(data.name || "Shared Household").trim(),
  nameLower: String(data.name || "").trim().toLowerCase(),
  description: String(data.description || "").trim(),
  joinCode: String(data.joinCode || "").toUpperCase(),
  joinMode: data.joinMode === "approval" ? "approval" : "open",
  ownerId: String(data.ownerId || ""),
  memberCount: Number(data.memberCount || 0),
  active: true,
  updatedAt: FieldValue.serverTimestamp(),
});

// ── Main ───────────────────────────────────────────────────────────────────
async function migrate() {
  console.log("Fetching all households…");
  const householdsSnap = await db.collection("households").get();
  console.log(`Found ${householdsSnap.size} household(s).`);

  let activePatchCount = 0;
  let directoryCreateCount = 0;
  let directorySkipCount = 0;
  let errorCount = 0;

  for (const doc of householdsSnap.docs) {
    const id = doc.id;
    const data = doc.data();
    const name = data.name || "(unnamed)";

    try {
      // 1. Stamp active: true if missing
      if (data.active !== true) {
        await doc.ref.update({ active: true, updatedAt: FieldValue.serverTimestamp() });
        console.log(`  ✓ [${name}] stamped active:true`);
        activePatchCount++;
      }

      // 2. Create householdDirectory entry if missing
      const dirRef = db.collection("householdDirectory").doc(id);
      const dirSnap = await dirRef.get();

      if (!dirSnap.exists) {
        if (!data.joinCode && !data.name) {
          console.log(`  ⚠ [${id}] skipped — no name or joinCode`);
          directorySkipCount++;
          continue;
        }
        await dirRef.set(normalizeHouseholdDirectory(id, data));
        console.log(`  ✓ [${name}] created householdDirectory entry (code: ${data.joinCode || "—"})`);
        directoryCreateCount++;
      } else {
        directorySkipCount++;
      }
    } catch (err) {
      console.error(`  ✗ [${name} / ${id}] error:`, err.message);
      errorCount++;
    }
  }

  console.log("\n── Migration complete ──────────────────────────");
  console.log(`  active:true stamped:          ${activePatchCount}`);
  console.log(`  householdDirectory created:   ${directoryCreateCount}`);
  console.log(`  householdDirectory skipped:   ${directorySkipCount}`);
  console.log(`  errors:                       ${errorCount}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
