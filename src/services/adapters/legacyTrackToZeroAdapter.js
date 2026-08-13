import { isMonthlyBill, isNoInterestBill } from "../billModel.js";
import { normalizeAprDecimal } from "../../utils/budgetUtils.js";
import {
  createBalanceSnapshot,
  createDebt,
  createExpectedCheckpoint,
  createPayoffPlan,
  createPlanVersion,
  createStartingDebtSnapshotItem,
  createWorkspace,
  createWorkspaceMembership,
} from "../../domain/tracktozero/models.js";
import { buildExpectedCheckpoints } from "./tracktozeroCalcAdapter.js";
import { v2Paths } from "../repositories/tracktozeroRepositories.js";

export const LEGACY_DEBT_CLASSIFICATION = Object.freeze({
  CLEAR_DEBT: "clear_debt",
  NOT_DEBT: "not_debt",
  NEEDS_CONFIRMATION: "needs_confirmation",
});

const ZERO_TIME = "2026-01-01T00:00:00.000Z";
const text = (value) => String(value || "").trim();
const money = (value) => Math.max(0, Number(value ?? 0) || 0);
const slug = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

export const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const stableHash = (value) => {
  const source = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const deterministicId = (...parts) => `${slug(parts[0])}-${stableHash(parts.slice(1)).slice(0, 10)}`;
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

const normalizeSource = ({ legacyWorkspace, legacyMembers, legacyAccounts, legacyPlans }) => ({
  workspace: {
    id: text(legacyWorkspace?.id || legacyWorkspace?.householdId || legacyWorkspace?.uid || "preview-workspace"),
    uid: text(legacyWorkspace?.uid),
    householdId: text(legacyWorkspace?.householdId),
    memberIds: Array.isArray(legacyWorkspace?.memberIds) ? [...legacyWorkspace.memberIds].sort() : [],
    ownerId: text(legacyWorkspace?.ownerId),
    type: text(legacyWorkspace?.type),
  },
  members: legacyMembers.map((member) => ({
    uid: text(member.uid || member.id),
    role: text(member.role),
    status: text(member.status || "active"),
    owner: !!member.owner,
  })).sort((a, b) => a.uid.localeCompare(b.uid)),
  accounts: legacyAccounts.map((account) => ({
    id: text(account.id),
    name: text(account.name || account.billName || account.bank),
    billType: text(account.billType || account.type),
    category: text(account.category),
    cur_bal: money(account.cur_bal ?? account.starting_bal),
    base_bal_v: money(account.base_bal_v ?? account.starting_bal ?? account.cur_bal),
    min_due_v: money(account.min_due_v ?? account.budgeted_min),
    apr_v: account.apr_v ?? account.apr ?? "",
    due_day: account.due_day || "",
    owner: text(account.owner),
    planned_v: money(account.planned_v),
    paid_v: money(account.paid_v),
  })).sort((a, b) => a.id.localeCompare(b.id)),
  plans: legacyPlans.map((plan) => ({
    id: text(plan.id),
    name: text(plan.name),
    strategy: text(plan.strategy || "avalanche"),
    monthly_extra: money(plan.monthly_extra),
    items: Array.isArray(plan.items) ? plan.items.map((item) => ({
      account_id: text(item.account_id),
      include: item.include !== false,
      extra_payment: money(item.extra_payment),
    })).sort((a, b) => a.account_id.localeCompare(b.account_id)) : [],
  })).sort((a, b) => a.id.localeCompare(b.id)),
});

export const buildSourceFingerprint = (source) => stableHash(normalizeSource(source));

export const classifyLegacyAccount = (account = {}, confirmations = {}) => {
  const explicit = confirmations[text(account.id)];
  if (explicit?.classification === LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT, reason: "confirmed by migration reviewer" };
  }
  if (explicit?.classification === LEGACY_DEBT_CLASSIFICATION.NOT_DEBT) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.NOT_DEBT, reason: "excluded by migration reviewer" };
  }
  const haystack = lowerHaystack(account);
  const balance = money(account.cur_bal ?? account.starting_bal);
  if (isMonthlyBill(account) && balance <= 0.01) return { classification: LEGACY_DEBT_CLASSIFICATION.NOT_DEBT, reason: "ordinary monthly expense" };
  if (hasExplicitPayoffType(account) && balance > 0.01) return { classification: LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT, reason: "explicit legacy paydown/no-interest account" };
  if (/(credit|card|loan|mortgage|affirm|sofi|mohela|navient|nelnet|aidvantage|line of credit)/.test(haystack) && balance > 0.01) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT, reason: "debt-like name/category with balance" };
  }
  if (/(utility|subscription|insurance|rent|phone|internet|electric|water|streaming)/.test(haystack)) {
    return { classification: LEGACY_DEBT_CLASSIFICATION.NOT_DEBT, reason: "recurring expense category" };
  }
  return { classification: LEGACY_DEBT_CLASSIFICATION.NEEDS_CONFIRMATION, reason: "ambiguous legacy record" };
};

export const legacyAccountToDebtCandidate = ({ account, workspaceId, createdBy = "migration-preview", confirmations = {}, idMap = null, asOf = ZERO_TIME }) => {
  const classification = classifyLegacyAccount(account, confirmations);
  if (classification.classification !== LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT) {
    return { classification, debt: null };
  }
  const confirmation = confirmations[text(account.id)] || {};
  const haystack = lowerHaystack({ ...account, ...confirmation });
  const isMortgage = /mortgage/.test(haystack) || confirmation.debtType === "mortgage";
  const noInterest = isNoInterestBill(account) || confirmation.aprStatus === "no_interest";
  const aprRaw = confirmation.apr ?? account.apr_v ?? account.apr;
  const aprKnown = aprRaw !== undefined && aprRaw !== null && aprRaw !== "";
  const sourceAccountId = text(account.id);
  const debtId = confirmation.targetDebtId || idMap?.debts?.[sourceAccountId] || deterministicId("debt", workspaceId, sourceAccountId);
  const currentBalance = money(confirmation.currentBalance ?? account.cur_bal ?? account.starting_bal);
  const debt = createDebt({
    id: debtId,
    workspaceId,
    name: text(confirmation.name || account.name || account.billName || account.bank || "Legacy debt"),
    debtType: confirmation.debtType || (isMortgage ? "mortgage" : noInterest ? "no_interest_financing" : "legacy_paydown"),
    status: currentBalance > 0.01 ? "active" : "paid_off",
    currentBalance,
    startingBalance: money(confirmation.startingBalance ?? account.base_bal_v ?? account.starting_bal ?? currentBalance),
    aprStatus: noInterest ? "no_interest" : aprKnown ? "known" : "unknown",
    apr: noInterest ? 0 : aprKnown ? normalizeAprDecimal(aprRaw) : null,
    minimumRequiredPayment: money(confirmation.minimumRequiredPayment ?? account.min_due_v ?? account.budgeted_min),
    dueDay: confirmation.dueDay ?? account.due_day ?? null,
    ownerId: text(confirmation.ownerId),
    ownerLabel: text(confirmation.ownerLabel || account.owner),
    includedInCorePayoffPlan: confirmation.includedInCorePayoffPlan ?? !isMortgage,
    createdAt: asOf,
    createdBy,
  });
  return { classification, debt };
};

export const legacyHouseholdToWorkspaceCandidate = ({ household, members = [], asOf, createdBy = "migration-preview", idMap = null }) => {
  const legacyId = text(household.id || household.householdId);
  const ownerId = text(household.ownerId || members.find((member) => member.role === "owner" || member.owner)?.uid || members[0]?.uid);
  if (!ownerId) throw new Error("Household migration requires a clear owner");
  const workspaceId = idMap?.workspaceId || deterministicId("workspace", "household", legacyId);
  return {
    workspace: createWorkspace({
      id: workspaceId,
      type: "household",
      status: household.active === false ? "archived" : "active",
      activePlanId: "",
      createdAt: asOf,
      createdBy: ownerId || createdBy,
    }),
    memberships: members.map((member) => {
      const uid = text(member.uid || member.id);
      return createWorkspaceMembership({
        workspaceId,
        uid,
        role: uid === ownerId || member.role === "owner" ? "owner" : "contributor",
        status: member.status || "active",
        displayName: text(member.displayName || member.label),
        email: text(member.email),
        createdAt: asOf,
        createdBy,
      });
    }),
    assumptions: ["Legacy non-owner household members map to contributor by default."],
  };
};

export const legacySavedPlanToDraftCandidate = ({ plan, workspaceId, createdBy = "migration-preview", asOf, idMap = null }) => createPayoffPlan({
  id: idMap?.plans?.[text(plan.id)] || deterministicId("plan", workspaceId, text(plan.id)),
  workspaceId,
  status: "draft",
  activeVersionId: "",
  createdAt: asOf,
  createdBy,
});

const buildPlanVersionForDraft = ({ plan, draftPlan, debts, idMap, asOf, createdBy }) => {
  const includedSourceIds = new Set((plan.items || []).filter((item) => item.include !== false).map((item) => text(item.account_id)));
  const includedDebtIds = new Set([...includedSourceIds].map((id) => idMap.debts[id]).filter(Boolean));
  const scopedDebts = debts.map((debt) => ({
    ...debt,
    includedInCorePayoffPlan: includedDebtIds.size ? includedDebtIds.has(debt.id) : debt.includedInCorePayoffPlan,
  }));
  const version = createPlanVersion({
    id: deterministicId("version", draftPlan.id, "migration-v1"),
    workspaceId: draftPlan.workspaceId,
    planId: draftPlan.id,
    versionNumber: 1,
    strategy: plan.strategy || "avalanche",
    asOf,
    startingDebtSnapshot: scopedDebts.map(createStartingDebtSnapshotItem),
    extraMonthlyPayment: money(plan.monthly_extra),
    assumptions: {
      migrationSourcePlanId: text(plan.id),
      importedAsDraft: true,
      legacyPlannedVUsed: false,
    },
    createdAt: asOf,
    createdBy,
    createdBecause: "activation",
  });
  const [month, year] = [new Date(asOf).getUTCMonth() + 1, new Date(asOf).getUTCFullYear()];
  const checkpoints = buildExpectedCheckpoints({ debts: scopedDebts, planVersion: version, startMonth: month, startYear: year, maxMonths: 60 })
    .slice(0, 12)
    .map((checkpoint) => createExpectedCheckpoint(checkpoint));
  return { version, checkpoints };
};

const buildPreviewDigest = (preview) => stableHash({
  sourceFingerprint: preview.sourceFingerprint,
  workspace: preview.candidateWorkspace,
  memberships: preview.candidateMemberships,
  debts: preview.candidateDebts,
  snapshots: preview.initialBalanceSnapshots,
  plans: preview.candidateDraftPlans,
  versions: preview.candidatePlanVersions,
  checkpoints: preview.expectedCheckpoints,
  excluded: preview.excludedLegacyExpenses,
  ambiguous: preview.ambiguousRecords,
  idMap: preview.sourceToTargetIdMap,
  expectedTargetPaths: preview.expectedTargetPaths,
  migrationState: preview.migrationState,
});

export const buildMigrationPreview = ({
  legacyWorkspace,
  legacyMembers = [],
  legacyAccounts = [],
  legacyPlans = [],
  confirmations = {},
  asOf = ZERO_TIME,
  previewGeneratedAt = asOf,
  writeSink = null,
}) => {
  if (writeSink) throw new Error("Migration preview is read-only and accepts no write sink");
  const source = { legacyWorkspace, legacyMembers, legacyAccounts, legacyPlans };
  const sourceFingerprint = buildSourceFingerprint(source);
  const legacyWorkspaceId = text(legacyWorkspace?.id || legacyWorkspace?.householdId || legacyWorkspace?.uid || "preview-workspace");
  const isHousehold = !!legacyWorkspace?.memberIds || legacyWorkspace?.type === "household" || legacyMembers.length > 1;
  const workspaceId = deterministicId("workspace", isHousehold ? "household" : "personal", legacyWorkspaceId);
  const ownerUid = isHousehold
    ? text(legacyWorkspace?.ownerId || legacyMembers.find((member) => member.role === "owner" || member.owner)?.uid || legacyMembers[0]?.uid)
    : text(legacyWorkspace?.uid || legacyWorkspace?.ownerId || legacyWorkspaceId);
  if (!ownerUid) throw new Error("Migration preview requires a clear owner");
  const workspaceBundle = isHousehold
    ? legacyHouseholdToWorkspaceCandidate({ household: { ...legacyWorkspace, id: legacyWorkspaceId, ownerId: ownerUid }, members: legacyMembers, asOf, idMap: { workspaceId } })
    : {
        workspace: createWorkspace({ id: workspaceId, type: "personal", status: "active", activePlanId: "", createdAt: asOf, createdBy: ownerUid }),
        memberships: [createWorkspaceMembership({ workspaceId, uid: ownerUid, role: "owner", status: "active", createdAt: asOf, createdBy: ownerUid })],
        assumptions: [],
      };

  const sourceToTargetIdMap = {
    workspace: { [legacyWorkspaceId]: workspaceId },
    debts: {},
    plans: {},
    snapshots: {},
    memberships: Object.fromEntries(workspaceBundle.memberships.map((member) => [member.uid, member.uid])),
  };
  legacyAccounts.forEach((account) => { sourceToTargetIdMap.debts[text(account.id)] = deterministicId("debt", workspaceId, text(account.id)); });
  legacyPlans.forEach((plan) => { sourceToTargetIdMap.plans[text(plan.id)] = deterministicId("plan", workspaceId, text(plan.id)); });

  const candidateDebts = [];
  const excludedLegacyExpenses = [];
  const ambiguousRecords = [];
  const initialBalanceSnapshots = [];
  legacyAccounts.forEach((account) => {
    const candidate = legacyAccountToDebtCandidate({ account, workspaceId, createdBy: ownerUid, confirmations, idMap: sourceToTargetIdMap, asOf });
    const sourceId = text(account.id);
    if (candidate.debt) {
      candidateDebts.push(candidate.debt);
      const snapshotId = deterministicId("snapshot", candidate.debt.id, sourceId, "initial");
      sourceToTargetIdMap.snapshots[sourceId] = snapshotId;
      initialBalanceSnapshots.push(createBalanceSnapshot({
        id: snapshotId,
        workspaceId,
        debtId: candidate.debt.id,
        balance: candidate.debt.currentBalance,
        observedAt: asOf,
        source: "import",
        createdAt: asOf,
        createdBy: ownerUid,
        notes: `Initial migration balance from legacy record ${sourceId}.`,
      }));
    } else if (candidate.classification.classification === LEGACY_DEBT_CLASSIFICATION.NOT_DEBT) {
      excludedLegacyExpenses.push({ id: sourceId, reason: candidate.classification.reason });
    } else {
      ambiguousRecords.push({ id: sourceId, reason: candidate.classification.reason });
    }
  });

  const candidateDraftPlans = legacyPlans.map((plan) => legacySavedPlanToDraftCandidate({ plan, workspaceId, createdBy: ownerUid, asOf, idMap: sourceToTargetIdMap }));
  const planArtifacts = legacyPlans.map((plan, index) => buildPlanVersionForDraft({
    plan,
    draftPlan: candidateDraftPlans[index],
    debts: candidateDebts,
    idMap: sourceToTargetIdMap,
    asOf,
    createdBy: ownerUid,
  }));
  const candidatePlanVersions = planArtifacts.map((artifact) => artifact.version);
  const expectedCheckpoints = planArtifacts.flatMap((artifact) => artifact.checkpoints);

  const expectedTargetPaths = [
    v2Paths.workspace(workspaceId),
    ...workspaceBundle.memberships.map((member) => v2Paths.member(workspaceId, member.uid)),
    ...candidateDebts.map((debt) => v2Paths.debt(workspaceId, debt.id)),
    ...initialBalanceSnapshots.map((snapshot) => v2Paths.balanceSnapshot(workspaceId, snapshot.debtId, snapshot.id)),
    ...candidateDraftPlans.map((plan) => v2Paths.plan(workspaceId, plan.id)),
    ...candidatePlanVersions.map((version) => v2Paths.version(workspaceId, version.planId, version.id)),
    ...expectedCheckpoints.map((checkpoint) => v2Paths.expectedCheckpoint(workspaceId, checkpoint.planId, checkpoint.planVersionId, checkpoint.id)),
  ].sort();

  const preview = {
    sourceIdentity: { type: isHousehold ? "household" : "personal", legacyWorkspaceId, ownerUid },
    sourceWorkspaceIdentity: { legacyWorkspaceId, candidateWorkspaceId: workspaceId },
    sourceFingerprint,
    candidateWorkspace: workspaceBundle.workspace,
    candidateMemberships: workspaceBundle.memberships,
    candidateDebts,
    excludedLegacyExpenses,
    ambiguousRecords,
    candidateDraftPlans,
    candidatePlanVersions,
    expectedCheckpoints,
    initialBalanceSnapshots,
    candidatePaymentEvents: [],
    warnings: [
      ...workspaceBundle.assumptions,
      "Legacy saved plans import as drafts only; no active 2.0 plan is inferred.",
      "Legacy planned_v is not migrated as debt truth.",
      "Legacy paid_v does not create PaymentEvents.",
    ],
    sourceToTargetIdMap,
    expectedWriteCount: expectedTargetPaths.length + 1,
    expectedTargetPaths,
    migrationState: "migration_preview",
    previewGeneratedAt,
    writesPerformed: 0,
  };
  return { ...preview, previewDigest: buildPreviewDigest(preview) };
};
