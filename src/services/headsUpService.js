import {
  formatCountLabel,
  getBalancesThatWentUp,
  getDueSoonAccounts,
  getOverdueAccounts,
} from "../utils/guidanceRules";
import { asMoney } from "../utils/progressCalculations";

export const buildHeadsUps = ({
  accounts = [],
  progress,
  dueSoon = [],
  momentum,
  getPrevRecord,
}) => {
  const overdue = getOverdueAccounts(accounts);
  const soon = dueSoon.length ? dueSoon : getDueSoonAccounts(accounts);
  const balancesUp = getBalancesThatWentUp(accounts, getPrevRecord);
  const items = [];

  if (overdue.length) {
    items.push({
      id: "overdue",
      label: "Heads up",
      title: overdue.length === 1 ? "This one needs attention" : "A few need attention",
      detail: overdue.length === 1 ? overdue[0].name : formatCountLabel(overdue.length, "bill"),
      tone: "warn",
    });
  }

  if (soon.length) {
    items.push({
      id: "due-soon",
      label: "Due soon",
      title: soon.length === 1 ? soon[0].name : `${formatCountLabel(soon.length, "bill")} due soon`,
      detail: soon.length === 1 ? `Due in ${soon[0].d_left} days` : "A quick check keeps you ahead",
      tone: "accent",
    });
  }

  if (progress?.almostDoneDebt?.name) {
    items.push({
      id: "almost-done",
      label: "Almost there",
      title: progress.almostDoneDebt.name,
      detail: `${asMoney(progress.almostDoneDebt.currentBalance)} left`,
      tone: "good",
    });
  }

  if (balancesUp.length) {
    items.push({
      id: "balance-up",
      label: "Balance went up",
      title: balancesUp[0].name,
      detail: "Update this one when you can",
      tone: "warn",
    });
  }

  if (!items.length && momentum?.weeklyHandled) {
    items.push({
      id: "one-left",
      label: "One left",
      title: "You're still moving",
      detail: `${momentum.weeklyHandled} things moved this week`,
      tone: "good",
    });
  }

  return items.slice(0, 3);
};

