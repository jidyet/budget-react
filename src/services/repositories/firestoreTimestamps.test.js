import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toFirestoreValue, fromFirestoreValue, toFirestoreDoc, fromFirestoreDoc } from "./firestoreTimestamps";

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
