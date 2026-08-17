/**
 * homeViewModels.js
 *
 * Derives the full Home command-center view model from the authoritative
 * workspace snapshot. Home cards render these outputs; they do not
 * independently recompute totals, trajectory, or plan semantics.
 */

import { isBalanceUnresolved, isConfirmedZero } from "../../../domain/tracktozero/ownership.js";
import { deriveCurrentPlanPeriodStatus } from "./homeMonthlyStatus.js";
import { TRACKTOZERO_STATUS_THRESHOLDS, deriveDebtsAwaitingReforecast } from "../../../services/tracktozero/projectionStatusService.js";

const MAX_TRAJECTORY_POINTS = 8;
const HOME_REFERENCE_MONTH = "Aug 2026";

const toAmount = (value) => Math.max(0, Number(value) || 0);
const sortByAtAsc = (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime();

// Bug fix: ExpectedCheckpoint.period (and PlanVersion.projectedZeroDate) are
// never "YYYY-MM" - they're the payoff engine's own "Mon YYYY" month label
// (payoffEngine.js's payoffSimulate: toLocaleDateString("en-US", { month:
// "short", year: "numeric" })), e.g. "Apr 2027". The previous parser built
// `${value}-01T00:00:00.000Z`, which for "Apr 2027" produces the invalid
// date string "Apr 2027-01T00:00:00.000Z" - silently NaN, which then flowed
// into TrajectoryChart's SVG path/circle coordinates as literal "NaN"
// attributes (a real, console-visible rendering defect, not just a missing
// value). Parse the actual "Mon YYYY" format instead.
const MONTH_ABBREVIATIONS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const parseMonthLabel = (value) => {
  const match = String(value || "").trim().match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(match[1].toLowerCase());
  if (monthIndex < 0) return null;
  return new Date(Date.UTC(Number(match[2]), monthIndex, 1));
};

const monthDiff = (fromMonth, toMonth) => {
  const from = parseMonthLabel(fromMonth);
  const to = parseMonthLabel(toMonth);
  if (!from || !to) return null;
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
};

// Bug fix: the previous version grew `picked` by re-deriving each new index
// from picked.size itself (`ratio = picked.size / (maxPoints - 1)`). Once a
// computed index collided with one already in the Set, Set.add() was a
// no-op, so picked.size never changed - which meant the next loop iteration
// recomputed the EXACT same ratio and the EXACT same colliding index again,
// forever. This collision is not an edge case: at picked.size ===
// maxPoints - 1, ratio is always exactly 1, which always maps to
// items.length - 1 - the very last index, already seeded into the Set at
// the start. So this hung on every call where items.length > maxPoints
// (e.g. Home's trajectory chart against any real plan's
// expectedCheckpoints, which the seed alone generates 24+ of). Fixed by
// deriving each of the fixed `maxPoints` indices from its own loop
// position `i`, never from the Set's current size, so the loop always
// terminates in exactly maxPoints iterations regardless of collisions.
const sampleEvenly = (items, maxPoints = MAX_TRAJECTORY_POINTS) => {
  if (!Array.isArray(items) || items.length <= maxPoints) return items || [];
  const picked = new Set();
  for (let i = 0; i < maxPoints; i++) {
    const ratio = maxPoints <= 1 ? 0 : i / (maxPoints - 1);
    picked.add(Math.round(ratio * (items.length - 1)));
  }
  return [...picked].sort((a, b) => a - b).map((index) => items[index]);
};

const aggregateObservedTrajectory = (snapshot) => {
  const version = snapshot?.activeContext?.version;
  const startingDebtSnapshot = version?.startingDebtSnapshot || [];
  const historyByDebt = snapshot?.balanceHistoryByDebt || {};
  if (!startingDebtSnapshot.length) {
    return { points: [], latestMovement: null, hasLaterConfirmedPoint: false };
  }

  const openingBalance = startingDebtSnapshot.reduce((sum, item) => sum + toAmount(item.balance), 0);
  const planStartAt = version?.asOf || snapshot?.asOf || "";
  const trackedIds = startingDebtSnapshot.map((item) => item.debtId);
  const runningBalances = new Map(startingDebtSnapshot.map((item) => [item.debtId, toAmount(item.balance)]));

  const updates = trackedIds.flatMap((debtId) => {
    const debt = snapshot?.debts?.find((candidate) => candidate.id === debtId);
    if (!debt || isBalanceUnresolved(debt)) return [];
    return (historyByDebt[debtId] || [])
      .filter((entry) => entry?.observedAt)
      .map((entry) => ({
        debtId,
        at: entry.observedAt,
        balance: toAmount(entry.balance),
      }));
  });

  const grouped = new Map();
  updates.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).forEach((update) => {
    const key = String(update.at).slice(0, 10);
    const list = grouped.get(key) || [];
    list.push(update);
    grouped.set(key, list);
  });

  const points = [];
  if (planStartAt) {
    points.push({
      kind: "observed",
      pointType: "starting",
      at: planStartAt,
      balance: openingBalance,
      label: "Starting baseline",
    });
  }

  [...grouped.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .forEach(([, list]) => {
      list.forEach((item) => runningBalances.set(item.debtId, item.balance));
      points.push({
        kind: "observed",
        pointType: "confirmed",
        at: list[0].at,
        balance: [...runningBalances.values()].reduce((sum, balance) => sum + toAmount(balance), 0),
        label: "Confirmed balance",
      });
    });

  const deduped = points
    .sort(sortByAtAsc)
    .filter((point, index, list) => index === 0 || point.at !== list[index - 1].at || point.balance !== list[index - 1].balance);

  const latestMovement = deduped.length >= 2
    ? {
        from: deduped[deduped.length - 2],
        to: deduped[deduped.length - 1],
        delta: deduped[deduped.length - 1].balance - deduped[deduped.length - 2].balance,
      }
    : null;

  return {
    points: deduped,
    latestMovement,
    hasLaterConfirmedPoint: deduped.length > 1,
  };
};

const aggregateObservedTrajectoryWithoutPlan = (snapshot) => {
  const debts = (snapshot?.debts || []).filter((debt) => debt.status !== "archived" && !isBalanceUnresolved(debt));
  if (!debts.length) {
    return { points: [], latestMovement: null, hasLaterConfirmedPoint: false };
  }

  const seeded = debts.map((debt) => {
    const entries = [...(snapshot?.balanceHistoryByDebt?.[debt.id] || [])]
      .filter((entry) => entry?.observedAt)
      .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
    if (!entries.length) return null;
    return { debt, entries };
  }).filter(Boolean);

  if (!seeded.length) {
    return { points: [], latestMovement: null, hasLaterConfirmedPoint: false };
  }

  const openingBalance = seeded.reduce((sum, item) => sum + toAmount(item.entries[0]?.balance), 0);
  const runningBalances = new Map(seeded.map((item) => [item.debt.id, toAmount(item.entries[0]?.balance)]));

  const grouped = new Map();
  seeded.forEach(({ debt, entries }) => {
    entries.forEach((entry) => {
      const key = String(entry.observedAt).slice(0, 10);
      const list = grouped.get(key) || [];
      list.push({ debtId: debt.id, at: entry.observedAt, balance: toAmount(entry.balance) });
      grouped.set(key, list);
    });
  });

  const firstAt = seeded
    .map((item) => item.entries[0]?.observedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

  const points = firstAt
    ? [{
        kind: "observed",
        pointType: "starting",
        at: firstAt,
        balance: openingBalance,
        label: "Starting confirmed balance",
      }]
    : [];

  [...grouped.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .forEach(([, list]) => {
      list.forEach((item) => runningBalances.set(item.debtId, item.balance));
      points.push({
        kind: "observed",
        pointType: "confirmed",
        at: list[0].at,
        balance: [...runningBalances.values()].reduce((sum, balance) => sum + toAmount(balance), 0),
        label: "Confirmed balance",
      });
    });

  const deduped = points
    .sort(sortByAtAsc)
    .filter((point, index, list) => index === 0 || point.at !== list[index - 1].at || point.balance !== list[index - 1].balance);

  const latestMovement = deduped.length >= 2
    ? {
        from: deduped[deduped.length - 2],
        to: deduped[deduped.length - 1],
        delta: deduped[deduped.length - 1].balance - deduped[deduped.length - 2].balance,
      }
    : null;

  return {
    points: deduped,
    latestMovement,
    hasLaterConfirmedPoint: deduped.length > 1,
  };
};

const aggregateTrackedProgressWithoutPlan = (snapshot) => {
  const debts = (snapshot?.debts || []).filter((debt) => debt.status !== "archived" && !isBalanceUnresolved(debt));
  if (!debts.length) {
    return {
      confirmed: false,
      openingBalance: 0,
      latestBalance: 0,
      eliminated: 0,
      percent: 0,
      laterConfirmedHistory: false,
    };
  }

  let allSafe = true;
  let hasLaterConfirmedHistory = false;

  const totals = debts.reduce((acc, debt) => {
    const entries = [...(snapshot?.balanceHistoryByDebt?.[debt.id] || [])]
      .filter((entry) => entry?.observedAt)
      .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
    if (!entries.length) {
      allSafe = false;
      return acc;
    }
    if (entries.length > 1) hasLaterConfirmedHistory = true;
    acc.openingBalance += toAmount(entries[0].balance);
    acc.latestBalance += toAmount(entries.at(-1)?.balance);
    return acc;
  }, { openingBalance: 0, latestBalance: 0 });

  if (!allSafe) {
    return {
      confirmed: false,
      openingBalance: totals.openingBalance,
      latestBalance: 0,
      eliminated: 0,
      percent: 0,
      laterConfirmedHistory: false,
    };
  }

  const eliminated = Math.max(0, totals.openingBalance - totals.latestBalance);
  const percent = totals.openingBalance > 0 ? (eliminated / totals.openingBalance) * 100 : 0;
  return {
    confirmed: true,
    openingBalance: totals.openingBalance,
    latestBalance: totals.latestBalance,
    eliminated,
    percent: Math.min(100, Math.max(0, percent)),
    laterConfirmedHistory: hasLaterConfirmedHistory,
  };
};

export const deriveConfirmedProgress = (snapshot) => {
  const startingDebtSnapshot = snapshot?.activeContext?.version?.startingDebtSnapshot;
  if (!startingDebtSnapshot?.length) {
    return {
      confirmed: false,
      openingBalance: 0,
      latestBalance: 0,
      eliminated: 0,
      percent: 0,
      laterConfirmedHistory: false,
    };
  }

  const openingBalance = startingDebtSnapshot.reduce((sum, item) => sum + toAmount(item.balance), 0);

  let allSafe = true;
  const latestBalance = startingDebtSnapshot.reduce((sum, item) => {
    const debt = snapshot.debts?.find((candidate) => candidate.id === item.debtId);
    const latestSnapshot = snapshot.latestSnapshotsByDebt?.[item.debtId];
    if (!debt || !latestSnapshot || isBalanceUnresolved(debt)) {
      allSafe = false;
      return sum;
    }
    return sum + toAmount(latestSnapshot.balance);
  }, 0);

  if (!allSafe) {
    return {
      confirmed: false,
      openingBalance,
      latestBalance: 0,
      eliminated: 0,
      percent: 0,
      laterConfirmedHistory: false,
    };
  }

  const observed = aggregateObservedTrajectory(snapshot);
  const eliminated = Math.max(0, openingBalance - latestBalance);
  const percent = openingBalance > 0 ? (eliminated / openingBalance) * 100 : 0;

  return {
    confirmed: true,
    openingBalance,
    latestBalance,
    eliminated,
    percent: Math.min(100, Math.max(0, percent)),
    laterConfirmedHistory: observed.hasLaterConfirmedPoint,
  };
};

export const deriveZeroDay = (snapshot) => {
  if (!snapshot?.activeContext?.version) return null;
  if (!snapshot.projectedZeroDate) return null;
  if ((snapshot.warnings || []).some((warning) => warning.code === "projection_capped")) return null;
  return snapshot.projectedZeroDate;
};

export const deriveHouseholdBreakdown = (snapshot) => {
  if (snapshot.workspace.type !== "household") return null;

  const breakdown = [];
  (snapshot.portfolioSummary?.memberDebt || []).forEach((member) => {
    if (toAmount(member.total) > 0) {
      breakdown.push({
        type: "member",
        uid: member.uid,
        displayName: member.displayName || member.uid,
        totalDebt: toAmount(member.total),
        debtCount: member.debtCount || 0,
      });
    }
  });

  if (toAmount(snapshot.portfolioSummary?.jointDebt) > 0) {
    breakdown.push({
      type: "joint",
      displayName: "Joint",
      totalDebt: toAmount(snapshot.portfolioSummary.jointDebt),
      debtCount: 0,
    });
  }

  if (toAmount(snapshot.portfolioSummary?.unassignedDebt) > 0) {
    breakdown.push({
      type: "unassigned",
      displayName: "Unassigned",
      totalDebt: toAmount(snapshot.portfolioSummary.unassignedDebt),
      debtCount: 0,
    });
  }

  return breakdown.sort((a, b) => b.totalDebt - a.totalDebt);
};

export const deriveDebtSnapshot = (snapshot, { hasActivePlan = false } = {}) => {
  const allTracked = (snapshot?.debts || []).filter((debt) => debt.status !== "archived");
  const scoped = hasActivePlan
    ? (snapshot?.includedDebts || []).filter((debt) => debt.status !== "archived")
    : allTracked;
  const active = scoped.filter((debt) => !isConfirmedZero(debt));
  const knownAprDebts = active.filter((debt) => debt.aprStatus === "known" && debt.apr != null);
  const highestAprDebt = knownAprDebts.sort((a, b) => Number(b.apr || 0) - Number(a.apr || 0))[0] || null;

  return {
    trackedCount: allTracked.length,
    activeCount: active.length,
    activeLabel: hasActivePlan
      ? `${active.length} debt${active.length === 1 ? "" : "s"} left`
      : `${active.length} active debt${active.length === 1 ? "" : "s"}`,
    remainingDebt: hasActivePlan
      ? toAmount(snapshot?.portfolioSummary?.includedDebt)
      : toAmount(snapshot?.portfolioSummary?.totalWorkspaceDebt),
    highestKnownApr: highestAprDebt ? Number(highestAprDebt.apr || 0) : null,
    highestKnownAprDebtName: highestAprDebt?.name || "",
  };
};

export const deriveDataFreshness = (snapshot, asOf = new Date()) => {
  const debtsWithSnapshots = (snapshot.includedDebts || [])
    .map((debt) => ({
      debtId: debt.id,
      debtName: debt.name,
      snapshot: snapshot.latestSnapshotsByDebt?.[debt.id],
    }))
    .filter((item) => item.snapshot);

  if (!debtsWithSnapshots.length) {
    return { isStale: true, daysOld: 999, lastUpdate: null, staleDebts: [] };
  }

  const oldest = debtsWithSnapshots.reduce((acc, current) => (
    new Date(current.snapshot.observedAt).getTime() < new Date(acc.snapshot.observedAt).getTime() ? current : acc
  ));

  const lastUpdate = new Date(oldest.snapshot.observedAt);
  const daysOld = Math.floor((asOf.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
  const isStale = daysOld >= TRACKTOZERO_STATUS_THRESHOLDS.staleBalanceDays;

  const staleDebts = debtsWithSnapshots
    .map((item) => ({
      debtId: item.debtId,
      debtName: item.debtName,
      daysOld: Math.floor((asOf.getTime() - new Date(item.snapshot.observedAt).getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter((item) => item.daysOld >= 30);

  return { isStale, daysOld, lastUpdate, staleDebts };
};

export const derivePaidOffDebts = (snapshot) =>
  (snapshot.debts || [])
    .filter((debt) => isConfirmedZero(debt))
    .map((debt) => ({
      debt,
      paidOffAt: snapshot.latestSnapshotsByDebt?.[debt.id]?.observedAt,
    }))
    .sort((a, b) => new Date(b.paidOffAt).getTime() - new Date(a.paidOffAt).getTime());

export const deriveProjectedTrajectory = (snapshot) => {
  const checkpoints = snapshot.expectedCheckpoints || [];
  if (!checkpoints.length) return [];
  return sampleEvenly(checkpoints)
    .map((checkpoint, index, list) => {
      const checkpointDate = parseMonthLabel(checkpoint.period);
      if (!checkpointDate) return null;
      return {
        kind: "projected",
        pointType: index === list.length - 1 && toAmount(checkpoint.expectedTotalBalance) <= 0 ? "zero" : "projected",
        at: checkpointDate.toISOString(),
        period: checkpoint.period,
        balance: toAmount(checkpoint.expectedTotalBalance),
        label: index === list.length - 1 && toAmount(checkpoint.expectedTotalBalance) <= 0 ? "$0 projected" : "Projected balance",
      };
    })
    .filter(Boolean);
};

export const deriveTrajectory = (snapshot) => {
  const observed = snapshot?.activeContext?.version
    ? aggregateObservedTrajectory(snapshot)
    : aggregateObservedTrajectoryWithoutPlan(snapshot);
  const projected = snapshot?.activeContext?.version ? deriveProjectedTrajectory(snapshot) : [];
  return {
    observed: observed.points,
    projected,
    latestMovement: observed.latestMovement,
    hasObservedHistory: observed.points.length > 0,
    hasLaterObservedPoint: observed.hasLaterConfirmedPoint,
  };
};

export const deriveNextMilestone = (snapshot) => {
  const checkpoints = snapshot.expectedCheckpoints || [];
  if (!checkpoints.length) return null;
  const targetDebt = snapshot.targetDebt || null;
  const projectedZeroCheckpoint = checkpoints.find((checkpoint) => toAmount(checkpoint.expectedTotalBalance) <= 0) || null;
  if (projectedZeroCheckpoint && targetDebt) {
    return {
      type: "projected_payoff",
      title: `${targetDebt.name} is projected to hit $0`,
      supporting: "Projected payoff under your current active plan.",
      period: projectedZeroCheckpoint.period,
      expectedTotalBalance: toAmount(projectedZeroCheckpoint.expectedTotalBalance),
    };
  }

  const nextCheckpoint = checkpoints.find((checkpoint) => toAmount(checkpoint.expectedTotalBalance) > 0) || checkpoints[0];
  return {
    type: "checkpoint",
    title: targetDebt ? `${targetDebt.name} is your current payoff focus` : "Your next projected checkpoint",
    supporting: targetDebt
      ? `Projected balance by ${nextCheckpoint.period}: ${toAmount(nextCheckpoint.expectedTotalBalance).toFixed(2)}.`
      : `Projected balance by ${nextCheckpoint.period}: ${toAmount(nextCheckpoint.expectedTotalBalance).toFixed(2)}.`,
    period: nextCheckpoint.period,
    expectedTotalBalance: toAmount(nextCheckpoint.expectedTotalBalance),
  };
};

export const deriveMomentum = (snapshot, progress, trajectory) => {
  if (!progress?.confirmed) {
    return {
      kind: "insufficient_history",
      headline: "Your progress history will appear after your next confirmed balance update.",
      supporting: "",
      eliminated: 0,
      latestMovement: null,
    };
  }

  if (progress.eliminated <= 0) {
    return {
      kind: "no_change",
      headline: "Your confirmed balance has not changed since your current baseline.",
      supporting: "Update your balances after your next statement to refresh your progress.",
      eliminated: 0,
      latestMovement: trajectory.latestMovement,
    };
  }

  if (!trajectory.latestMovement) {
    return {
      kind: "confirmed_progress",
      headline: "You've reduced your confirmed debt since your starting balance.",
      supporting: "",
      eliminated: progress.eliminated,
      latestMovement: null,
    };
  }

  return {
    kind: trajectory.latestMovement.delta < 0 ? "confirmed_progress" : "balance_increase",
    headline: trajectory.latestMovement.delta < 0
      ? "Your latest confirmed balance moved down."
      : "Your latest confirmed balance moved up.",
    supporting: "",
    eliminated: progress.eliminated,
    latestMovement: {
      delta: trajectory.latestMovement.delta,
      from: trajectory.latestMovement.from.at,
      to: trajectory.latestMovement.to.at,
    },
  };
};

// The single deterministic priority chain behind Home's "Next Move" hero.
// Exactly one state wins - the first branch whose condition is true, in this
// fixed order. Tiers 2-6 all structurally no-op before a plan exists
// (planHealth can't be "critical" pre-plan, debtsAwaitingReforecast is
// always empty pre-plan since there's no frozen queue to lag behind,
// dataFreshness/monthlyStatus are null/no-plan-shaped pre-plan) - so in
// practice only blocking review can ever preempt the no-plan state, which
// matches the product intent: resolve bad imported data before committing
// to a plan built on it.
export const deriveNextMove = (snapshot, context) => {
  if (context.hasBlockingReview) {
    return {
      label: "Resolve a review item",
      body: "A review item is blocking full plan trust. Clean that up before relying on the projection.",
      ctaLabel: "Open Review",
      action: "review",
    };
  }

  if (context.planHealth?.code === "critical") {
    return {
      label: "Review your plan",
      body: "Your active plan has a critical warning (for example, a projected balance that isn't shrinking). Review it before trusting this plan's status.",
      ctaLabel: "View My Plan",
      action: "plan",
    };
  }

  const debtsAwaitingReforecast = context.debtsAwaitingReforecast || [];
  if (debtsAwaitingReforecast.length > 0) {
    const names = debtsAwaitingReforecast.map((debt) => debt.name).join(", ");
    return {
      label: "Reforecast your plan",
      body: `${names} ${debtsAwaitingReforecast.length === 1 ? "was" : "were"} added after this plan was last set, so ${debtsAwaitingReforecast.length === 1 ? "it isn't" : "they aren't"} reflected yet. Reforecast to include ${debtsAwaitingReforecast.length === 1 ? "it" : "them"}.`,
      ctaLabel: "View My Plan",
      action: "plan",
    };
  }

  if (context.dataFreshness?.isStale) {
    return {
      label: "Update your balances",
      body: "Your latest confirmed balances are stale, so Home can't compare reality to your plan with confidence.",
      ctaLabel: "Update balances",
      action: "debts",
    };
  }

  const monthlyStatus = context.monthlyStatus;
  const targetName = context.currentTarget?.name || "this target debt";

  if (monthlyStatus?.shouldRecordPayment) {
    return {
      label: `Record your ${targetName} payment`,
      body: monthlyStatus.supporting,
      ctaLabel: monthlyStatus.ctaLabel || "Record payment",
      action: "debts",
    };
  }

  if (monthlyStatus?.shouldUpdateBalance || monthlyStatus?.balanceRefreshNeeded) {
    return {
      label: `Update your ${targetName} balance`,
      body: "Payment history is recorded, but confirmed progress only moves after a new balance snapshot.",
      ctaLabel: "Update balance",
      action: "debts",
    };
  }

  if (context.homeState === "no-plan") {
    return {
      label: "Pick your payoff strategy",
      body: "Compare Snowball and Avalanche so Home can start guiding what to do next.",
      ctaLabel: "Compare strategies",
      action: "compare",
    };
  }

  if (context.allDebtsArePaidOff) {
    return {
      label: "You've confirmed $0",
      body: "Your included debts are confirmed paid off. TrackToZero is preserving this journey rather than pointing you to a next payoff step.",
      ctaLabel: "View debts",
      action: "debts",
    };
  }

  if (!monthlyStatus) {
    return {
      label: "Check your plan",
      body: "Open your plan and debts so TrackToZero can refresh your current target.",
      ctaLabel: "View My Plan",
      action: "plan",
    };
  }

  return {
    label: "Stay on this month's target",
    body: "Your current target is set. Keep balances fresh so Home can compare reality to the plan.",
    ctaLabel: "View debt",
    action: "debts",
  };
};

export const deriveInsights = (snapshot, context) => {
  const insights = [];
  const warnings = snapshot.warnings || [];
  const progress = context.progress;
  const dataFreshness = context.dataFreshness;
  const projectedZeroDate = context.zeroDay || snapshot.projectedZeroDate || "";
  const monthsToZero = monthDiff(HOME_REFERENCE_MONTH, projectedZeroDate);

  if (warnings.some((warning) => warning.code === "negative_amortization")) {
    insights.push({
      tone: "danger",
      title: "Your current payment may not reduce one balance.",
      body: "Review your plan before continuing with the current payment path.",
      cta: "View my plan",
      action: "plan",
    });
  }

  if (context.openReviewCount > 0) {
    insights.push({
      tone: "warning",
      title: `${context.openReviewCount} debt${context.openReviewCount === 1 ? "" : "s"} still need review.`,
      body: "Review items can change what TrackToZero is able to trust in your plan.",
      cta: "Review now",
      action: "review",
    });
  }

  if (warnings.some((warning) => warning.code === "unknown_apr")) {
    insights.push({
      tone: "warning",
      title: "A missing APR is limiting your interest projection.",
      body: "Adding it would make your payoff estimate more complete.",
      cta: "View debts",
      action: "debts",
    });
  }

  if (dataFreshness?.isStale) {
    insights.push({
      tone: "info",
      title: "Your balance updates look stale.",
      body: "Refresh a balance after your next statement so Home can compare reality to your plan.",
      cta: "Update balances",
      action: "debts",
    });
  }

  if (progress?.confirmed && progress.eliminated > 0) {
    insights.push({
      tone: context.planHealth?.code === "ahead" ? "success" : "info",
      title: `You've confirmed ${Math.round(progress.percent)}% of this payoff journey.`,
      body: projectedZeroDate && monthsToZero != null
        ? `Your active plan still projects reaching $0 around ${projectedZeroDate} (${monthsToZero} months from Aug 2026).`
        : "Keep confirming balances over time to sharpen your projection.",
      cta: context.hasActivePlan ? "View my plan" : "Compare strategies",
      action: context.hasActivePlan ? "plan" : "compare",
    });
  }

  return insights.slice(0, 3);
};

export const deriveHomeContext = (snapshot, reviewSnapshot, scenario) => {
  const workspace = snapshot.workspace || {};
  const isHousehold = workspace.type === "household";
  const isPersonal = workspace.type === "personal";
  const hasDebts = (snapshot.debts || []).length > 0;
  const hasActivePlan = !!snapshot.activeContext?.version;
  const includedDebts = snapshot.includedDebts || [];
  const allDebtsArePaidOff = includedDebts.length > 0 && includedDebts.every((debt) => isConfirmedZero(debt));

  const progress = hasActivePlan ? deriveConfirmedProgress(snapshot) : aggregateTrackedProgressWithoutPlan(snapshot);
  const zeroDay = hasActivePlan ? deriveZeroDay(snapshot) : null;
  const planHealth = snapshot.status;
  const householdBreakdown = isHousehold ? deriveHouseholdBreakdown(snapshot) : null;
  const dataFreshness = hasActivePlan ? deriveDataFreshness(snapshot) : null;
  const paidOffDebts = derivePaidOffDebts(snapshot);
  const trajectory = deriveTrajectory(snapshot);

  const debtsAwaitingReforecast = hasActivePlan
    ? deriveDebtsAwaitingReforecast({
        debts: snapshot.debts || [],
        payoffQueue: snapshot.payoffQueue || [],
        startingDebtSnapshot: snapshot.activeContext?.version?.startingDebtSnapshot || [],
      })
    : [];

  const openReviewCount = reviewSnapshot?.actionableCount ?? reviewSnapshot?.openCount ?? 0;
  const blockingReviewCount = reviewSnapshot?.blockingCount || 0;
  const deferredBlockingCount = reviewSnapshot?.deferredBlockingCount || 0;
  const staleBatchCount = reviewSnapshot?.staleBatchCount || 0;
  const staleCandidateCount = reviewSnapshot?.staleCandidateCount || 0;
  const hasBlockingReview = blockingReviewCount > 0;
  const hasStaleReview = staleBatchCount > 0;
  const whatIf = scenario || null;

  let homeState = "unknown";
  if (!hasDebts) homeState = "no-debt";
  else if (!hasActivePlan) homeState = "no-plan";
  else if (hasBlockingReview && planHealth?.code !== "critical") homeState = "blocking-review";
  else if (planHealth?.code === "critical") homeState = "critical";
  else if (allDebtsArePaidOff) homeState = "all-paid-off";
  else homeState = "active-plan";

  const includedDebt = toAmount(snapshot.portfolioSummary?.includedDebt);
  const excludedDebt = toAmount(snapshot.portfolioSummary?.excludedDebt);
  const totalDebt = toAmount(snapshot.portfolioSummary?.totalWorkspaceDebt);
  const primaryRemainingDebt = hasActivePlan ? includedDebt : totalDebt;
  const primaryDebtScopeLabel = hasActivePlan ? "Included in your active payoff journey" : "Confirmed tracked debt";
  const secondaryDebtMetric = excludedDebt > 0
    ? { label: "Tracked outside this payoff journey", value: excludedDebt }
    : null;

  const context = {
    workspace,
    isHousehold,
    isPersonal,
    homeState,
    hasDebts,
    hasActivePlan,
    allDebtsArePaidOff,
    totalDebt,
    includedDebt,
    excludedDebt,
    primaryRemainingDebt,
    primaryDebtScopeLabel,
    secondaryDebtMetric,
    progress,
    zeroDay,
    planHealth,
    warnings: snapshot.warnings || [],
    currentTarget: snapshot.targetDebt,
    payoffQueue: snapshot.payoffQueue,
    strategy: snapshot.activeContext?.version?.strategy,
    extraMonthlyPayment: snapshot.activeContext?.version?.extraMonthlyPayment,
    activeVersion: snapshot.activeContext?.version || null,
    openReviewCount,
    blockingReviewCount,
    deferredBlockingCount,
    staleBatchCount,
    staleCandidateCount,
    hasBlockingReview,
    hasStaleReview,
    debtsAwaitingReforecast,
    householdBreakdown,
    members: snapshot.members,
    dataFreshness,
    paidOffDebts,
    trajectory,
    nextMilestone: hasActivePlan ? deriveNextMilestone(snapshot) : null,
    whatIf,
    monthlyStatus: deriveCurrentPlanPeriodStatus(snapshot),
    debtCount: (snapshot?.debts || []).filter((debt) => debt.status !== "archived").length,
    debtSnapshot: deriveDebtSnapshot(snapshot, { hasActivePlan }),
    snapshot,
  };

  return {
    ...context,
    momentum: hasActivePlan ? deriveMomentum(snapshot, progress, trajectory) : null,
    nextMove: deriveNextMove(snapshot, context),
    insights: deriveInsights(snapshot, context),
  };
};
