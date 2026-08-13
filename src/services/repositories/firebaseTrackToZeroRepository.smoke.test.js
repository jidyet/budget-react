import { describe, it, expect } from "vitest";
import { FirebaseTrackToZeroRepository } from "./firebaseTrackToZeroRepository";

describe("FirebaseTrackToZeroRepository (smoke)", () => {
  it("parses, imports, and instantiates with an injected Firestore-like instance", () => {
    const repo = new FirebaseTrackToZeroRepository({ __fake: true });
    expect(repo.db).toEqual({ __fake: true });
    const methods = [
      "saveWorkspace", "getWorkspace", "putWorkspace",
      "saveMembership", "getMembership",
      "saveDebt", "createDebtWithOpeningSnapshot", "listDebts",
      "savePlan", "getPlan", "putPlan", "listPlans",
      "savePlanVersion", "getPlanVersion", "updatePlanVersion",
      "createPaymentEvent", "getPaymentEvent", "updatePaymentEvent",
      "createBalanceSnapshot", "updateBalanceSnapshot", "listBalanceSnapshots",
      "createExpectedCheckpoint", "getExpectedCheckpoint", "updateExpectedCheckpoint",
      "activatePlan",
    ];
    for (const m of methods) {
      expect(typeof repo[m]).toBe("function");
    }
  });

  it("updatePlanVersion/updatePaymentEvent/updateBalanceSnapshot/updateExpectedCheckpoint throw without touching Firestore", () => {
    const repo = new FirebaseTrackToZeroRepository({ __fake: true });
    expect(() => repo.updatePlanVersion()).toThrow(/immutable/);
    expect(() => repo.updatePaymentEvent()).toThrow(/append-only/);
    expect(() => repo.updateBalanceSnapshot()).toThrow(/append-only/);
    expect(() => repo.updateExpectedCheckpoint()).toThrow(/immutable/);
  });
});
