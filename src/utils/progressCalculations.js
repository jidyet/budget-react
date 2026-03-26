const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

export const asMoney = (value) => money.format(Number(value || 0));

export const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const getAccountStartingBalance = (account, previousRecord) => {
  const currentBalance = safeNumber(account?.cur_bal);
  const previousBalance = safeNumber(previousRecord?.cur_bal ?? previousRecord?.base_bal_v);
  const seedBalance = safeNumber(account?.starting_bal ?? account?.base_bal_v);
  return Math.max(currentBalance, previousBalance, seedBalance);
};

export const getAccountProgress = (account, previousRecord) => {
  const currentBalance = Math.max(0, safeNumber(account?.cur_bal));
  const startingBalance = Math.max(0, getAccountStartingBalance(account, previousRecord));
  const paidDown = Math.max(0, startingBalance - currentBalance);
  const ratio = startingBalance > 0 ? clamp(paidDown / startingBalance) : currentBalance <= 0 ? 1 : 0;
  return {
    currentBalance,
    startingBalance,
    paidDown,
    ratio,
    almostDone: currentBalance > 0 && (currentBalance <= Math.min(500, startingBalance * 0.15) || ratio >= 0.85),
    cleared: currentBalance <= 0.01,
  };
};

export const getMonthChange = (accounts, getPrevRecord) => {
  let previousTotal = 0;
  let currentTotal = 0;

  accounts.forEach((account) => {
    const previous = getPrevRecord ? getPrevRecord(account.id) : null;
    currentTotal += Math.max(0, safeNumber(account.cur_bal));
    previousTotal += Math.max(0, getAccountStartingBalance(account, previous));
  });

  const reduction = Math.max(0, previousTotal - currentTotal);
  return {
    previousTotal,
    currentTotal,
    reduction,
    improved: reduction > 0,
  };
};

export const getProgressLabel = (monthsSooner) => {
  if (monthsSooner >= 2) return `${monthsSooner} months sooner`;
  if (monthsSooner === 1) return "1 month sooner";
  return "You moved forward";
};

export const getProjectedMonthLabel = (rows) => {
  const lastRow = rows?.[rows.length - 1];
  if (lastRow?.month) return lastRow.month;
  return "Keep going";
};

export const buildProjectedDateFromMonths = (selMonth, selYear, monthCount) => {
  if (!monthCount || monthCount < 1) return "";
  const target = new Date(selYear, selMonth - 1 + (monthCount - 1), 1);
  return dateLabel.format(target);
};
