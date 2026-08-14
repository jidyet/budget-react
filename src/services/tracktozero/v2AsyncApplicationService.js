import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { createStartingDebtSnapshotItem } from "../../domain/tracktozero/models.js";
import { resolveDebtOwnership } from "../../domain/tracktozero/ownership.js";
import { buildExpectedCheckpoints } from "../adapters/tracktozeroCalcAdapter.js";
import { calculateWhatIfComparison } from "../calc/scenarioComparison.js";
import {
  buildProjectionWithWarnings,
  classifyPlanStatus,
  getIncludedDebts,
  monthKeyFromDate,
  sortDebtsForStrategy,
} from "./projectionStatusService.js";
import { summarizeHouseholdOwnership } from "./ownershipSummary.js";
import { V2_DATA_MODES, hasPermission } from "./v2ApplicationService.js";
import { V2_TEST_NOW } from "./v2SeedData.js";

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
    const status = classifyPlanStatus({
      debts,
      planVersion: activeContext?.version,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      asOf,
    });
    const includedDebts = getIncludedDebts(debts, activeContext?.version);
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    // A debt with a $0 (or lower) balance is already paid off and must never
    // be presented as "what to pay off next," even as a fallback when no
    // plan has been activated yet.
    const payableIncludedDebts = includedDebts.filter((debt) => debtBalance(debt) > 0);
    const projectedTarget = projectionWithWarnings.projection[0]?.payoff_target || "";
    const frozenTargetId = activeContext?.version?.startingDebtSnapshot?.find((item) => item.includedInCorePayoffPlan)?.debtId || "";
    const targetDebt = debts.find((debt) => debt.id === projectedTarget && debtBalance(debt) > 0)
      || debts.find((debt) => debt.name === projectedTarget && debtBalance(debt) > 0)
      || debts.find((debt) => debt.id === frozenTargetId && debtBalance(debt) > 0)
      || payableIncludedDebts[0]
      || null;
    const totalIncludedDebt = includedDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
    const householdOwnershipSummary = summarizeHouseholdOwnership({
      workspace: context.workspace,
      members: context.members,
      includedDebts,
      debtBalance,
    });
    const payoffQueue = sortDebtsForStrategy(includedDebts, activeContext?.version?.strategy || "avalanche");

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
      totalIncludedDebt,
      targetDebt,
      householdOwnershipSummary,
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
    const startingTotalBalance = included.reduce((sum, debt) => sum + Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0), 0);
    const payoffOrder = sortDebtsForStrategy(included, strategy);
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
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot import debts into this workspace.");
    const batchId = id("import");
    return repository.saveImportBatch({
      id: batchId,
      workspaceId,
      createdBy: actorId,
      createdAt: asOf,
      sourceType,
      sourceFilename,
      status: candidates.length ? "review_required" : "failed",
      candidateCount: candidates.length,
      confirmedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      warnings,
      metadata: { parserVersion },
      candidates: candidates.map((candidate) => ({ ...candidate, importBatchId: batchId, workspaceId })),
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

  const commitImportBatch = async (workspaceId, batchId) => {
    assertInteractive();
    const { workspace, membership, members } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot commit this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status === "committed") return { batch, createdDebts: [] };
    if (batch.status !== "review_required") throw new Error(`Import batch cannot be committed from status "${batch.status}".`);

    const createdDebts = [];
    const failures = [];
    for (const candidate of batch.candidates) {
      if (candidate.decision !== "confirmed") continue;
      const debtId = `debt-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`;
      const openingBalanceSnapshotId = `opening-${debtId}`;
      try {
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
            debtType: candidate.debtType,
            currentBalance: candidate.currentBalance,
            aprStatus: candidate.aprStatus,
            apr: candidate.aprStatus === "unknown" ? null : candidate.apr,
            minimumRequiredPayment: candidate.minimumPayment ?? 0,
            dueDay: null,
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
      } catch (error) {
        failures.push({ candidateId: candidate.candidateId, message: error?.message || String(error) });
      }
    }

    const confirmedCount = batch.candidates.filter((c) => c.decision === "confirmed").length;
    const committed = failures.length === 0;
    const updatedBatch = await repository.saveImportBatch({
      ...batch,
      status: committed ? "committed" : (createdDebts.length ? "review_required" : "failed"),
      confirmedCount,
      rejectedCount: batch.candidates.filter((c) => c.decision === "excluded").length,
      committedAt: committed ? asOf : null,
      updatedAt: asOf,
      updatedBy: actorId,
      failure: failures.length ? `${failures.length} candidate(s) failed to commit: ${failures.map((f) => f.candidateId).join(", ")}` : "",
      warnings: [...(batch.warnings || []), ...failures.map((f) => `Candidate ${f.candidateId} failed: ${f.message}`)],
    });
    if (failures.length) throw Object.assign(new Error(`Import commit incomplete: ${failures.length} of ${confirmedCount} confirmed debts failed. ${createdDebts.length} succeeded and were kept; the batch was not marked committed so it can be retried.`), { batch: updatedBatch, createdDebts, failures });
    return { batch: updatedBatch, createdDebts };
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
    commitImportBatch,
    previewDraftPlan,
    createDraftPlan,
    activatePlan,
    previewScenario,
    previewReforecast,
    applyReforecast,
    getCurrentPeriod: () => monthKeyFromDate(asOf),
  };
};
