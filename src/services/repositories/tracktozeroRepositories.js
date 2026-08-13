import { createBalanceSnapshot, createDebt, createExpectedCheckpoint, createPaymentEvent, createPayoffPlan, createPlanVersion, createWorkspace, createWorkspaceMembership } from "../../domain/tracktozero/models.js";
import { activatePlanTransaction } from "../tracktozero/activePlanService.js";

const clone = (value) => structuredClone(value);

export const v2Paths = {
  workspace: (workspaceId) => `workspaces/${workspaceId}`,
  member: (workspaceId, uid) => `workspaces/${workspaceId}/members/${uid}`,
  debt: (workspaceId, debtId) => `workspaces/${workspaceId}/debts/${debtId}`,
  plan: (workspaceId, planId) => `workspaces/${workspaceId}/plans/${planId}`,
  version: (workspaceId, planId, versionId) => `workspaces/${workspaceId}/plans/${planId}/versions/${versionId}`,
  expectedCheckpoint: (workspaceId, planId, versionId, checkpointId) =>
    `workspaces/${workspaceId}/plans/${planId}/versions/${versionId}/expected_schedule/${checkpointId}`,
  paymentEvent: (workspaceId, debtId, eventId) => `workspaces/${workspaceId}/debts/${debtId}/payment_events/${eventId}`,
  balanceSnapshot: (workspaceId, debtId, snapshotId) => `workspaces/${workspaceId}/debts/${debtId}/balance_snapshots/${snapshotId}`,
  migrationRun: (workspaceId, runId) => `workspaces/${workspaceId}/migration_runs/${runId}`,
};

const pathFromEntity = (entity) => {
  if (entity.kind === "workspace") return v2Paths.workspace(entity.workspace.id);
  if (entity.kind === "membership") return v2Paths.member(entity.membership.workspaceId, entity.membership.uid);
  if (entity.kind === "debt") return v2Paths.debt(entity.debt.workspaceId, entity.debt.id);
  if (entity.kind === "balanceSnapshot") return v2Paths.balanceSnapshot(entity.snapshot.workspaceId, entity.snapshot.debtId, entity.snapshot.id);
  if (entity.kind === "plan") return v2Paths.plan(entity.plan.workspaceId, entity.plan.id);
  if (entity.kind === "planVersion") return v2Paths.version(entity.version.workspaceId, entity.version.planId, entity.version.id);
  if (entity.kind === "expectedCheckpoint") return v2Paths.expectedCheckpoint(entity.checkpoint.workspaceId, entity.checkpoint.planId, entity.checkpoint.planVersionId, entity.checkpoint.id);
  if (entity.kind === "migrationRun") return v2Paths.migrationRun(entity.migrationRun.workspaceId, entity.migrationRun.id);
  throw new Error(`Unsupported v2 migration entity kind: ${entity.kind}`);
};

export class InMemoryTrackToZeroRepository {
  constructor(seed = {}) {
    this.workspaces = new Map(Object.entries(seed.workspaces || {}).map(([id, value]) => [id, clone(value)]));
    this.members = new Map(Object.entries(seed.members || {}).map(([key, value]) => [key, clone(value)]));
    this.debts = new Map(Object.entries(seed.debts || {}).map(([key, value]) => [key, clone(value)]));
    this.plans = new Map(Object.entries(seed.plans || {}).map(([key, value]) => [key, clone(value)]));
    this.versions = new Map(Object.entries(seed.versions || {}).map(([key, value]) => [key, clone(value)]));
    this.paymentEvents = new Map(Object.entries(seed.paymentEvents || {}).map(([key, value]) => [key, clone(value)]));
    this.balanceSnapshots = new Map(Object.entries(seed.balanceSnapshots || {}).map(([key, value]) => [key, clone(value)]));
    this.expectedCheckpoints = new Map(Object.entries(seed.expectedCheckpoints || {}).map(([key, value]) => [key, clone(value)]));
    this.migrationRuns = new Map(Object.entries(seed.migrationRuns || {}).map(([key, value]) => [key, clone(value)]));
  }

  key(workspaceId, id) { return `${workspaceId}/${id}`; }
  versionKey(workspaceId, planId, versionId) { return `${workspaceId}/${planId}/${versionId}`; }
  checkpointKey(workspaceId, planId, versionId, checkpointId) { return `${workspaceId}/${planId}/${versionId}/${checkpointId}`; }

  saveWorkspace(input) {
    const workspace = createWorkspace(input);
    this.workspaces.set(workspace.id, clone(workspace));
    return workspace;
  }
  getWorkspace(id) { return this.workspaces.has(id) ? clone(this.workspaces.get(id)) : null; }
  listWorkspaces() { return [...this.workspaces.values()].map(clone); }
  putWorkspace(workspace) { this.workspaces.set(workspace.id, clone(workspace)); return clone(workspace); }

  saveMembership(input) {
    const membership = createWorkspaceMembership(input);
    this.members.set(this.key(membership.workspaceId, membership.uid), clone(membership));
    return membership;
  }
  getMembership(workspaceId, uid) { return this.members.has(this.key(workspaceId, uid)) ? clone(this.members.get(this.key(workspaceId, uid))) : null; }
  listMemberships(workspaceId) { return [...this.members.values()].filter((m) => m.workspaceId === workspaceId).map(clone); }

  saveDebt(input) {
    const debt = createDebt(input);
    this.debts.set(this.key(debt.workspaceId, debt.id), clone(debt));
    return debt;
  }
  listDebts(workspaceId) { return [...this.debts.values()].filter((d) => d.workspaceId === workspaceId).map(clone); }

  savePlan(input) {
    const plan = createPayoffPlan(input);
    this.plans.set(this.key(plan.workspaceId, plan.id), clone(plan));
    return plan;
  }
  getPlan(workspaceId, planId) { return this.plans.has(this.key(workspaceId, planId)) ? clone(this.plans.get(this.key(workspaceId, planId))) : null; }
  putPlan(plan) { this.plans.set(this.key(plan.workspaceId, plan.id), clone(plan)); return clone(plan); }
  listPlans(workspaceId) { return [...this.plans.values()].filter((p) => p.workspaceId === workspaceId).map(clone); }

  savePlanVersion(input) {
    const version = createPlanVersion(input);
    this.versions.set(this.versionKey(version.workspaceId, version.planId, version.id), clone(version));
    return version;
  }
  getPlanVersion(workspaceId, planId, versionId) {
    const key = this.versionKey(workspaceId, planId, versionId);
    return this.versions.has(key) ? clone(this.versions.get(key)) : null;
  }
  listPlanVersions(workspaceId, planId) {
    return [...this.versions.values()]
      .filter((v) => v.workspaceId === workspaceId && v.planId === planId)
      .sort((a, b) => Number(a.versionNumber || 0) - Number(b.versionNumber || 0) || String(a.id).localeCompare(String(b.id)))
      .map(clone);
  }
  updatePlanVersion() { throw new Error("PlanVersion is immutable; create a new version instead"); }

  createPaymentEvent(input) {
    const event = createPaymentEvent(input);
    this.paymentEvents.set(this.key(`${event.workspaceId}/${event.debtId}`, event.id), clone(event));
    return event;
  }
  getPaymentEvent(workspaceId, debtId, eventId) {
    const key = this.key(`${workspaceId}/${debtId}`, eventId);
    return this.paymentEvents.has(key) ? clone(this.paymentEvents.get(key)) : null;
  }
  listPaymentEvents(workspaceId, debtId) {
    return [...this.paymentEvents.values()]
      .filter((e) => e.workspaceId === workspaceId && e.debtId === debtId)
      .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
  }
  updatePaymentEvent() { throw new Error("PaymentEvent core facts are append-only; create a correction record"); }

  createBalanceSnapshot(input) {
    const snapshot = createBalanceSnapshot(input);
    this.balanceSnapshots.set(this.key(`${snapshot.workspaceId}/${snapshot.debtId}`, snapshot.id), clone(snapshot));
    return snapshot;
  }
  updateBalanceSnapshot() { throw new Error("BalanceSnapshot core facts are append-only; create a correction record"); }
  listBalanceSnapshots(workspaceId, debtId) {
    return [...this.balanceSnapshots.values()]
      .filter((s) => s.workspaceId === workspaceId && s.debtId === debtId)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
  }

  createExpectedCheckpoint(input) {
    const checkpoint = createExpectedCheckpoint(input);
    this.expectedCheckpoints.set(
      this.checkpointKey(checkpoint.workspaceId, checkpoint.planId, checkpoint.planVersionId, checkpoint.id),
      clone(checkpoint)
    );
    return checkpoint;
  }
  getExpectedCheckpoint(workspaceId, planId, versionId, checkpointId) {
    const key = this.checkpointKey(workspaceId, planId, versionId, checkpointId);
    return this.expectedCheckpoints.has(key) ? clone(this.expectedCheckpoints.get(key)) : null;
  }
  listExpectedCheckpoints(workspaceId, planId, versionId) {
    return [...this.expectedCheckpoints.values()]
      .filter((c) => c.workspaceId === workspaceId && c.planId === planId && c.planVersionId === versionId)
      .sort((a, b) => String(a.period).localeCompare(String(b.period)) || String(a.id).localeCompare(String(b.id)))
      .map(clone);
  }
  updateExpectedCheckpoint() { throw new Error("ExpectedCheckpoint is immutable once created"); }

  saveMigrationRun(input) {
    const run = clone(input);
    this.migrationRuns.set(this.key(run.workspaceId, run.id), run);
    return clone(run);
  }
  saveMigrationBootstrap({ workspace, ownerMembership, manifest }) {
    const savedWorkspace = this.saveWorkspace(workspace);
    const savedMembership = this.saveMembership(ownerMembership);
    const savedManifest = this.saveMigrationRun(manifest);
    return { workspace: savedWorkspace, ownerMembership: savedMembership, manifest: savedManifest };
  }
  getMigrationRun(workspaceId, runId) {
    const key = this.key(workspaceId, runId);
    return this.migrationRuns.has(key) ? clone(this.migrationRuns.get(key)) : null;
  }
  listMigrationRuns(workspaceId) {
    return [...this.migrationRuns.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(clone);
  }
  getMigrationEntityByPath(path) {
    const parts = String(path).split("/");
    if (parts[0] !== "workspaces") return null;
    const workspaceId = parts[1];
    if (parts.length === 2) return this.getWorkspace(workspaceId);
    if (parts[2] === "members") return this.getMembership(workspaceId, parts[3]);
    if (parts[2] === "debts" && parts.length === 4) {
      return this.listDebts(workspaceId).find((debt) => debt.id === parts[3]) || null;
    }
    if (parts[2] === "debts" && parts[4] === "balance_snapshots") {
      return this.listBalanceSnapshots(workspaceId, parts[3]).find((snapshot) => snapshot.id === parts[5]) || null;
    }
    if (parts[2] === "debts" && parts[4] === "payment_events") {
      return this.getPaymentEvent(workspaceId, parts[3], parts[5]);
    }
    if (parts[2] === "plans" && parts.length === 4) return this.getPlan(workspaceId, parts[3]);
    if (parts[2] === "plans" && parts[4] === "versions" && parts.length === 6) {
      return this.getPlanVersion(workspaceId, parts[3], parts[5]);
    }
    if (parts[2] === "plans" && parts[4] === "versions" && parts[6] === "expected_schedule") {
      return this.getExpectedCheckpoint(workspaceId, parts[3], parts[5], parts[7]);
    }
    if (parts[2] === "migration_runs") return this.getMigrationRun(workspaceId, parts[3]);
    return null;
  }
  deleteMigrationEntityByPath(path) {
    const parts = String(path).split("/");
    if (parts[0] !== "workspaces") throw new Error(`Unsupported migration delete path: ${path}`);
    const workspaceId = parts[1];
    if (parts.length === 2) return this.workspaces.delete(workspaceId);
    if (parts[2] === "members") return this.members.delete(this.key(workspaceId, parts[3]));
    if (parts[2] === "debts" && parts.length === 4) return this.debts.delete(this.key(workspaceId, parts[3]));
    if (parts[2] === "debts" && parts[4] === "balance_snapshots") {
      return this.balanceSnapshots.delete(this.key(`${workspaceId}/${parts[3]}`, parts[5]));
    }
    if (parts[2] === "debts" && parts[4] === "payment_events") {
      return this.paymentEvents.delete(this.key(`${workspaceId}/${parts[3]}`, parts[5]));
    }
    if (parts[2] === "plans" && parts.length === 4) return this.plans.delete(this.key(workspaceId, parts[3]));
    if (parts[2] === "plans" && parts[4] === "versions" && parts.length === 6) {
      return this.versions.delete(this.versionKey(workspaceId, parts[3], parts[5]));
    }
    if (parts[2] === "plans" && parts[4] === "versions" && parts[6] === "expected_schedule") {
      return this.expectedCheckpoints.delete(this.checkpointKey(workspaceId, parts[3], parts[5], parts[7]));
    }
    if (parts[2] === "migration_runs") return this.migrationRuns.delete(this.key(workspaceId, parts[3]));
    throw new Error(`Unsupported migration delete path: ${path}`);
  }
  getEntityAtPath(path) { return this.getMigrationEntityByPath(path); }
  deleteEntityAtPath(path) { return this.deleteMigrationEntityByPath(path); }
  pathFromEntity(entity) { return pathFromEntity(entity); }

  activatePlan({ workspaceId, planId, versionId, actorId, activatedAt }) {
    return activatePlanTransaction({ repository: this, workspaceId, planId, versionId, actorId, activatedAt });
  }

  reforecastActivePlan({ workspaceId, planId, priorVersionId, nextVersion, actorId, appliedAt }) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.activePlanId !== planId) throw new Error("Plan is not the active workspace plan");
    const plan = this.getPlan(workspaceId, planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.activeVersionId !== priorVersionId) throw new Error("Prior version is no longer authoritative");
    const priorVersion = this.getPlanVersion(workspaceId, planId, priorVersionId);
    if (!priorVersion) throw new Error("Prior PlanVersion not found");

    const savedVersion = this.savePlanVersion(nextVersion);
    this.putPlan({
      ...plan,
      status: "active",
      activeVersionId: savedVersion.id,
      updatedAt: appliedAt,
      updatedBy: actorId,
    });
    return {
      workspace: this.getWorkspace(workspaceId),
      plan: this.getPlan(workspaceId, planId),
      priorVersion,
      version: savedVersion,
    };
  }
}
