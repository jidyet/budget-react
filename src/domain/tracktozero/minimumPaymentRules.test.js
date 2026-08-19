import { describe, expect, it } from "vitest";
import { estimateNextMinimum, MINIMUM_PAYMENT_RULES, shouldRecalculateEstimate } from "./minimumPaymentRules.js";

describe("estimateNextMinimum", () => {
  it("MIN-DYN-08: an unknown issuer rule always resolves to unknown, never a guess", () => {
    const result = estimateNextMinimum({ debt: { debtType: "credit_card" }, workingBalanceAmount: 4700 });
    expect(result).toEqual({ amount: null, source: "unknown" });
  });

  it("MIN-DYN-09: a known, high APR alone never produces a contractual-looking minimum", () => {
    const result = estimateNextMinimum({ debt: { debtType: "credit_card", aprStatus: "known", apr: 0.2999 }, workingBalanceAmount: 4700 });
    expect(result.amount).toBeNull();
    expect(result.source).toBe("unknown");
  });

  it("MIN-DYN-10: 0% APR does not imply a $0 minimum", () => {
    const result = estimateNextMinimum({ debt: { debtType: "credit_card", aprStatus: "no_interest", apr: 0 }, workingBalanceAmount: 4700 });
    expect(result.amount).toBeNull();
    expect(result.source).toBe("unknown");
  });

  it("MIN-DYN-11/18: ships with zero registered rules today, by design - the registry (not a call-time override) is the only source of a rule", () => {
    expect(MINIMUM_PAYMENT_RULES).toEqual([]);
    expect(Object.isFrozen(MINIMUM_PAYMENT_RULES)).toBe(true);
  });
});

describe("shouldRecalculateEstimate", () => {
  it("MIN-DYN-13: recalculates when the working balance changed", () => {
    expect(shouldRecalculateEstimate({ workingBalanceAmount: 5000 }, { workingBalanceAmount: 4700 })).toBe(true);
  });

  it("does not recalculate when nothing relevant changed", () => {
    const inputs = { workingBalanceAmount: 5000, lastConfirmedAmount: 5000, apr: 0.2, aprStatus: "known", debtType: "credit_card" };
    expect(shouldRecalculateEstimate(inputs, { ...inputs })).toBe(false);
  });

  it("recalculates when APR/aprStatus/debtType change even if the balance did not", () => {
    const base = { workingBalanceAmount: 5000, aprStatus: "known", apr: 0.2 };
    expect(shouldRecalculateEstimate(base, { ...base, apr: 0.25 })).toBe(true);
    expect(shouldRecalculateEstimate(base, { ...base, aprStatus: "unknown" })).toBe(true);
    expect(shouldRecalculateEstimate({ ...base, debtType: "credit_card" }, { ...base, debtType: "personal_loan" })).toBe(true);
  });

  it("recalculates when a newer confirmed balance snapshot lands", () => {
    expect(shouldRecalculateEstimate({ lastConfirmedAmount: 5000 }, { lastConfirmedAmount: 4560 })).toBe(true);
  });
});
