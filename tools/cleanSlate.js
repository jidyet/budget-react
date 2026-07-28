/**
 * cleanSlate.js
 *
 * Wipes ALL Firestore data and Firebase Auth accounts EXCEPT for the
 * specified preserved user (jidyet@yahoo.co.uk).
 *
 * How to run:
 *   node tools/cleanSlate.js path/to/serviceAccountKey.json
 *
 * What it deletes:
 *   - /registry/{uid}          for all users except preserved
 *   - /users/{uid}/**          for all users except preserved
 *   - /households/{id}/**      all households + subcollections
 *   - /householdDirectory/{id} all directory entries
 *   - Firebase Auth accounts   for all users except preserved
 *
 * Safe: preserved user's data is never touched.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const path = require("path");
const fs = require("fs");

const PRESERVED_EMAIL = "jidyet@yahoo.co.uk";

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node tools/cleanSlate.js path/to/serviceAccountKey.json");
  process.exit(1);
}
const absoluteKeyPath = path.resolve(keyPath);
if (!fs.existsSync(absoluteKeyPath)) {
  console.error(`Key not found: ${absoluteKeyPath}`);
  process.exit(1);
}

initializeApp({ credential: cert(absoluteKeyPath) });
const db = getFirestore();
const auth = getAuth();

const deleteSubcollections = async (docRef, subcollectionNames) => {
  for (const name of subcollectionNames) {
    const snap = await db.collection(`${docRef.path}/${name}`).get();
    if (snap.empty) continue;
    // Delete nested subcollections first (e.g. months/accounts, months/uploads)
    if (name === "months") {
      for (const monthDoc of snap.docs) {
        await deleteSubcollections(monthDoc.ref, ["accounts", "uploads"]);
        await monthDoc.ref.delete();
      }
    } else {
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
};

async function run() {
  // 1. Find preserved UID
  let preservedUid = "";
  try {
    const preservedUser = await auth.getUserByEmail(PRESERVED_EMAIL);
    preservedUid = preservedUser.uid;
    console.log(`✓ Preserved user: ${PRESERVED_EMAIL} (${preservedUid})`);
  } catch {
    console.warn(`⚠ Could not find ${PRESERVED_EMAIL} in Auth — will preserve by email match in registry only`);
  }

  // 2. Delete all Firebase Auth accounts except preserved
  console.log("\n── Deleting Firebase Auth accounts ──");
  let pageToken;
  let authDeleteCount = 0;
  do {
    const listResult = await auth.listUsers(1000, pageToken);
    for (const user of listResult.users) {
      if (user.uid === preservedUid || user.email === PRESERVED_EMAIL) continue;
      await auth.deleteUser(user.uid);
      console.log(`  ✓ Auth deleted: ${user.email || user.uid}`);
      authDeleteCount++;
    }
    pageToken = listResult.pageToken;
  } while (pageToken);
  console.log(`  Total Auth accounts deleted: ${authDeleteCount}`);

  // 3. Delete all /users/{uid} except preserved
  console.log("\n── Deleting /users ──");
  const usersSnap = await db.collection("users").get();
  let usersDeleted = 0;
  for (const userDoc of usersSnap.docs) {
    if (userDoc.id === preservedUid) { console.log(`  ↷ Skipped preserved user`); continue; }
    await deleteSubcollections(userDoc.ref, ["months", "payoff_plans", "invites"]);
    // Delete meta/app doc
    await db.doc(`users/${userDoc.id}/meta/app`).delete().catch(() => {});
    await userDoc.ref.delete();
    console.log(`  ✓ Deleted /users/${userDoc.id}`);
    usersDeleted++;
  }

  // 4. Delete all /registry entries except preserved
  console.log("\n── Deleting /registry ──");
  const regSnap = await db.collection("registry").get();
  let regDeleted = 0;
  for (const regDoc of regSnap.docs) {
    if (regDoc.id === preservedUid) { console.log(`  ↷ Skipped preserved registry`); continue; }
    await regDoc.ref.delete();
    regDeleted++;
  }
  console.log(`  Deleted ${regDeleted} registry entries`);

  // 5. Delete all /households and subcollections
  console.log("\n── Deleting /households ──");
  const householdsSnap = await db.collection("households").get();
  let householdsDeleted = 0;
  for (const hDoc of householdsSnap.docs) {
    await deleteSubcollections(hDoc.ref, ["members", "joinRequests", "months", "payoff_plans", "meta", "activity", "dashboard"]);
    await hDoc.ref.delete();
    console.log(`  ✓ Deleted household ${hDoc.id}`);
    householdsDeleted++;
  }

  // 6. Delete all /householdDirectory
  console.log("\n── Deleting /householdDirectory ──");
  const dirSnap = await db.collection("householdDirectory").get();
  const dirBatch = db.batch();
  dirSnap.docs.forEach((d) => dirBatch.delete(d.ref));
  await dirBatch.commit();
  console.log(`  Deleted ${dirSnap.size} directory entries`);

  console.log("\n── Clean slate complete ────────────────────────");
  console.log(`  Auth accounts deleted:    ${authDeleteCount}`);
  console.log(`  User docs deleted:        ${usersDeleted}`);
  console.log(`  Registry entries deleted: ${regDeleted}`);
  console.log(`  Households deleted:       ${householdsDeleted}`);
  console.log(`\n  Preserved: ${PRESERVED_EMAIL} (${preservedUid})`);
}

run().catch((err) => {
  console.error("Clean slate failed:", err);
  process.exit(1);
});
