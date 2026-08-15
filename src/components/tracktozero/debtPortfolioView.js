import { effectiveOwnerType, isConfirmedZero, isDebtNeedsReview, looksLikeJunkOwnerLabel } from "../../domain/tracktozero/ownership.js";

const normalizeBalance = (value) => Number(value ?? 0) || 0;

export const deriveDebtPortfolioView = (snapshot = {}) => {
  const debts = Array.isArray(snapshot.debts) ? snapshot.debts : [];
  const activeDebts = debts.filter((debt) => debt?.status === "active");
  const reviewDebts = activeDebts.filter((debt) => isDebtNeedsReview(debt) || looksLikeJunkOwnerLabel(debt?.ownerLabel));
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
