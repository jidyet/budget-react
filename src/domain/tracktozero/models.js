import {
  APR_STATUSES,
  DEBT_STATUSES,
  EVENT_SOURCES,
  MEMBER_ROLES,
  PLAN_STATUSES,
  PLAN_STRATEGIES,
  VERSION_REASONS,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
} from "./constants.js";
import {
  deepFreezeClone,
  normalizeAprDecimal,
  optionalString,
  optionalTimestamp,
  requireEnum,
  requireMoney,
  requireString,
  requireTimestamp,
} from "./validation.js";

const nowOr = (value) => requireTimestamp(value || new Date("2026-01-01T00:00:00.000Z").toISOString(), "timestamp");

export const createWorkspace = (input = {}) => {
  const workspace = {
    id: requireString(input.id, "workspace.id"),
    type: requireEnum(input.type, WORKSPACE_TYPES, "workspace.type"),
    status: requireEnum(input.status || "active", WORKSPACE_STATUSES, "workspace.status"),
    activePlanId: optionalString(input.activePlanId),
    createdAt: nowOr(input.createdAt),
    createdBy: requireString(input.createdBy, "workspace.createdBy"),
    updatedAt: optionalTimestamp(input.updatedAt),
    updatedBy: optionalString(input.updatedBy),
  };
  return deepFreezeClone(workspace);
};

export const createWorkspaceMembership = (input = {}) => {
  const membership = {
    workspaceId: requireString(input.workspaceId, "membership.workspaceId"),
    uid: requireString(input.uid, "membership.uid"),
    role: requireEnum(input.role, MEMBER_ROLES, "membership.role"),
    status: input.status || "active",
    displayName: optionalString(input.displayName),
    email: optionalString(input.email),
    createdAt: nowOr(input.createdAt),
    createdBy: optionalString(input.createdBy),
    updatedAt: optionalTimestamp(input.updatedAt),
    updatedBy: optionalString(input.updatedBy),
  };
  return deepFreezeClone(membership);
};

export const createDebt = (input = {}) => {
  const debtType = optionalString(input.debtType) || "other";
  const aprStatus = requireEnum(input.aprStatus || "unknown", APR_STATUSES, "debt.aprStatus");
  const isMortgage = debtType.toLowerCase() === "mortgage";
  const debt = {
    id: requireString(input.id, "debt.id"),
    workspaceId: requireString(input.workspaceId, "debt.workspaceId"),
    name: requireString(input.name, "debt.name"),
    debtType,
    status: requireEnum(input.status || "active", DEBT_STATUSES, "debt.status"),
    currentBalance: requireMoney(input.currentBalance, "debt.currentBalance"),
    startingBalance: requireMoney(input.startingBalance ?? input.currentBalance, "debt.startingBalance"),
    aprStatus,
    apr: aprStatus === "unknown" ? null : normalizeAprDecimal(input.apr ?? 0, "debt.apr"),
    minimumRequiredPayment: requireMoney(input.minimumRequiredPayment, "debt.minimumRequiredPayment"),
    dueDay: input.dueDay == null || input.dueDay === "" ? null : Number(input.dueDay),
    ownerId: optionalString(input.ownerId),
    ownerLabel: optionalString(input.ownerLabel),
    includedInCorePayoffPlan: input.includedInCorePayoffPlan ?? !isMortgage,
    createdAt: nowOr(input.createdAt),
    createdBy: requireString(input.createdBy, "debt.createdBy"),
    updatedAt: optionalTimestamp(input.updatedAt),
    updatedBy: optionalString(input.updatedBy),
    paidOffAt: optionalTimestamp(input.paidOffAt),
  };
  if (debt.dueDay !== null && (!Number.isInteger(debt.dueDay) || debt.dueDay < 1 || debt.dueDay > 31)) {
    throw new Error("debt.dueDay must be 1-31");
  }
  return deepFreezeClone(debt);
};

export const createPayoffPlan = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "plan.id"),
  workspaceId: requireString(input.workspaceId, "plan.workspaceId"),
  status: requireEnum(input.status || "draft", PLAN_STATUSES, "plan.status"),
  activeVersionId: optionalString(input.activeVersionId),
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "plan.createdBy"),
  activatedAt: optionalTimestamp(input.activatedAt),
  completedAt: optionalTimestamp(input.completedAt),
  updatedAt: optionalTimestamp(input.updatedAt),
  updatedBy: optionalString(input.updatedBy),
});

export const createPlanVersion = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "version.id"),
  planId: requireString(input.planId, "version.planId"),
  workspaceId: requireString(input.workspaceId, "version.workspaceId"),
  versionNumber: Number(input.versionNumber || 1),
  strategy: requireEnum(input.strategy || "avalanche", PLAN_STRATEGIES, "version.strategy"),
  asOf: requireTimestamp(input.asOf || input.startDate, "version.asOf"),
  startingDebtSnapshot: Array.isArray(input.startingDebtSnapshot) ? structuredClone(input.startingDebtSnapshot) : [],
  extraMonthlyPayment: requireMoney(input.extraMonthlyPayment || 0, "version.extraMonthlyPayment"),
  goalDate: optionalString(input.goalDate),
  projectedZeroDate: optionalString(input.projectedZeroDate),
  assumptions: input.assumptions && typeof input.assumptions === "object" ? structuredClone(input.assumptions) : {},
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "version.createdBy"),
  createdBecause: requireEnum(input.createdBecause || "activation", VERSION_REASONS, "version.createdBecause"),
});

export const createExpectedCheckpoint = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "checkpoint.id"),
  workspaceId: requireString(input.workspaceId, "checkpoint.workspaceId"),
  planId: requireString(input.planId, "checkpoint.planId"),
  planVersionId: requireString(input.planVersionId, "checkpoint.planVersionId"),
  period: requireString(input.period, "checkpoint.period"),
  expectedTotalBalance: requireMoney(input.expectedTotalBalance, "checkpoint.expectedTotalBalance"),
  expectedDebtBalances: input.expectedDebtBalances && typeof input.expectedDebtBalances === "object" ? structuredClone(input.expectedDebtBalances) : {},
  expectedTargetDebtId: optionalString(input.expectedTargetDebtId),
  expectedPayment: requireMoney(input.expectedPayment || 0, "checkpoint.expectedPayment"),
  projectedZeroDate: optionalString(input.projectedZeroDate),
});

export const createPaymentEvent = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "payment.id"),
  workspaceId: requireString(input.workspaceId, "payment.workspaceId"),
  debtId: requireString(input.debtId, "payment.debtId"),
  planId: optionalString(input.planId),
  planVersionId: optionalString(input.planVersionId),
  amount: requireMoney(input.amount, "payment.amount", { allowZero: false }),
  paidAt: requireTimestamp(input.paidAt, "payment.paidAt"),
  source: requireEnum(input.source || "manual", EVENT_SOURCES, "payment.source"),
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "payment.createdBy"),
  notes: optionalString(input.notes),
  voidedAt: optionalTimestamp(input.voidedAt),
  voidedBy: optionalString(input.voidedBy),
  correctionOfId: optionalString(input.correctionOfId),
});

export const createBalanceSnapshot = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "snapshot.id"),
  workspaceId: requireString(input.workspaceId, "snapshot.workspaceId"),
  debtId: requireString(input.debtId, "snapshot.debtId"),
  balance: requireMoney(input.balance, "snapshot.balance"),
  observedAt: requireTimestamp(input.observedAt, "snapshot.observedAt"),
  source: requireEnum(input.source || "manual", EVENT_SOURCES, "snapshot.source"),
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "snapshot.createdBy"),
  relatedPaymentEventId: optionalString(input.relatedPaymentEventId),
  notes: optionalString(input.notes),
  voidedAt: optionalTimestamp(input.voidedAt),
  voidedBy: optionalString(input.voidedBy),
  correctionOfId: optionalString(input.correctionOfId),
});

export const createStartingDebtSnapshotItem = (debt) => deepFreezeClone({
  debtId: debt.id,
  balance: debt.currentBalance,
  aprStatus: debt.aprStatus,
  effectiveApr: debt.aprStatus === "unknown" ? null : debt.apr,
  minimumRequiredPayment: debt.minimumRequiredPayment,
  includedInCorePayoffPlan: !!debt.includedInCorePayoffPlan,
  debtType: debt.debtType,
});
