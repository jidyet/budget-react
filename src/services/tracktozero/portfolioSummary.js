import { effectiveOwnerType, isBalanceUnresolved, isDebtNeedsReview, looksLikeJunkOwnerLabel } from "../../domain/tracktozero/ownership.js";

// THE single shared debt-portfolio derivation (UX-0 Part 3) - Home, Debts,
// and Plan summaries all consume this so a total can never disagree with
// the individual debt cards that make it up. Always computed from the LIVE
// set of debts (status === "active"), never from a PlanVersion's frozen
// startingDebtSnapshot - that snapshot exists to keep the ACTIVE PLAN's own
// simulation stable (see getEligiblePlanDebts in projectionStatusService.js),
// not to define "how much debt does this workspace have right now." A debt
// added after the plan was last activated/reforecast still owes real money
// and must still count in these totals, even though it isn't part of the
// plan's own frozen projection scope yet.
//
// Only debts with a CONFIRMED balance contribute to the dollar totals - an
// unresolved (failed-import) balance has no trustworthy number to add, and
// treating it as $0 would silently understate what's owed just as badly as
// treating a contaminated value as truth would (UX-0 Part 4/14). Those
// debts are still counted via needsReviewDebtIds so they are never silently
// dropped from view - just excluded from the arithmetic.
//
// Joint debt is counted exactly once in every total (totalWorkspaceDebt/
// includedDebt/excludedDebt) because each debt is visited exactly once to
// build those sums - the member/joint/unassigned breakdown below is a
// separate partition of that SAME set for display, never re-summed back in.
export const deriveDebtPortfolioSummary = ({ workspace, members = [], debts = [], debtBalance }) => {
  const active = debts.filter((debt) => debt.status === "active");
  const confirmed = active.filter((debt) => !isBalanceUnresolved(debt));
  const needsReviewDebtIds = active
    .filter((debt) => isDebtNeedsReview(debt) || looksLikeJunkOwnerLabel(debt.ownerLabel))
    .map((debt) => debt.id);

  const sum = (list) => list.reduce((total, debt) => total + debtBalance(debt), 0);
  const includedConfirmed = confirmed.filter((debt) => debt.includedInCorePayoffPlan !== false);
  const excludedConfirmed = confirmed.filter((debt) => debt.includedInCorePayoffPlan === false);

  const summary = {
    totalWorkspaceDebt: sum(confirmed),
    includedDebt: sum(includedConfirmed),
    excludedDebt: sum(excludedConfirmed),
    memberDebt: [],
    jointDebt: 0,
    unassignedDebt: 0,
    needsReviewDebtIds,
    needsReviewCount: needsReviewDebtIds.length,
  };

  if (workspace?.type !== "household") return summary;

  const byMember = new Map();
  for (const debt of includedConfirmed) {
    const balance = debtBalance(debt);
    const ownerType = effectiveOwnerType(debt);
    if (ownerType === "member" && debt.ownerId) {
      const member = members.find((candidate) => candidate.uid === debt.ownerId);
      const existing = byMember.get(debt.ownerId) || {
        uid: debt.ownerId,
        displayName: member?.displayName || debt.ownerLabel || debt.ownerId,
        total: 0,
        debtCount: 0,
      };
      existing.total += balance;
      existing.debtCount += 1;
      byMember.set(debt.ownerId, existing);
    } else if (ownerType === "joint") {
      summary.jointDebt += balance;
    } else {
      summary.unassignedDebt += balance;
    }
  }
  summary.memberDebt = [...byMember.values()].sort((a, b) => b.total - a.total);
  return summary;
};
