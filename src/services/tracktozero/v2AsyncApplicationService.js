import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { createDebt, createStartingDebtSnapshotItem } from "../../domain/tracktozero/models.js";
import { buildExpectedCheckpoints } from "../adapters/tracktozeroCalcAdapter.js";
import { calculateWhatIfComparison } from "../calc/scenarioComparison.js";
import {
  buildProjectionWithWarnings,
  classifyPlanStatus,
  getIncludedDebts,
  monthKeyFromDate,
} from "./projectionStatusService.js";
import { V2_DATA_MODES, hasPermission } from "./v2ApplicationService.js";
import { V2_TEST_NOW } from "./v2SeedData.js";

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  const bootstrapOwnerWorkspace = async (workspaceId, { displayName = "", email = "" } = {}) => {
    assertInteractive();
    const existingMembership = await repository.getMembership(workspaceId, actorId).catch(() => null);
    if (existingMembership?.status === "active") return getWorkspaceContext(workspaceId);
    await repository.saveWorkspace({
      id: workspaceId,
      type: "solo",
      status: "active",
      activePlanId: "",
      createdAt: asOf,
      createdBy: actorId,
    });
    await repository.saveMembership({
      workspaceId,
      uid: actorId,
      role: "owner",
      status: "active",
      displayName,
      email,
      createdAt: asOf,
      createdBy: actorId,
    });
    return getWorkspaceContext(workspaceId);
  };

  const getWorkspaceContext = async (workspaceId) => {
    const workspace = await repository.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const [membership, members] = await Promise.all([
      repository.getMembership(workspaceId, actorId),
      repository.listMemberships?.(workspaceId) || [],
    ]);
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
    const projectedTarget = projectionWithWarnings.projection[0]?.payoff_target || "";
    const frozenTargetId = activeContext?.version?.startingDebtSnapshot?.find((item) => item.includedInCorePayoffPlan)?.debtId || "";
    const targetDebt = debts.find((debt) => debt.id === projectedTarget)
      || debts.find((debt) => debt.name === projectedTarget)
      || debts.find((debt) => debt.id === frozenTargetId)
      || includedDebts[0]
      || null;
    const totalIncludedDebt = includedDebts.reduce((sum, debt) =>
      sum + Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0), 0);

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
      projectedZeroDate: projectionWithWarnings.projection.at(-1)?.month || activeContext?.version?.projectedZeroDate || "",
    };
  };

  const createNewDebt = async (workspaceId, input) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view debts, but cannot add debt terms.");
    return repository.saveDebt(createDebt({
      id: id("debt"),
      workspaceId,
      createdAt: asOf,
      createdBy: actorId,
      ...input,
    }));
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
    getWorkspaceContext,
    getWorkspaceSnapshot,
    getActivePlanContext,
    createNewDebt,
    updateDebt,
    recordPayment,
    recordBalanceSnapshot,
    createDraftPlan,
    activatePlan,
    previewScenario,
    previewReforecast,
    applyReforecast,
    getCurrentPeriod: () => monthKeyFromDate(asOf),
  };
};
