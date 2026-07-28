import { readFileSync } from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const positionalArgs = process.argv.slice(2).filter((arg) => !String(arg).startsWith("--"));
const backupPath = positionalArgs[0];
const targetArg = positionalArgs[1] || "";
const explicitMonthKey = positionalArgs[2] || "";
const explicitKeyPath = positionalArgs[3] || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";
const dryRun = process.argv.includes("--dry-run");
const householdFlag = process.argv.find((arg) => String(arg).startsWith("--household-id="));
const householdIdFromFlag = householdFlag ? String(householdFlag).split("=").slice(1).join("=").trim() : "";

if (!backupPath) {
  console.error("Usage: node scripts/restore-account-from-backup.mjs <backup-json-path> [target-email-or-uid] [monthKey] [service-account-key-path] [--household-id=<id>] [--dry-run]");
  process.exit(1);
}

const defaultKeyPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "service-account-key.json");
const keyPath = explicitKeyPath || defaultKeyPath;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "").trim());
}

function inferMonthKey(backup, sourcePath) {
  if (isMonthKey(explicitMonthKey)) return explicitMonthKey;

  const recordKeys = Object.keys(backup?.records || {});
  const nestedRecordMonthKeys = recordKeys.filter(isMonthKey);
  if (nestedRecordMonthKeys.length === 1) return nestedRecordMonthKeys[0];

  const noteMonthKeys = Object.keys(backup?.settings?.monthNotes || {}).filter(isMonthKey);
  if (noteMonthKeys.length === 1) return noteMonthKeys[0];

  const fileMatch = String(sourcePath || "").match(/(20\d{2}-\d{2})/);
  if (fileMatch?.[1]) return fileMatch[1];

  const exportedAt = String(backup?.exportedAt || "");
  const exportedMatch = exportedAt.match(/^(20\d{2}-\d{2})/);
  if (exportedMatch?.[1]) return exportedMatch[1];

  return "";
}

function restoreTimestamps(value) {
  if (Array.isArray(value)) return value.map(restoreTimestamps);
  if (!value || typeof value !== "object") return value;
  if (
    value.type === "firestore/timestamp/1.0"
    && Number.isFinite(value.seconds)
    && Number.isFinite(value.nanoseconds)
  ) {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, restoreTimestamps(nested)])
  );
}

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nested]) => [key, sanitize(nested)])
        .filter(([, nested]) => nested !== undefined)
    );
  }
  return value === undefined ? undefined : value;
}

function normalizeIncomePayload(income, monthKey) {
  if (Array.isArray(income)) {
    return monthKey ? { [monthKey]: { entries: income, receipts: {} } } : {};
  }
  if (!income || typeof income !== "object") return {};
  if (Object.keys(income).some(isMonthKey)) {
    return income;
  }
  return monthKey ? { [monthKey]: income } : {};
}

function normalizeRecordPayload(records, monthKey) {
  if (!records || typeof records !== "object") return {};
  if (Object.keys(records).some(isMonthKey)) return records;
  return monthKey ? { [monthKey]: records } : {};
}

function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

let serviceAccount;
let backup;
try {
  serviceAccount = readJson(keyPath);
} catch (error) {
  console.error(`Could not read service account key at ${keyPath}`);
  console.error(error.message);
  process.exit(1);
}

try {
  backup = readJson(backupPath);
} catch (error) {
  console.error(`Could not read backup file at ${backupPath}`);
  console.error(error.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const auth = admin.auth();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const identifier = String(targetArg || backup?.user || "").trim();
if (!identifier) {
  console.error("Could not determine which account to restore. Pass an email address or UID.");
  process.exit(1);
}

const monthKey = inferMonthKey(backup, backupPath);
if (!monthKey && backup?.records && Object.keys(backup.records).length) {
  console.error("Could not infer the month key for records. Pass it as the third argument, for example 2026-04.");
  process.exit(1);
}

let userRecord;
try {
  userRecord = identifier.includes("@")
    ? await auth.getUserByEmail(identifier)
    : await auth.getUser(identifier);
} catch (error) {
  console.error(`Could not find Firebase Auth user for ${identifier}`);
  console.error(error.message);
  process.exit(1);
}

const uid = String(userRecord.uid);
const email = String(userRecord.email || backup?.user || "");
const displayName = String(userRecord.displayName || email || uid);
const restoreToHousehold = Boolean(householdIdFromFlag);
const householdId = householdIdFromFlag;

const settingsData = sanitize(restoreTimestamps(backup?.settings || {}));
const recordMonths = normalizeRecordPayload(sanitize(restoreTimestamps(backup?.records || {})), monthKey);
const incomeMonths = normalizeIncomePayload(sanitize(restoreTimestamps(backup?.income || {})), monthKey);
const planList = Array.isArray(backup?.plans) ? sanitize(restoreTimestamps(backup.plans)) : [];

if (restoreToHousehold) {
  const householdSnap = await db.doc(`households/${householdId}`).get();
  if (!householdSnap.exists) {
    console.error(`Household ${householdId} was not found.`);
    process.exit(1);
  }
  const memberSnap = await db.doc(`households/${householdId}/members/${uid}`).get();
  if (!memberSnap.exists) {
    console.error(`User ${uid} is not a member of household ${householdId}.`);
    process.exit(1);
  }
}

const writes = [];
const userRootRef = db.doc(`users/${uid}`);
const userAppRef = db.doc(`users/${uid}/meta/app`);
const registryRef = db.doc(`registry/${uid}`);

writes.push({
  ref: userRootRef,
  data: {
    displayName,
    email,
    photoURL: userRecord.photoURL || "",
    schemaVersion: Number(settingsData?.schemaVersion || 2),
    workspaceMode: restoreToHousehold ? "household" : "solo",
    activeHouseholdId: restoreToHousehold ? householdId : "",
    updatedAt: FieldValue.serverTimestamp(),
  },
  merge: true,
});

writes.push({
  ref: userAppRef,
  data: {
    ...settingsData,
    schemaVersion: Number(settingsData?.schemaVersion || 2),
    workspaceMode: restoreToHousehold ? "household" : "solo",
    activeHouseholdId: restoreToHousehold ? householdId : "",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    householdSetupDone: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
    updatedByLabel: settingsData?.updatedByLabel || displayName,
  },
  merge: true,
});

writes.push({
  ref: registryRef,
  data: {
    uid,
    email,
    displayName,
    workspaceMode: restoreToHousehold ? "household" : "solo",
    activeHouseholdId: restoreToHousehold ? householdId : "",
    deleted: FieldValue.delete(),
    deletedAt: FieldValue.delete(),
    lastSeenAt: FieldValue.serverTimestamp(),
  },
  merge: true,
});

if (restoreToHousehold) {
  writes.push({
    ref: db.doc(`households/${householdId}/meta/app`),
    data: {
      ...settingsData,
      schemaVersion: Number(settingsData?.schemaVersion || 2),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedByLabel: settingsData?.updatedByLabel || displayName,
    },
    merge: true,
  });
}

for (const [nextMonthKey, records] of Object.entries(recordMonths)) {
  const monthRef = restoreToHousehold
    ? db.doc(`households/${householdId}/months/${nextMonthKey}`)
    : db.doc(`users/${uid}/months/${nextMonthKey}`);
  const incomeData = incomeMonths[nextMonthKey];
  writes.push({
    ref: monthRef,
    data: {
      monthKey: String(nextMonthKey),
      schemaVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedByLabel: settingsData?.updatedByLabel || displayName,
      ...(incomeData
        ? {
            entries: Array.isArray(incomeData?.entries) ? incomeData.entries : [],
            receipts: incomeData?.receipts && typeof incomeData.receipts === "object" ? incomeData.receipts : {},
          }
        : {}),
    },
    merge: true,
  });

  for (const [accountId, record] of Object.entries(records || {})) {
    writes.push({
      ref: restoreToHousehold
        ? db.doc(`households/${householdId}/months/${nextMonthKey}/accounts/${accountId}`)
        : db.doc(`users/${uid}/months/${nextMonthKey}/accounts/${accountId}`),
      data: {
        ...record,
        schemaVersion: Number(record?.schemaVersion || 2),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: record?.updatedBy || uid,
        updatedByLabel: record?.updatedByLabel || settingsData?.updatedByLabel || displayName,
      },
      merge: true,
    });
  }
}

if (!Object.keys(recordMonths).length) {
  for (const [nextMonthKey, incomeData] of Object.entries(incomeMonths)) {
    writes.push({
      ref: restoreToHousehold
        ? db.doc(`households/${householdId}/months/${nextMonthKey}`)
        : db.doc(`users/${uid}/months/${nextMonthKey}`),
      data: {
        monthKey: String(nextMonthKey),
        schemaVersion: 2,
        entries: Array.isArray(incomeData?.entries) ? incomeData.entries : [],
        receipts: incomeData?.receipts && typeof incomeData.receipts === "object" ? incomeData.receipts : {},
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
        updatedByLabel: settingsData?.updatedByLabel || displayName,
      },
      merge: true,
    });
  }
}

for (const plan of planList) {
  const planId = String(plan?.id || plan?.planId || "");
  const ref = planId
    ? (restoreToHousehold
      ? db.doc(`households/${householdId}/payoff_plans/${planId}`)
      : db.doc(`users/${uid}/payoff_plans/${planId}`))
    : (restoreToHousehold
      ? db.collection(`households/${householdId}/payoff_plans`).doc()
      : db.collection(`users/${uid}/payoff_plans`).doc());
  writes.push({
    ref,
    data: {
      ...plan,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedByLabel: settingsData?.updatedByLabel || displayName,
    },
    merge: true,
  });
}

const monthCount = Object.keys(recordMonths).length || Object.keys(incomeMonths).length;
const recordCount = Object.values(recordMonths).reduce((sum, records) => sum + Object.keys(records || {}).length, 0);

if (dryRun) {
  console.log("Dry run only. No Firestore writes were made.");
  console.log(`  uid: ${uid}`);
  console.log(`  email: ${email}`);
  console.log(`  settings present: ${Boolean(settingsData && Object.keys(settingsData).length)}`);
  console.log(`  months to restore: ${monthCount}`);
  console.log(`  records to restore: ${recordCount}`);
  console.log(`  plans to restore: ${planList.length}`);
  console.log(`  restore target: ${restoreToHousehold ? `household ${householdId}` : "solo workspace"}`);
  if (monthKey) console.log(`  inferred month key: ${monthKey}`);
  process.exit(0);
}

const batches = chunk(writes, 450);
for (const entries of batches) {
  const batch = db.batch();
  for (const entry of entries) {
    batch.set(entry.ref, entry.data, { merge: entry.merge !== false });
  }
  await batch.commit();
}

console.log("Restore complete.");
console.log(`  uid: ${uid}`);
console.log(`  email: ${email}`);
console.log(`  settings restored: ${Boolean(settingsData && Object.keys(settingsData).length)}`);
console.log(`  months restored: ${monthCount}`);
console.log(`  records restored: ${recordCount}`);
console.log(`  plans restored: ${planList.length}`);
console.log(`  restore target: ${restoreToHousehold ? `household ${householdId}` : "solo workspace"}`);
if (monthKey) {
  console.log(`  inferred month key: ${monthKey}`);
}
