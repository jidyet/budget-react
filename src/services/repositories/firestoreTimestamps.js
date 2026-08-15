import { Timestamp } from "firebase/firestore";

// Domain entities (src/domain/tracktozero/models.js) use ISO-8601 strings as
// the canonical timestamp representation. Firestore stores/returns its own
// Timestamp type. This module is the only place that boundary is crossed, so
// Firebase types never leak into domain objects and vice versa.

export const toFirestoreValue = (iso) => {
  if (iso == null || iso === "") return null;
  return Timestamp.fromDate(new Date(iso));
};

export const fromFirestoreValue = (value) => {
  if (value == null) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return value;
};

// Explicit per-entity allowlists (not a blind deep-walk) - some fields hold
// arbitrary nested data (PlanVersion.assumptions, ExpectedCheckpoint's
// expectedDebtBalances) that must pass through untouched.
export const TIMESTAMP_FIELDS = {
  workspace: ["createdAt", "updatedAt"],
  member: ["createdAt", "updatedAt"],
  person: ["createdAt", "updatedAt"],
  debt: ["createdAt", "updatedAt", "paidOffAt"],
  plan: ["createdAt", "activatedAt", "completedAt", "updatedAt"],
  version: ["createdAt", "asOf"],
  expectedCheckpoint: [],
  paymentEvent: ["paidAt", "createdAt", "voidedAt"],
  balanceSnapshot: ["observedAt", "createdAt", "voidedAt"],
  migrationRun: ["startedAt", "completedAt", "failedAt", "rolledBackAt", "updatedAt"],
  importBatch: ["createdAt", "updatedAt", "committedAt"],
  scenario: ["createdAt", "updatedAt"],
};

// DATA-1 HOTFIX: a deliberate, single Firestore-write boundary that
// guarantees no literal `undefined` ever reaches setDoc(), for every entity
// kind - not just a point-fix for the one field that happened to trigger
// this. Only recurses into plain objects/arrays; anything else (Timestamp,
// Date, class instances) passes through untouched, so this can never
// corrupt a value toFirestoreValue already converted. This is NOT
// ignoreUndefinedProperties: undefined keys are omitted deliberately here
// (optional-absent semantics), while null/false/0/"" - all meaningful,
// explicit values - are preserved exactly.
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export const sanitizeForFirestore = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(sanitizeForFirestore);
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      result[key] = sanitizeForFirestore(val);
    }
    return result;
  }
  return value;
};

export const toFirestoreDoc = (kind, obj) => {
  const fields = TIMESTAMP_FIELDS[kind];
  if (!fields) throw new Error(`Unknown entity kind for Firestore serialization: ${kind}`);
  const doc = { ...obj };
  for (const field of fields) {
    if (field in doc) doc[field] = toFirestoreValue(doc[field]);
  }
  return sanitizeForFirestore(doc);
};

export const fromFirestoreDoc = (kind, data) => {
  const fields = TIMESTAMP_FIELDS[kind];
  if (!fields) throw new Error(`Unknown entity kind for Firestore serialization: ${kind}`);
  const obj = { ...data };
  for (const field of fields) {
    if (field in obj) obj[field] = fromFirestoreValue(obj[field]);
  }
  return obj;
};
