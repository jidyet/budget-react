import { describe, expect, it } from "vitest";
import { deriveConfirmedProgress, deriveHomeContext, deriveNextMove, deriveProjectedTrajectory } from "./homeViewModels.js";

const debt = (overrides = {}) => ({
  id: "d1",
  workspaceId: "w1",
  name: "Chase Freedom",
  currentBalance: 1000,
  balanceStatus: "confirmed",
  includedInCorePayoffPlan: true,
  ...overrides,
});

const startingItem = (debtId, balance) => ({ debtId, balance, includedInCorePayoffPlan: true, debtType: "credit_card" });

const baseSnapshot = (overrides = {}) => ({
  workspace: { type: "personal" },
  debts: [debt()],
  includedDebts: [debt()],
  latestSnapshotsByDebt: { d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" } },
  activeContext: { version: { startingDebtSnapshot: [startingItem("d1", 1000)] } },
  portfolioSummary: {},
  warnings: [],
  status: { code: "on_track" },
  targetDebt: debt(),
  payoffQueue: [debt()],
  ...overrides,
});

describe("UX-2 fix: deriveConfirmedProgress is confirmed-safe", () => {
  it("reports confirmed progress when every starting debt has a confirmed latest balance", () => {
    const progress = deriveConfirmedProgress(baseSnapshot());
    expect(progress.confirmed).toBe(true);
    expect(progress.openingBalance).toBe(1000);
    expect(progress.latestBalance).toBe(500);
    expect(progress.eliminated).toBe(500);
    expect(progress.percent).toBe(50);
  });

  it("REGRESSION: a debt with no latest snapshot at all must never be silently treated as $0 (which would inflate elimination)", () => {
    const snapshot = baseSnapshot({ latestSnapshotsByDebt: {} }); // no snapshot recorded for d1
    const progress = deriveConfirmedProgress(snapshot);
    expect(progress.confirmed).toBe(false);
    expect(progress.eliminated).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("refuses to claim confirmed progress when a starting debt's balance is unresolved, even if a latest snapshot exists", () => {
    const snapshot = baseSnapshot({ debts: [debt({ balanceStatus: "unresolved" })] });
    const progress = deriveConfirmedProgress(snapshot);
    expect(progress.confirmed).toBe(false);
    expect(progress.percent).toBe(0);
  });

  it("compares the SAME frozen debt set on both sides - a debt added to includedDebts after activation never counts on the latest side without also being in the opening side", () => {
    const snapshot = baseSnapshot({
      // Two debts included now, but only d1 was part of the plan's frozen starting snapshot.
      includedDebts: [debt(), debt({ id: "d2", name: "New card added later" })],
      latestSnapshotsByDebt: {
        d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" },
        d2: { balance: 2000, observedAt: "2026-08-01T00:00:00.000Z" },
      },
    });
    const progress = deriveConfirmedProgress(snapshot);
    // Only d1 (the frozen starting debt) should be counted - d2 must not
    // silently deflate or inflate the comparison.
    expect(progress.openingBalance).toBe(1000);
    expect(progress.latestBalance).toBe(500);
    expect(progress.confirmed).toBe(true);
  });

  it("returns unconfirmed, zeroed progress when there is no active plan", () => {
    const progress = deriveConfirmedProgress({});
    expect(progress).toEqual({ confirmed: false, openingBalance: 0, latestBalance: 0, eliminated: 0, percent: 0, laterConfirmedHistory: false });
  });
});

describe("UX-2 fix: all-paid-off reflects included/core payoff truth, not every workspace debt", () => {
  it("celebrates when every INCLUDED debt is confirmed zero, even if an excluded mortgage still has a balance", () => {
    const mortgage = debt({ id: "m1", name: "Mortgage", currentBalance: 200000, includedInCorePayoffPlan: false });
    const paidCard = debt({ id: "d1", currentBalance: 0 });
    const snapshot = baseSnapshot({
      debts: [paidCard, mortgage],
      includedDebts: [paidCard], // mortgage correctly excluded from core payoff
    });
    const context = deriveHomeContext(snapshot, null, null);
    expect(context.allDebtsArePaidOff).toBe(true);
    expect(context.homeState).toBe("all-paid-off");
  });

  it("does NOT celebrate when a workspace has zero included debts (nothing was ever a core payoff target)", () => {
    const mortgage = debt({ id: "m1", name: "Mortgage", currentBalance: 200000, includedInCorePayoffPlan: false });
    const snapshot = baseSnapshot({ debts: [mortgage], includedDebts: [], activeContext: { version: null } });
    const context = deriveHomeContext(snapshot, null, null);
    expect(context.allDebtsArePaidOff).toBe(false);
  });

  it("does NOT celebrate while any included debt still has a real balance", () => {
    const snapshot = baseSnapshot(); // included debt has currentBalance 1000
    const context = deriveHomeContext(snapshot, null, null);
    expect(context.allDebtsArePaidOff).toBe(false);
  });
});

describe("UX-2 fix: blocking-review is a distinct Home state", () => {
  it("routes to blocking-review when blockingReviewCount > 0 and the plan isn't already critical", () => {
    const context = deriveHomeContext(baseSnapshot(), { openCount: 2, blockingCount: 1 }, null);
    expect(context.homeState).toBe("blocking-review");
    expect(context.blockingReviewCount).toBe(1);
    expect(context.openReviewCount).toBe(2);
  });

  it("a critical plan health takes priority over blocking-review framing", () => {
    const snapshot = baseSnapshot({ status: { code: "critical" } });
    const context = deriveHomeContext(snapshot, { openCount: 2, blockingCount: 1 }, null);
    expect(context.homeState).toBe("critical");
  });

  it("non-blocking open reviews do not trigger the blocking-review state", () => {
    const context = deriveHomeContext(baseSnapshot(), { openCount: 2, blockingCount: 0 }, null);
    expect(context.homeState).toBe("active-plan");
  });
});

describe("UX-2.1 closeout: Home snapshot details", () => {
  it("derives debt count and highest known APR from trusted debt data", () => {
    const context = deriveHomeContext(baseSnapshot({
      debts: [
        debt({ id: "d1", aprStatus: "known", apr: 0.2099, currentBalance: 1000 }),
        debt({ id: "d2", aprStatus: "unknown", apr: null, currentBalance: 500 }),
      ],
      includedDebts: [
        debt({ id: "d1", aprStatus: "known", apr: 0.2099, currentBalance: 1000 }),
        debt({ id: "d2", aprStatus: "unknown", apr: null, currentBalance: 500 }),
      ],
      portfolioSummary: { totalWorkspaceDebt: 1500, includedDebt: 1500, excludedDebt: 0 },
    }), null, null);

    expect(context.debtSnapshot.activeCount).toBe(2);
    expect(context.debtSnapshot.highestKnownApr).toBe(0.2099);
    expect(context.debtSnapshot.activeLabel).toBe("2 debts left");
  });

  it("derives a useful no-plan next move and keeps projected dates absent", () => {
    const context = deriveHomeContext({
      workspace: { type: "personal" },
      debts: [debt()],
      includedDebts: [debt()],
      activeContext: { version: null },
      portfolioSummary: { totalWorkspaceDebt: 1000, includedDebt: 1000, excludedDebt: 0 },
      balanceHistoryByDebt: {
        d1: [{ balance: 1000, observedAt: "2026-07-01T00:00:00.000Z" }, { balance: 900, observedAt: "2026-08-01T00:00:00.000Z" }],
      },
    }, null, null);

    expect(context.homeState).toBe("no-plan");
    expect(context.zeroDay).toBeNull();
    expect(context.nextMove.label).toBe("Pick your payoff strategy");
    expect(context.trajectory.observed.length).toBeGreaterThan(1);
    expect(context.trajectory.projected).toEqual([]);
  });
});

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Matches payoffEngine.js's own toLocaleDateString("en-US", { month: "short",
// year: "numeric" }) output - the real, only format ExpectedCheckpoint.period
// is ever generated in (never "YYYY-MM").
const monthLabelAt = (startIndex, offset) => {
  const total = startIndex + offset;
  return `${MONTH_LABELS[total % 12]} ${2026 + Math.floor(total / 12)}`;
};

describe("UX-7: deriveNextMove is a deterministic, ordered priority chain", () => {
  const reforecastDebt = (id, name) => ({ id, name });

  it("tier 1 (blocking review) wins over every lower tier at once", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: true,
      planHealth: { code: "critical" },
      debtsAwaitingReforecast: [reforecastDebt("d2", "New Card")],
      dataFreshness: { isStale: true },
      monthlyStatus: { shouldRecordPayment: true },
    });
    expect(move.action).toBe("review");
  });

  it("tier 2 (critical plan warning) wins over reforecast/stale/payment when review isn't blocking", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: { code: "critical" },
      debtsAwaitingReforecast: [reforecastDebt("d2", "New Card")],
      dataFreshness: { isStale: true },
      monthlyStatus: { shouldRecordPayment: true },
    });
    expect(move.label).toBe("Review your plan");
    expect(move.action).toBe("plan");
  });

  it("tier 3 (debt awaiting reforecast) wins over stale balance and payment-due when review/critical are clear", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: { code: "on_track" },
      debtsAwaitingReforecast: [reforecastDebt("d2", "New Card")],
      dataFreshness: { isStale: true },
      monthlyStatus: { shouldRecordPayment: true },
    });
    expect(move.label).toBe("Reforecast your plan");
    expect(move.action).toBe("plan");
  });

  it("tier 3 copy pluralizes correctly for exactly one debt vs. more than one", () => {
    const one = deriveNextMove({}, { planHealth: {}, debtsAwaitingReforecast: [reforecastDebt("d2", "New Card")], monthlyStatus: {} });
    expect(one.body).toContain("New Card was added");
    expect(one.body).toContain("it isn't reflected");

    const two = deriveNextMove({}, {
      planHealth: {},
      debtsAwaitingReforecast: [reforecastDebt("d2", "New Card"), reforecastDebt("d3", "Old Loan")],
      monthlyStatus: {},
    });
    expect(two.body).toContain("New Card, Old Loan were added");
    expect(two.body).toContain("they aren't reflected");
  });

  it("tier 4 (stale balance) wins over payment-due when reforecast isn't needed", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: { code: "on_track" },
      debtsAwaitingReforecast: [],
      dataFreshness: { isStale: true },
      monthlyStatus: { shouldRecordPayment: true },
    });
    expect(move.action).toBe("debts");
    expect(move.label).toBe("Update your balances");
  });

  it("tier 5 (payment confirmation) wins over tier 6 (balance update) when both could apply", () => {
    const move = deriveNextMove({}, {
      dataFreshness: { isStale: false },
      currentTarget: { name: "Chase Freedom" },
      monthlyStatus: { shouldRecordPayment: true, shouldUpdateBalance: true, supporting: "Go pay it." },
    });
    expect(move.label).toBe("Record your Chase Freedom payment");
  });

  it("tier 6 (balance update after a recorded payment) fires when payment confirmation isn't needed", () => {
    const move = deriveNextMove({}, {
      dataFreshness: { isStale: false },
      currentTarget: { name: "Chase Freedom" },
      monthlyStatus: { shouldRecordPayment: false, balanceRefreshNeeded: true },
    });
    expect(move.label).toBe("Update your Chase Freedom balance");
  });

  it("tier 7 (no active plan) fires when nothing above applies and there is genuinely no plan yet", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: undefined,
      debtsAwaitingReforecast: [],
      dataFreshness: null,
      monthlyStatus: { state: "no_plan", shouldRecordPayment: false, shouldUpdateBalance: false },
      homeState: "no-plan",
    });
    expect(move.label).toBe("Pick your payoff strategy");
    expect(move.action).toBe("compare");
  });

  it("tier 8 (all confirmed paid off) fires once every earlier tier is clear and a plan exists", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: { code: "on_track" },
      debtsAwaitingReforecast: [],
      dataFreshness: { isStale: false },
      monthlyStatus: { shouldRecordPayment: false, shouldUpdateBalance: false },
      homeState: "all-paid-off",
      allDebtsArePaidOff: true,
    });
    expect(move.label).toBe("You've confirmed $0");
  });

  it("tier 9 fallback (stay on target) fires only when every higher tier is genuinely clear", () => {
    const move = deriveNextMove({}, {
      hasBlockingReview: false,
      planHealth: { code: "on_track" },
      debtsAwaitingReforecast: [],
      dataFreshness: { isStale: false },
      monthlyStatus: { shouldRecordPayment: false, shouldUpdateBalance: false },
      homeState: "active-plan",
      allDebtsArePaidOff: false,
    });
    expect(move.label).toBe("Stay on this month's target");
    expect(move.action).toBe("debts");
  });
});

describe("UX-2.1 fix: deriveProjectedTrajectory / sampleEvenly must terminate for any real plan length", () => {
  it("REGRESSION: never hangs for a real plan's expectedCheckpoints (24+ months), and returns at most 8 sampled points with valid dates", () => {
    const checkpoints = Array.from({ length: 24 }, (_, index) => ({
      period: monthLabelAt(7, index),
      expectedTotalBalance: Math.max(0, 5000 - index * 200),
    }));
    const trajectory = deriveProjectedTrajectory({ expectedCheckpoints: checkpoints });
    expect(trajectory.length).toBeGreaterThan(0);
    expect(trajectory.length).toBeLessThanOrEqual(8);
    // Every point must carry a real, parseable date - never the NaN that
    // used to flow into TrajectoryChart's SVG path/circle coordinates.
    trajectory.forEach((point) => expect(Number.isNaN(new Date(point.at).getTime())).toBe(false));
    // Always includes the first and last checkpoint so the chart never
    // silently drops the plan's start or its $0 end.
    expect(trajectory[0].period).toBe(checkpoints[0].period);
    expect(trajectory[trajectory.length - 1].period).toBe(checkpoints[checkpoints.length - 1].period);
  });

  it("REGRESSION: also terminates for checkpoint counts that previously collided exactly on the last index (9, 36, 100)", () => {
    for (const length of [9, 36, 100]) {
      const checkpoints = Array.from({ length }, (_, index) => ({ period: monthLabelAt(0, index), expectedTotalBalance: 0 }));
      const trajectory = deriveProjectedTrajectory({ expectedCheckpoints: checkpoints });
      expect(trajectory.length).toBeGreaterThan(0);
      expect(trajectory.length).toBeLessThanOrEqual(8);
    }
  });

  it("REGRESSION: an unparseable period is dropped rather than producing a NaN point", () => {
    const trajectory = deriveProjectedTrajectory({ expectedCheckpoints: [{ period: "not-a-month", expectedTotalBalance: 100 }] });
    expect(trajectory).toEqual([]);
  });
});
