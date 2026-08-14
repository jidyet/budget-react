import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { createStartingDebtSnapshotItem } from "../../domain/tracktozero/models.js";
import { isDebtNeedsReview, matchMemberByName, resolveDebtOwnership } from "../../domain/tracktozero/ownership.js";
import { buildExpectedCheckpoints } from "../adapters/tracktozeroCalcAdapter.js";
import { calculateWhatIfComparison } from "../calc/scenarioComparison.js";
import {
  buildProjectionWithWarnings,
  derivePlanHealth,
  getEligiblePlanDebts,
  getIncludedDebts,
  monthKeyFromDate,
  sortDebtsForStrategy,
} from "./projectionStatusService.js";
import { deriveDebtPortfolioSummary } from "./portfolioSummary.js";
import { V2_DATA_MODES, hasPermission } from "./v2ApplicationService.js";
import { V2_TEST_NOW } from "./v2SeedData.js";
import {
  MATCH_CLASSIFICATIONS,
  RECONCILIATION_DECISIONS,
  buildResolutionEvidence,
  enrichImportCandidatesWithDebtMatches,
} from "./debtReconciliation.js";
import {
  REVIEW_RESOLUTION_TYPES,
  debtStateFingerprint,
  getBlockingReviewCount,
  getOpenReviewCount,
  getOpenReviewItems,
  getResolvedReviewItems,
  getReviewCountsByType,
  sortOpenReviewItems,
} from "./reviewDomain.js";
import { OWNER_TYPES } from "../../domain/tracktozero/constants.js";

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const stableIdPart = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 64);

const parseAsOf = (asOf) => {
  const date = new Date(asOf || V2_TEST_NOW);
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
};

const dueDayFromCandidate = (candidate = {}) => {
  if (candidate.dueDay) return Number(candidate.dueDay);
  if (!candidate.dueDate) return null;
  const parsed = new Date(candidate.dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDate();
};

const metadataPatchFromCandidate = (metadataUpdates = {}) => {
  const allowed = ["apr", "aprStatus", "minimumRequiredPayment", "dueDay", "includedInCorePayoffPlan", "debtType", "ownerType", "ownerId", "ownerLabel", "accountReferenceSafe"];
  return Object.fromEntries(Object.entries(metadataUpdates)
    .filter(([key, value]) => allowed.includes(key) && value !== undefined));
};

export const getUserSafeTrackToZeroError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  if (code.includes("permission-denied") || /permission|insufficient/i.test(message)) {
    return {
      kind: "permission_denied",
      message: "Your role allows viewing this information, but not changing it.",
    };
  }
  if (/emulator|required|unavailable/i.test(message)) {
    return {
      kind: "repository_error",
      message: "TrackToZero beta is temporarily unavailable. Nothing was changed. Try again shortly.",
    };
  }
  // DATA-1 HOTFIX: a raw Firestore write rejection (e.g. an internal
  // serialization bug like the undefined-field ImportBatch failure this
  // guards against) must never surface its technical wording as the
  // primary import-failure message.
  if (/setDoc|invalid data|unsupported field value/i.test(message)) {
    return {
      kind: "import_persistence_error",
      message: "We couldn't save that file yet. Nothing was added. Try again.",
    };
  }
  return {
    kind: "repository_error",
    message: "TrackToZero could not complete that action. Nothing was changed. Try again.",
  };
};

const resolveActivePlanContextAsync = async ({ repository, workspaceId }) => {
  const workspace = await repository.getWorkspace(workspaceId);
  if (!workspace?.activePlanId) return null;
  const plan = await repository.getPlan(workspaceId, workspace.activePlanId);
  if (!plan) return { workspace, plan: null, version: null };
  const version = plan.activeVersionId
    ? await repository.getPlanVersion(workspaceId, plan.id, plan.activeVersionId)
    : null;
  return { workspace, plan, version };
};

const latestSnapshotsByDebtAsync = async (repository, workspaceId, debts) => {
  const pairs = await Promise.all(debts.map(async (debt) => [
    debt.id,
    (await repository.listBalanceSnapshots(workspaceId, debt.id))[0] || null,
  ]));
  return Object.fromEntries(pairs);
};

const paymentEventsByDebtAsync = async (repository, workspaceId, debts) => {
  if (typeof repository.listPaymentEvents !== "function") return {};
  const pairs = await Promise.all(debts.map(async (debt) => [
    debt.id,
    await repository.listPaymentEvents(workspaceId, debt.id),
  ]));
  return Object.fromEntries(pairs);
};

export const createTrackToZeroV2AsyncAppService = ({
  repository,
  actorId = "seed-owner",
  mode = V2_DATA_MODES.interactive,
  asOf = V2_TEST_NOW,
} = {}) => {
  if (!repository) throw new Error("TrackToZero v2 async application service requires a repository");

  const assertInteractive = () => {
    if (mode !== V2_DATA_MODES.interactive) {
      throw new Error("Legacy Preview mode is read-only. No TrackToZero 2.0 writes are allowed here.");
    }
  };

  const getWorkspaces = async () =>
    (await repository.listWorkspaces())
      .map((workspace) => ({ ...workspace }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  const bootstrapOwnerWorkspace = async (workspaceId, { type = "personal", displayName = "", email = "" } = {}) => {
    assertInteractive();
    const existingMembership = await Promise.resolve(repository.getMembership(workspaceId, actorId)).catch(() => null);
    if (existingMembership?.status === "active") return getWorkspaceContext(workspaceId);
    const workspace = {
      id: workspaceId,
      type,
      status: "active",
      activePlanId: "",
      createdAt: asOf,
      createdBy: actorId,
    };
    const ownerMembership = {
      workspaceId,
      uid: actorId,
      role: "owner",
      status: "active",
      displayName,
      email,
      createdAt: asOf,
      createdBy: actorId,
    };
    if (typeof repository.saveOwnerWorkspaceBootstrap === "function") {
      await repository.saveOwnerWorkspaceBootstrap({ workspace, ownerMembership });
    } else {
      await repository.saveWorkspace(workspace);
      await repository.saveMembership(ownerMembership);
    }
    return getWorkspaceContext(workspaceId);
  };

  const createMemberInvite = async (workspaceId, { email = "", role = "viewer" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageMembers")) throw new Error("Your role cannot manage household invitations.");
    if (!["admin", "contributor", "viewer"].includes(role)) throw new Error("Owners cannot be invited or transferred in this beta flow.");
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Enter a valid invite email.");
    if (typeof repository.saveMemberInvite !== "function") throw new Error("Invitation storage is unavailable.");
    return repository.saveMemberInvite({
      id: id("invite"),
      workspaceId,
      email: normalizedEmail,
      role,
      status: "pending",
      createdAt: asOf,
      createdBy: actorId,
      note: "Pending invite only. This does not grant workspace access until a future secure acceptance flow exists.",
    });
  };

  const getWorkspaceContext = async (workspaceId) => {
    const workspace = await repository.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const [membership, members] = await Promise.all([
      repository.getMembership(workspaceId, actorId),
      repository.listMemberships?.(workspaceId) || [],
    ]);
    if (!membership || membership.status !== "active") throw new Error("You are not a member of this workspace.");
    return {
      workspace,
      membership,
      members,
      permissions: ROLE_PERMISSIONS[membership?.role] || ROLE_PERMISSIONS.viewer,
    };
  };

  const getActivePlanContext = (workspaceId) => resolveActivePlanContextAsync({ repository, workspaceId });

  const getExpectedCheckpoints = async (workspaceId, activeContext) => {
    if (!activeContext?.plan || !activeContext?.version) return [];
    return repository.listExpectedCheckpoints?.(workspaceId, activeContext.plan.id, activeContext.version.id) || [];
  };

  const getWorkspaceSnapshot = async (workspaceId) => {
    const context = await getWorkspaceContext(workspaceId);
    const debts = await repository.listDebts(workspaceId);
    const activeContext = await getActivePlanContext(workspaceId);
    const expectedCheckpoints = await getExpectedCheckpoints(workspaceId, activeContext);
    const snapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, debts);
    const paymentEventsByDebt = await paymentEventsByDebtAsync(repository, workspaceId, debts);
    const { month, year } = parseAsOf(asOf);
    const projectionWithWarnings = activeContext?.version
      ? buildProjectionWithWarnings({ debts, planVersion: activeContext.version, startMonth: month, startYear: year })
      : { projection: [], warnings: [] };
    // THE single Home/Plan plan-health derivation (UX-0 Part 9-10) - see the
    // matching comment in v2ApplicationService.js's getWorkspaceSnapshot.
    const status = derivePlanHealth({
      debts,
      planVersion: activeContext?.version,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      projectionWarnings: projectionWithWarnings.warnings,
      asOf,
    });
    const includedDebts = getIncludedDebts(debts, activeContext?.version);
    const eligibleDebts = getEligiblePlanDebts(debts, activeContext?.version);
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    // A debt with a $0 (or lower) balance is already paid off and must never
    // be presented as "what to pay off next," even as a fallback when no
    // plan has been activated yet.
    const payableEligibleDebts = eligibleDebts.filter((debt) => debtBalance(debt) > 0);
    const projectedTarget = projectionWithWarnings.projection[0]?.payoff_target || "";
    const frozenTargetId = activeContext?.version?.startingDebtSnapshot?.find((item) => item.includedInCorePayoffPlan)?.debtId || "";
    const targetDebt = debts.find((debt) => debt.id === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.name === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.id === frozenTargetId && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || payableEligibleDebts[0]
      || null;
    // THE single shared debt-portfolio derivation (UX-0 Part 3) - see the
    // matching comment in v2ApplicationService.js's getWorkspaceSnapshot.
    const portfolioSummary = deriveDebtPortfolioSummary({
      workspace: context.workspace,
      members: context.members,
      debts,
      debtBalance,
    });
    const payoffQueue = sortDebtsForStrategy(
      eligibleDebts.filter((debt) => debtBalance(debt) > 0),
      activeContext?.version?.strategy || "avalanche"
    );

    return {
      ...context,
      mode,
      asOf,
      debts,
      includedDebts,
      activeContext,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      paymentEventsByDebt,
      projection: projectionWithWarnings.projection,
      warnings: projectionWithWarnings.warnings,
      status,
      totalIncludedDebt: portfolioSummary.includedDebt,
      targetDebt,
      portfolioSummary,
      payoffQueue,
      projectedZeroDate: projectionWithWarnings.projection.at(-1)?.month || activeContext?.version?.projectedZeroDate || "",
    };
  };

  const createNewDebt = async (workspaceId, input) => {
    assertInteractive();
    const { workspace, membership, members } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view debts, but cannot add debt terms.");
    if (typeof repository.createDebtWithOpeningSnapshot !== "function") {
      throw new Error("Debt setup requires an opening balance snapshot.");
    }
    const ownership = resolveDebtOwnership({
      workspaceType: workspace.type,
      members,
      actorId,
      requested: { ownerType: input.ownerType, ownerId: input.ownerId },
    });
    const debtId = input.id || (input.clientRequestId ? `debt-${stableIdPart(input.clientRequestId)}` : id("debt"));
    const openingBalanceSnapshotId = input.openingBalanceSnapshotId || `opening-${debtId}`;
    const result = await repository.createDebtWithOpeningSnapshot({
      debt: {
        ...input,
        ...ownership,
        id: debtId,
        workspaceId,
        createdAt: asOf,
        createdBy: actorId,
        openingBalanceSnapshotId,
      },
      openingSnapshot: {
        id: openingBalanceSnapshotId,
        workspaceId,
        debtId,
        balance: input.currentBalance,
        observedAt: input.balanceAsOf || input.observedAt || asOf,
        source: "manual",
        notes: "Opening balance",
        createdAt: asOf,
        createdBy: actorId,
      },
    });
    return result.debt;
  };

  const updateDebt = async (workspaceId, debtId, patch) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view this debt, but cannot edit debt terms.");
    const current = (await repository.listDebts(workspaceId)).find((debt) => debt.id === debtId);
    if (!current) throw new Error("Debt not found");
    return repository.saveDebt({ ...current, ...patch, updatedAt: asOf, updatedBy: actorId });
  };

  const recordPayment = async (workspaceId, debtId, { amount, paidAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot record payments in this workspace.");
    const activeContext = await getActivePlanContext(workspaceId);
    return repository.createPaymentEvent({
      id: id("payment"),
      workspaceId,
      debtId,
      planId: activeContext?.plan?.id || "",
      planVersionId: activeContext?.version?.id || "",
      amount,
      paidAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  const recordBalanceSnapshot = async (workspaceId, debtId, { balance, observedAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot update balances in this workspace.");
    return repository.createBalanceSnapshot({
      id: id("snapshot"),
      workspaceId,
      debtId,
      balance,
      observedAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  // Zero-write preview for a plan that doesn't exist yet (first-run flow):
  // mirrors previewReforecast's approach of building a not-yet-persisted
  // PlanVersion and running it through the existing trusted projection
  // engine, without creating anything. Nothing here recomputes payoff math -
  // buildProjectionWithWarnings is the same function createDraftPlan/
  // activatePlan use for real.
  const previewDraftPlan = async (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    const debts = await repository.listDebts(workspaceId);
    const included = debtIds.length
      ? debts.filter((debt) => debtIds.includes(debt.id))
      : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    if (!included.length) return null;
    const snapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, included);
    const { month, year } = parseAsOf(asOf);
    const previewVersion = {
      id: "preview-first-plan", workspaceId, planId: "preview", versionNumber: 1, strategy, asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment, goalDate, createdAt: asOf, createdBy: actorId, createdBecause: "activation",
    };
    const { projection, warnings } = buildProjectionWithWarnings({ debts: included, planVersion: previewVersion, startMonth: month, startYear: year });
    // See the matching comment in v2ApplicationService.js's previewDraftPlan
    // - the displayed order/total must reflect exactly what was simulated.
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    const eligibleForDisplay = getEligiblePlanDebts(included, previewVersion).filter((debt) => debtBalance(debt) > 0);
    const startingTotalBalance = eligibleForDisplay.reduce((sum, debt) => sum + debtBalance(debt), 0);
    const payoffOrder = sortDebtsForStrategy(eligibleForDisplay, strategy);
    return {
      strategy,
      extraMonthlyPayment,
      includedDebts: included,
      payoffOrder,
      startingTotalBalance,
      monthsToZero: projection.length,
      projectedZeroDate: projection.at(-1)?.month || "",
      estimatedInterest: projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
      warnings,
      projection,
    };
  };

  const createDraftPlan = async (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot create payoff plans.");
    const debts = await repository.listDebts(workspaceId);
    const included = debtIds.length
      ? debts.filter((debt) => debtIds.includes(debt.id))
      : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    const plan = await repository.savePlan({ id: id("plan"), workspaceId, status: "draft", createdAt: asOf, createdBy: actorId });
    const version = await repository.savePlanVersion({
      id: id("version"),
      planId: plan.id,
      workspaceId,
      versionNumber: 1,
      strategy,
      asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment,
      goalDate,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "activation",
    });
    return { plan, version };
  };

  const activatePlan = async (workspaceId, planId, versionId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot activate payoff plans.");
    if (typeof repository.activatePlan !== "function") throw new Error("Repository cannot activate payoff plans");
    const context = await repository.activatePlan({ workspaceId, planId, versionId, actorId, activatedAt: asOf });
    const debts = await repository.listDebts(workspaceId);
    const { month, year } = parseAsOf(asOf);
    for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: context.version, startMonth: month, startYear: year }).slice(0, 36)) {
      await repository.createExpectedCheckpoint(checkpoint);
    }
    return context;
  };

  const createImportBatch = async (workspaceId, { sourceType, sourceFilename = "", candidates = [], warnings = [], parserVersion = "1" } = {}) => {
    assertInteractive();
    const { workspace, membership, members } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot import debts into this workspace.");
    const batchId = id("import");
    // Convenience pre-fill only: if the parser's raw ownerSuggestion matches a
    // REAL verified household member by name, pre-select them instead of
    // forcing a manual pick - the human still reviews/confirms (or changes)
    // this before anything is committed, and resolveDebtOwnership re-verifies
    // it against the real membership list regardless at commit time.
    const withOwnerSuggestions = workspace.type === "household"
      ? candidates.map((candidate) => {
          if (candidate.ownerType && candidate.ownerType !== "unassigned") return candidate;
          const match = matchMemberByName(candidate.ownerSuggestion, members);
          return match ? { ...candidate, ownerType: "member", ownerId: match.uid } : candidate;
        })
      : candidates;
    const debts = await repository.listDebts(workspaceId);
    const latestSnapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, debts);
    const priorImportBatches = await (repository.listImportBatches?.(workspaceId) || []);
    const reconciledCandidates = enrichImportCandidatesWithDebtMatches({
      candidates: withOwnerSuggestions,
      debts,
      latestSnapshotsByDebt,
      priorImportBatches,
    });
    return repository.saveImportBatch({
      id: batchId,
      workspaceId,
      createdBy: actorId,
      createdAt: asOf,
      sourceType,
      sourceFilename,
      status: reconciledCandidates.length ? "review_required" : "failed",
      candidateCount: reconciledCandidates.length,
      confirmedCount: 0,
      rejectedCount: 0,
      duplicateCount: reconciledCandidates.filter((candidate) => candidate.evidence?.reconciliation?.classification === MATCH_CLASSIFICATIONS.duplicateImport).length,
      warnings,
      metadata: { parserVersion },
      candidates: reconciledCandidates.map((candidate) => ({ ...candidate, importBatchId: batchId, workspaceId })),
    });
  };

  const decideImportCandidate = async (workspaceId, batchId, candidateId, { decision, patch = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) =>
      candidate.candidateId === candidateId ? { ...candidate, ...patch, decision } : candidate);
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      confirmedCount: candidates.filter((c) => c.decision === "confirmed").length,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const resolveImportCandidateMatch = async (workspaceId, batchId, candidateId, { decision, targetDebtId = "", metadataUpdates = {}, patch = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!Object.values(RECONCILIATION_DECISIONS).includes(decision)) throw new Error("Unsupported reconciliation decision.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const debts = await repository.listDebts(workspaceId);
    const targetDebt = debts.find((debt) => debt.id === targetDebtId);
    if (decision === RECONCILIATION_DECISIONS.updateExisting && !targetDebt) {
      throw new Error("Target debt not found in this workspace.");
    }
    // Stale-review protection (Part 28) starts here: the target debt's
    // observed state is fingerprinted at the moment the human makes this
    // decision, not at commit time. commitImportBatch later compares this
    // fingerprint against the live debt and refuses to overwrite newer truth.
    const debtSnapshotAtResolution = decision === RECONCILIATION_DECISIONS.updateExisting ? debtStateFingerprint(targetDebt) : null;
    const reviewResolutionType = decision === RECONCILIATION_DECISIONS.updateExisting
      ? REVIEW_RESOLUTION_TYPES.updatedExistingDebt
      : decision === RECONCILIATION_DECISIONS.newDebt
        ? REVIEW_RESOLUTION_TYPES.createdNewDebt
        : REVIEW_RESOLUTION_TYPES.deferred;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      const resolution = buildResolutionEvidence({ decision, targetDebtId, metadataUpdates, actorId, resolvedAt: asOf });
      const nextDecision = decision === RECONCILIATION_DECISIONS.unsure ? "needs_information" : "confirmed";
      return {
        ...candidate,
        ...patch,
        decision: nextDecision,
        targetDebtId: decision === RECONCILIATION_DECISIONS.updateExisting ? targetDebtId : "",
        duplicateOfDebtId: decision === RECONCILIATION_DECISIONS.updateExisting ? targetDebtId : candidate.duplicateOfDebtId,
        duplicateStatus: decision === RECONCILIATION_DECISIONS.updateExisting ? "likely_duplicate" : candidate.duplicateStatus,
        // The durable, general-purpose REVIEW-1A marker (reviewDomain.js
        // reads this to derive status) - kept alongside, not instead of,
        // DATA-1B's own evidence.reconciliation.resolution below, which
        // existing tests already depend on.
        reviewResolution: { type: reviewResolutionType, decidedAt: asOf, decidedBy: actorId, debtSnapshotAtResolution },
        evidence: {
          ...(candidate.evidence || {}),
          reconciliation: {
            ...(candidate.evidence?.reconciliation || {}),
            resolution,
          },
        },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      confirmedCount: candidates.filter((c) => c.decision === "confirmed").length,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      duplicateCount: candidates.filter((c) => c.evidence?.reconciliation?.classification === MATCH_CLASSIFICATIONS.duplicateImport).length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const commitImportBatch = async (workspaceId, batchId) => {
    assertInteractive();
    const { workspace, membership, members } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot commit this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status === "committed") return { batch, createdDebts: [] };
    if (batch.status !== "review_required") throw new Error(`Import batch cannot be committed from status "${batch.status}".`);

    const createdDebts = [];
    const updatedDebts = [];
    const failures = [];
    const staleCandidateIds = [];
    const committedOutcomeByCandidateId = new Map();
    for (const candidate of batch.candidates) {
      if (candidate.decision !== "confirmed") continue;
      const resolution = candidate.evidence?.reconciliation?.resolution || {};
      const isExistingUpdate = resolution.decision === RECONCILIATION_DECISIONS.updateExisting;
      const debtId = isExistingUpdate ? resolution.targetDebtId : `debt-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`;
      const openingBalanceSnapshotId = `opening-${debtId}`;
      try {
        if (isExistingUpdate) {
          if (typeof repository.updateDebtFromImportCandidate !== "function") throw new Error("Repository cannot update an existing debt from import.");
          const metadataPatch = metadataPatchFromCandidate(resolution.metadataUpdates || {});
          const result = await repository.updateDebtFromImportCandidate({
            workspaceId,
            debtId,
            metadataPatch,
            balanceSnapshot: {
              id: `import-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`,
              workspaceId,
              debtId,
              balance: candidate.currentBalance,
              observedAt: candidate.statementDate || asOf,
              source: "import",
              notes: `Imported balance update from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidate.candidateId}).`,
              createdAt: asOf,
              createdBy: actorId,
            },
            actorId,
            updatedAt: asOf,
            // Stale-review protection (Part 28): compare against the debt's
            // state at the moment this decision was made, captured by
            // resolveImportCandidateMatch/resolveAsExistingDebt.
            expectedPriorState: candidate.reviewResolution?.debtSnapshotAtResolution || null,
          });
          updatedDebts.push(result.debt);
          committedOutcomeByCandidateId.set(candidate.candidateId, { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, debtId, at: asOf });
          continue;
        }
        // candidate.ownerSuggestion is the parser's raw, non-authoritative
        // guess and is never written to the Debt - only the human-reviewed
        // ownerType/ownerId choice (verified below) becomes real ownership.
        const ownership = resolveDebtOwnership({
          workspaceType: workspace.type,
          members,
          actorId,
          requested: { ownerType: candidate.ownerType, ownerId: candidate.ownerId },
        });
        // Reuses the exact same repository method (and therefore the same
        // rules-enforced Debt+opening-BalanceSnapshot atomicity gate,
        // v2OpeningSnapshotCreatedWithDebt) that manual debt entry uses - no
        // separate atomicity contract to prove for the import path.
        const result = await repository.createDebtWithOpeningSnapshot({
          debt: {
            id: debtId,
            workspaceId,
            name: candidate.accountName || candidate.creditorName || "Imported debt",
            accountReferenceSafe: candidate.accountReferenceSafe,
            debtType: candidate.debtType,
            currentBalance: candidate.currentBalance,
            // Carries the parser/spreadsheet's confidence in this balance
            // through to the created Debt (see statementCandidateAdapter.js/
            // importCandidateAdapter.js) - a candidate whose balance was
            // never confidently found must never become a Debt that looks
            // like a confirmed $0 payoff (UX-0 Part 4/6).
            balanceStatus: candidate.balanceStatus || "confirmed",
            aprStatus: candidate.aprStatus,
            apr: candidate.aprStatus === "unknown" ? null : candidate.apr,
            minimumRequiredPayment: candidate.minimumPayment ?? 0,
            dueDay: dueDayFromCandidate(candidate),
            ...ownership,
            includedInCorePayoffPlan: candidate.includedInCorePayoffPlan,
            createdAt: asOf,
            createdBy: actorId,
            openingBalanceSnapshotId,
          },
          openingSnapshot: {
            id: openingBalanceSnapshotId,
            workspaceId,
            debtId,
            balance: candidate.currentBalance,
            observedAt: candidate.statementDate || asOf,
            source: "import",
            notes: `Imported from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidate.candidateId}).`,
            createdAt: asOf,
            createdBy: actorId,
          },
        });
        createdDebts.push(result.debt);
        committedOutcomeByCandidateId.set(candidate.candidateId, { type: REVIEW_RESOLUTION_TYPES.createdNewDebt, debtId, at: asOf });
      } catch (error) {
        // A stale-review failure is still a failure for batch-commit control
        // flow (nothing partial is marked committed, and it can be retried
        // after the reviewer looks again) - but it is tagged distinctly so
        // it is never confused with a generic repository error, and the
        // review stays actionable rather than silently disappearing.
        if (error?.code === "stale_review") staleCandidateIds.push(candidate.candidateId);
        failures.push({ candidateId: candidate.candidateId, message: error?.message || String(error), code: error?.code || "" });
      }
    }

    // Stamp committedOutcome onto the candidates that actually succeeded -
    // this is the durable marker that makes a review RESOLVED (Part 4/5):
    // the decision alone is not enough, the financial mutation must have
    // completed, and this must survive reload.
    const nextCandidates = batch.candidates.map((candidate) => {
      const outcome = committedOutcomeByCandidateId.get(candidate.candidateId);
      return outcome ? { ...candidate, committedOutcome: outcome } : candidate;
    });

    const confirmedCount = batch.candidates.filter((c) => c.decision === "confirmed").length;
    const committed = failures.length === 0;
    const updatedBatch = await repository.saveImportBatch({
      ...batch,
      candidates: nextCandidates,
      // A commit-time failure must always stay retryable (Part 27/48 -
      // "the batch was not marked committed so it can be retried") even when
      // zero candidates happened to succeed yet - "failed" is reserved for
      // createImportBatch's own zero-candidates-parsed case, never reused
      // here to mean "commit attempt failed."
      status: committed ? "committed" : "review_required",
      confirmedCount,
      rejectedCount: batch.candidates.filter((c) => c.decision === "excluded").length,
      committedAt: committed ? asOf : null,
      updatedAt: asOf,
      updatedBy: actorId,
      failure: failures.length ? `${failures.length} candidate(s) failed to commit: ${failures.map((f) => f.candidateId).join(", ")}` : "",
      warnings: [...(batch.warnings || []), ...failures.map((f) => `Candidate ${f.candidateId} failed: ${f.message}`)],
    });
    if (failures.length) throw Object.assign(new Error(`Import commit incomplete: ${failures.length} of ${confirmedCount} confirmed debts failed. ${createdDebts.length + updatedDebts.length} succeeded and were kept; the batch was not marked committed so it can be retried.`), { batch: updatedBatch, createdDebts, updatedDebts, failures, staleCandidateIds });
    return { batch: updatedBatch, createdDebts, updatedDebts };
  };

  // ── REVIEW-1A resolution commands ───────────────────────────────────────
  // React/UI code never performs multi-document financial mutations
  // directly (Part 12) - every resolution goes through one of these named
  // actions, which all share the same underlying safety machinery
  // (resolveImportCandidateMatch's staleness fingerprinting, and
  // commitImportBatch's atomic-per-candidate mutation + idempotent retry).

  // Update Existing (Part 13). Thin, named wrapper over the existing,
  // already-tested resolveImportCandidateMatch primitive - kept so the
  // resolution surface reads the way the rest of the spec names it.
  const resolveAsExistingDebt = (workspaceId, batchId, candidateId, { targetDebtId, metadataUpdates = {} } = {}) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.updateExisting, targetDebtId, metadataUpdates });

  // Create New Debt (Part 14).
  const resolveAsNewDebt = (workspaceId, batchId, candidateId) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.newDebt });

  // "I'm not sure" / Leave for later (Part 15) - the review stays OPEN with
  // zero financial mutation. Identical safety contract to "unsure" above;
  // named separately because it is not really a "reconciliation decision",
  // it is the explicit absence of one.
  const deferReview = (workspaceId, batchId, candidateId) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.unsure });

  const RESOLVABLE_CANDIDATE_FIELDS = Object.freeze(["currentBalance", "balanceStatus", "apr", "aprStatus", "minimumPayment", "dueDate", "dueDay", "ownerType", "ownerId"]);

  // Missing-information / field-conflict resolution (Part 16-19). Patches
  // only the specific fields the reviewer explicitly confirmed - never asks
  // for or overwrites fields the reviewer didn't touch. This narrows the
  // candidate's own review signals (e.g. clears BALANCE_CONFIRMATION once a
  // real balance is supplied) but is NOT itself a new_debt/update_existing
  // decision - it can be called any number of times before one of those.
  const resolveMissingInformation = async (workspaceId, batchId, candidateId, { fields = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const patch = Object.fromEntries(Object.entries(fields).filter(([key]) => RESOLVABLE_CANDIDATE_FIELDS.includes(key)));
    if (!Object.keys(patch).length) throw new Error("No resolvable fields were provided.");
    if ("currentBalance" in patch) patch.balanceStatus = "confirmed";
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        ...patch,
        fieldResolutions: {
          ...(candidate.fieldResolutions || {}),
          ...Object.fromEntries(Object.keys(patch).map((field) => [field, { value: patch[field], decidedAt: asOf, decidedBy: actorId }])),
        },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({ ...batch, candidates, updatedAt: asOf, updatedBy: actorId });
  };

  const resolveBalance = (workspaceId, batchId, candidateId, { currentBalance } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { currentBalance } });
  const resolveApr = (workspaceId, batchId, candidateId, { apr, aprStatus = "known" } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { apr, aprStatus } });
  const resolveMinimumPayment = (workspaceId, batchId, candidateId, { minimumPayment } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { minimumPayment } });
  // Day-of-month only (Part 19 of REVIEW-1B) - a source that only supports
  // "due day 21" must never be displayed/stored as a fabricated full date
  // like "Aug 21". dueDay is the same authoritative field Debt.dueDay
  // already uses; commitImportBatch's dueDayFromCandidate already prefers
  // candidate.dueDay over candidate.dueDate when both are present.
  const resolveDueDate = (workspaceId, batchId, candidateId, { dueDay } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { dueDay: Number(dueDay) } });

  // Owner resolution (Part 19) - authoritative ownership is restricted to a
  // verified workspace member, Joint/Household, or Unassigned. Parser text
  // (ownerSuggestion) is never accepted here as a value in its own right.
  const resolveOwner = async (workspaceId, batchId, candidateId, { ownerType, ownerId = "" } = {}) => {
    if (!OWNER_TYPES.includes(ownerType)) throw new Error("Unsupported owner type.");
    if (ownerType === "member") {
      const { members } = await getWorkspaceContext(workspaceId);
      if (!members.some((member) => member.uid === ownerId && member.status !== "removed")) {
        throw new Error("Owner must be a verified workspace member.");
      }
    }
    return resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { ownerType, ownerId: ownerType === "member" ? ownerId : "" } });
  };

  // Business-scope resolution (Part 20). "exclude" is terminal (dismissed,
  // zero mutation) - a business-like row never silently enters a Household
  // payoff. "include" only acknowledges the scope question; the reviewer
  // still separately resolves new_debt/update_existing afterward.
  const resolveBusinessScope = async (workspaceId, batchId, candidateId, { decision } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!["exclude", "include"].includes(decision)) throw new Error("Unsupported business-scope decision.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const resolutionType = decision === "exclude" ? REVIEW_RESOLUTION_TYPES.excludedBusinessScope : REVIEW_RESOLUTION_TYPES.includedBusinessScope;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: decision === "exclude" ? "excluded" : candidate.decision,
        includedInCorePayoffPlan: decision === "exclude" ? false : candidate.includedInCorePayoffPlan,
        reviewResolution: { type: resolutionType, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Debt-vs-bill classification (Part 21). "bill" is terminal - no Debt is
  // ever created from it.
  const resolveDebtClassification = async (workspaceId, batchId, candidateId, { classification } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!["debt", "bill"].includes(classification)) throw new Error("Unsupported classification.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const resolutionType = classification === "bill" ? REVIEW_RESOLUTION_TYPES.classifiedAsBill : REVIEW_RESOLUTION_TYPES.classifiedAsDebt;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: classification === "bill" ? "excluded" : candidate.decision,
        reviewResolution: { type: resolutionType, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Duplicate resolution (Part 22) - terminal, zero mutation, idempotent
  // (calling it twice leaves the same dismissed state).
  const dismissDuplicate = async (workspaceId, batchId, candidateId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: "excluded",
        reviewResolution: { type: REVIEW_RESOLUTION_TYPES.dismissedDuplicate, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Historical-statement resolution (Part 23) - uses the plain,
  // append-only createBalanceSnapshot primitive (never
  // updateDebtFromImportCandidate), so an older statement can NEVER become
  // the debt's current balance no matter when it is uploaded.
  const addHistoricalSnapshot = async (workspaceId, batchId, candidateId, { targetDebtId, statementDate } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!statementDate) throw new Error("A statement date is required for a historical snapshot.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    const candidate = batch.candidates.find((c) => c.candidateId === candidateId);
    if (!candidate) throw new Error("Candidate not found in this import batch.");
    const debts = await repository.listDebts(workspaceId);
    if (!debts.some((debt) => debt.id === targetDebtId)) throw new Error("Target debt not found in this workspace.");
    const latestSnapshot = (await repository.listBalanceSnapshots(workspaceId, targetDebtId))[0] || null;
    if (latestSnapshot && Date.parse(statementDate) >= Date.parse(latestSnapshot.observedAt)) {
      throw new Error("This statement is not older than the debt's latest known balance - use Update Existing Debt instead.");
    }
    const snapshot = await repository.createBalanceSnapshot({
      id: `historical-${stableIdPart(`${batchId}:${candidateId}`)}`,
      workspaceId,
      debtId: targetDebtId,
      balance: candidate.currentBalance,
      observedAt: statementDate,
      source: "import",
      notes: `Historical balance from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidateId}). Confirmed as historical - does not change the debt's current balance.`,
      createdAt: asOf,
      createdBy: actorId,
    });
    const candidates = batch.candidates.map((c) => {
      if (c.candidateId !== candidateId) return c;
      return {
        ...c,
        decision: "confirmed",
        targetDebtId,
        reviewResolution: { type: REVIEW_RESOLUTION_TYPES.addedHistoricalSnapshot, decidedAt: asOf, decidedBy: actorId },
        committedOutcome: { type: REVIEW_RESOLUTION_TYPES.addedHistoricalSnapshot, debtId: targetDebtId, at: asOf },
      };
    });
    await repository.saveImportBatch({ ...batch, candidates, updatedAt: asOf, updatedBy: actorId });
    return { balanceSnapshot: snapshot };
  };

  // Shared review truth (Part 9, 39, 40) - the one entry point a future
  // Review Center / Home count / Import screen should call, so open/
  // blocking/type counts are never recomputed independently per screen.
  // Workspace-scoped for free: repository.listImportBatches already filters
  // by workspaceId in both the InMemory and Firebase repositories.
  const getReviewSnapshot = async (workspaceId) => {
    await getWorkspaceContext(workspaceId);
    const batches = await (repository.listImportBatches?.(workspaceId) || []);
    return {
      openItems: sortOpenReviewItems(getOpenReviewItems(batches)),
      resolvedItems: getResolvedReviewItems(batches),
      openCount: getOpenReviewCount(batches),
      blockingCount: getBlockingReviewCount(batches),
      countsByType: getReviewCountsByType(batches),
    };
  };

  const previewScenario = async (workspaceId, { extraMonthlyPayment = 100 } = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const scenarioVersion = {
      ...snapshot.activeContext.version,
      extraMonthlyPayment: Number(snapshot.activeContext.version.extraMonthlyPayment || 0) + Number(extraMonthlyPayment || 0),
    };
    const scenarioProjection = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: scenarioVersion, startMonth: month, startYear: year }).projection;
    return calculateWhatIfComparison({ baselineRows: snapshot.projection, scenarioRows: scenarioProjection });
  };

  const previewReforecast = async (workspaceId, overrides = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const proposedVersion = {
      ...snapshot.activeContext.version,
      ...overrides,
      id: `${snapshot.activeContext.version.id}-preview`,
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      createdBecause: "reforecast",
    };
    const proposed = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: proposedVersion, startMonth: month, startYear: year });
    return {
      priorVersion: snapshot.activeContext.version,
      proposedVersion,
      oldProjectedZeroDate: snapshot.projectedZeroDate,
      proposedZeroDate: proposed.projection.at(-1)?.month || "",
      warnings: proposed.warnings,
      projection: proposed.projection,
    };
  };

  const applyReforecast = async (workspaceId, overrides = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot reforecast payoff plans.");
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.plan || !snapshot.activeContext?.version) throw new Error("No active plan to reforecast");
    const nextVersion = {
      ...snapshot.activeContext.version,
      ...overrides,
      id: id("version"),
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      asOf,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "reforecast",
    };
    const context = await repository.reforecastActivePlan({
      workspaceId,
      planId: snapshot.activeContext.plan.id,
      priorVersionId: snapshot.activeContext.version.id,
      nextVersion,
      actorId,
      appliedAt: asOf,
    });
    const debts = await repository.listDebts(workspaceId);
    const { month, year } = parseAsOf(asOf);
    for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: context.version, startMonth: month, startYear: year }).slice(0, 36)) {
      await repository.createExpectedCheckpoint(checkpoint);
    }
    return context;
  };

  return {
    mode,
    actorId,
    getWorkspaces,
    bootstrapOwnerWorkspace,
    createMemberInvite,
    getWorkspaceContext,
    getWorkspaceSnapshot,
    getActivePlanContext,
    createNewDebt,
    updateDebt,
    recordPayment,
    recordBalanceSnapshot,
    createImportBatch,
    decideImportCandidate,
    resolveImportCandidateMatch,
    commitImportBatch,
    resolveAsExistingDebt,
    resolveAsNewDebt,
    deferReview,
    resolveMissingInformation,
    resolveBalance,
    resolveApr,
    resolveMinimumPayment,
    resolveDueDate,
    resolveOwner,
    resolveBusinessScope,
    resolveDebtClassification,
    dismissDuplicate,
    addHistoricalSnapshot,
    getReviewSnapshot,
    previewDraftPlan,
    createDraftPlan,
    activatePlan,
    previewScenario,
    previewReforecast,
    applyReforecast,
    getCurrentPeriod: () => monthKeyFromDate(asOf),
  };
};
