import {
  asMoney,
  buildProjectedDateFromMonths,
  getAccountProgress,
  getMonthChange,
  getProjectedMonthLabel,
  getProgressLabel,
  safeNumber,
} from "../utils/progressCalculations";
import { getBillBalance, isDebtBill } from "./billModel";

const getStrategyTarget = (accounts) => {
  const positiveAccounts = accounts.filter((account) => getBillBalance(account) > 0.01);
  if (!positiveAccounts.length) return { closestDebt: null, nextFocusDebt: null };

  const closestDebt = [...positiveAccounts].sort((left, right) => getBillBalance(left) - getBillBalance(right))[0] || null;
  const nextFocusDebt = [...positiveAccounts].sort((left, right) => safeNumber(right.effectiveApr ?? right.apr_v ?? right.apr) - safeNumber(left.effectiveApr ?? left.apr_v ?? left.apr))[0] || closestDebt;

  return { closestDebt, nextFocusDebt };
};

export const buildDebtProgressSnapshot = ({
  accounts = [],
  totalPaid = 0,
  totalDue = 0,
  getPrevRecord,
  payoffSimulate,
  selMonth,
  selYear,
  workspaceMode = "solo",
  householdMembers = [],
}) => {
  const activeAccounts = accounts
    .map((account) => ({ ...account, cur_bal: getBillBalance(account) }))
    .filter((account) => safeNumber(account.cur_bal) > 0.01 || safeNumber(account.paid_v) > 0);

  // Debt accounts only (excludes monthly recurring bills from debt totals)
  const paydownAccounts = activeAccounts.filter((account) => isDebtBill(account));

  // Total debt — paydown bills only (monthly bills reset each cycle, never "pay off")
  const totalDebtLeft = paydownAccounts.reduce((sum, account) => sum + Math.max(0, safeNumber(account.cur_bal)), 0);
  const totalExtraPaid = paydownAccounts.reduce((sum, account) => {
    const paid = safeNumber(account.paid_v);
    const minimum = safeNumber(account.min_due_v || account.budgeted_min);
    return sum + Math.max(0, paid - minimum);
  }, 0);
  const totalReduction = paydownAccounts.reduce((sum, account) => {
    const previous = getPrevRecord ? getPrevRecord(account.id) : null;
    return sum + getAccountProgress(account, previous).paidDown;
  }, 0);
  const monthChange = getMonthChange(paydownAccounts, getPrevRecord);

  // Progress list — all active accounts so monthly bills still appear in the UI
  const progressByDebt = activeAccounts
    .map((account) => {
      const previous = getPrevRecord ? getPrevRecord(account.id) : null;
      const accountProgress = getAccountProgress(account, previous);
      const balance = getBillBalance(account);
      return {
        ...account,
        ...accountProgress,
        currentBalance: balance,
        currentBalanceLabel: asMoney(balance),
        startingBalanceLabel: asMoney(accountProgress.startingBalance),
      };
    })
    .sort((left, right) => {
      if (left.almostDone !== right.almostDone) return left.almostDone ? -1 : 1;
      return left.currentBalance - right.currentBalance;
    });

  // Strategy targets — paydown bills only (monthly bills never "finish")
  const almostDoneDebt = progressByDebt.find((account) => isDebtBill(account) && account.almostDone && !account.cleared) || null;
  const { closestDebt, nextFocusDebt } = getStrategyTarget(paydownAccounts);

  // Payoff simulation — paydown bills only
  const baselineRows = typeof payoffSimulate === "function" ? payoffSimulate(paydownAccounts.filter((account) => safeNumber(account.cur_bal) > 0.01), "avalanche", 0, {}) : [];
  const acceleratedRows = typeof payoffSimulate === "function"
    ? payoffSimulate(paydownAccounts.filter((account) => safeNumber(account.cur_bal) > 0.01), "avalanche", totalExtraPaid, {})
    : [];
  const baselineMonths = baselineRows.length;
  const acceleratedMonths = acceleratedRows.length;
  const monthsSooner = Math.max(0, baselineMonths - acceleratedMonths);
  const projectedPayoffDate = acceleratedMonths
    ? getProjectedMonthLabel(acceleratedRows) || buildProjectedDateFromMonths(selMonth, selYear, acceleratedMonths)
    : "";

  return {
    workspaceMode,
    memberCount: householdMembers.length,
    totalDebtLeft,
    totalDebtLeftLabel: asMoney(totalDebtLeft),
    paidThisMonth: safeNumber(totalPaid),
    paidThisMonthLabel: asMoney(totalPaid),
    totalDue: safeNumber(totalDue),
    totalDueLabel: asMoney(totalDue),
    totalExtraPaid,
    totalExtraPaidLabel: asMoney(totalExtraPaid),
    totalReduction,
    totalReductionLabel: asMoney(totalReduction),
    monthChange,
    monthChangeLabel: asMoney(monthChange.reduction),
    progressByDebt,
    overallRatio: monthChange.previousTotal > 0 ? Math.max(0, Math.min(1, 1 - (totalDebtLeft / monthChange.previousTotal))) : 0,
    almostDoneDebt,
    closestDebt,
    nextFocusDebt,
    baselineMonths,
    acceleratedMonths,
    monthsSooner,
    monthsSoonerLabel: getProgressLabel(monthsSooner),
    projectedPayoffDate,
  };
};
