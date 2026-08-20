import { describe, expect, it } from "vitest";
import { payoffSimulate, payoffSimulateDetailed } from "./payoffEngine.js";

const makeAccount = (overrides = {}) => ({
  id: "a1",
  name: "Test Card",
  cur_bal: 1000,
  min_due_v: 50,
  paid_v: 0,
  planned_v: 0,
  apr_v: 0.2,
  promo_apr: null,
  promo_until: "",
  apr_after_promo: 0.2,
  ...overrides,
});

describe("GATE-10B.1D: payoffSimulateDetailed", () => {
  it("PLAN-PROJ-09: detailed rows are identical to payoffSimulate's rows for the same core args", () => {
    const accounts = [
      makeAccount({ id: "small", cur_bal: 500, min_due_v: 25, apr_v: 0.1 }),
      makeAccount({ id: "large", cur_bal: 1500, min_due_v: 45, apr_v: 0.18 }),
    ];
    const plain = payoffSimulate(accounts, "snowball", 100, {}, 1, 2027, 60);
    const detailed = payoffSimulateDetailed(accounts, "snowball", 100, {}, 1, 2027, 60);
    expect(detailed.rows).toEqual(plain);
  });

  it("PLAN-PROJ-10: produces per-debt trajectories with a correct payoff month and truncates after payoff", () => {
    const accounts = [makeAccount({ id: "a1", cur_bal: 300, min_due_v: 100, apr_v: 0 })];
    const { perDebt } = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 24);
    const debt = perDebt.a1;
    expect(debt.startingBalance).toBe(300);
    expect(debt.payoffMonth).toBeTruthy();
    expect(debt.rows.at(-1).balance).toBe(0);
    // 300 balance / 100 min due, 0% APR -> exactly 3 months, no rows after payoff.
    expect(debt.rows).toHaveLength(3);
  });

  it("a debt that never reaches $0 within maxMonths gets payoffMonth: null", () => {
    // Interest (25%/yr on 5000 ~= $104/mo) exceeds the $50 minimum, so the
    // balance grows rather than shrinks - genuinely never reaches $0.
    const accounts = [makeAccount({ id: "a1", cur_bal: 5000, min_due_v: 50, apr_v: 0.25 })];
    const { perDebt } = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 12);
    expect(perDebt.a1.payoffMonth).toBeNull();
    expect(perDebt.a1.payoffMonthIndex).toBeNull();
    expect(perDebt.a1.rows).toHaveLength(12);
  });

  describe("PLAN-PROJ-07: one-time payment (first-class engine param)", () => {
    it("month-0 application is numerically identical to subtracting the lump sum from the starting balance", () => {
      const accounts = [makeAccount({ id: "a1", cur_bal: 1000, min_due_v: 50, apr_v: 0.2 })];
      const viaOneTimeParam = payoffSimulateDetailed(
        accounts, "avalanche", 0, {}, 1, 2027, 60, [],
        { oneTimePayments: [{ debtId: "a1", amount: 400, month: 0 }] },
      );
      const viaStartingBalanceSubtraction = payoffSimulate(
        [makeAccount({ id: "a1", cur_bal: 600, min_due_v: 50, apr_v: 0.2 })],
        "avalanche", 0, {}, 1, 2027, 60,
      );
      expect(viaOneTimeParam.rows).toEqual(viaStartingBalanceSubtraction);
      expect(viaOneTimeParam.appliedOneTimePayments).toEqual([{ debtId: "a1", amount: 400, month: 0 }]);
      expect(viaOneTimeParam.skippedOneTimePayments).toEqual([]);
    });

    it("a payment against a debt id that doesn't exist is skipped with a reason, never silently dropped", () => {
      const accounts = [makeAccount({ id: "a1", cur_bal: 1000 })];
      const result = payoffSimulateDetailed(
        accounts, "avalanche", 0, {}, 1, 2027, 24, [],
        { oneTimePayments: [{ debtId: "does-not-exist", amount: 100, month: 0 }] },
      );
      expect(result.appliedOneTimePayments).toEqual([]);
      expect(result.skippedOneTimePayments).toEqual([{ debtId: "does-not-exist", amount: 100, month: 0, reason: "debt_not_found" }]);
    });

    it("a payment against a debt already paid off by that month is skipped, not silently dropped or double-applied", () => {
      const accounts = [makeAccount({ id: "a1", cur_bal: 100, min_due_v: 100, apr_v: 0 })];
      const result = payoffSimulateDetailed(
        accounts, "avalanche", 0, {}, 1, 2027, 24, [],
        { oneTimePayments: [{ debtId: "a1", amount: 50, month: 3 }] },
      );
      expect(result.skippedOneTimePayments).toEqual([{ debtId: "a1", amount: 50, month: 3, reason: "already_paid_off" }]);
    });

    it("a lump sum that pays off the LAST remaining debt at month 0 still records that debt's payoff row (no early-break gap)", () => {
      const accounts = [makeAccount({ id: "a1", cur_bal: 500, min_due_v: 50, apr_v: 0.1 })];
      const result = payoffSimulateDetailed(
        accounts, "avalanche", 0, {}, 1, 2027, 24, [],
        { oneTimePayments: [{ debtId: "a1", amount: 500, month: 0 }] },
      );
      expect(result.perDebt.a1.payoffMonth).toBeTruthy();
      expect(result.perDebt.a1.payoffMonthIndex).toBe(0);
      expect(result.perDebt.a1.rows).toHaveLength(1);
      expect(result.perDebt.a1.rows[0].balance).toBe(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].remaining_debt).toBe(0);
    });
  });

  describe("PLAN-PROJ-06/PLAN-PROJ-12: dynamic minimum-payment rules (opt-in, never fabricated)", () => {
    it("useMinimumPaymentRules: false (default) is a byte-identical no-op even when a rule is present", () => {
      const accounts = [makeAccount({
        id: "a1", cur_bal: 2000, min_due_v: 50, apr_v: 0.2,
        minimumPaymentRule: { ruleType: "percentage_of_balance", percentageComponent: 0.03 },
      })];
      const withoutFlag = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 12);
      const withFlagFalse = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 12, [], { useMinimumPaymentRules: false });
      expect(withoutFlag.rows).toEqual(withFlagFalse.rows);
    });

    it("a percentage-of-balance rule causes the minimum to shrink month-over-month as the balance shrinks", () => {
      const accounts = [makeAccount({
        id: "a1", cur_bal: 2000, min_due_v: 999, apr_v: 0.15,
        minimumPaymentRule: { ruleType: "percentage_of_balance", percentageComponent: 0.03 },
        aprStatus: "known",
      })];
      const { perDebt } = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 6, [], { useMinimumPaymentRules: true });
      const minimums = perDebt.a1.rows.map((row) => row.minimumDue);
      // 3% of a shrinking balance must itself shrink month over month.
      for (let i = 1; i < minimums.length; i++) {
        expect(minimums[i]).toBeLessThan(minimums[i - 1]);
      }
      // Never the untouched static min_due_v (999) once the rule is active.
      expect(minimums[0]).toBeLessThan(999);
    });

    it("a debt with no confirmed rule is unaffected even when useMinimumPaymentRules is true", () => {
      const accounts = [makeAccount({ id: "a1", cur_bal: 1000, min_due_v: 50, apr_v: 0.1 })];
      const withFlag = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 12, [], { useMinimumPaymentRules: true });
      const withoutFlag = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 12);
      expect(withFlag.rows).toEqual(withoutFlag.rows);
    });

    it("regression: a rule-computed minimum BELOW the static min_due_v still lowers the actual simulated payment, not just the recorded minimumDue metric", () => {
      // Before this fix, the payment-amount formula used max(scheduled_payment,
      // min_due) where scheduled_payment stayed frozen at the original static
      // min_due_v - so a rule computing a SMALLER minimum than that static
      // value (the common real case: percentage-of-balance minimums shrink as
      // balance shrinks) never actually reduced the payment, even though the
      // recorded minimumDue metric looked correct. Static min_due_v (200) is
      // well above the rule's 3% of $1000 = $30, so this only passes once
      // scheduled_payment tracks the recomputed minimum too.
      const accounts = [makeAccount({
        id: "a1", cur_bal: 1000, min_due_v: 200, apr_v: 0,
        minimumPaymentRule: { ruleType: "percentage_of_balance", percentageComponent: 0.03 },
        aprStatus: "known",
      })];
      const withRule = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 3, [], { useMinimumPaymentRules: true });
      const withoutRule = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 3);
      // A much smaller real payment means a much SLOWER payoff (higher
      // remaining balance after month 1) than the static-$200-minimum case.
      expect(withRule.rows[0].remaining_debt).toBeGreaterThan(withoutRule.rows[0].remaining_debt);
      expect(withRule.perDebt.a1.rows[0].minimumDue).toBeCloseTo(30, 0);
    });

    it("an interest-inclusive rule on an unknown APR safely falls back to the static minimum, never NaN", () => {
      const accounts = [makeAccount({
        id: "a1", cur_bal: 1000, min_due_v: 40, apr_v: 0,
        minimumPaymentRule: { ruleType: "percentage_plus_interest_fees", percentageComponent: 0.02, interestComponent: true },
        aprStatus: "unknown",
      })];
      const { perDebt } = payoffSimulateDetailed(accounts, "avalanche", 0, {}, 1, 2027, 3, [], { useMinimumPaymentRules: true });
      for (const row of perDebt.a1.rows) {
        expect(Number.isFinite(row.minimumDue)).toBe(true);
        expect(row.minimumDue).not.toBeNaN();
      }
    });
  });
});
