import { subscribeHouseholdDashboard } from "../firebase";
import { fx0 } from "../utils/budgetUtils";

export const subscribeSharedDashboardSnapshot = (householdId, monthKey, callback) =>
  subscribeHouseholdDashboard(householdId, monthKey, (snapshot) => callback(formatSharedDashboard(snapshot)));

export const formatSharedDashboard = (snapshot) => {
  if (!snapshot) return null;
  return {
    ...snapshot,
    totalBalanceLabel: fx0(Number(snapshot.totalBalance || 0)),
    paidLabel: fx0(Number(snapshot.totalPaid || 0)),
    remainingLabel: fx0(Number(snapshot.remaining || 0)),
    incomeLabel: fx0(Number(snapshot.totalIncome || 0)),
  };
};
