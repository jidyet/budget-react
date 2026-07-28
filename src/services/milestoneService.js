import { asMoney, safeNumber } from "../utils/progressCalculations";
import { getBillDisplayName, isDebtBill } from "./billModel";

export const buildMilestones = ({ progress, accounts = [], getPrevRecord }) => {
  if (!progress) return [];

  const milestones = [];
  const debtAccounts = accounts.filter((account) => isDebtBill(account));
  const clearedDebts = debtAccounts.filter((account) => {
    const previous = getPrevRecord ? getPrevRecord(account.id) : null;
    return safeNumber(account.cur_bal) <= 0.01 && safeNumber(previous?.cur_bal ?? previous?.base_bal_v ?? account.starting_bal) > 0.01;
  });

  clearedDebts.slice(0, 2).forEach((account) => {
    milestones.push({
      id: `cleared-${account.id}`,
      title: "One down",
      body: `${getBillDisplayName(account)} cleared`,
      tone: "success",
    });
  });

  if (progress.almostDoneDebt) {
    milestones.push({
      id: `almost-${progress.almostDoneDebt.id}`,
      title: "Almost done",
      body: `${getBillDisplayName(progress.almostDoneDebt)} has ${asMoney(progress.almostDoneDebt.currentBalance)} left`,
      tone: "accent",
    });
  }

  if (progress.totalReduction > 0) {
    milestones.push({
      id: "moved-forward",
      title: "Balance went down",
      body: `${progress.totalReductionLabel} down this month`,
      tone: "success",
    });
  }

  if (progress.monthsSooner > 0) {
    milestones.push({
      id: "months-sooner",
      title: progress.monthsSooner >= 2 ? `${progress.monthsSooner} months sooner` : "1 month sooner",
      body: `Projected payoff now ${progress.projectedPayoffDate || "sooner than before"}`,
      tone: "accent",
    });
  }

  const paidAccounts = debtAccounts.filter((account) => safeNumber(account.paid_v) > 0);
  if (paidAccounts.length >= 2) {
    milestones.push({
      id: "multi-payments",
      title: "Nice work",
      body: `${paidAccounts.length} payments made this month`,
      tone: "default",
    });
  }

  return milestones.slice(0, 3);
};
