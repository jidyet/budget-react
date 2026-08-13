import { describe, expect, it } from "vitest";
import { calculateGoalDatePlan } from "./goalDate";
import { orderPayoffTargets, payoffSimulate } from "./payoffEngine";
import { calculateWhatIfComparison } from "./scenarioComparison";

const makeAccount = (overrides = {}) => ({
  id: "a1",
  name: "Test Card",
  cur_bal: 1000,
  min_due_v: 50,
  paid_v: 0,
  planned_v: 0,
  apr_v: 0.20,
  promo_apr: null,
  promo_until: "",
  apr_after_promo: 0.20,
  ...overrides,
});

const summarizeRows = (rows) => ({
  monthsToZero: rows.length,
  payoffMonth: rows.at(-1)?.month || "n/a",
  remainingDebt: Number((rows.at(-1)?.remaining_debt || 0).toFixed(6)),
  totalInterest: Number(rows.reduce((sum, row) => sum + Number(row.total_interest || 0), 0).toFixed(6)),
  first3: rows.slice(0, 3).map((row) => ({
    month: row.month,
    remaining_debt: Number(row.remaining_debt.toFixed(6)),
    total_interest: Number(row.total_interest.toFixed(6)),
  })),
});

describe("payoff calculation golden masters", () => {
  it("preserves representative baseline outputs", () => {
    const fixtures = {
      singleZero: payoffSimulate(
        [makeAccount({ id: "zero", cur_bal: 300, min_due_v: 100, apr_v: 0 })],
        "avalanche",
        0,
        {},
        1,
        2025,
        24,
      ),
      multiSnowball: payoffSimulate(
        [
          makeAccount({ id: "small", name: "Small", cur_bal: 300, min_due_v: 25, apr_v: 0.10 }),
          makeAccount({ id: "large", name: "Large", cur_bal: 900, min_due_v: 35, apr_v: 0.10 }),
        ],
        "snowball",
        100,
        {},
        1,
        2025,
        60,
      ),
      multiAvalanche: payoffSimulate(
        [
          makeAccount({ id: "low", name: "Low", cur_bal: 800, min_due_v: 25, apr_v: 0.05 }),
          makeAccount({ id: "high", name: "High", cur_bal: 800, min_due_v: 25, apr_v: 0.25 }),
        ],
        "avalanche",
        100,
        {},
        1,
        2025,
        60,
      ),
      mixedApr: payoffSimulate(
        [
          makeAccount({ id: "zero", name: "Zero", cur_bal: 400, min_due_v: 40, apr_v: 0 }),
          makeAccount({ id: "mid", name: "Mid", cur_bal: 600, min_due_v: 30, apr_v: 0.12 }),
          makeAccount({ id: "high", name: "High", cur_bal: 900, min_due_v: 45, apr_v: 0.24 }),
        ],
        "avalanche",
        75,
        {},
        1,
        2025,
        60,
      ),
      negativeAmortization: payoffSimulate(
        [makeAccount({ id: "neg", cur_bal: 1000, min_due_v: 5, apr_v: 0.36 })],
        "avalanche",
        0,
        {},
        1,
        2025,
        6,
      ),
      rollover: payoffSimulate(
        [
          makeAccount({ id: "first", name: "First", cur_bal: 100, min_due_v: 100, apr_v: 0 }),
          makeAccount({ id: "next", name: "Next", cur_bal: 500, min_due_v: 50, apr_v: 0 }),
        ],
        "snowball",
        0,
        {},
        1,
        2025,
        12,
      ),
      promo: payoffSimulate(
        [makeAccount({
          id: "promo",
          cur_bal: 500,
          min_due_v: 50,
          apr_v: "",
          apr: 0.20,
          promo_apr: 0,
          apr_after_promo: 0.24,
          promo_until: "2025-02",
        })],
        "avalanche",
        0,
        {},
        1,
        2025,
        12,
      ),
    };

    expect(Object.fromEntries(
      Object.entries(fixtures).map(([name, rows]) => [name, summarizeRows(rows)]),
    )).toMatchInlineSnapshot(`
      {
        "mixedApr": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 1734,
              "total_interest": 24,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 1565.72,
              "total_interest": 21.72,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 1395.1168,
              "total_interest": 19.3968,
            },
          ],
          "monthsToZero": 11,
          "payoffMonth": "Nov 2025",
          "remainingDebt": 0,
          "totalInterest": 134.314929,
        },
        "multiAvalanche": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 1470,
              "total_interest": 20,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 1337.652778,
              "total_interest": 17.652778,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 1202.910937,
              "total_interest": 15.25816,
            },
          ],
          "monthsToZero": 12,
          "payoffMonth": "Dec 2025",
          "remainingDebt": 0,
          "totalInterest": 96.162821,
        },
        "multiSnowball": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 1050,
              "total_interest": 10,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 898.75,
              "total_interest": 8.75,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 746.239583,
              "total_interest": 7.489583,
            },
          ],
          "monthsToZero": 8,
          "payoffMonth": "Aug 2025",
          "remainingDebt": 0,
          "totalInterest": 44.41055,
        },
        "negativeAmortization": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 1025,
              "total_interest": 30,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 1050.75,
              "total_interest": 30.75,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 1077.2725,
              "total_interest": 31.5225,
            },
          ],
          "monthsToZero": 6,
          "payoffMonth": "Jun 2025",
          "remainingDebt": 1161.710247,
          "totalInterest": 191.710247,
        },
        "promo": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 450,
              "total_interest": 0,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 400,
              "total_interest": 0,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 358,
              "total_interest": 8,
            },
          ],
          "monthsToZero": 11,
          "payoffMonth": "Nov 2025",
          "remainingDebt": 0,
          "totalInterest": 40.305606,
        },
        "rollover": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 450,
              "total_interest": 0,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 300,
              "total_interest": 0,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 150,
              "total_interest": 0,
            },
          ],
          "monthsToZero": 4,
          "payoffMonth": "Apr 2025",
          "remainingDebt": 0,
          "totalInterest": 0,
        },
        "singleZero": {
          "first3": [
            {
              "month": "Jan 2025",
              "remaining_debt": 200,
              "total_interest": 0,
            },
            {
              "month": "Feb 2025",
              "remaining_debt": 100,
              "total_interest": 0,
            },
            {
              "month": "Mar 2025",
              "remaining_debt": 0,
              "total_interest": 0,
            },
          ],
          "monthsToZero": 3,
          "payoffMonth": "Mar 2025",
          "remainingDebt": 0,
          "totalInterest": 0,
        },
      }
    `);
  });
});

describe("pure payoff services", () => {
  it("keeps equal-APR avalanche order stable by current input order", () => {
    const ordered = orderPayoffTargets(
      [
        { id: "first", name: "First", bal: 500, apr: 0.2 },
        { id: "second", name: "Second", bal: 100, apr: 0.2 },
      ],
      "avalanche",
    );

    expect(ordered.map((account) => account.id)).toEqual(["first", "second"]);
  });

  it("clamps final payment when minimum exceeds remaining balance", () => {
    const rows = payoffSimulate(
      [makeAccount({ cur_bal: 100, min_due_v: 250, apr_v: 0 })],
      "avalanche",
      0,
      {},
      1,
      2025,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].remaining_debt).toBeCloseTo(0, 6);
  });

  it("characterizes insufficient-payment behavior without mutating inputs", () => {
    const accounts = [makeAccount({ id: "neg", cur_bal: 1000, min_due_v: 5, apr_v: 0.36 })];
    const before = structuredClone(accounts);
    const rows = payoffSimulate(accounts, "avalanche", 0, {}, 1, 2025, 3);

    expect(rows.at(-1).remaining_debt).toBeGreaterThan(rows[0].remaining_debt);
    expect(rows.some((row) => Object.hasOwn(row, "warnings"))).toBe(false);
    expect(accounts).toEqual(before);
  });

  it("does not accrue interest for 0% APR debt", () => {
    const rows = payoffSimulate(
      [makeAccount({ cur_bal: 500, min_due_v: 100, apr_v: 0 })],
      "avalanche",
      0,
      {},
      1,
      2025,
    );

    expect(rows.reduce((sum, row) => sum + row.total_interest, 0)).toBe(0);
  });

  it("rolls freed payment to the next target after payoff", () => {
    const withRollover = payoffSimulate(
      [
        makeAccount({ id: "first", cur_bal: 100, min_due_v: 100, apr_v: 0 }),
        makeAccount({ id: "next", cur_bal: 500, min_due_v: 50, apr_v: 0 }),
      ],
      "snowball",
      0,
      {},
      1,
      2025,
      12,
    );
    const withoutFreedPayment = payoffSimulate(
      [makeAccount({ id: "next", cur_bal: 500, min_due_v: 50, apr_v: 0 })],
      "snowball",
      0,
      {},
      1,
      2025,
      12,
    );

    expect(withRollover).toHaveLength(4);
    expect(withRollover.length).toBeLessThan(withoutFreedPayment.length);
  });

  it("keeps what-if scenario comparison side-effect-free", () => {
    const baselineRows = payoffSimulate(
      [makeAccount({ cur_bal: 500, min_due_v: 50, apr_v: 0 })],
      "avalanche",
      0,
      {},
      1,
      2025,
    );
    const scenarioRows = payoffSimulate(
      [makeAccount({ cur_bal: 500, min_due_v: 50, apr_v: 0 })],
      "avalanche",
      50,
      {},
      1,
      2025,
    );
    const baselineBefore = structuredClone(baselineRows);
    const scenarioBefore = structuredClone(scenarioRows);

    const comparison = calculateWhatIfComparison({ baselineRows, scenarioRows });

    expect(comparison.monthsSaved).toBe(5);
    expect(comparison.rows).toHaveLength(10);
    expect(baselineRows).toEqual(baselineBefore);
    expect(scenarioRows).toEqual(scenarioBefore);
  });
});

describe("goal date calculation service", () => {
  it("returns zero additional extra when baseline already finishes by target", () => {
    const result = calculateGoalDatePlan({
      goalDate: "2025-12",
      included: [makeAccount({ cur_bal: 300, min_due_v: 100, apr_v: 0 })],
      scenarioAccounts: [],
      extraMap: {},
      planMonthlyExtra: 0,
      planMonthlyDebtPayment: 100,
      planStrategy: "avalanche",
      selMonth: 1,
      selYear: 2025,
      payoffSimulate,
    });

    expect(result).toMatchObject({
      valid: true,
      additionalNeeded: 0,
      baselineFinishesOnTime: true,
      proposedTotalMonthlyPayment: 100,
    });
  });

  it("characterizes infeasible capped search as null additionalNeeded", () => {
    const result = calculateGoalDatePlan({
      goalDate: "2025-01",
      included: [makeAccount({ cur_bal: 1_000_000_000, min_due_v: 0, apr_v: 0 })],
      scenarioAccounts: [],
      extraMap: {},
      planMonthlyExtra: 0,
      planMonthlyDebtPayment: 0,
      planStrategy: "avalanche",
      selMonth: 1,
      selYear: 2025,
      payoffSimulate,
    });

    expect(result).toMatchObject({
      valid: true,
      baselineFinishesOnTime: false,
      additionalNeeded: null,
      proposedTotalMonthlyPayment: null,
    });
  });
});
