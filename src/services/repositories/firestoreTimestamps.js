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
  debt: ["createdAt", "updatedAt", "paidOffAt"],
  plan: ["createdAt", "activatedAt", "completedAt", "updatedAt"],
  version: ["createdAt", "asOf"],
  expectedCheckpoint: [],
  paymentEvent: ["paidAt", "createdAt", "voidedAt"],
  balanceSnapshot: ["observedAt", "createdAt", "voidedAt"],
  migrationRun: ["startedAt", "completedAt", "failedAt", "rolledBackAt", "updatedAt"],
  importBatch: ["createdAt", "updatedAt", "committedAt"],
};

export const toFirestoreDoc = (kind, obj) => {
  const fields = TIMESTAMP_FIELDS[kind];
  if (!fields) throw new Error(`Unknown entity kind for Firestore serialization: ${kind}`);
  const doc = { ...obj };
  for (const field of fields) {
    if (field in doc) doc[field] = toFirestoreValue(doc[field]);
  }
  return doc;
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
