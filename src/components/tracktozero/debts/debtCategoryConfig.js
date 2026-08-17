import { CreditCard, GraduationCap, HandCoins, Landmark, Car, Home, Briefcase, ReceiptText, Layers } from "lucide-react";
import { DEBT_CATEGORY_GROUPS } from "../../../domain/tracktozero/financialItemTaxonomy.js";

// UX-6.1: the single source of truth for how a debt CATEGORY (the coarse
// DEBT_CATEGORY_GROUPS grouping - see financialItemTaxonomy.js) presents in
// the UI: display label, icon, route slug, description, sort order. Both the
// Debts Command Center's category grid and the Import Review's category
// grouping read from this ONE list, so a tile in Import and a tile in the
// Portfolio always look and sort the same way (task requirement: visual
// continuity between Import -> Review -> Portfolio).
export const CATEGORY_CONFIG = Object.freeze([
  {
    group: DEBT_CATEGORY_GROUPS.creditCard,
    label: "Credit Cards",
    description: "Revolving card balances",
    icon: CreditCard,
    routeSlug: "credit-cards",
    sortOrder: 1,
  },
  {
    group: DEBT_CATEGORY_GROUPS.studentLoan,
    label: "Student Loans",
    description: "Federal or private education loans",
    icon: GraduationCap,
    routeSlug: "student-loans",
    sortOrder: 2,
  },
  {
    group: DEBT_CATEGORY_GROUPS.personalLoan,
    label: "Personal Loans",
    description: "Unsecured installment loans",
    icon: HandCoins,
    routeSlug: "personal-loans",
    sortOrder: 3,
  },
  {
    group: DEBT_CATEGORY_GROUPS.lineOfCredit,
    label: "Lines of Credit",
    description: "Revolving credit lines, including HELOCs",
    icon: Landmark,
    routeSlug: "lines-of-credit",
    sortOrder: 4,
  },
  {
    group: DEBT_CATEGORY_GROUPS.autoLoan,
    label: "Auto Loans",
    description: "Vehicle financing",
    icon: Car,
    routeSlug: "auto-loans",
    sortOrder: 5,
  },
  {
    group: DEBT_CATEGORY_GROUPS.mortgageOrHomeLoan,
    label: "Mortgage / Home",
    description: "Home loans - tracked, excluded from the core payoff date by default",
    icon: Home,
    routeSlug: "mortgage",
    sortOrder: 6,
  },
  {
    group: DEBT_CATEGORY_GROUPS.businessDebt,
    label: "Business Debt",
    description: "Debt carried for a business, not household expenses",
    icon: Briefcase,
    routeSlug: "business",
    sortOrder: 7,
  },
  {
    group: DEBT_CATEGORY_GROUPS.bnplOrInstallmentFinancing,
    label: "BNPL / Financing",
    description: "Buy-now-pay-later and installment financing",
    icon: ReceiptText,
    routeSlug: "financing",
    sortOrder: 8,
  },
  {
    group: DEBT_CATEGORY_GROUPS.otherDebt,
    label: "Other Debt",
    description: "Medical, collections, tax, and everything else",
    icon: Layers,
    routeSlug: "other",
    sortOrder: 9,
  },
]);

const BY_GROUP = new Map(CATEGORY_CONFIG.map((entry) => [entry.group, entry]));
const BY_SLUG = new Map(CATEGORY_CONFIG.map((entry) => [entry.routeSlug, entry]));

export const categoryConfigForGroup = (group) => BY_GROUP.get(group) || null;
export const categoryConfigForSlug = (slug) => BY_SLUG.get(slug) || null;

// UX-6.1: the ONE reconciled debt-type options list, replacing the two
// divergent hardcoded <option> lists that previously existed inline in
// TrackToZeroV2App.jsx (one for import-candidate editing, one for the
// Add-debt form) - both already listed the exact same 12 values in the same
// order, so this is a de-dup, not a semantic change.
export const DEBT_TYPE_OPTIONS = Object.freeze([
  ["credit_card", "Credit card"],
  ["personal_loan", "Personal loan"],
  ["auto_loan", "Auto loan"],
  ["student_loan", "Student loan"],
  ["medical", "Medical debt"],
  ["collections", "Collections"],
  ["tax_debt", "Tax debt"],
  ["line_of_credit", "Line of credit"],
  ["bnpl", "Financing / BNPL"],
  ["personal_debt", "Personal debt"],
  ["mortgage", "Mortgage"],
  ["other", "Other"],
]);
