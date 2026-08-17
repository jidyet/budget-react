// DATA-2: the financial-item classification gate that must run BEFORE any row
// becomes a DebtCandidate. Import parsers previously jumped straight from
// "row with a number" to DebtCandidate, so utilities/subscriptions/insurance/
// savings/income/section-headers/subtotals could all end up looking like
// debt. This module answers "what kind of financial item is this?" - a
// question distinct from (and prior to) "is it a debt, and if so what kind."

// Every source item this pipeline can recognize, independent of whether it's
// debt. ONLY items classified DEBT ever enter the DebtCandidate pipeline -
// everything else is understood and retained (see workbookDebtDiscovery.js's
// nonDebtItems), never silently dropped, but also never turned into a Debt.
export const FINANCIAL_ITEM_TYPES = Object.freeze({
  debt: "DEBT",
  billOrRecurringExpense: "BILL_OR_RECURRING_EXPENSE",
  utility: "UTILITY",
  subscription: "SUBSCRIPTION",
  insurance: "INSURANCE",
  homeExpense: "HOME_EXPENSE",
  storageExpense: "STORAGE_EXPENSE",
  savings: "SAVINGS",
  income: "INCOME",
  headerOrSection: "HEADER_OR_SECTION",
  subtotalOrSummary: "SUBTOTAL_OR_SUMMARY",
  unknown: "UNKNOWN",
});

// A pure reporting/grouping taxonomy over the EXISTING free-string Debt.debtType
// convention (see importCandidateAdapter.js's DEBT_TYPE_ALIASES) - never
// assigned to debtType directly, and never a reason to rename/collapse an
// existing granular value. medical/collections/tax_debt/personal_debt/other
// have no equivalent in this coarser list and are deliberately kept as-is
// (grouped under OTHER_DEBT here) rather than renamed - they are live,
// reachable values on real imported/committed data.
export const DEBT_CATEGORY_GROUPS = Object.freeze({
  creditCard: "CREDIT_CARD",
  studentLoan: "STUDENT_LOAN",
  personalLoan: "PERSONAL_LOAN",
  lineOfCredit: "LINE_OF_CREDIT",
  autoLoan: "AUTO_LOAN",
  mortgageOrHomeLoan: "MORTGAGE_OR_HOME_LOAN",
  businessDebt: "BUSINESS_DEBT",
  bnplOrInstallmentFinancing: "BNPL_OR_INSTALLMENT_FINANCING",
  otherDebt: "OTHER_DEBT",
});

const DEBT_TYPE_TO_CATEGORY_GROUP = {
  credit_card: DEBT_CATEGORY_GROUPS.creditCard,
  student_loan: DEBT_CATEGORY_GROUPS.studentLoan,
  personal_loan: DEBT_CATEGORY_GROUPS.personalLoan,
  line_of_credit: DEBT_CATEGORY_GROUPS.lineOfCredit,
  auto_loan: DEBT_CATEGORY_GROUPS.autoLoan,
  mortgage: DEBT_CATEGORY_GROUPS.mortgageOrHomeLoan,
  business_debt: DEBT_CATEGORY_GROUPS.businessDebt,
  bnpl: DEBT_CATEGORY_GROUPS.bnplOrInstallmentFinancing,
};

export const debtCategoryGroupFor = (debtType) => DEBT_TYPE_TO_CATEGORY_GROUP[debtType] || DEBT_CATEGORY_GROUPS.otherDebt;

const safeString = (value) => String(value ?? "").trim();
const normalizeText = (value) => safeString(value).toLowerCase().replace(/[•*]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

// New vocabulary not previously covered by workbookDebtDiscovery.js's
// BILL_CATEGORY_RE/ORDINARY_BILL_RE (which only distinguished "ordinary bill"
// from "debt," never which KIND of non-debt item). Savings/income in
// particular had NO vocabulary at all before this - a row like "Monthly
// Savings" or "EagleView income" was only ever caught (if at all) as a
// generic, unlabeled "ordinary bill."
export const UTILITY_RE = /\b(electric(?:ity)?|water|natural gas|gas utility|gas|sewer|trash|garbage|utility|utilities)\b/i;
export const SUBSCRIPTION_RE = /\b(netflix|hulu|spotify|disney\+?|streaming|subscriptions?|membership|prime video|hbo|apple (?:music|tv))\b/i;
export const INSURANCE_RE = /\b(insurance|premium)\b/i;
export const HOME_EXPENSE_RE = /\b(home expenses?|rent|mortgage payment reminder|hoa|lawn|cleaning service|household service)\b/i;
export const STORAGE_EXPENSE_RE = /\b(storage|self storage|storage unit|storage fee)\b/i;
export const SAVINGS_RE = /\b(savings?|emergency fund|nest egg|retirement contribution|401\s*k|ira contribution)\b/i;
export const INCOME_RE = /\b(income|salary|paycheck|payroll|wages|earnings|direct deposit)\b/i;
const SUBTOTAL_RE = /\b(subtotal|grand total|total)\b/i;

// Ordered: first match wins. BUSINESS is deliberately last and carries no
// financialItemType of its own (isBusinessSection: true only) - a BUSINESS
// section heading must never itself imply DEBT or any other single type;
// secondary classification (see financialItemTypeForNonDebt /
// workbookDebtDiscovery.js's per-row debt-type detection) decides that per row.
export const SECTION_HEADING_MATCHERS = Object.freeze([
  { re: /^credit cards?$/i, financialItemType: FINANCIAL_ITEM_TYPES.debt },
  { re: /^student loans?$/i, financialItemType: FINANCIAL_ITEM_TYPES.debt },
  { re: /^personal loans?$/i, financialItemType: FINANCIAL_ITEM_TYPES.debt },
  { re: /^(line of credit|lines? of credit)$/i, financialItemType: FINANCIAL_ITEM_TYPES.debt },
  { re: /^auto loans?$/i, financialItemType: FINANCIAL_ITEM_TYPES.debt },
  { re: /^insurance$/i, financialItemType: FINANCIAL_ITEM_TYPES.insurance },
  { re: /^subscriptions?$/i, financialItemType: FINANCIAL_ITEM_TYPES.subscription },
  { re: /^home expenses?$/i, financialItemType: FINANCIAL_ITEM_TYPES.homeExpense },
  { re: /^utilit(?:y|ies)$/i, financialItemType: FINANCIAL_ITEM_TYPES.utility },
  { re: /^storage$/i, financialItemType: FINANCIAL_ITEM_TYPES.storageExpense },
  { re: /^savings?$/i, financialItemType: FINANCIAL_ITEM_TYPES.savings },
  { re: /^income$/i, financialItemType: FINANCIAL_ITEM_TYPES.income },
  { re: /^business$/i, financialItemType: null, isBusinessSection: true },
]);

// Recognizes a standalone section-heading row (e.g. a row that is JUST
// "UTILITIES" with no financial data of its own, immediately above the rows
// it categorizes) or a subtotal/total row. Returns null if `label` isn't one.
export const matchSectionHeading = (label) => {
  const normalized = normalizeText(label);
  if (!normalized) return null;
  if (SUBTOTAL_RE.test(normalized)) return { financialItemType: FINANCIAL_ITEM_TYPES.subtotalOrSummary, isBusinessSection: false };
  const match = SECTION_HEADING_MATCHERS.find((entry) => entry.re.test(normalized));
  if (!match) return null;
  return { financialItemType: match.financialItemType, isBusinessSection: !!match.isBusinessSection };
};

// Assigns the SPECIFIC FINANCIAL_ITEM_TYPES value for a row that has already
// been classified not-debt (see workbookDebtDiscovery.js's CLASSIFICATIONS.notDebt).
// `sectionHint` is the nearest enclosing section's financialItemType, if any
// (strongest signal - a "Gas" row under a UTILITIES heading is unambiguous).
// Row-level vocabulary is checked next; BILL_OR_RECURRING_EXPENSE is the
// generic fallback when only non-specific bill vocabulary matched, UNKNOWN
// when nothing matched at all.
export const financialItemTypeForNonDebt = ({ accountText = "", categoryText = "", sectionHint = null } = {}) => {
  if (sectionHint && sectionHint !== FINANCIAL_ITEM_TYPES.debt) return sectionHint;
  const haystack = `${accountText} ${categoryText}`;
  if (SAVINGS_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.savings;
  if (INCOME_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.income;
  if (INSURANCE_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.insurance;
  if (SUBSCRIPTION_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.subscription;
  if (UTILITY_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.utility;
  if (STORAGE_EXPENSE_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.storageExpense;
  if (HOME_EXPENSE_RE.test(haystack)) return FINANCIAL_ITEM_TYPES.homeExpense;
  return FINANCIAL_ITEM_TYPES.billOrRecurringExpense;
};
