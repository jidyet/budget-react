import { isMonthlyBill, isNoInterestBill } from "../billModel";
import { normalizeAprDecimal } from "../../utils/budgetUtils";

export const LEGACY_DEBT_CLASSIFICATION = Object.freeze({
  CLEAR_DEBT: "clear_debt",
  NOT_DEBT: "not_debt",
  NEEDS_CONFIRMATION: "needs_confirmation",
});

const text = (value) => String(value || "").trim();
const explicitBillType = (account = {}) => String(account.billType || account.type || "").trim().toLowerCase();
const hasExplicitPayoffType = (account = {}) => {
  const type = explicitBillType(account);
  return type.includes("paydown") || type.includes("pay down") || type.includes("nointerest") || type.includes("no interest") || type.includes("no-interest");
};
const lowerHaystack = (account = {}) => [
  account.name,
  account.billName,
  account.bank,
  account.category,
  account.subtype,
  account.billType,
].map((part) => text(part).toLowerCase()).join(" ");

export const classifyLegacyAccount = (account = {}) => {
  const haystack = lowerHaystack(account);
  const balance = Number(account.cur_bal ?? account.starting_bal ?? 0) || 0;
  if (isMonthlyBill(account) && balance <= 0.01) return { classification: LEGACY_DEBT_CLASSIFICATION.NOT_DEBT, reason: "ordinary monthly expense" };
  if (hasExplicitPayoffType(account)) return { classification: LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT, reason: "explicit legacy paydown/no-interest account" };
  if (/credit|card|loan|mortgage|affirm|sofi|mohela|navient|nelnet|aidvantage|line of credit/.test(haystack) && balance > 0.01) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT, reason: "debt-like name/category with balance" };
  }
  if (/utility|subscription|insurance|rent|phone|internet|electric|water|streaming/.test(haystack)) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.NOT_DEBT, reason: "recurring expense category" };
  }
  return { classification: LEGACY_DEBT_CLASSIFICATION.NEEDS_CONFIRMATION, reason: "ambiguous legacy record" };
};

export const legacyAccountToDebtCandidate = ({ account, workspaceId, createdBy = "migration-preview" }) => {
  const classification = classifyLegacyAccount(account);
  if (classification.classification !== LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT) {
    return { classification, debt: null };
  }
  const haystack = lowerHaystack(account);
  const isMortgage = /mortgage/.test(haystack);
  const aprRaw = account.apr_v ?? account.apr;
  const aprKnown = aprRaw !== undefined && aprRaw !== null && aprRaw !== "";
  const noInterest = isNoInterestBill(account);
  return {
    classification,
    debt: {
      id: text(account.id),
      workspaceId,
      name: text(account.name || account.billName || account.bank || "Legacy debt"),
      debtType: isMortgage ? "mortgage" : noInterest ? "no_interest_financing" : "legacy_paydown",
      status: Number(account.cur_bal || 0) > 0.01 ? "active" : "paid_off",
      currentBalance: Math.max(0, Number(account.cur_bal ?? account.starting_bal ?? 0) || 0),
      startingBalance: Math.max(0, Number(account.base_bal_v ?? account.starting_bal ?? account.cur_bal ?? 0) || 0),
      aprStatus: noInterest ? "no_interest" : aprKnown ? "known" : "unknown",
      apr: noInterest ? 0 : aprKnown ? normalizeAprDecimal(aprRaw) : null,
      minimumRequiredPayment: Math.max(0, Number(account.min_due_v ?? account.budgeted_min ?? 0) || 0),
      dueDay: account.due_day || null,
      ownerLabel: text(account.owner),
      includedInCorePayoffPlan: !isMortgage,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      createdBy,
    },
  };
};

export const legacyHouseholdToWorkspaceCandidate = ({ household, members = [], asOf, createdBy = "migration-preview" }) => {
  const workspaceId = text(household.id || household.householdId);
  return {
    workspace: {
      id: workspaceId,
      type: "household",
      status: household.active === false ? "archived" : "active",
      activePlanId: "",
      createdAt: asOf,
      createdBy: text(household.ownerId || createdBy),
    },
    memberships: members.map((member) => ({
      workspaceId,
      uid: text(member.uid || member.id),
      role: member.role === "owner" ? "owner" : "contributor",
      status: member.status || "active",
      displayName: text(member.displayName || member.label),
      email: text(member.email),
      createdAt: asOf,
      createdBy,
    })),
    assumptions: ["Legacy non-owner household members map to contributor by default."],
  };
};

export const legacySavedPlanToDraftCandidate = ({ plan, workspaceId, createdBy = "migration-preview", asOf }) => ({
  id: text(plan.id),
  workspaceId,
  status: "draft",
  activeVersionId: "",
  createdAt: asOf,
  createdBy,
  legacySource: {
    strategy: plan.strategy || "avalanche",
    monthlyExtra: Number(plan.monthly_extra || 0),
    items: Array.isArray(plan.items) ? structuredClone(plan.items) : [],
  },
});

export const buildMigrationPreview = ({ legacyWorkspace, legacyMembers = [], legacyAccounts = [], legacyPlans = [], asOf, writeSink = null }) => {
  if (writeSink) throw new Error("Migration preview is read-only and accepts no write sink");
  const workspaceId = text(legacyWorkspace?.id || legacyWorkspace?.householdId || legacyWorkspace?.uid || "preview-workspace");
  const workspaceBundle = legacyWorkspace?.memberIds
    ? legacyHouseholdToWorkspaceCandidate({ household: { ...legacyWorkspace, id: workspaceId }, members: legacyMembers, asOf })
    : {
        workspace: { id: workspaceId, type: "personal", status: "active", activePlanId: "", createdAt: asOf, createdBy: workspaceId },
        memberships: [{ workspaceId, uid: workspaceId, role: "owner", status: "active", createdAt: asOf, createdBy: workspaceId }],
        assumptions: [],
      };

  const candidateDebts = [];
  const excludedLegacyExpenses = [];
  const ambiguousRecords = [];
  legacyAccounts.forEach((account) => {
    const candidate = legacyAccountToDebtCandidate({ account, workspaceId, createdBy: workspaceBundle.workspace.createdBy });
    if (candidate.debt) candidateDebts.push(candidate.debt);
    else if (candidate.classification.classification === LEGACY_DEBT_CLASSIFICATION.NOT_DEBT) excludedLegacyExpenses.push({ id: account.id, reason: candidate.classification.reason });
    else ambiguousRecords.push({ id: account.id, reason: candidate.classification.reason });
  });

  return {
    workspace: workspaceBundle.workspace,
    memberships: workspaceBundle.memberships,
    candidateDebts,
    excludedLegacyExpenses,
    ambiguousRecords,
    candidateDraftPlans: legacyPlans.map((plan) => legacySavedPlanToDraftCandidate({ plan, workspaceId, createdBy: workspaceBundle.workspace.createdBy, asOf })),
    warnings: [
      ...workspaceBundle.assumptions,
      "Legacy saved plans are draft candidates only; no active 2.0 plan is inferred.",
    ],
    migrationState: "migration_preview",
    writesPerformed: 0,
  };
};
