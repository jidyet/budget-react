import {
  buildShortNextStep,
  getBalancesThatWentUp,
  getDueSoonAccounts,
  getOverdueAccounts,
  getPaidCountThisMonth,
  summarizeReason,
} from "../utils/guidanceRules";
import { safeNumber } from "../utils/progressCalculations";

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));

export const buildProgressScore = ({
  accounts = [],
  progress,
  momentum,
  activity = [],
  workspaceMode = "solo",
  getPrevRecord,
}) => {
  const overdue = getOverdueAccounts(accounts);
  const dueSoon = getDueSoonAccounts(accounts);
  const balancesUp = getBalancesThatWentUp(accounts, getPrevRecord);
  const paidCount = getPaidCountThisMonth(accounts);
  const reduction = safeNumber(progress?.totalReduction);
  const paidThisMonth = safeNumber(progress?.paidThisMonth);
  const totalDue = safeNumber(progress?.totalDue);
  const monthlyCoverage = totalDue > 0 ? Math.min(1, paidThisMonth / totalDue) : paidThisMonth > 0 ? 1 : 0;
  const weeklyHandled = safeNumber(momentum?.weeklyHandled);
  const householdBoost = workspaceMode === "household" && activity.length > 0 ? 4 : 0;

  let score = 54;
  score += Math.round(monthlyCoverage * 18);
  score += Math.min(12, paidCount * 3);
  score += reduction > 0 ? 10 : 0;
  score += Math.min(8, weeklyHandled * 2);
  score += householdBoost;
  score -= overdue.length * 12;
  score -= balancesUp.length * 4;
  score -= dueSoon.length > 4 ? 4 : 0;
  score = clampScore(score);

  let label = "Keep going";
  if (score >= 85) label = "You're doing great";
  else if (score >= 70) label = "You're doing good";
  else if (score >= 55) label = "You're on track";
  else if (score >= 40) label = "One small move helps";
  else label = "Start with one thing";

  return {
    score,
    label,
    reason: summarizeReason({
      overdueCount: overdue.length,
      paidCount,
      reduction,
      weeklyHandled,
    }),
    nextStep: buildShortNextStep({
      overdue,
      almostDoneDebt: progress?.almostDoneDebt,
      nextFocusDebt: progress?.nextFocusDebt,
      dueSoon,
    }),
    tone: overdue.length ? "warn" : score >= 70 ? "good" : "steady",
    overdueCount: overdue.length,
    balancesUpCount: balancesUp.length,
    dueSoonCount: dueSoon.length,
  };
};

