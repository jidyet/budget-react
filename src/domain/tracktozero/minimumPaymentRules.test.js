import { describe, expect, it } from "vitest";
import { computeFromRule, estimateNextMinimum, shouldRecalculateEstimate } from "./minimumPaymentRules.js";
import { createMinimumPaymentRuleProfile } from "./models.js";

const rule = (overrides = {}) => createMinimumPaymentRuleProfile({
  ruleType: "percentage_of_balance",
  percentageComponent: 0.02,
  effectiveDate: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  updatedBy: "actor-1",
  ...overrides,
});

describe("estimateNextMinimum", () => {
  it("MIN-RULE-01: no rule -> Unknown", () => {
    expect(estimateNextMinimum({ debt: { minimumPaymentRule: null }, workingBalanceAmount: 5000 })).toEqual({ amount: null, source: "unknown" });
    expect(estimateNextMinimum({ debt: {}, workingBalanceAmount: 5000 })).toEqual({ amount: null, source: "unknown" });
  });

  it("MIN-RULE-02: a known APR with no confirmed rule is still Unknown - APR alone is never sufficient", () => {
    const result = estimateNextMinimum({ debt: { aprStatus: "known", apr: 0.2999, minimumPaymentRule: null }, workingBalanceAmount: 5000 });
    expect(result).toEqual({ amount: null, source: "unknown" });
  });

  it("a 0% (no-interest) APR with no confirmed rule is still Unknown, never a fabricated $0 minimum", () => {
    const result = estimateNextMinimum({ debt: { aprStatus: "no_interest", apr: 0, minimumPaymentRule: null }, workingBalanceAmount: 5000 });
    expect(result).toEqual({ amount: null, source: "unknown" });
  });

  it("MIN-RULE-03/MIN-CALC-01: a user-confirmed valid percentage rule produces a real estimate labeled issuer_rule_estimate", () => {
    const result = estimateNextMinimum({ debt: { minimumPaymentRule: rule({ percentageComponent: 0.02 }) }, workingBalanceAmount: 5000 });
    expect(result).toEqual({ amount: 100, source: "issuer_rule_estimate" });
  });

  it("MIN-CALC-09: a percentage rule with a required component missing (percentageComponent stripped) never fabricates a value", () => {
    // Simulate a corrupted/legacy record missing the field createMinimumPaymentRuleProfile would normally require.
    const brokenRule = { ...rule(), percentageComponent: null };
    expect(estimateNextMinimum({ debt: { minimumPaymentRule: brokenRule }, workingBalanceAmount: 5000 })).toEqual({ amount: null, source: "unknown" });
  });

  it("MIN-CALC-01/02: recomputes proportionally as balance falls or rises - no one-direction-only behavior", () => {
    const debt = { minimumPaymentRule: rule({ percentageComponent: 0.03 }) };
    expect(estimateNextMinimum({ debt, workingBalanceAmount: 10000 }).amount).toBe(300);
    expect(estimateNextMinimum({ debt, workingBalanceAmount: 8000 }).amount).toBe(240); // balance fell -> estimate fell
    expect(estimateNextMinimum({ debt, workingBalanceAmount: 12000 }).amount).toBe(360); // balance rose -> estimate rose
  });
});

describe("computeFromRule - fixed_amount", () => {
  it("returns the confirmed fixed amount regardless of balance", () => {
    const fixed = rule({ ruleType: "fixed_amount", percentageComponent: undefined, fixedFloor: 45 });
    expect(computeFromRule(fixed, { workingBalanceAmount: 500 })).toBe(45);
    expect(computeFromRule(fixed, { workingBalanceAmount: 50000 })).toBe(45);
  });
});

describe("computeFromRule - percentage_of_balance with a floor", () => {
  it("MIN-CALC-08: honors the fixed floor when the percentage would produce less ('greater of' logic)", () => {
    const withFloor = rule({ percentageComponent: 0.01, fixedFloor: 35 });
    // 1% of 2000 = $20, floor is $35 -> floor wins
    expect(computeFromRule(withFloor, { workingBalanceAmount: 2000 })).toBe(35);
    // 1% of 10000 = $100, floor is $35 -> percentage wins
    expect(computeFromRule(withFloor, { workingBalanceAmount: 10000 })).toBe(100);
  });
});

describe("computeFromRule - percentage_plus_interest_fees", () => {
  it("adds a standard monthly-interest approximation only when interestComponent is set and APR is known", () => {
    const withInterest = rule({
      ruleType: "percentage_plus_interest_fees",
      percentageComponent: 0.01,
      interestComponent: true,
    });
    // 1% of 5000 = $50, interest = (0.24/12)*5000 = $100 -> total $150
    expect(computeFromRule(withInterest, { workingBalanceAmount: 5000, apr: 0.24, aprStatus: "known" })).toBe(150);
  });

  it("MIN-CALC-09: interestComponent true but APR unknown -> Unknown, never silently omits the required component", () => {
    const withInterest = rule({ ruleType: "percentage_plus_interest_fees", percentageComponent: 0.01, interestComponent: true });
    expect(computeFromRule(withInterest, { workingBalanceAmount: 5000, apr: null, aprStatus: "unknown" })).toBeNull();
  });

  it("interestComponent true with a confirmed no_interest (0%) APR is allowed - a real confirmed rate, not missing data", () => {
    const withInterest = rule({ ruleType: "percentage_plus_interest_fees", percentageComponent: 0.01, interestComponent: true });
    expect(computeFromRule(withInterest, { workingBalanceAmount: 5000, apr: 0, aprStatus: "no_interest" })).toBe(50); // 1% of 5000, +$0 interest
  });

  it("interestComponent true with a promotional APR is blocked - a temporary rate is not a trustworthy basis for a future estimate", () => {
    const withInterest = rule({ ruleType: "percentage_plus_interest_fees", percentageComponent: 0.01, interestComponent: true });
    expect(computeFromRule(withInterest, { workingBalanceAmount: 5000, apr: 0.05, aprStatus: "promotional" })).toBeNull();
  });

  it("adds a confirmed flat fee amount when feeComponent is set", () => {
    const withFee = rule({ ruleType: "percentage_plus_interest_fees", percentageComponent: 0.01, feeComponent: true, feeAmount: 10 });
    expect(computeFromRule(withFee, { workingBalanceAmount: 5000 })).toBe(60); // $50 + $10 fee
  });

  it("does not require interest/fees when both components are off - behaves like plain percentage_of_balance", () => {
    const plain = rule({ ruleType: "percentage_plus_interest_fees", percentageComponent: 0.02 });
    expect(computeFromRule(plain, { workingBalanceAmount: 5000 })).toBe(100);
  });
});

describe("computeFromRule - safety", () => {
  it("returns null for no rule, NO_RULE_AVAILABLE source, or unknown working balance", () => {
    expect(computeFromRule(null, { workingBalanceAmount: 5000 })).toBeNull();
    expect(computeFromRule(rule({ ruleSource: "NO_RULE_AVAILABLE" }), { workingBalanceAmount: 5000 })).toBeNull();
    expect(computeFromRule(rule(), { workingBalanceAmount: null })).toBeNull();
  });
});

describe("shouldRecalculateEstimate", () => {
  it("MIN-CALC-13 (rule-change trigger): recalculates when the rule profile itself changed", () => {
    expect(shouldRecalculateEstimate({ minimumPaymentRule: null }, { minimumPaymentRule: rule() })).toBe(true);
  });

  it("does not recalculate when nothing relevant changed, including an unchanged rule", () => {
    const sharedRule = rule();
    const inputs = { workingBalanceAmount: 5000, lastConfirmedAmount: 5000, apr: 0.2, aprStatus: "known", debtType: "credit_card", minimumPaymentRule: sharedRule };
    expect(shouldRecalculateEstimate(inputs, { ...inputs })).toBe(false);
  });

  it("recalculates when the working balance changed", () => {
    expect(shouldRecalculateEstimate({ workingBalanceAmount: 5000 }, { workingBalanceAmount: 4700 })).toBe(true);
  });
});
