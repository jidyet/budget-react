import {
  isAlmostDoneBill,
  isBillCoveredThisCycle,
  isBillPaid,
  isDueSoonBill,
  isMonthlyBill,
  isNoInterestBill,
  needsBillUpdate,
  normalizeBillType,
  normalizeStartsOverMonthly,
} from "./billModel";

const safeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const safeText = (value, fallback = "") => String((value ?? fallback) || "").trim();

export const buildCoachMonthKey = (month, year) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const buildCoachHouseholdSummary = ({ workspaceMode = "solo", householdMembers = [] } = {}) => ({
  enabled: workspaceMode === "household",
  memberCount: Array.isArray(householdMembers) ? householdMembers.length : 0,
});

export const normalizeCoachBill = (account = {}) => {
  const billType = normalizeBillType(account);
  const startsOverMonthly = normalizeStartsOverMonthly(account);
  const balance = safeNumber(account?.balance ?? account?.bal ?? account?.cur_bal);
  const apr = safeNumber(account?.apr ?? account?.effectiveApr ?? account?.apr_v);
  const minDue = safeNumber(account?.minDue ?? account?.min_due_v);
  const paidAmount = safeNumber(account?.paidAmount ?? account?.paid_v);
  const plannedPayment = safeNumber(account?.plannedPayment ?? account?.effectivePayment ?? account?.planned_v ?? account?.paid_v ?? account?.min_due_v);
  const monthlyInterest = startsOverMonthly || billType === "noInterest"
    ? 0
    : safeNumber(account?.monthlyInterest);
  const principalReduction = safeNumber(account?.principalReduction ?? account?.principal);
  const dueDay = safeNumber(account?.dueDay ?? account?.day ?? account?.due_day);
  const base = {
    ...account,
    id: safeText(account?.id),
    name: safeText(account?.name, "Bill"),
    owner: safeText(account?.owner, "Unassigned"),
    category: safeText(account?.category),
    balance,
    apr,
    minDue,
    paidAmount,
    plannedPayment,
    monthlyInterest,
    principalReduction,
    dueDay,
    billType,
    startsOverMonthly,
  };
  return {
    ...base,
    isMonthly: isMonthlyBill(base),
    isNoInterest: isNoInterestBill(base),
    isPaid: isBillPaid({
      ...base,
      cur_bal: balance,
      min_due_v: minDue,
      paid_v: paidAmount,
      startsOverMonthly,
      billType,
      is_paid: account?.is_paid,
    }),
    dueSoon: isDueSoonBill({
      ...base,
      cur_bal: balance,
      min_due_v: minDue,
      paid_v: paidAmount,
      d_left: account?.d_left,
      is_paid: account?.is_paid,
      startsOverMonthly,
      billType,
    }),
    needsUpdate: needsBillUpdate({
      ...base,
      cur_bal: balance,
      min_due_v: minDue,
      paid_v: paidAmount,
      due_day: dueDay,
      startsOverMonthly,
      billType,
      is_paid: account?.is_paid,
    }),
    almostDone: isAlmostDoneBill({
      ...base,
      cur_bal: balance,
      starting_bal: safeNumber(account?.starting_bal ?? account?.base_bal_v ?? balance),
      startsOverMonthly,
      billType,
      is_paid: account?.is_paid,
    }),
    coveredThisMonth: startsOverMonthly && isBillCoveredThisCycle({
      ...base,
      cur_bal: balance,
      min_due_v: minDue,
      paid_v: paidAmount,
      is_paid: account?.is_paid,
      startsOverMonthly,
      billType,
    }),
  };
};

export const summarizeCoachAccounts = (accounts = [], limit = 6) =>
  (Array.isArray(accounts) ? accounts : [])
    .map((account) => normalizeCoachBill(account))
    .filter((account) =>
      account.balance > 0
      || account.plannedPayment > 0
      || account.monthlyInterest > 0
      || account.isMonthly
    )
    .sort((left, right) =>
      Number(right.dueSoon) - Number(left.dueSoon)
      || (right.monthlyInterest - left.monthlyInterest)
      || (right.apr - left.apr)
      || (right.balance - left.balance)
    )
    .slice(0, limit);

export const summarizeLargestBalances = (accounts = [], limit = 3) =>
  (Array.isArray(accounts) ? accounts : [])
    .map((account) => normalizeCoachBill(account))
    .filter((account) => account.balance > 0)
    .sort((left, right) => (right.balance - left.balance) || (right.apr - left.apr))
    .slice(0, limit);

export const summarizeCoachBillMix = (accounts = []) => {
  const rows = (Array.isArray(accounts) ? accounts : []).map((account) => normalizeCoachBill(account));
  return {
    totalBills: rows.length,
    paydownCount: rows.filter((row) => row.billType === "paydown").length,
    noInterestCount: rows.filter((row) => row.billType === "noInterest").length,
    monthlyCount: rows.filter((row) => row.billType === "monthly").length,
    monthlyCoveredCount: rows.filter((row) => row.billType === "monthly" && row.coveredThisMonth).length,
    monthlyNotCoveredCount: rows.filter((row) => row.billType === "monthly" && !row.coveredThisMonth).length,
    dueSoonCount: rows.filter((row) => row.dueSoon).length,
    paidCount: rows.filter((row) => row.isPaid).length,
    needsUpdateCount: rows.filter((row) => row.needsUpdate).length,
    almostDoneCount: rows.filter((row) => row.almostDone).length,
    unassignedCount: rows.filter((row) => !safeText(row.owner) || row.owner === "Unassigned").length,
  };
};

export const buildCoachState = ({
  askType = "overview",
  accounts = [],
  payoffSummary = null,
  trendSummary = null,
} = {}) => {
  const rows = (Array.isArray(accounts) ? accounts : []).map((account) => normalizeCoachBill(account));
  const debtLike = rows.filter((row) => row.billType !== "monthly" && (row.balance > 0 || row.plannedPayment > 0));
  const monthlyBills = rows.filter((row) => row.billType === "monthly");
  const missingBalances = rows.filter((row) => row.billType !== "monthly" && row.balance <= 0 && row.plannedPayment <= 0);
  const state = {
    ready: true,
    message: "",
    limitations: [],
  };

  if (!rows.length) {
    return {
      ready: false,
      message: askType === "payoff"
        ? "Add at least one pay-down bill to get payoff guidance."
        : "Add at least one debt to get AI guidance.",
      limitations: ["no_bills"],
    };
  }

  if (askType === "payoff" && !debtLike.length) {
    return {
      ready: false,
      message: monthlyBills.length
        ? "Most of your current items are monthly bills, so I can only help with coverage priorities."
        : "Add at least one pay-down bill to get payoff guidance.",
      limitations: monthlyBills.length ? ["only_monthly_bills"] : ["no_paydown_bills"],
    };
  }

  if (askType === "trends" && !trendSummary) {
    state.limitations.push("missing_trend_context");
  }
  if (askType === "payoff" && !payoffSummary?.monthsToZero && !payoffSummary?.recommendedTarget) {
    state.limitations.push("missing_payoff_target");
  }
  if (missingBalances.length) {
    state.limitations.push("missing_balances");
  }

  return state;
};
