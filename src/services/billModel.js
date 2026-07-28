export const BILL_TYPE_OPTIONS = [
  {
    value: "paydown",
    label: "Pay down over time",
    help: "Balance goes down until this bill is fully finished.",
  },
  {
    value: "noInterest",
    label: "No-interest payment plan",
    help: "Balance goes down over time without interest.",
  },
  {
    value: "monthly",
    label: "Monthly bill",
    help: "Starts fresh each month and is tracked as covered.",
  },
];

export const BILL_FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "monthly", label: "Monthly" },
  { key: "noInterest", label: "No interest" },
  { key: "paydown", label: "Pay down" },
  { key: "dueSoon", label: "Due soon" },
  { key: "paid", label: "Paid" },
  { key: "needsUpdate", label: "Needs update" },
];

const normalizeString = (value) => String(value || "").trim();
const normalizeTypeToken = (value) => String(value || "").trim().toLowerCase();
const isTruthyFlag = (value) =>
  value === true ||
  value === 1 ||
  value === "1" ||
  String(value || "").trim().toLowerCase() === "true" ||
  String(value || "").trim().toLowerCase() === "yes";

const coerceBillType = (value) => {
  const raw = normalizeTypeToken(value);
  if (!raw) return "";
  if (raw === "monthly" || raw === "monthly bill" || raw.includes("monthly")) return "monthly";
  if (raw === "nointerest" || raw === "no interest" || raw === "no-interest" || raw.includes("no interest")) return "noInterest";
  if (raw === "paydown" || raw === "pay down" || raw === "pay down over time" || raw.includes("pay down")) return "paydown";
  return "";
};

const normalizeCategoryToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/[^\w\s]/g, "");

const titleCaseToken = (token) => {
  const KEEP = new Set(["APR", "CC", "IRS", "LLC", "LOC", "MOHELA", "SOFI", "UTD", "USBANK"]);
  if (KEEP.has(token)) return token;
  if (/^[A-Z0-9]{2,}$/.test(token)) return token.charAt(0) + token.slice(1).toLowerCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

const prettifyTokenCasing = (value) =>
  String(value || "")
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : titleCaseToken(part)))
    .join("");

const isDebtCategory = (bill = {}) =>
  /credit cards?|student loans?|personal loans?|line of credit|business/.test(
    normalizeCategoryToken(bill?.category)
  );

const hasDebtIndicators = (bill = {}) => {
  const haystack = [
    bill?.subtype,
    bill?.name,
    bill?.billName,
    bill?.bank,
  ]
    .map(normalizeCategoryToken)
    .filter(Boolean)
    .join(" ");
  return /credit|card|loan|line of credit|loc|student loan|personal loan|mortgage|auto loan|affirm|sofi|aidvantage|mohela|navient|nelnet|firstmark/.test(haystack);
};

const isRecurringCategory = (bill = {}) => {
  const category = normalizeCategoryToken(bill?.category);
  const subtype = normalizeCategoryToken(bill?.subtype);
  const name = normalizeCategoryToken(bill?.name || bill?.billName);
  const haystack = `${category} ${subtype} ${name}`.trim();
  if (!haystack) return false;
  if (
    /subscription|subscriptions|insurance|utilities|utility|home expense|home expenses|rent|mortgage payment|phone|internet|electric|electricity|water|sewer|trash|gas|groceries|daycare|school fees|streaming|toll|storage/.test(
      haystack
    )
  ) {
    return true;
  }
  return false;
};

export const getBillBalance = (bill = {}) => {
  const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  // Tier 1: direct current-balance fields (prefer the most-specific to least-specific)
  const directCandidates = [
    { key: "cur_bal", value: toNumber(bill?.cur_bal) },
    { key: "currentBalance", value: toNumber(bill?.currentBalance) },
    { key: "current_balance", value: toNumber(bill?.current_balance) },
    { key: "balance", value: toNumber(bill?.balance) },
    { key: "bal", value: toNumber(bill?.bal) },
    { key: "payoffBalance", value: toNumber(bill?.payoffBalance) },
    { key: "remainingBalance", value: toNumber(bill?.remainingBalance) },
  ];
  const directMatch = directCandidates.find((e) => e.value != null && Math.abs(e.value) > 0.009);
  if (directMatch) return directMatch.value;

  // Tier 2: computed balance from raw components (mirrors getBalanceBase/getComputedBalance
  // logic from budgetUtils without importing it — avoids circular dependency).
  // Covers bills where cur_bal=0 but base_bal_v + payment fields can reconstruct the balance.
  const baseV = toNumber(bill?.base_bal_v);
  if (baseV != null && baseV > 0.009) {
    const paid = Number(bill?.paid_v || 0);
    const purch = Number(bill?.purch_v || 0);
    return Math.max(0, baseV - paid + purch);
  }

  // Tier 3: starting_bal as last resort (original loan amount; stale but non-zero)
  const startingBal = toNumber(bill?.starting_bal);
  if (startingBal != null && Math.abs(startingBal) > 0.009) return startingBal;

  // All candidates were zero or absent
  const anyDirect = directCandidates.find((e) => e.value != null);
  return anyDirect ? anyDirect.value : 0;
};

export const normalizeStartsOverMonthly = (bill = {}) => {
  return normalizeBillType(bill) === "monthly";
};

export const normalizeBillType = (bill = {}) => {
  const debtLike = isDebtCategory(bill) || hasDebtIndicators(bill);
  const recurringLike = isRecurringCategory(bill);
  const primary = coerceBillType(bill?.billType);
  if (primary === "noInterest" || primary === "paydown") return primary;
  if (primary === "monthly") return debtLike ? "paydown" : "monthly";
  const fallback = coerceBillType(bill?.type);
  if (fallback === "noInterest" || fallback === "paydown") return fallback;
  if (fallback === "monthly") return debtLike ? "paydown" : "monthly";
  if (debtLike) return "paydown";
  if (isTruthyFlag(bill?.startsOverMonthly) && !debtLike) return "monthly";
  if (recurringLike && !debtLike) return "monthly";
  return "paydown";
};

export const getBillDisplayName = (bill = {}, options = {}) => {
  const { includeOwner = false } = options;
  const rawName = normalizeString(bill?.name || bill?.billName);
  const bank = normalizeString(bill?.bank);
  const owner = normalizeString(bill?.owner || bill?.account_owner);

  let cleanName = rawName || bank || "Unnamed bill";

  if (owner) {
    cleanName = cleanName.replace(new RegExp(`\\s*\\(${owner}\\)\\s*$`, "i"), "").trim();
  }

  cleanName = cleanName
    .replace(/\s*\((credit card|student loan|personal loan|line of credit|subscription|utility|home expense|business|insurance)\)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (bank && cleanName.toLowerCase().startsWith(bank.toLowerCase())) {
    cleanName = cleanName.slice(bank.length).trim().replace(/^[-:/\s]+/, "").trim();
  }

  const aliases = new Map([
    ["AMEX", "Amex"],
    ["BOFA", "Bank of America"],
    ["SOFI", "SoFi"],
    ["USBANK", "US Bank"],
    ["YTMUSIC", "YouTube Music"],
  ]);

  cleanName = aliases.get(cleanName.toUpperCase()) || prettifyTokenCasing(cleanName);

  if (!cleanName) cleanName = prettifyTokenCasing(bank || rawName || "Unnamed bill");

  const display = cleanName.length > 40 ? cleanName.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() : cleanName;
  return includeOwner && owner ? `${display} · ${owner}` : display;
};

export const withNormalizedBillFields = (bill = {}) => ({
  ...bill,
  billType: normalizeBillType(bill),
  startsOverMonthly: normalizeStartsOverMonthly(bill),
  displayName: getBillDisplayName(bill),
  displayNameWithOwner: getBillDisplayName(bill, { includeOwner: true }),
  owner: normalizeString(bill?.owner),
});

export const isMonthlyBill = (bill = {}) =>
  normalizeStartsOverMonthly(bill) || normalizeBillType(bill) === "monthly";

export const isNoInterestBill = (bill = {}) =>
  normalizeBillType(bill) === "noInterest";

export const isPaydownBill = (bill = {}) =>
  normalizeBillType(bill) === "paydown";

export const isDebtBill = (bill = {}) => {
  if (isMonthlyBill(bill)) return false;
  const type = normalizeBillType(bill);
  return type === "paydown" || type === "noInterest" || type === "";
};

export const getBillTypeLabel = (value) =>
  BILL_TYPE_OPTIONS.find((option) => option.value === normalizeBillType({ billType: value }))?.label || "Pay down over time";

export const getBillTypeHelp = (value) =>
  BILL_TYPE_OPTIONS.find((option) => option.value === normalizeBillType({ billType: value }))?.help || BILL_TYPE_OPTIONS[0].help;

export const getBillOwnerOptions = ({
  householdMembers = [],
  allOwners = [],
  defaultOwnerLabel = "",
}) => {
  const memberNames = (Array.isArray(householdMembers) ? householdMembers : [])
    .map((member) => normalizeString(member?.label || member?.displayName || member?.name || member?.email))
    .filter(Boolean);
  const accountOwners = (Array.isArray(allOwners) ? allOwners : [])
    .map((owner) => normalizeString(owner))
    .filter((owner) => owner && owner !== "All");
  const merged = Array.from(new Set([
    ...memberNames,
    ...accountOwners,
    normalizeString(defaultOwnerLabel),
    "Shared",
    "Unassigned",
  ].filter(Boolean)));
  return merged;
};

export const isBillPaid = (bill = {}) => {
  return isBillSettledThisCycle(bill);
};

export const isDueSoonBill = (bill = {}) =>
  isBillOpenThisCycle(bill) && bill?.d_left != null && Number(bill.d_left) >= 0 && Number(bill.d_left) <= 7;

export const isAlmostDoneBill = (bill = {}) => {
  if (isMonthlyBill(bill) || isBillPaid(bill)) return false;
  const balance = Number(bill?.cur_bal ?? bill?.starting_bal ?? 0) || 0;
  const starting = Number(bill?.starting_bal ?? bill?.base_bal_v ?? balance) || 0;
  if (balance <= 0) return false;
  if (starting > 0 && balance / starting <= 0.12) return true;
  return balance <= 250;
};

export const needsBillUpdate = (bill = {}) => {
  const balance = Number(bill?.cur_bal ?? bill?.starting_bal ?? 0) || 0;
  const paid = Number(bill?.paid_v || 0) || 0;
  const minDue = Number(bill?.min_due_v ?? bill?.budgeted_min ?? 0) || 0;
  if (!normalizeString(bill?.name)) return true;
  if (!normalizeString(bill?.category)) return true;
  if (!normalizeString(bill?.owner)) return true;
  if (bill?.due_day == null || bill?.due_day === "" || Number(bill?.due_day) < 1) return true;
  if (isMonthlyBill(bill)) return paid <= 0 && !bill?.is_paid;
  if (balance > 0 && minDue <= 0) return true;
  return false;
};

export const isBillPaidOff = (bill = {}) => {
  if (isMonthlyBill(bill)) return false;
  const balance = getBillBalance(bill);
  return balance <= 0.009;
};

export const isBillCoveredThisCycle = (bill = {}) => {
  if (isBillPaidOff(bill)) return true;
  const { monthly_due, paid_this_cycle } = getBillCycleValues(bill);
  if (isMonthlyBill(bill)) {
    if (monthly_due <= 0) return Boolean(bill?.is_paid) || paid_this_cycle > 0;
    return Boolean(bill?.is_paid) || paid_this_cycle >= monthly_due;
  }
  if (monthly_due <= 0) return Boolean(bill?.is_paid) || paid_this_cycle > 0;
  return Boolean(bill?.is_paid) || paid_this_cycle >= monthly_due;
};

export const isBillSettledThisCycle = (bill = {}) =>
  isBillPaidOff(bill) || isBillCoveredThisCycle(bill);

export const isBillOpenThisCycle = (bill = {}) =>
  !isBillSettledThisCycle(bill);

export const isBillOverdue = (bill = {}) =>
  isBillOpenThisCycle(bill) && bill?.d_left != null && Number(bill.d_left) < 0;

export const getBillDisplayStatus = (bill = {}) => {
  if (isMonthlyBill(bill)) {
    const coverage = getBillMonthlyCoverageStatus(bill);
    if (coverage === "covered" || coverage === "overcovered" || Boolean(bill?.is_paid)) {
      return { key: "covered", label: "Covered", tone: "success" };
    }
  } else {
    if (isBillPaidOff(bill)) {
      return { key: "paid_off", label: "Paid off", tone: "success" };
    }
    if (isBillCoveredThisCycle(bill)) {
      return { key: "paid_cycle", label: "Paid this cycle", tone: "success" };
    }
  }

  if (bill?.d_left == null) return { key: "open", label: "Open", tone: "default" };
  if (Number(bill.d_left) < 0) return { key: "overdue", label: `${Math.abs(Number(bill.d_left))}d overdue`, tone: "danger" };
  if (Number(bill.d_left) === 0) return { key: "due_today", label: "Due today", tone: "danger" };
  if (Number(bill.d_left) <= 7) {
    return {
      key: "due_soon",
      label: Number(bill.d_left) === 1 ? "Due tomorrow" : `Due in ${Number(bill.d_left)}d`,
      tone: "warning",
    };
  }
  return { key: "upcoming", label: `Due in ${Number(bill.d_left)}d`, tone: "default" };
};

export const getBillBadges = (bill = {}) => {
  const badges = [];
  if (isMonthlyBill(bill)) badges.push({ key: "monthly", label: "Monthly" });
  if (isNoInterestBill(bill)) badges.push({ key: "noInterest", label: "No interest" });
  if (isDueSoonBill(bill)) badges.push({ key: "dueSoon", label: "Due soon" });
  if (isAlmostDoneBill(bill)) badges.push({ key: "almostDone", label: "Almost done" });
  if (isBillPaidOff(bill)) badges.push({ key: "paidOff", label: "Paid off" });
  else if (isBillCoveredThisCycle(bill)) badges.push({ key: "paidCycle", label: isMonthlyBill(bill) ? "Covered" : "Paid this cycle" });
  if (needsBillUpdate(bill)) badges.push({ key: "needsUpdate", label: "Needs update" });
  return badges;
};

export const matchesBillFilter = (bill = {}, filterKey = "all", ownerFilter = "All") => {
  const owner = normalizeString(bill?.owner) || "Unassigned";
  if (ownerFilter && ownerFilter !== "All" && owner !== ownerFilter) return false;
  switch (filterKey) {
    case "monthly":
      return isMonthlyBill(bill);
    case "noInterest":
      return isNoInterestBill(bill);
    case "paydown":
      return isPaydownBill(bill);
    case "dueSoon":
      return isDueSoonBill(bill);
    case "paid":
      return isBillSettledThisCycle(bill);
    case "needsUpdate":
      return needsBillUpdate(bill);
    case "all":
    default:
      return true;
  }
};

export const createBillActivityEntry = ({
  billId = "",
  userName = "",
  action = "",
  metadata = {},
}) => ({
  id: `bill-activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  billId: String(billId || ""),
  userName: normalizeString(userName) || "Someone",
  action: normalizeString(action),
  timestamp: Date.now(),
  metadata: metadata && typeof metadata === "object" ? metadata : {},
});

// ── Bill cycle & payoff separation ─────────────────────────────────────────

export const getBillCycleValues = (bill = {}) => {
  const monthly_due =
    Number(bill.monthly_due ?? bill.min_due_v ?? bill.budgeted_min ?? 0) || 0;

  let paid_this_cycle = 0;
  if (Array.isArray(bill.payment_entries) && bill.payment_entries.length > 0) {
    paid_this_cycle = bill.payment_entries
      .filter(
        (e) =>
          e &&
          (e.applies_to_cycle == null ||
            e.applies_to_cycle === bill.current_cycle)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  } else {
    paid_this_cycle = Number(bill.paid_v ?? 0) || 0;
    // Legacy: manually marked paid but no dollar amount recorded
    if (paid_this_cycle === 0 && bill.is_paid && monthly_due > 0) {
      paid_this_cycle = monthly_due;
    }
  }

  const remaining_this_cycle = Math.max(monthly_due - paid_this_cycle, 0);
  return { monthly_due, paid_this_cycle, remaining_this_cycle };
};

export const getBillMonthlyCoverageStatus = (bill = {}) => {
  const { monthly_due, paid_this_cycle } = getBillCycleValues(bill);
  if (Boolean(bill?.is_paid) && paid_this_cycle <= 0 && monthly_due > 0) return "covered";
  if (paid_this_cycle <= 0) return "not_started";
  if (monthly_due <= 0) return paid_this_cycle > 0 ? "covered" : "not_started";
  if (paid_this_cycle > monthly_due) return "overcovered";
  if (paid_this_cycle >= monthly_due) return "covered";
  return "partial";
};

export const MONTHLY_COVERAGE_LABELS = {
  not_started: "Not started",
  partial: "Partially covered",
  covered: "Covered",
  overcovered: "Over-covered",
};

export const getBillPayoffStatus = (bill = {}) => {
  return isBillPaidOff(bill) ? "paid_off" : "active";
};

export const PAYOFF_STATUS_LABELS = {
  active: "Active",
  paid_off: "Paid off",
};
