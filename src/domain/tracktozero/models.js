import {
  APR_STATUSES,
  BALANCE_STATUSES,
  DEBT_STATUSES,
  EVENT_SOURCES,
  IMPORT_BATCH_STATUSES,
  IMPORT_CANDIDATE_DECISIONS,
  INVITATION_STATUSES,
  MEMBER_ROLES,
  OWNER_TYPES,
  PERSON_KINDS,
  PERSON_STATUSES,
  PLAN_STATUSES,
  PLAN_STRATEGIES,
  SCENARIO_STATUSES,
  SCENARIO_TYPES,
  VERSION_REASONS,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
} from "./constants.js";
import {
  deepFreezeClone,
  normalizeAprDecimal,
  optionalMoney,
  optionalString,
  optionalTimestamp,
  requireEnum,
  requireMoney,
  requireString,
  requireTimestamp,
} from "./validation.js";
import { isDebtNeedsReview } from "./ownership.js";

const nowOr = (value) => requireTimestamp(value || new Date("2026-01-01T00:00:00.000Z").toISOString(), "timestamp");

export const createWorkspace = (input = {}) => {
  const workspace = {
    id: requireString(input.id, "workspace.id"),
    type: requireEnum(input.type, WORKSPACE_TYPES, "workspace.type"),
    status: requireEnum(input.status || "active", WORKSPACE_STATUSES, "workspace.status"),
    name: optionalString(input.name),
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
    acceptedInviteId: optionalString(input.acceptedInviteId),
    createdAt: nowOr(input.createdAt),
    createdBy: optionalString(input.createdBy),
    updatedAt: optionalTimestamp(input.updatedAt),
    updatedBy: optionalString(input.updatedBy),
  };
  return deepFreezeClone(membership);
};

export const createWorkspaceInvitation = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "invite.id"),
  workspaceId: requireString(input.workspaceId, "invite.workspaceId"),
  workspaceName: optionalString(input.workspaceName),
  emailNormalized: requireString(input.emailNormalized, "invite.emailNormalized"),
  role: requireEnum(input.role, MEMBER_ROLES.filter((role) => role !== "owner"), "invite.role"),
  status: requireEnum(input.status || "pending", INVITATION_STATUSES, "invite.status"),
  tokenHash: requireString(input.tokenHash || input.id, "invite.tokenHash"),
  invitedByUserId: requireString(input.invitedByUserId, "invite.invitedByUserId"),
  invitedByName: optionalString(input.invitedByName),
  workspacePersonId: optionalString(input.workspacePersonId),
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy || input.invitedByUserId, "invite.createdBy"),
  expiresAt: requireTimestamp(input.expiresAt, "invite.expiresAt"),
  acceptedAt: optionalTimestamp(input.acceptedAt),
  acceptedByUserId: optionalString(input.acceptedByUserId),
  canceledAt: optionalTimestamp(input.canceledAt),
  canceledByUserId: optionalString(input.canceledByUserId),
});

// DATA-HH1: a Workspace-scoped financial identity for a person referenced by
// imported/entered data who may or may not have a TrackToZero account. This
// is deliberately NOT an authenticated account, NOT a WorkspaceMembership,
// and grants zero access to anything - see personIdentity.js and
// ownership.js's DATA-HH1 comments for the full contract. Every persisted
// WorkspacePerson is kind "imported_person"; "authenticated_member" is only
// ever a classification value the matching engine/owner-display resolver
// returns for a real WorkspaceMembership, never its own stored document.
export const createWorkspacePerson = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "person.id"),
  workspaceId: requireString(input.workspaceId, "person.workspaceId"),
  displayName: requireString(input.displayName, "person.displayName"),
  normalizedName: requireString(input.normalizedName, "person.normalizedName"),
  aliases: Array.isArray(input.aliases) ? [...new Set(input.aliases.map((alias) => String(alias || "").trim()).filter(Boolean))] : [],
  kind: requireEnum(input.kind || "imported_person", PERSON_KINDS, "person.kind"),
  status: requireEnum(input.status || "active", PERSON_STATUSES, "person.status"),
  // Set only once this person is later explicitly, securely connected to a
  // real WorkspaceMembership (UX-6) - DATA-HH1 never sets this itself.
  workspaceMembershipId: optionalString(input.workspaceMembershipId),
  mergedIntoPersonId: optionalString(input.mergedIntoPersonId),
  source: optionalString(input.source) || "import_confirmed",
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "person.createdBy"),
  updatedAt: optionalTimestamp(input.updatedAt),
  updatedBy: optionalString(input.updatedBy),
});

export const createDebt = (input = {}) => {
  const debtType = optionalString(input.debtType) || "other";
  const aprStatus = requireEnum(input.aprStatus || "unknown", APR_STATUSES, "debt.aprStatus");
  const isMortgage = debtType.toLowerCase() === "mortgage";
  const ownerId = optionalString(input.ownerId);
  // Ownership defaults to "member" when a legacy/seed record already has an
  // ownerId (backward compatible with records written before ownerType
  // existed), otherwise "unassigned" - never guessed as "member" without one.
  const ownerType = requireEnum(input.ownerType || (ownerId ? "member" : "unassigned"), OWNER_TYPES, "debt.ownerType");
  const debt = {
    id: requireString(input.id, "debt.id"),
    workspaceId: requireString(input.workspaceId, "debt.workspaceId"),
    name: requireString(input.name, "debt.name"),
    accountReferenceSafe: optionalString(input.accountReferenceSafe),
    debtType,
    status: requireEnum(input.status || "active", DEBT_STATUSES, "debt.status"),
    currentBalance: requireMoney(input.currentBalance, "debt.currentBalance"),
    startingBalance: requireMoney(input.startingBalance ?? input.currentBalance, "debt.startingBalance"),
    aprStatus,
    apr: aprStatus === "unknown" ? null : normalizeAprDecimal(input.apr ?? 0, "debt.apr"),
    // UX-9: unknown, not silently confirmed-$0 - matches apr's null-when-
    // unknown handling above. An import candidate whose parser never found
    // a minimum payment, or a manual/edit form left blank, must not become
    // indistinguishable from a debt whose $0 minimum was actually confirmed
    // (see evaluateProjectionWarnings' missing_minimum_payment warning and
    // debtExplorerView's requiredPaymentSortValue, both already null-aware).
    minimumRequiredPayment: optionalMoney(input.minimumRequiredPayment, "debt.minimumRequiredPayment"),
    dueDay: input.dueDay == null || input.dueDay === "" ? null : Number(input.dueDay),
    // ownerId is never free text: it is either empty, or the uid of a
    // workspace member verified against the real membership list (enforced
    // in the application-service layer, which has repository access - see
    // resolveDebtOwnership in ownership.js). ownerLabel is a display-only
    // string derived from that verified identity, never authoritative.
    ownerType,
    ownerId,
    ownerLabel: optionalString(input.ownerLabel),
    // "confirmed" (default) means currentBalance reflects a real observation
    // (manual entry, a recorded snapshot, or a successfully-parsed import).
    // "unresolved" means the balance could not be confidently captured (e.g.
    // committing an import candidate whose parser never found a balance) -
    // a 0 here must never be treated as "paid off" (see effectiveBalanceStatus
    // / isConfirmedZero in ownership.js).
    balanceStatus: requireEnum(input.balanceStatus || "confirmed", BALANCE_STATUSES, "debt.balanceStatus"),
    includedInCorePayoffPlan: input.includedInCorePayoffPlan ?? !isMortgage,
    openingBalanceSnapshotId: optionalString(input.openingBalanceSnapshotId),
    createdAt: nowOr(input.createdAt),
    createdBy: requireString(input.createdBy, "debt.createdBy"),
    updatedAt: optionalTimestamp(input.updatedAt),
    updatedBy: optionalString(input.updatedBy),
    paidOffAt: optionalTimestamp(input.paidOffAt),
  };
  if (debt.dueDay !== null && (!Number.isInteger(debt.dueDay) || debt.dueDay < 1 || debt.dueDay > 31)) {
    throw new Error("debt.dueDay must be 1-31");
  }
  const ownerIdRequired = debt.ownerType === "member" || debt.ownerType === "person";
  if (ownerIdRequired && !debt.ownerId) {
    throw new Error(`debt.ownerId is required when ownerType is "${debt.ownerType}"`);
  }
  if (!ownerIdRequired && debt.ownerId) {
    throw new Error("debt.ownerId must be empty unless ownerType is \"member\" or \"person\"");
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

// UX-4: a persisted, non-authoritative "what if" the user chose to keep.
// Never part of the Workspace.activePlanId -> PayoffPlan.activeVersionId ->
// PlanVersion pointer chain - a SavedScenario only ever gets promoted into
// that chain through the same explicit applyReforecast/activatePlan
// primitives any other reforecast/activation already uses (see
// v2AsyncApplicationService.js's applyScenario). basePlanVersionId anchors
// the scenario to the PlanVersion it was computed against, so a reopened
// scenario can honestly tell the user whether reality has since moved on
// (Part 37 - staleness) instead of silently presenting stale numbers as current.
export const createSavedScenario = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "scenario.id"),
  workspaceId: requireString(input.workspaceId, "scenario.workspaceId"),
  name: requireString(input.name, "scenario.name"),
  type: requireEnum(input.type, SCENARIO_TYPES, "scenario.type"),
  status: requireEnum(input.status || "active", SCENARIO_STATUSES, "scenario.status"),
  basePlanId: optionalString(input.basePlanId),
  basePlanVersionId: optionalString(input.basePlanVersionId),
  // Free-form, type-specific inputs (e.g. {extraMonthlyPayment} for
  // recurring_extra, {amount, targetDebtId} for one_time,
  // {targetDebtId} for custom_target, {targetMonth} for goal_date) - not
  // simulation OUTPUT, which is cheap enough to always recompute fresh
  // rather than trust a persisted, potentially-stale projection.
  inputs: input.inputs && typeof input.inputs === "object" ? structuredClone(input.inputs) : {},
  createdAt: nowOr(input.createdAt),
  createdBy: requireString(input.createdBy, "scenario.createdBy"),
  updatedAt: optionalTimestamp(input.updatedAt),
  updatedBy: optionalString(input.updatedBy),
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

export const createImportBatch = (input = {}) => deepFreezeClone({
  id: requireString(input.id, "importBatch.id"),
  workspaceId: requireString(input.workspaceId, "importBatch.workspaceId"),
  createdBy: requireString(input.createdBy, "importBatch.createdBy"),
  createdAt: nowOr(input.createdAt),
  updatedAt: optionalTimestamp(input.updatedAt),
  updatedBy: optionalString(input.updatedBy),
  sourceType: requireString(input.sourceType || "excel", "importBatch.sourceType"),
  sourceFilename: optionalString(input.sourceFilename),
  status: requireEnum(input.status || "review_required", IMPORT_BATCH_STATUSES, "importBatch.status"),
  candidateCount: Number(input.candidateCount || 0),
  confirmedCount: Number(input.confirmedCount || 0),
  rejectedCount: Number(input.rejectedCount || 0),
  duplicateCount: Number(input.duplicateCount || 0),
  warnings: Array.isArray(input.warnings) ? structuredClone(input.warnings) : [],
  metadata: input.metadata && typeof input.metadata === "object" ? structuredClone(input.metadata) : {},
  candidates: Array.isArray(input.candidates) ? structuredClone(input.candidates) : [],
  committedAt: optionalTimestamp(input.committedAt),
  failure: optionalString(input.failure),
});

export const createImportCandidate = (input = {}) => deepFreezeClone({
  candidateId: requireString(input.candidateId, "importCandidate.candidateId"),
  source: requireString(input.source || "excel", "importCandidate.source"),
  creditorName: optionalString(input.creditorName),
  accountName: requireString(input.accountName || input.creditorName || "Unnamed debt", "importCandidate.accountName"),
  accountReferenceSafe: optionalString(input.accountReferenceSafe),
  debtType: optionalString(input.debtType) || "other",
  currentBalance: requireMoney(input.currentBalance, "importCandidate.currentBalance"),
  // "unresolved" means the source (parser/spreadsheet row) never produced a
  // confident balance and currentBalance was defaulted to 0 for form display
  // only - this must survive through to the created Debt (see
  // commitImportBatch) so a failed import is never indistinguishable from a
  // genuinely confirmed $0 payoff.
  balanceStatus: requireEnum(input.balanceStatus || "confirmed", BALANCE_STATUSES, "importCandidate.balanceStatus"),
  statementDate: optionalString(input.statementDate),
  apr: input.aprStatus && input.aprStatus !== "unknown" && input.apr != null ? normalizeAprDecimal(input.apr, "importCandidate.apr") : null,
  aprStatus: requireEnum(input.aprStatus || "unknown", APR_STATUSES, "importCandidate.aprStatus"),
  minimumPayment: input.minimumPayment == null || input.minimumPayment === "" ? null : requireMoney(input.minimumPayment, "importCandidate.minimumPayment"),
  dueDate: optionalString(input.dueDate),
  // ownerSuggestion is the parser's raw, non-authoritative guess at the
  // holder name on the statement - shown to the human reviewer as a hint
  // only. ownerType/ownerId are the actual (initially unassigned) ownership
  // decision, which only becomes real once a human explicitly confirms it
  // against the workspace's verified member list (see ownership.js).
  ownerSuggestion: optionalString(input.ownerSuggestion),
  ownerType: requireEnum(input.ownerType || "unassigned", OWNER_TYPES, "importCandidate.ownerType"),
  ownerId: optionalString(input.ownerId),
  includedInCorePayoffPlan: input.includedInCorePayoffPlan ?? (String(input.debtType).toLowerCase() !== "mortgage"),
  confidence: input.confidence == null ? null : Number(input.confidence),
  evidence: input.evidence && typeof input.evidence === "object" ? structuredClone(input.evidence) : {},
  warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
  duplicateStatus: requireEnum(input.duplicateStatus || "new", ["new", "exact_duplicate", "likely_duplicate", "possible_duplicate"], "importCandidate.duplicateStatus"),
  duplicateOfDebtId: optionalString(input.duplicateOfDebtId),
  decision: requireEnum(input.decision || "pending_review", IMPORT_CANDIDATE_DECISIONS, "importCandidate.decision"),
  targetDebtId: optionalString(input.targetDebtId),
});

// UX-8.2: a needs-review debt (unresolved balance, contaminated minimum
// payment - see isDebtNeedsReview) is never actually counted in real plan
// math on any live read (getEligiblePlanDebts re-filters isDebtNeedsReview
// on every read, regardless of what's frozen here). Before this fix, every
// caller (createDraftPlan/applyReforecast/previewDraftPlan) still froze
// includedInCorePayoffPlan: true for such a debt, so the historical
// PlanVersion record falsely claimed it was included. Forcing it false here
// changes no computed math (it was already excluded on every read) - it
// only makes the frozen snapshot honestly reflect what was actually true at
// freeze time.
export const createStartingDebtSnapshotItem = (debt) => deepFreezeClone({
  debtId: debt.id,
  balance: debt.currentBalance,
  aprStatus: debt.aprStatus,
  effectiveApr: debt.aprStatus === "unknown" ? null : debt.apr,
  minimumRequiredPayment: debt.minimumRequiredPayment,
  includedInCorePayoffPlan: !!debt.includedInCorePayoffPlan && !isDebtNeedsReview(debt),
  debtType: debt.debtType,
});
