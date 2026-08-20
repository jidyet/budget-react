import { describe, expect, it } from "vitest";
import {
  classifyGoalDateFeasibility,
  computeSpeedUpSuggestion,
  deriveAllocationSegments,
  deriveDebtCompositionSegments,
  deriveInterestBreakdownSegments,
  deriveNextMove,
  derivePerDebtImpactRows,
  deriveStrategyRecommendation,
  pickBestByZeroDate,
  safePercentDelta,
} from "./planInsights.js";

describe("GATE-10B.1D: safePercentDelta", () => {
  it("COMPARE-06: never Infinity%/NaN% for a zero 'from' - reports a direction, not a fake percentage", () => {
    const result = safePercentDelta(0, 500);
    expect(result.value).toBeNull();
    expect(result.direction).toBe("increase");
    expect(Number.isFinite(result.value)).toBe(false); // null, not Infinity/NaN
  });

  it("COMPARE-05: ties never show a fake percentage difference", () => {
    expect(safePercentDelta(500, 500)).toEqual({ value: 0, direction: "same" });
    expect(safePercentDelta(0, 0)).toEqual({ value: 0, direction: "same" });
  });

  it("computes a correct signed percentage for a normal decrease/increase", () => {
    expect(safePercentDelta(1000, 800).value).toBeCloseTo(20, 5);
    expect(safePercentDelta(1000, 800).direction).toBe("decrease");
    expect(safePercentDelta(1000, 1250).value).toBeCloseTo(25, 5);
    expect(safePercentDelta(1000, 1250).direction).toBe("increase");
  });
});

describe("GATE-10B.1D: deriveAllocationSegments - never a fabricated buffer", () => {
  it("produces exactly two segments (minimums, extra), never a third 'buffer'", () => {
    const queue = [{ minimumRequiredPayment: 85 }, { minimumRequiredPayment: 45 }];
    const result = deriveAllocationSegments(queue, 150);
    expect(result.segments.map((s) => s.id)).toEqual(["minimums", "extra"]);
    expect(result.segments.find((s) => s.id === "minimums").value).toBe(130);
    expect(result.segments.find((s) => s.id === "extra").value).toBe(150);
    expect(result.total).toBe(280);
  });

  it("excludes an unknown minimum from the sum rather than coercing it to $0", () => {
    const queue = [{ minimumRequiredPayment: 85 }, { minimumRequiredPayment: null }];
    const result = deriveAllocationSegments(queue, 0);
    expect(result.segments.find((s) => s.id === "minimums").value).toBe(85);
    expect(result.unknownMinimumCount).toBe(1);
  });

  it("omits a zero-value segment entirely rather than drawing a zero-width slice", () => {
    const result = deriveAllocationSegments([{ minimumRequiredPayment: 50 }], 0);
    expect(result.segments.map((s) => s.id)).toEqual(["minimums"]);
  });
});

describe("GATE-10B.1D: deriveDebtCompositionSegments", () => {
  it("groups by category and sums balance, sorted largest first", () => {
    const debts = [
      { debtType: "credit_card", currentBalance: 500 },
      { debtType: "credit_card", currentBalance: 300 },
      { debtType: "student_loan", currentBalance: 2000 },
    ];
    const result = deriveDebtCompositionSegments(debts);
    expect(result[0]).toMatchObject({ group: "STUDENT_LOAN", balance: 2000, count: 1 });
    expect(result[1]).toMatchObject({ group: "CREDIT_CARD", balance: 800, count: 2 });
  });
});

describe("GATE-10B.1D: deriveInterestBreakdownSegments", () => {
  it("sums interest per debt from perDebt rows and sorts largest first", () => {
    const perDebt = {
      a: { id: "a", name: "Card A", rows: [{ interest: 10 }, { interest: 8 }] },
      b: { id: "b", name: "Card B", rows: [{ interest: 40 }] },
    };
    const result = deriveInterestBreakdownSegments(perDebt, []);
    expect(result[0]).toMatchObject({ id: "b", value: 40 });
    expect(result[1]).toMatchObject({ id: "a", value: 18 });
  });

  it("excludes a debt with zero total interest", () => {
    const perDebt = { a: { id: "a", name: "Card A", rows: [{ interest: 0 }] } };
    expect(deriveInterestBreakdownSegments(perDebt, [])).toEqual([]);
  });
});

describe("GATE-10B.1D: deriveNextMove", () => {
  it("returns null with no target debt or no active plan - never fabricates a next move", () => {
    expect(deriveNextMove({ targetDebt: null, activeVersion: {} })).toBeNull();
    expect(deriveNextMove({ targetDebt: { id: "d1" }, activeVersion: null })).toBeNull();
  });

  it("builds a real next-move card from the target debt and active version", () => {
    const result = deriveNextMove({
      targetDebt: { id: "d1", name: "Chase Card" },
      activeVersion: { extraMonthlyPayment: 150 },
      perDebt: { d1: { payoffMonth: "Jun 2027" } },
    });
    expect(result.targetDebtName).toBe("Chase Card");
    expect(result.extraMonthlyPayment).toBe(150);
    expect(result.payoffMonth).toBe("Jun 2027");
    expect(result.body).toContain("Chase Card");
  });
});

describe("GATE-10B.1D: computeSpeedUpSuggestion - outcome always computed, never hardcoded", () => {
  it("returns null when previewTrendFn is not a function (defensive)", async () => {
    expect(await computeSpeedUpSuggestion({ strategy: "avalanche" }, null)).toBeNull();
  });

  it("computes real months/interest saved from the injected preview function, never a hardcoded number", async () => {
    const previewTrendFn = async ({ extraMonthlyPayment }) =>
      (extraMonthlyPayment >= 100 ? { monthsToZero: 20, estimatedInterest: 500 } : { monthsToZero: 24, estimatedInterest: 800 });
    const result = await computeSpeedUpSuggestion({ strategy: "avalanche", currentExtra: 0, suggestedIncrement: 100 }, previewTrendFn);
    expect(result).toEqual({ additionalMonthly: 100, monthsSaved: 4, interestSaved: 300 });
  });

  it("returns null when the suggested increment produces no improvement (never a fake positive suggestion)", async () => {
    const previewTrendFn = async () => ({ monthsToZero: 20, estimatedInterest: 500 });
    const result = await computeSpeedUpSuggestion({ strategy: "avalanche" }, previewTrendFn);
    expect(result).toBeNull();
  });
});

describe("GATE-10B.1D/COMPARE-05/COMPARE-11: deriveStrategyRecommendation", () => {
  it("COMPARE-05: a real tie never shows a fake '$0 better' - explicit tie code", () => {
    const result = deriveStrategyRecommendation({
      snowball: { monthsToZero: 24, estimatedInterest: 500 },
      avalanche: { monthsToZero: 24, estimatedInterest: 500 },
    });
    expect(result.code).toBe("tie");
    expect(result.monthsDelta).toBe(0);
    expect(result.interestDelta).toBe(0);
  });

  it("same payoff month, different interest - the cheaper strategy wins without a fake time claim", () => {
    const result = deriveStrategyRecommendation({
      snowball: { monthsToZero: 24, estimatedInterest: 600 },
      avalanche: { monthsToZero: 24, estimatedInterest: 500 },
    });
    expect(result.code).toBe("avalanche_better");
    expect(result.monthsDelta).toBe(0);
    expect(result.interestDelta).toBeCloseTo(100, 5);
  });

  it("a genuine tradeoff (Snowball faster, Avalanche cheaper) is reported as 'tradeoff', never a one-sided winner", () => {
    const result = deriveStrategyRecommendation({
      snowball: { monthsToZero: 20, estimatedInterest: 700 },
      avalanche: { monthsToZero: 24, estimatedInterest: 500 },
    });
    expect(result.code).toBe("tradeoff");
    expect(result.monthsDelta).toBe(4);
    expect(result.interestDelta).toBeCloseTo(200, 5);
  });

  it("one strategy wins on both fronts - reported as a clean winner", () => {
    const result = deriveStrategyRecommendation({
      snowball: { monthsToZero: 26, estimatedInterest: 700 },
      avalanche: { monthsToZero: 22, estimatedInterest: 500 },
    });
    expect(result.code).toBe("avalanche_better");
    expect(result.monthsDelta).toBe(4);
  });
});

describe("GATE-10B.1D/FINISH-07: classifyGoalDateFeasibility - documented, quantified buckets", () => {
  it("infeasible when the search itself reports not feasible", () => {
    expect(classifyGoalDateFeasibility({ valid: true, feasible: false })).toBe("infeasible");
    expect(classifyGoalDateFeasibility({ valid: false })).toBe("infeasible");
  });

  it("comfortable when no additional payment is needed", () => {
    expect(classifyGoalDateFeasibility({ valid: true, feasible: true, additionalNeeded: 0, currentMonthlyExtra: 150 })).toBe("comfortable");
  });

  it("achievable when the increase is at most 50% of the current extra payment", () => {
    expect(classifyGoalDateFeasibility({ valid: true, feasible: true, additionalNeeded: 60, currentMonthlyExtra: 150 })).toBe("achievable");
  });

  it("tight when the increase exceeds 50% of the current extra payment", () => {
    expect(classifyGoalDateFeasibility({ valid: true, feasible: true, additionalNeeded: 200, currentMonthlyExtra: 150 })).toBe("tight");
  });
});

describe("GATE-10B.1D/WHATIF-10/WHATIF-11: derivePerDebtImpactRows", () => {
  it("reports 'earlier' with a positive monthsDelta when the scenario pays off a debt sooner", () => {
    const baseline = { d1: { payoffMonthIndex: 20, payoffMonth: "Jun 2028" } };
    const scenario = { d1: { payoffMonthIndex: 12, payoffMonth: "Oct 2027" } };
    const rows = derivePerDebtImpactRows(baseline, scenario, [{ id: "d1", name: "Chase" }]);
    expect(rows[0]).toMatchObject({ debtId: "d1", change: "earlier", monthsDelta: 8 });
  });

  it("reports 'later' when the scenario delays payoff", () => {
    const baseline = { d1: { payoffMonthIndex: 10 } };
    const scenario = { d1: { payoffMonthIndex: 15 } };
    const rows = derivePerDebtImpactRows(baseline, scenario, []);
    expect(rows[0]).toMatchObject({ change: "later", monthsDelta: 5 });
  });

  it("reports 'now_paid_off' when a debt never reached $0 in the baseline but does in the scenario", () => {
    const baseline = { d1: { payoffMonthIndex: null } };
    const scenario = { d1: { payoffMonthIndex: 30, payoffMonth: "Dec 2029" } };
    const rows = derivePerDebtImpactRows(baseline, scenario, []);
    expect(rows[0].change).toBe("now_paid_off");
  });

  it("reports 'no_change' when the payoff month is identical", () => {
    const baseline = { d1: { payoffMonthIndex: 10 } };
    const scenario = { d1: { payoffMonthIndex: 10 } };
    const rows = derivePerDebtImpactRows(baseline, scenario, []);
    expect(rows[0]).toMatchObject({ change: "no_change", monthsDelta: 0 });
  });
});

describe("GATE-10B.1D/SAVED-11: pickBestByZeroDate - honest about no data yet", () => {
  it("returns null when nothing has been previewed yet, never a fabricated best", () => {
    expect(pickBestByZeroDate([])).toBeNull();
    expect(pickBestByZeroDate([{ scenario: { id: "s1" }, preview: {} }])).toBeNull();
  });

  it("picks the earliest projected $0 date among previewed scenarios", () => {
    const entries = [
      { scenario: { id: "s1" }, preview: { projectedZeroDate: "Dec 2029", estimatedInterest: 900 } },
      { scenario: { id: "s2" }, preview: { projectedZeroDate: "Jun 2028", estimatedInterest: 1200 } },
    ];
    expect(pickBestByZeroDate(entries).scenario.id).toBe("s2");
  });

  it("breaks a tied payoff date by lower estimated interest", () => {
    const entries = [
      { scenario: { id: "s1" }, preview: { projectedZeroDate: "Jun 2028", estimatedInterest: 900 } },
      { scenario: { id: "s2" }, preview: { projectedZeroDate: "Jun 2028", estimatedInterest: 500 } },
    ];
    expect(pickBestByZeroDate(entries).scenario.id).toBe("s2");
  });
});
