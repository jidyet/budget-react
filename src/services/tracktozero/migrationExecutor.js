import { stableHash, stableStringify } from "../adapters/legacyTrackToZeroAdapter.js";
import { v2Paths } from "../repositories/tracktozeroRepositories.js";

const clone = (value) => structuredClone(value);
const nowIso = () => new Date().toISOString();
const safe = async (read, fallback) => {
  try {
    return await Promise.resolve(read());
  } catch {
    return fallback;
  }
};

export const MIGRATION_EXECUTION_STATES = Object.freeze({
  IN_PROGRESS: "in_progress",
  PARTIAL_FAILED: "partial_failed",
  ROLLBACK_ALLOWED: "rollback_allowed",
  ROLLED_BACK: "rolled_back",
  ROLLBACK_BLOCKED: "rollback_blocked",
});

const entityFromPath = (preview, path) => {
  const workspaceId = preview.candidateWorkspace.id;
  if (path === v2Paths.workspace(workspaceId)) return { kind: "workspace", value: preview.candidateWorkspace };
  const member = preview.candidateMemberships.find((item) => path === v2Paths.member(workspaceId, item.uid));
  if (member) return { kind: "membership", value: member };
  const debt = preview.candidateDebts.find((item) => path === v2Paths.debt(workspaceId, item.id));
  if (debt) return { kind: "debt", value: debt };
  const snapshot = preview.initialBalanceSnapshots.find((item) => path === v2Paths.balanceSnapshot(workspaceId, item.debtId, item.id));
  if (snapshot) return { kind: "balanceSnapshot", value: snapshot };
  const plan = preview.candidateDraftPlans.find((item) => path === v2Paths.plan(workspaceId, item.id));
  if (plan) return { kind: "plan", value: plan };
  const version = preview.candidatePlanVersions.find((item) => path === v2Paths.version(workspaceId, item.planId, item.id));
  if (version) return { kind: "planVersion", value: version };
  const checkpoint = preview.expectedCheckpoints.find((item) => path === v2Paths.expectedCheckpoint(workspaceId, item.planId, item.planVersionId, item.id));
  if (checkpoint) return { kind: "expectedCheckpoint", value: checkpoint };
  throw new Error(`Preview does not define target path: ${path}`);
};

const saveEntity = async (repository, entity) => {
  if (entity.kind === "workspace") return repository.saveWorkspace(entity.value);
  if (entity.kind === "membership") return repository.saveMembership(entity.value);
  if (entity.kind === "debt") return repository.saveDebt(entity.value);
  if (entity.kind === "balanceSnapshot") return repository.createBalanceSnapshot(entity.value);
  if (entity.kind === "plan") return repository.savePlan(entity.value);
  if (entity.kind === "planVersion") return repository.savePlanVersion(entity.value);
  if (entity.kind === "expectedCheckpoint") return repository.createExpectedCheckpoint(entity.value);
  throw new Error(`Unsupported migration entity kind: ${entity.kind}`);
};

const sameEntity = (a, b) => stableStringify(a || null) === stableStringify(b || null);

export const buildMigrationManifest = ({ preview, actorId, migrationRunId, state = MIGRATION_EXECUTION_STATES.IN_PROGRESS, at = nowIso(), completedPaths = [], failure = null }) => ({
  id: migrationRunId,
  workspaceId: preview.candidateWorkspace.id,
  sourceIdentity: clone(preview.sourceIdentity),
  sourceFingerprint: preview.sourceFingerprint,
  previewDigest: preview.previewDigest,
  actorId,
  startedAt: at,
  updatedAt: at,
  migrationState: state,
  sourceToTargetIdMap: clone(preview.sourceToTargetIdMap),
  expectedTargetPaths: [...preview.expectedTargetPaths],
  completedPaths: [...completedPaths],
  expectedWriteCount: preview.expectedWriteCount,
  warnings: [...preview.warnings],
  rollbackEligible: state === MIGRATION_EXECUTION_STATES.ROLLBACK_ALLOWED,
  failure,
});

export const collectWorkspacePaths = async ({ repository, workspaceId }) => {
  const paths = [];
  const workspace = await safe(() => repository.getWorkspace(workspaceId), null);
  if (workspace) paths.push(v2Paths.workspace(workspaceId));
  for (const member of await safe(() => repository.listMemberships(workspaceId), [])) {
    paths.push(v2Paths.member(workspaceId, member.uid));
  }
  const debts = await safe(() => repository.listDebts(workspaceId), []);
  for (const debt of debts) {
    paths.push(v2Paths.debt(workspaceId, debt.id));
    for (const snapshot of await safe(() => repository.listBalanceSnapshots(workspaceId, debt.id), [])) {
      paths.push(v2Paths.balanceSnapshot(workspaceId, debt.id, snapshot.id));
    }
    if (typeof repository.listPaymentEvents === "function") {
      for (const event of await safe(() => repository.listPaymentEvents(workspaceId, debt.id), [])) {
        paths.push(v2Paths.paymentEvent(workspaceId, debt.id, event.id));
      }
    }
  }
  for (const plan of await safe(() => repository.listPlans(workspaceId), [])) {
    paths.push(v2Paths.plan(workspaceId, plan.id));
    for (const version of await safe(() => repository.listPlanVersions(workspaceId, plan.id), [])) {
      paths.push(v2Paths.version(workspaceId, plan.id, version.id));
      for (const checkpoint of await safe(() => repository.listExpectedCheckpoints(workspaceId, plan.id, version.id), [])) {
        paths.push(v2Paths.expectedCheckpoint(workspaceId, plan.id, version.id, checkpoint.id));
      }
    }
  }
  return paths.sort();
};

export const validateMigrationPreviewAgainstRepository = async ({ repository, preview }) => {
  const mismatches = [];
  for (const path of preview.expectedTargetPaths) {
    const expected = entityFromPath(preview, path).value;
    const actual = await safe(() => repository.getEntityAtPath(path), null);
    if (!sameEntity(actual, expected)) mismatches.push({ path, reason: "persisted value does not match preview" });
  }
  const actualPaths = await collectWorkspacePaths({ repository, workspaceId: preview.candidateWorkspace.id });
  const expected = new Set(preview.expectedTargetPaths);
  const unexpectedPaths = actualPaths.filter((path) => !expected.has(path));
  return {
    ok: mismatches.length === 0 && unexpectedPaths.length === 0,
    mismatches,
    unexpectedPaths,
  };
};

export const executeMigrationPreview = async ({
  repository,
  preview,
  sourceFingerprint,
  confirmedPreviewDigest,
  explicitConfirmation,
  actorId,
  migrationRunId = `migration-${preview.previewDigest}`,
  failAfterWrites = null,
}) => {
  if (!explicitConfirmation) throw new Error("Explicit migration confirmation is required");
  if (!confirmedPreviewDigest || confirmedPreviewDigest !== preview.previewDigest) throw new Error("Preview digest mismatch; regenerate and confirm the latest preview");
  if (!sourceFingerprint || sourceFingerprint !== preview.sourceFingerprint) throw new Error("Source fingerprint mismatch; regenerate migration preview");
  if (preview.ambiguousRecords.length) throw new Error("Cannot execute migration while records need confirmation");
  if (!preview.candidateMemberships.some((member) => member.uid === actorId && ["owner", "admin"].includes(member.role))) {
    throw new Error("Only owner/admin can execute migration");
  }

  const existingRun = await safe(() => repository.getMigrationRun(preview.candidateWorkspace.id, migrationRunId), null);
  if (existingRun?.migrationState === "v2_native") throw new Error("Workspace is already v2_native; migration rollback/execution is closed");
  const startedAt = existingRun?.startedAt || nowIso();
  const completedPaths = [...(existingRun?.completedPaths || [])];
  let manifest = buildMigrationManifest({ preview, actorId, migrationRunId, at: startedAt, completedPaths });

  const workspacePath = v2Paths.workspace(preview.candidateWorkspace.id);
  const actorMembership = preview.candidateMemberships.find((member) => member.uid === actorId);
  const actorMembershipPath = v2Paths.member(preview.candidateWorkspace.id, actorId);
  if (preview.candidateWorkspace.createdBy !== actorId || actorMembership?.role !== "owner") {
    throw new Error("Migration bootstrap requires the actor to be the deterministic workspace owner");
  }

  // Bootstrap workspace + actor owner membership + manifest as one recoverable
  // unit. Production member order is not guaranteed, so non-owner memberships
  // must not be attempted until owner authority exists.
  const orderedPaths = [
    ...preview.candidateMemberships
      .filter((member) => member.uid !== actorId)
      .map((member) => v2Paths.member(preview.candidateWorkspace.id, member.uid)),
    ...preview.expectedTargetPaths.filter((path) => path !== v2Paths.workspace(preview.candidateWorkspace.id)
      && !preview.candidateMemberships.some((member) => path === v2Paths.member(preview.candidateWorkspace.id, member.uid))),
  ];

  try {
    if (!existingRun) {
      const existingWorkspace = await safe(() => repository.getEntityAtPath(workspacePath), null);
      const existingActorMembership = await safe(() => repository.getEntityAtPath(actorMembershipPath), null);
      if (existingWorkspace || existingActorMembership) {
        throw new Error("Unjournaled migration bootstrap state exists; perform supervised recovery before retrying");
      }
      manifest = {
        ...manifest,
        completedPaths: [workspacePath, actorMembershipPath],
        updatedAt: nowIso(),
      };
      if (typeof repository.saveMigrationBootstrap === "function") {
        await repository.saveMigrationBootstrap({
          workspace: preview.candidateWorkspace,
          ownerMembership: actorMembership,
          manifest,
        });
      } else {
        await repository.saveWorkspace(preview.candidateWorkspace);
        await repository.saveMembership(actorMembership);
        await repository.saveMigrationRun(manifest);
      }
      completedPaths.push(workspacePath, actorMembershipPath);
    }

    let writeCount = completedPaths.length;
    if (failAfterWrites != null && writeCount >= failAfterWrites) {
      throw new Error("Injected migration failure after controlled writes");
    }

    for (const path of orderedPaths) {
      if (completedPaths.includes(path)) continue;
      const entity = entityFromPath(preview, path);
      const existing = await safe(() => repository.getEntityAtPath(path), null);
      if (existing && !sameEntity(existing, entity.value)) throw new Error(`Conflicting existing target at ${path}`);
      const pathsCompletedByWrite = [path];
      if (!existing && entity.kind === "debt" && typeof repository.createDebtWithOpeningSnapshot === "function") {
        const openingSnapshot = preview.initialBalanceSnapshots.find((snapshot) => snapshot.debtId === entity.value.id);
        if (!openingSnapshot) throw new Error(`Debt ${entity.value.id} is missing its opening balance snapshot`);
        const snapshotPath = v2Paths.balanceSnapshot(preview.candidateWorkspace.id, openingSnapshot.debtId, openingSnapshot.id);
        const existingSnapshot = await safe(() => repository.getEntityAtPath(snapshotPath), null);
        if (existingSnapshot && !sameEntity(existingSnapshot, openingSnapshot)) throw new Error(`Conflicting existing target at ${snapshotPath}`);
        if (!existingSnapshot) {
          await repository.createDebtWithOpeningSnapshot({ debt: entity.value, openingSnapshot });
        } else {
          await saveEntity(repository, entity);
        }
        pathsCompletedByWrite.push(snapshotPath);
      } else if (!existing) {
        await saveEntity(repository, entity);
      }
      for (const completedPath of pathsCompletedByWrite) {
        if (!completedPaths.includes(completedPath)) completedPaths.push(completedPath);
      }
      writeCount += pathsCompletedByWrite.length;
      manifest = { ...manifest, completedPaths: [...completedPaths], updatedAt: nowIso() };
      await repository.saveMigrationRun(manifest);
      if (failAfterWrites != null && writeCount >= failAfterWrites) {
        throw new Error("Injected migration failure after controlled writes");
      }
    }
    const validation = await validateMigrationPreviewAgainstRepository({ repository, preview });
    if (!validation.ok) throw new Error(`Post-write validation failed: ${stableStringify(validation)}`);
    manifest = {
      ...manifest,
      migrationState: MIGRATION_EXECUTION_STATES.ROLLBACK_ALLOWED,
      rollbackEligible: true,
      completedAt: nowIso(),
      updatedAt: nowIso(),
      completedPaths: [...completedPaths],
    };
    await repository.saveMigrationRun(manifest);
    return { manifest, validation, writesPerformed: completedPaths.length };
  } catch (error) {
    manifest = {
      ...manifest,
      migrationState: MIGRATION_EXECUTION_STATES.PARTIAL_FAILED,
      rollbackEligible: false,
      failedAt: nowIso(),
      updatedAt: nowIso(),
      completedPaths: [...completedPaths],
      failure: { message: error.message },
    };
    await safe(() => repository.saveMigrationRun(manifest), null);
    throw error;
  }
};

export const rollbackMigration = async ({ repository, preview, migrationRunId = `migration-${preview.previewDigest}`, actorId }) => {
  const manifest = await repository.getMigrationRun(preview.candidateWorkspace.id, migrationRunId);
  if (!manifest) throw new Error("Migration manifest not found");
  if (!manifest.rollbackEligible || manifest.migrationState !== MIGRATION_EXECUTION_STATES.ROLLBACK_ALLOWED) {
    throw new Error("Rollback is not currently allowed");
  }
  if (!preview.candidateMemberships.some((member) => member.uid === actorId && ["owner", "admin"].includes(member.role))) {
    throw new Error("Only owner/admin can rollback migration");
  }
  const actualPaths = await collectWorkspacePaths({ repository, workspaceId: preview.candidateWorkspace.id });
  const expected = new Set(preview.expectedTargetPaths);
  const unexpected = actualPaths.filter((path) => !expected.has(path));
  if (unexpected.length) {
    const blocked = { ...manifest, migrationState: MIGRATION_EXECUTION_STATES.ROLLBACK_BLOCKED, rollbackEligible: false, updatedAt: nowIso(), failure: { message: "V2-native or unrelated writes detected", unexpected } };
    await repository.saveMigrationRun(blocked);
    throw new Error("Rollback blocked because V2-native or unrelated writes exist");
  }
  const deletedPaths = [];
  const preservedForJournal = new Set([
    v2Paths.workspace(preview.candidateWorkspace.id),
    v2Paths.member(preview.candidateWorkspace.id, actorId),
  ]);
  for (const path of [...preview.expectedTargetPaths].reverse()) {
    if (preservedForJournal.has(path)) continue;
    await repository.deleteEntityAtPath(path);
    deletedPaths.push(path);
  }
  await repository.putWorkspace({
    ...preview.candidateWorkspace,
    status: "archived",
    activePlanId: "",
    updatedAt: nowIso(),
    updatedBy: actorId,
  });
  const rolledBack = {
    ...manifest,
    migrationState: MIGRATION_EXECUTION_STATES.ROLLED_BACK,
    rollbackEligible: false,
    rolledBackAt: nowIso(),
    updatedAt: nowIso(),
    deletedPaths,
  };
  await repository.saveMigrationRun(rolledBack);
  return { manifest: rolledBack, deletedPaths };
};

export const compareProjectionParity = ({ preview, simulate }) => stableHash({
  previewDigest: preview.previewDigest,
  debts: preview.candidateDebts.map((debt) => ({
    id: debt.id,
    balance: debt.currentBalance,
    aprStatus: debt.aprStatus,
    apr: debt.apr,
    minimumRequiredPayment: debt.minimumRequiredPayment,
    includedInCorePayoffPlan: debt.includedInCorePayoffPlan,
  })),
  versions: preview.candidatePlanVersions.map((version) => ({
    id: version.id,
    strategy: version.strategy,
    extraMonthlyPayment: version.extraMonthlyPayment,
    result: simulate ? simulate(version) : null,
  })),
});
