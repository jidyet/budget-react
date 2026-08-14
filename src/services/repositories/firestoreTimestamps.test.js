import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toFirestoreValue, fromFirestoreValue, toFirestoreDoc, fromFirestoreDoc, sanitizeForFirestore } from "./firestoreTimestamps";

describe("firestoreTimestamps", () => {
  it("converts an ISO string to a Firestore Timestamp and back", () => {
    const iso = "2026-03-15T12:30:00.000Z";
    const ts = toFirestoreValue(iso);
    expect(ts).toBeInstanceOf(Timestamp);
    expect(fromFirestoreValue(ts)).toBe(iso);
  });

  it("passes null straight through in both directions without coercing to epoch", () => {
    expect(toFirestoreValue(null)).toBeNull();
    expect(toFirestoreValue(undefined)).toBeNull();
    expect(toFirestoreValue("")).toBeNull();
    expect(fromFirestoreValue(null)).toBeNull();
  });

  it("toFirestoreDoc only converts allowlisted timestamp fields, leaves everything else untouched", () => {
    const plan = {
      id: "p1",
      workspaceId: "w1",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      activatedAt: "2026-02-01T00:00:00.000Z",
      completedAt: null,
      updatedAt: null,
    };
    const doc = toFirestoreDoc("plan", plan);
    expect(doc.id).toBe("p1");
    expect(doc.status).toBe("active");
    expect(doc.createdAt).toBeInstanceOf(Timestamp);
    expect(doc.activatedAt).toBeInstanceOf(Timestamp);
    expect(doc.completedAt).toBeNull();
    expect(doc.updatedAt).toBeNull();
  });

  it("fromFirestoreDoc round-trips a full entity with all-optional-timestamps null", () => {
    const debt = {
      id: "d1",
      workspaceId: "w1",
      name: "Card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
      paidOffAt: null,
    };
    const stored = toFirestoreDoc("debt", debt);
    const restored = fromFirestoreDoc("debt", stored);
    expect(restored).toEqual(debt);
  });

  it("does not touch arbitrary nested objects like assumptions/expectedDebtBalances", () => {
    const version = {
      id: "v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      asOf: "2026-01-01T00:00:00.000Z",
      assumptions: { inflation: 0.03, nested: { a: 1 } },
    };
    const doc = toFirestoreDoc("version", version);
    expect(doc.assumptions).toEqual({ inflation: 0.03, nested: { a: 1 } });
  });

  it("throws for an unknown entity kind rather than silently no-op-ing", () => {
    expect(() => toFirestoreDoc("unknownKind", {})).toThrow();
    expect(() => fromFirestoreDoc("unknownKind", {})).toThrow();
  });
});

describe("sanitizeForFirestore (DATA-1 HOTFIX)", () => {
  it("omits a nested undefined field instead of persisting it (the exact ImportBatch bug)", () => {
    const evidence = { kind: "debt_signal", source: "debt vocabulary/category", weight: 1, value: undefined, truth: "observed" };
    const result = sanitizeForFirestore(evidence);
    expect("value" in result).toBe(false);
    expect(result).toEqual({ kind: "debt_signal", source: "debt vocabulary/category", weight: 1, truth: "observed" });
  });

  it("recurses into nested arrays/objects (e.g. ImportBatch.candidates[].evidence.classificationEvidence[])", () => {
    const batch = { candidates: [{ evidence: { classificationEvidence: [{ kind: "debt_signal", value: undefined }] } }] };
    const result = sanitizeForFirestore(batch);
    expect("value" in result.candidates[0].evidence.classificationEvidence[0]).toBe(false);
  });

  it("removes an undefined array element rather than writing a hole Firestore would reject", () => {
    expect(sanitizeForFirestore(["credit_card", undefined, "student_loan"])).toEqual(["credit_card", "student_loan"]);
  });

  it("preserves meaningful falsy values exactly: 0, false, empty string, null", () => {
    const input = { count: 0, confirmed: false, note: "", missing: null };
    expect(sanitizeForFirestore(input)).toEqual({ count: 0, confirmed: false, note: "", missing: null });
  });

  it("never mutates a Firestore Timestamp instance into a plain object", () => {
    const ts = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));
    const result = sanitizeForFirestore({ createdAt: ts });
    expect(result.createdAt).toBeInstanceOf(Timestamp);
    expect(result.createdAt).toBe(ts); // same instance, not reconstructed
  });

  it("is the boundary toFirestoreDoc actually applies - an ImportBatch with a deeply nested undefined now serializes safely", () => {
    const importBatch = {
      id: "batch-1",
      workspaceId: "w1",
      createdAt: "2026-01-01T00:00:00.000Z",
      candidates: [{
        candidateId: "c1",
        evidence: {
          classificationEvidence: [{ kind: "debt_signal", source: "x", weight: 1, provenance: {}, value: undefined, truth: "observed", note: "" }],
          ordinaryBillEvidence: [],
        },
      }],
    };
    const doc = toFirestoreDoc("importBatch", importBatch);
    const hasUndefined = (node) => {
      if (Array.isArray(node)) return node.some(hasUndefined);
      if (node !== null && typeof node === "object" && !(node instanceof Timestamp)) {
        return Object.values(node).some((value) => value === undefined || hasUndefined(value));
      }
      return false;
    };
    expect(hasUndefined(doc)).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Timestamp);
  });
});
