import { describeDebtReviewReasons, effectiveOwnerType, isConfirmedZero } from "../../domain/tracktozero/ownership.js";
import { debtCategoryGroupFor } from "../../domain/tracktozero/financialItemTaxonomy.js";

const normalizeBalance = (value) => Number(value ?? 0) || 0;

export const deriveDebtPortfolioView = (snapshot = {}) => {
  const debts = Array.isArray(snapshot.debts) ? snapshot.debts : [];
  const isHousehold = snapshot.workspace?.type === "household";
  const activeDebts = debts.filter((debt) => debt?.status === "active");
  // UX-8.2: uses the same describeDebtReviewReasons union DebtBadges shows,
  // so a debt whose card displays "Needs review" (e.g. missing APR, junk
  // owner label) always lands in this same reviewDebts bucket - previously
  // this filter was narrower than the badge, so a debt could show "Needs
  // review" on its card yet never appear under the Debts page's own
  // "Needs review" filter/count.
  const reviewDebts = activeDebts.filter((debt) => describeDebtReviewReasons(debt, isHousehold).length > 0);
  const reviewDebtIds = new Set(reviewDebts.map((debt) => debt.id));
  const paidOffDebts = activeDebts.filter((debt) => isConfirmedZero(debt) && !reviewDebtIds.has(debt.id));
  const actionableDebts = activeDebts.filter((debt) => !isConfirmedZero(debt) && !reviewDebtIds.has(debt.id));

  const leftToGo = Math.max(0, Number(snapshot.portfolioSummary?.includedDebt ?? 0) || 0);
  const totalDebt = Math.max(0, Number(snapshot.portfolioSummary?.totalWorkspaceDebt ?? 0) || 0);
  const excludedDebt = Math.max(0, Number(snapshot.portfolioSummary?.excludedDebt ?? 0) || 0);

  const householdTotals = snapshot.workspace?.type === "household"
    ? {
        totalDebt,
        memberDebt: Number(snapshot.portfolioSummary?.memberDebt?.reduce((sum, member) => sum + Number(member.total || 0), 0) || 0),
        jointDebt: Number(snapshot.portfolioSummary?.jointDebt || 0),
        unassignedDebt: Number(snapshot.portfolioSummary?.unassignedDebt || 0),
      }
    : null;

  const householdBreakdown = snapshot.workspace?.type === "household"
    ? [
        ...(snapshot.portfolioSummary?.memberDebt || []).map((member) => ({
          type: "member",
          uid: member.uid,
          displayName: member.displayName || member.uid,
          totalDebt: Number(member.total || 0),
          debtCount: Number(member.debtCount || 0),
        })),
        ...(Number(snapshot.portfolioSummary?.jointDebt || 0) > 0 ? [{ type: "joint", displayName: "Joint / Household", totalDebt: Number(snapshot.portfolioSummary.jointDebt || 0), debtCount: 0 }] : []),
        ...(Number(snapshot.portfolioSummary?.unassignedDebt || 0) > 0 ? [{ type: "unassigned", displayName: "Unassigned", totalDebt: Number(snapshot.portfolioSummary.unassignedDebt || 0), debtCount: 0 }] : []),
      ]
    : [];

  const summaryCards = [
    { key: "leftToGo", label: "Left to go", value: leftToGo, tone: "primary" },
    { key: "active", label: "Active debts", value: actionableDebts.length, tone: "neutral" },
    { key: "review", label: "Needs review", value: reviewDebts.length, tone: "warning" },
    { key: "paidOff", label: "Paid off", value: paidOffDebts.length, tone: "success" },
  ];

  return {
    activeDebts: actionableDebts,
    reviewDebts,
    paidOffDebts,
    leftToGo,
    totalDebt,
    excludedDebt,
    householdTotals,
    householdBreakdown,
    summaryCards,
    isHousehold: snapshot.workspace?.type === "household",
    debtCount: activeDebts.length,
    debtsByOwner: {
      member: activeDebts.filter((debt) => effectiveOwnerType(debt) === "member").length,
      joint: activeDebts.filter((debt) => effectiveOwnerType(debt) === "joint").length,
      unassigned: activeDebts.filter((debt) => effectiveOwnerType(debt) === "unassigned").length,
    },
    budgetHealth: {
      needsReview: reviewDebts.length > 0,
      hasExcludedDebt: excludedDebt > 0,
      hasUnresolvedBalance: activeDebts.some((debt) => normalizeBalance(debt.currentBalance) === 0 && (debt.aprStatus === "unknown" || debt.minimumRequiredPayment === 0 || debt.minimumRequiredPayment == null)),
    },
  };
};

// UX-6.1: shared owner-scope filter, extracted from the Debts page's
// pre-existing "Filter by owner" logic - reused by the category grid,
// category detail view, and the Import Review owner filter so there is
// exactly one definition of what a given owner scope means, matching
// resolveDebtOwnership's ownerType/ownerId contract (never a parallel
// owner-matching mechanism). `ownerFilter` is "all" | "joint" | "unassigned"
// | a specific member uid or WorkspacePerson id.
export const filterDebtsByOwnerScope = (debts, ownerFilter = "all") => {
  if (!ownerFilter || ownerFilter === "all") return debts;
  if (ownerFilter === "joint" || ownerFilter === "unassigned") {
    return debts.filter((debt) => effectiveOwnerType(debt) === ownerFilter);
  }
  return debts.filter((debt) => debt.ownerId === ownerFilter);
};

// UX-6.1: groups a portfolio's debts by DEBT_CATEGORY_GROUPS for the visual
// category navigation (Debt Command Center + Import Review continuity).
// Derived from the SAME activeDebts/reviewDebts/paidOffDebts arrays
// deriveDebtPortfolioView already computed above - together they exactly
// partition "all active debts" (reviewDebts is checked first there, so a
// debt is never double-counted here either) - never a new query, never a
// parallel balance/ownership computation, so category totals stay
// reconciled with the rest of the portfolio for the same owner scope.
export const deriveCategoryBreakdown = (portfolio, { ownerFilter = "all", latestSnapshotsByDebt = {} } = {}) => {
  const allActive = [...portfolio.activeDebts, ...portfolio.reviewDebts, ...portfolio.paidOffDebts];
  const scoped = filterDebtsByOwnerScope(allActive, ownerFilter);
  const reviewIds = new Set(portfolio.reviewDebts.map((debt) => debt.id));
  const paidOffIds = new Set(portfolio.paidOffDebts.map((debt) => debt.id));
  const byGroup = new Map();
  for (const debt of scoped) {
    const group = debtCategoryGroupFor(debt.debtType);
    if (!byGroup.has(group)) byGroup.set(group, { group, count: 0, balance: 0, reviewCount: 0, paidOffCount: 0 });
    const entry = byGroup.get(group);
    entry.count += 1;
    entry.balance += normalizeBalance(latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance);
    if (reviewIds.has(debt.id)) entry.reviewCount += 1;
    if (paidOffIds.has(debt.id)) entry.paidOffCount += 1;
  }
  return [...byGroup.values()];
};
