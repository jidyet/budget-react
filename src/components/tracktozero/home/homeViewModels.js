/**
 * homeViewModels.js
 *
 * Derives Home presentation context from the authoritative snapshot.
 * ONE place to compute all Home metrics - never computed independently
 * in components.
 *
 * Contract: uses only immutable truth from snapshot, never modifies anything.
 */

import { isBalanceUnresolved, isConfirmedZero } from "../../../domain/tracktozero/ownership.js";

/**
 * Derive confirmed progress from opening and latest snapshots.
 *
 * Contract:
 * - Compares the SAME frozen set of debts on both sides (the plan's
 *   startingDebtSnapshot) - a debt added to/dropped from core inclusion
 *   after activation must never silently shift either side of the
 *   comparison, or elimination looks bigger/smaller than it really is.
 * - confirmed = false (never eliminated/percent > 0) unless EVERY one of
 *   those debts has both a real latest observation AND a currently
 *   CONFIRMED (not unresolved) balance status - a missing snapshot must
 *   never be silently treated as "no balance" (which would inflate
 *   elimination), and an unresolved/imported-but-unverified balance must
 *   never be treated as confirmed truth.
 * - Never claims progress from unresolved or missing data.
 */
export const deriveConfirmedProgress = (snapshot) => {
  const startingDebtSnapshot = snapshot?.activeContext?.version?.startingDebtSnapshot;
  if (!startingDebtSnapshot?.length) {
    return { confirmed: false, openingBalance: 0, latestBalance: 0, eliminated: 0, percent: 0 };
  }

  // Sum confirmed opening balances from the frozen starting snapshot.
  const openingBalance = startingDebtSnapshot.reduce(
    (sum, snap) => sum + Math.max(0, Number(snap.balance) || 0),
    0
  );

  // Sum latest balances over the EXACT same debt set the opening balance
  // came from - and refuse to call the total "confirmed" the moment any
  // one of those debts lacks a safe, confirmed latest balance.
  let allSafe = true;
  const latestBalance = startingDebtSnapshot.reduce((sum, startingItem) => {
    const debt = snapshot.debts?.find((candidate) => candidate.id === startingItem.debtId);
    const latestSnapshot = snapshot.latestSnapshotsByDebt?.[startingItem.debtId];
    if (!debt || !latestSnapshot || isBalanceUnresolved(debt)) {
      allSafe = false;
      return sum;
    }
    return sum + Math.max(0, Number(latestSnapshot.balance) || 0);
  }, 0);

  if (!allSafe) {
    return { confirmed: false, openingBalance, latestBalance: 0, eliminated: 0, percent: 0 };
  }

  const eliminated = Math.max(0, openingBalance - latestBalance);
  const percent = openingBalance > 0 ? (eliminated / openingBalance) * 100 : 0;

  return {
    confirmed: true,
    openingBalance,
    latestBalance,
    eliminated,
    percent: Math.min(100, Math.max(0, percent)), // Clamp to 0-100
  };
};

/**
 * Derive Zero Day from projection.
 *
 * Contract:
 * - projectedZeroDate already exists in snapshot
 * - Returns null/"" if plan is not reachable or insufficient
 * - If projection_capped warning exists, plan capped at 255 months
 */
export const deriveZeroDay = (snapshot) => {
  if (!snapshot?.activeContext?.version) return null;
  if (!snapshot.projectedZeroDate) return null;

  // Check if there's a projection_capped warning - means plan doesn't actually reach $0
  const hasCapWarning = snapshot.warnings?.some((w) => w.code === "projection_capped");
  if (hasCapWarning) return null;

  return snapshot.projectedZeroDate;
};

/**
 * Derive household member breakdown.
 *
 * Contract:
 * - Only in household workspaces
 * - Joint debt counted ONCE in total, not per member
 * - Returns array of {uid, displayName, totalDebt, debtCount}
 * - Sorted by total debt descending
 */
export const deriveHouseholdBreakdown = (snapshot) => {
  if (snapshot.workspace.type !== "household") return null;

  const breakdown = [];

  // Member debts (excluding joint)
  if (snapshot.portfolioSummary?.memberDebt) {
    snapshot.portfolioSummary.memberDebt.forEach((member) => {
      if (Number(member.total) > 0) {
        breakdown.push({
          type: "member",
          uid: member.uid,
          displayName: member.displayName || member.uid,
          totalDebt: member.total,
          debtCount: member.debtCount || 0,
        });
      }
    });
  }

  // Joint debt (if any)
  if (Number(snapshot.portfolioSummary?.jointDebt) > 0) {
    breakdown.push({
      type: "joint",
      displayName: "Joint",
      totalDebt: snapshot.portfolioSummary.jointDebt,
      debtCount: 0,
    });
  }

  // Unassigned (if any)
  if (Number(snapshot.portfolioSummary?.unassignedDebt) > 0) {
    breakdown.push({
      type: "unassigned",
      displayName: "Unassigned",
      totalDebt: snapshot.portfolioSummary.unassignedDebt,
      debtCount: 0,
    });
  }

  // Sort by total debt descending
  return breakdown.sort((a, b) => b.totalDebt - a.totalDebt);
};

/**
 * Derive data freshness status.
 *
 * Contract:
 * - Checks latest snapshot date vs now
 * - Returns { isStale, daysOld, lastUpdate }
 * - Threshold: 45 days is "stale"
 */
export const deriveDataFreshness = (snapshot, asOf = new Date()) => {
  const debtsWithSnapshots = snapshot.includedDebts
    .map((debt) => ({
      debtId: debt.id,
      debtName: debt.name,
      snapshot: snapshot.latestSnapshotsByDebt?.[debt.id],
    }))
    .filter((d) => d.snapshot);

  if (debtsWithSnapshots.length === 0) {
    return { isStale: true, daysOld: 999, lastUpdate: null, staleDebts: [] };
  }

  // Find oldest snapshot
  const oldest = debtsWithSnapshots.reduce((acc, current) => {
    const accTime = new Date(acc.snapshot.observedAt).getTime();
    const currentTime = new Date(current.snapshot.observedAt).getTime();
    return currentTime < accTime ? current : acc;
  });

  const lastUpdateTime = new Date(oldest.snapshot.observedAt);
  const daysOld = Math.floor((asOf.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60 * 24));
  const isStale = daysOld >= 45;

  // Find which debts are stale (if multiple)
  const staleDebts = debtsWithSnapshots
    .filter((d) => {
      const daysOldForDebt = Math.floor(
        (asOf.getTime() - new Date(d.snapshot.observedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysOldForDebt >= 30;
    })
    .map((d) => ({ debtId: d.debtId, debtName: d.debtName, daysOld: Math.floor((asOf.getTime() - new Date(d.snapshot.observedAt).getTime()) / (1000 * 60 * 60 * 24)) }));

  return {
    isStale,
    daysOld,
    lastUpdate: lastUpdateTime,
    staleDebts,
  };
};

/**
 * Derive paid-off debt summary.
 *
 * Contract:
 * - Only includes debts with confirmed balance = $0
 * - Returns array of {debt, paidOffAt}
 * - Sorted by paidOffAt descending (most recent first)
 */
export const derivePaidOffDebts = (snapshot) => {
  return snapshot.debts
    .filter((debt) => isConfirmedZero(debt))
    .map((debt) => ({
      debt,
      paidOffAt: snapshot.latestSnapshotsByDebt?.[debt.id]?.observedAt,
    }))
    .sort((a, b) => new Date(b.paidOffAt) - new Date(a.paidOffAt));
};

/**
 * Main Home view-model derivation.
 *
 * Centralizes all presentation-layer calculations.
 * Everything Home needs to render is derived here once.
 */
export const deriveHomeContext = (snapshot, reviewSnapshot, scenario) => {
  const workspace = snapshot.workspace || {};
  const isHousehold = workspace.type === "household";
  const isPersonal = workspace.type === "personal";

  // Determine overall Home state
  const hasDebts = snapshot.debts?.length > 0;
  const hasActivePlan = !!snapshot.activeContext?.version;
  // The "you hit $0" celebration reflects included/core payoff truth, not
  // every debt in the workspace - a debt intentionally excluded from the
  // core payoff plan (e.g. a mortgage) must never block it, and a
  // workspace with zero included debts (nothing was ever a core payoff
  // target) must never trigger it either.
  const includedDebts = snapshot.includedDebts || [];
  const allDebtsArePaidOff = includedDebts.length > 0 && includedDebts.every((d) => isConfirmedZero(d));

  // Compute progress (only if active plan exists)
  const progress = hasActivePlan ? deriveConfirmedProgress(snapshot) : null;

  // Compute Zero Day (only if active plan exists and reachable)
  const zeroDay = hasActivePlan ? deriveZeroDay(snapshot) : null;

  // Compute status/health (only if active plan exists)
  const planHealth = snapshot.status;

  // Household breakdown (only for households)
  const householdBreakdown = isHousehold ? deriveHouseholdBreakdown(snapshot) : null;

  // Data freshness
  const dataFreshness = hasActivePlan ? deriveDataFreshness(snapshot) : null;

  // Paid-off debts
  const paidOffDebts = derivePaidOffDebts(snapshot);

  // Review counts (from shared ReviewSnapshot only - never recomputed here,
  // REVIEW-1C Part 33). openReviewCount uses the actionable count (excludes
  // items the user already chose "later" on) so Home's Quick Check headline
  // never disagrees with the nav badge (Part 32). blockingReviewCount is
  // deliberately NOT filtered by deferred status - a blocking review that
  // was deferred must still keep the plan untrusted (Part 12).
  const openReviewCount = reviewSnapshot?.actionableCount ?? reviewSnapshot?.openCount ?? 0;
  const blockingReviewCount = reviewSnapshot?.blockingCount || 0;
  const deferredBlockingCount = reviewSnapshot?.deferredBlockingCount || 0;
  const hasBlockingReview = blockingReviewCount > 0;

  // Scenario / What-If
  const whatIf = scenario || null;

  // Determine HOME STATE for routing
  let homeState = "unknown";
  if (!hasDebts) homeState = "no-debt";
  else if (!hasActivePlan) homeState = "no-plan";
  else if (hasBlockingReview && planHealth?.code !== "critical") homeState = "blocking-review";
  else if (planHealth?.code === "critical") homeState = "critical";
  else if (allDebtsArePaidOff) homeState = "all-paid-off";
  else homeState = "active-plan";

  return {
    // Core state
    workspace,
    isHousehold,
    isPersonal,
    homeState,
    hasDebts,
    hasActivePlan,
    allDebtsArePaidOff,

    // Financial metrics
    totalDebt: snapshot.portfolioSummary?.totalWorkspaceDebt || 0,
    includedDebt: snapshot.portfolioSummary?.includedDebt || 0,
    excludedDebt: snapshot.portfolioSummary?.excludedDebt || 0,

    // Progress & momentum
    progress,
    zeroDay,
    planHealth,
    warnings: snapshot.warnings || [],

    // Payoff targeting
    currentTarget: snapshot.targetDebt,
    payoffQueue: snapshot.payoffQueue,
    strategy: snapshot.activeContext?.version?.strategy,
    extraMonthlyPayment: snapshot.activeContext?.version?.extraMonthlyPayment,

    // Reviews
    openReviewCount,
    blockingReviewCount,
    deferredBlockingCount,
    hasBlockingReview,

    // Household
    householdBreakdown,
    members: snapshot.members,

    // Data quality
    dataFreshness,
    paidOffDebts,

    // Scenario
    whatIf,

    // Raw snapshot for fallback access
    snapshot,
  };
};
