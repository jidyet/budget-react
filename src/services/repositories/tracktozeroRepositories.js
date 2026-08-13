import { createBalanceSnapshot, createDebt, createExpectedCheckpoint, createPaymentEvent, createPayoffPlan, createPlanVersion, createWorkspace, createWorkspaceMembership } from "../../domain/tracktozero/models.js";

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
}
