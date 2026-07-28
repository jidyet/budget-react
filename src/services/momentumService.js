import { isBillSettledThisCycle } from "./billModel";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

const isRecent = (value, now) => {
  const date = toDate(value);
  if (!date) return false;
  return now.getTime() - date.getTime() <= WEEK_MS;
};

export const buildMomentumSnapshot = ({
  accounts = [],
  activity = [],
  progress,
  getPrevRecord,
  now = new Date(),
}) => {
  const handledFromAccounts = accounts.filter((account) => {
    const prev = typeof getPrevRecord === "function" ? getPrevRecord(account.id) : null;
    if (isBillSettledThisCycle(account) && !isBillSettledThisCycle(prev || {})) return true;
    return Number(account.paid_v || 0) > Number(prev?.paid_v || 0);
  }).length;

  const activityThisWeek = activity.filter((item) => isRecent(item?.raw?.createdAt || item?.timestamp, now));
  const householdMoves = activityThisWeek.length;
  const weeklyHandled = Math.max(handledFromAccounts, householdMoves);
  const weeklyReduction = Number(progress?.totalReduction || 0);
  const onTrack = weeklyHandled > 0 || weeklyReduction > 0 || Number(progress?.paidThisMonth || 0) > 0;

  let title = "Keep going";
  let detail = "One small move keeps the week alive.";
  if (weeklyHandled >= 3) {
    title = "Good week";
    detail = `${weeklyHandled} things moved this week.`;
  } else if (weeklyHandled === 2) {
    title = "Moving this week";
    detail = "Two things already moved.";
  } else if (weeklyHandled === 1) {
    title = "One down";
    detail = "You moved one thing already.";
  } else if (Number(progress?.remaining || progress?.totalDue || 0) <= 0 && Number(progress?.paidThisMonth || 0) > 0) {
    title = "You're on track";
    detail = "The month is in a good spot.";
  }

  return {
    title,
    detail,
    weeklyHandled,
    weeklyReduction,
    weeklyReductionLabel: progress?.totalReductionLabel || "$0",
    onTrack,
    checkInCount: Math.max(1, Math.min(7, householdMoves || (onTrack ? 3 : 1))),
    activityCount: householdMoves,
  };
};
