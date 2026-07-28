import { isBillOverdue } from "./billModel";
import { asMoney } from "../utils/progressCalculations";

export const buildNextMove = ({ progress, accounts = [], dueSoon = [], getPrevRecord, workspaceMode = "solo", activity = [] }) => {
  if (!progress) {
    return {
      title: "Next move",
      body: "Keep going",
      detail: "Open the app again tomorrow.",
      tone: "default",
      action: "bills",
    };
  }

  const overdue = accounts.filter((account) => isBillOverdue(account));
  if (overdue.length) {
    return {
      title: "Next move",
      body: `Pay ${overdue[0].name} first`,
      detail: overdue.length > 1 ? `${overdue.length} bills need attention` : "This one needs attention",
      tone: "warn",
      action: "bills",
    };
  }

  const balanceUp = accounts.find((account) => {
    if (typeof getPrevRecord !== "function") return false;
    const previous = getPrevRecord(account.id);
    return Number(account?.cur_bal || 0) > Number(previous?.cur_bal || 0) + 1;
  });
  if (balanceUp) {
    return {
      title: "Next move",
      body: `Update ${balanceUp.name}`,
      detail: "Its balance went up",
      tone: "warn",
      action: "bills",
    };
  }

  if (progress.almostDoneDebt) {
    return {
      title: "Next move",
      body: `Finish ${progress.almostDoneDebt.name}`,
      detail: `${asMoney(progress.almostDoneDebt.currentBalance)} left`,
      tone: "accent",
      action: "payoff",
    };
  }

  if (progress.nextFocusDebt) {
    return {
      title: "Next move",
      body: `Focus on ${progress.nextFocusDebt.name}`,
      detail: progress.monthsSooner > 0
        ? progress.monthsSoonerLabel
        : `${asMoney(progress.nextFocusDebt.cur_bal)} left`,
      tone: "default",
      action: "payoff",
    };
  }

  if (dueSoon.length) {
    return {
      title: "Next move",
      body: `Check ${dueSoon[0].name}`,
      detail: dueSoon[0].d_left === 0 ? "Due today" : `Due in ${dueSoon[0].d_left} days`,
      tone: "accent",
      action: "due-next",
    };
  }

  if (progress.totalDebtLeft <= 0.01) {
    return {
      title: "Nice work",
      body: "You're all caught up",
      detail: "Keep the streak going tomorrow.",
      tone: "success",
      action: "overview",
    };
  }

  return {
    title: "Next move",
    body: workspaceMode === "household" && activity.length ? "Check the latest update" : "Pay the next one down",
    detail: progress.totalDue > progress.paidThisMonth ? `${asMoney(progress.totalDue - progress.paidThisMonth)} still open` : `${asMoney(progress.paidThisMonth)} paid this month`,
    tone: "default",
    action: "bills",
  };
};
