import { MAX_SIMULATION_MONTHS, payoffSimulate } from "../calc/payoffEngine.js";
import { debtToEngineAccount } from "../adapters/tracktozeroCalcAdapter.js";
import { isConfirmedZero, isDebtNeedsReview } from "../../domain/tracktozero/ownership.js";

export const TRACKTOZERO_STATUS_THRESHOLDS = Object.freeze({
  staleBalanceDays: 45,
  onTrackDollarTolerance: 50,
  onTrackRatioTolerance: 0.02,
  needsReviewRatio: 0.1,
});

export const WARNING_SEVERITY = Object.freeze({
  info: "info",
  warning: "warning",
  critical: "critical",
});

const toDate = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

export const monthKeyFromDate = (value) => {
  const date = value instanceof Date ? value : toDate(value || new Date().toISOString());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const daysBetween = (a, b) => {
  const ms = toDate(b).getTime() - toDate(a).getTime();
  return Math.floor(ms / 86400000);
};

export const getIncludedDebts = (debts = [], planVersion = null) => {
  if (!planVersion?.startingDebtSnapshot?.length) {
    return debts.filter((debt) => debt.status === "active" && debt.includedInCorePayoffPlan !== false);
  }
  const includedIds = new Set(
    planVersion.startingDebtSnapshot
      .filter((item) => item.includedInCorePayoffPlan)
      .map((item) => item.debtId)
  );
  return debts.filter((debt) => debt.status === "active" && includedIds.has(debt.id));
};

// The set of included debts that can safely drive REAL plan math: the
// simulation, the payoff queue order, and target selection. A debt whose
// material financial truth is unresolved (unconfirmed balance) or almost
// certainly contaminated (minimum payment matching its own APR percentage -
// the exact "APR became minimum payment" bug) must not silently corrupt the
// projected $0 date, interest total, or trigger a false negative-
// amortization warning caused by bad data rather than a real payment
// shortfall. It is NOT removed from the workspace or hidden from the user -
// see evaluateProjectionWarnings, which still surfaces it as a distinct,
// explicit warning for every included debt, reviewed or not.
export const getEligiblePlanDebts = (debts, planVersion) =>
  getIncludedDebts(debts, planVersion).filter((debt) => !isDebtNeedsReview(debt));

// The single shared definition of "payoff order" for a strategy - used
// anywhere a numbered queue is shown (plan preview, active plan) so the
// displayed order can never drift from what payoffSimulate actually pays
// off first. Snowball: smallest balance first. Avalanche: highest APR
// first, with unknown-APR debts treated as highest priority (matches
// payoffSimulate's own conservative handling of unknown APR).
export const sortDebtsForStrategy = (debts = [], strategy = "avalanche") =>
  [...debts].sort((a, b) => strategy === "snowball"
    ? Number(a.currentBalance || 0) - Number(b.currentBalance || 0)
    : (b.aprStatus === "unknown" ? -1 : Number(b.apr || 0)) - (a.aprStatus === "unknown" ? -1 : Number(a.apr || 0)));

export const evaluateProjectionWarnings = ({
  debts = [],
  planVersion = null,
  projectionRows = [],
  maxMonths = MAX_SIMULATION_MONTHS,
} = {}) => {
  const includedDebts = getIncludedDebts(debts, planVersion);
  const warnings = [];

  for (const debt of includedDebts) {
    if (isDebtNeedsReview(debt)) {
      // Excluded from the simulation entirely (see getEligiblePlanDebts) -
      // this is the explicit, visible reason why, rather than the debt
      // silently vanishing from the plan's math.
      warnings.push({
        code: "needs_review_excluded",
        debtId: debt.id,
        severity: WARNING_SEVERITY.critical,
        message: `${debt.name} has unresolved or contaminated financial data and is excluded from this plan's calculations until reviewed.`,
      });
      continue;
    }
    // A confirmed-paid-off ($0) debt has no future interest to estimate -
    // warning about its APR confidence would be noise about a debt that's
    // already done, not a real planning concern.
    if (debt.aprStatus === "unknown" && !isConfirmedZero(debt)) {
      warnings.push({
        code: "unknown_apr",
        debtId: debt.id,
        severity: WARNING_SEVERITY.warning,
        message: `${debt.name} has an unknown APR, so interest and payoff-date estimates are lower-confidence planning estimates.`,
      });
    }
    if (Number(debt.minimumRequiredPayment || 0) <= 0 && Number(debt.currentBalance || 0) > 0) {
      warnings.push({
        code: "missing_minimum_payment",
        debtId: debt.id,
        severity: WARNING_SEVERITY.critical,
        message: `${debt.name} is missing a required payment. Add one before trusting the payoff plan.`,
      });
    }
  }

  // Matches exactly the debt set actually fed into the simulation (see
  // buildProjectionWithWarnings) - comparing this warning's math against a
  // different set of debts than what was simulated would just create a new
  // form of the same "numbers don't agree with each other" bug.
  const eligibleDebts = includedDebts.filter((debt) => !isDebtNeedsReview(debt));
  const startingTotal = eligibleDebts.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0);
  const lastTotal = Number(projectionRows.at(-1)?.remaining_debt || 0);
  if (projectionRows.length >= 2 && lastTotal > startingTotal + TRACKTOZERO_STATUS_THRESHOLDS.onTrackDollarTolerance) {
    warnings.push({
      code: "negative_amortization",
      debtId: "",
      severity: WARNING_SEVERITY.critical,
      message: "The projected balance grows instead of shrinking. Payments may not cover interest.",
    });
  }

  if (projectionRows.length >= maxMonths && lastTotal > 0) {
    warnings.push({
      code: "projection_capped",
      debtId: "",
      severity: WARNING_SEVERITY.warning,
      message: "The projection hit the simulation limit before reaching $0.",
    });
  }

  if (planVersion?.goalDate && projectionRows.at(-1)?.month) {
    const projected = projectionRows.at(-1).month;
    if (String(projected).localeCompare(String(planVersion.goalDate)) > 0) {
      warnings.push({
        code: "infeasible_goal_date",
        debtId: "",
        severity: WARNING_SEVERITY.warning,
        message: `The current assumptions do not appear to reach $0 by ${planVersion.goalDate}.`,
      });
    }
  }

  return warnings;
};

export const buildProjectionWithWarnings = ({
  debts = [],
  planVersion = null,
  startMonth,
  startYear,
  maxMonths = MAX_SIMULATION_MONTHS,
  // UX-4: only meaningful when planVersion.strategy === "custom" (a
  // preview-only pseudo-strategy - see payoffEngine.js's orderPayoffTargets).
  customTargetOrder = [],
} = {}) => {
  const eligibleDebts = getEligiblePlanDebts(debts, planVersion);
  const accounts = eligibleDebts.map(debtToEngineAccount);
  const projection = planVersion
    ? payoffSimulate(
        accounts,
        planVersion.strategy,
        Number(planVersion.extraMonthlyPayment || 0),
        {},
        startMonth,
        startYear,
        maxMonths,
        customTargetOrder
      )
    : [];
  return {
    projection,
    warnings: evaluateProjectionWarnings({ debts, planVersion, projectionRows: projection, maxMonths }),
  };
};

const getExpectedCheckpointForPeriod = (checkpoints = [], period) => {
  if (!checkpoints.length) return null;
  const exact = checkpoints.find((checkpoint) => checkpoint.period === period);
  if (exact) return exact;
  return checkpoints
    .filter((checkpoint) => String(checkpoint.period).localeCompare(String(period)) <= 0)
    .at(-1) || checkpoints[0];
};

export const classifyPlanStatus = ({
  debts = [],
  planVersion = null,
  expectedCheckpoints = [],
  latestSnapshotsByDebt = {},
  asOf = new Date().toISOString(),
  thresholds = TRACKTOZERO_STATUS_THRESHOLDS,
} = {}) => {
  const includedDebts = getIncludedDebts(debts, planVersion);
  if (!includedDebts.length) {
    return { code: "insufficient_data", label: "No included debts", message: "Add debts to build a payoff status.", delta: 0 };
  }
  if (!planVersion) {
    return { code: "insufficient_data", label: "No active plan", message: "Create an active payoff plan to track progress.", delta: 0 };
  }
  if (!expectedCheckpoints.length) {
    return { code: "insufficient_data", label: "Missing plan checkpoints", message: "The active plan needs expected checkpoints before status can be shown.", delta: 0 };
  }

  const snapshots = includedDebts.map((debt) => latestSnapshotsByDebt[debt.id]).filter(Boolean);
  if (snapshots.length < includedDebts.length) {
    return {
      code: "needs_balance_update",
      label: "Update your balance",
      message: "Confirm each included debt balance to refresh your plan status.",
      delta: 0,
    };
  }
  // A debt's "latest snapshot" being its own opening snapshot means no real
  // observation has been recorded since the debt (or the plan) was created -
  // there is no observed history yet to judge ahead/on-track/behind from.
  // Only flags this when both ids are genuinely present and equal, so
  // synthetic/test snapshots that omit an id (and therefore can't be
  // positively identified as the opening one) are unaffected.
  const allOpeningSnapshotsOnly = includedDebts.every((debt) => {
    const snap = latestSnapshotsByDebt[debt.id];
    return !!debt.openingBalanceSnapshotId && !!snap?.id && snap.id === debt.openingBalanceSnapshotId;
  });
  if (allOpeningSnapshotsOnly) {
    return {
      code: "insufficient_data",
      label: "Not enough history yet",
      message: "Confirm at least one real balance update before TrackToZero can show plan progress.",
      delta: 0,
    };
  }
  const oldestObserved = snapshots.reduce((oldest, snapshot) =>
    Date.parse(snapshot.observedAt) < Date.parse(oldest.observedAt) ? snapshot : oldest
  );
  if (daysBetween(oldestObserved.observedAt, asOf) > thresholds.staleBalanceDays) {
    return {
      code: "needs_balance_update",
      label: "Update your balance",
      message: "Your latest confirmed balances are stale, so TrackToZero will not call the plan on track yet.",
      delta: 0,
    };
  }

  const period = monthKeyFromDate(asOf);
  const checkpoint = getExpectedCheckpointForPeriod(expectedCheckpoints, period);
  const actualTotalBalance = snapshots.reduce((sum, snapshot) => sum + Number(snapshot.balance || 0), 0);
  const expectedTotalBalance = Number(checkpoint?.expectedTotalBalance || 0);
  const delta = actualTotalBalance - expectedTotalBalance;
  const tolerance = Math.max(
    thresholds.onTrackDollarTolerance,
    Math.abs(expectedTotalBalance) * thresholds.onTrackRatioTolerance
  );
  const needsReviewTolerance = Math.max(
    thresholds.onTrackDollarTolerance * 2,
    Math.abs(expectedTotalBalance) * thresholds.needsReviewRatio
  );

  if (delta < -tolerance) {
    return {
      code: "ahead",
      label: "Ahead of plan",
      message: "Your latest confirmed balance is below the plan estimate.",
      delta,
      actualTotalBalance,
      expectedTotalBalance,
    };
  }
  if (Math.abs(delta) <= tolerance) {
    return {
      code: "on_track",
      label: "On track",
      message: "Your latest confirmed balance is close to the plan estimate.",
      delta,
      actualTotalBalance,
      expectedTotalBalance,
    };
  }
  if (delta <= needsReviewTolerance) {
    return {
      code: "slightly_behind",
      label: "A little behind",
      message: "Your latest confirmed balance is above the plan estimate. A reforecast can make the path more realistic.",
      delta,
      actualTotalBalance,
      expectedTotalBalance,
    };
  }
  return {
    code: "needs_review",
    label: "Plan needs review",
    message: "Your latest confirmed balance is meaningfully above the plan estimate. Preview a reforecast before changing the active plan.",
    delta,
    actualTotalBalance,
    expectedTotalBalance,
  };
};

// THE single shared plan-health derivation - Home, Plan, and any future
// status component must all consume this (never classifyPlanStatus alone),
// so they can never disagree with each other. This is a hard UX/truth
// invariant: classifyPlanStatus alone only compares the latest confirmed
// balance against an expected checkpoint - it has no idea whether the
// active PlanVersion's own projection is currently failing (e.g. the
// projected balance grows instead of shrinking, from evaluateProjectionWarnings).
// A plan can look "ahead" by that balance-delta measure while its projection
// is simultaneously infeasible; without this composition step, Home and Plan
// would each report their own half of the truth and visibly contradict each
// other. A critical warning always overrides a positive/neutral directional
// label - it never overrides an already-informational state like
// insufficient_data or needs_balance_update, since there is nothing
// "positive" in those states to contradict.
export const derivePlanHealth = ({
  debts = [],
  planVersion = null,
  expectedCheckpoints = [],
  latestSnapshotsByDebt = {},
  projectionWarnings = [],
  asOf = new Date().toISOString(),
  thresholds = TRACKTOZERO_STATUS_THRESHOLDS,
} = {}) => {
  const base = classifyPlanStatus({ debts, planVersion, expectedCheckpoints, latestSnapshotsByDebt, asOf, thresholds });
  const INFORMATIONAL_CODES = new Set(["insufficient_data", "needs_balance_update"]);
  if (INFORMATIONAL_CODES.has(base.code)) return base;

  const hasCritical = projectionWarnings.some((warning) => warning.severity === WARNING_SEVERITY.critical);
  if (hasCritical) {
    return {
      code: "critical",
      label: "Plan needs attention",
      message: "The active plan has a critical warning (for example, the projected balance is not shrinking). Review it before trusting this plan's status.",
      delta: base.delta,
      actualTotalBalance: base.actualTotalBalance,
      expectedTotalBalance: base.expectedTotalBalance,
    };
  }
  return base;
};
