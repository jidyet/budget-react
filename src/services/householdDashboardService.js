import { subscribeHouseholdDashboard } from "../firebase";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const subscribeSharedDashboardSnapshot = (householdId, monthKey, callback) =>
  subscribeHouseholdDashboard(householdId, monthKey, (snapshot) => callback(formatSharedDashboard(snapshot)));

export const formatSharedDashboard = (snapshot) => {
  if (!snapshot) return null;
  return {
    ...snapshot,
    totalBalanceLabel: money.format(Number(snapshot.totalBalance || 0)),
    paidLabel: money.format(Number(snapshot.totalPaid || 0)),
    remainingLabel: money.format(Number(snapshot.remaining || 0)),
    incomeLabel: money.format(Number(snapshot.totalIncome || 0)),
  };
};
