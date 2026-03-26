import { asMoney, safeNumber } from "./progressCalculations";

export const getOverdueAccounts = (accounts = []) =>
  accounts.filter((account) => Number(account?.d_left) < 0 && safeNumber(account?.cur_bal) > 0.01);

export const getDueSoonAccounts = (accounts = [], days = 5) =>
  accounts.filter((account) => {
    const dueLeft = Number(account?.d_left);
    return Number.isFinite(dueLeft) && dueLeft >= 0 && dueLeft <= days && safeNumber(account?.cur_bal) > 0.01;
  });

export const getBalancesThatWentUp = (accounts = [], getPrevRecord) =>
  accounts.filter((account) => {
    if (typeof getPrevRecord !== "function") return false;
    const previous = getPrevRecord(account.id);
    return safeNumber(account?.cur_bal) > safeNumber(previous?.cur_bal) + 1;
  });

export const getPaidCountThisMonth = (accounts = []) =>
  accounts.filter((account) => safeNumber(account?.paid_v) > 0).length;

export const formatCountLabel = (count, one, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export const buildShortNextStep = ({ overdue = [], almostDoneDebt, nextFocusDebt, dueSoon = [] } = {}) => {
  if (overdue.length) {
    const first = overdue[0];
    return `Next: pay ${first.name} first`;
  }
  if (almostDoneDebt?.name) {
    return `Next: finish ${almostDoneDebt.name}`;
  }
  if (nextFocusDebt?.name) {
    return `Next: focus on ${nextFocusDebt.name}`;
  }
  if (dueSoon.length) {
    return `Next: check ${dueSoon[0].name}`;
  }
  return "Next: keep going";
};

export const summarizeReason = ({ overdueCount = 0, paidCount = 0, reduction = 0, weeklyHandled = 0 }) => {
  if (overdueCount > 0) return `${formatCountLabel(overdueCount, "bill")} needs attention`;
  if (paidCount >= 3) return `You paid ${paidCount} bills this month`;
  if (weeklyHandled >= 2) return `${formatCountLabel(weeklyHandled, "move")} this week`;
  if (reduction > 0) return `${asMoney(reduction)} down this month`;
  return "You checked in and stayed aware";
};

