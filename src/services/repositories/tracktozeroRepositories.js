import { createBalanceSnapshot, createDebt, createExpectedCheckpoint, createImportBatch, createPaymentEvent, createPayoffPlan, createPlanVersion, createSavedScenario, createWorkspace, createWorkspaceInvitation, createWorkspaceMembership, createWorkspacePerson } from "../../domain/tracktozero/models.js";
import { activatePlanTransaction } from "../tracktozero/activePlanService.js";

const clone = (value) => structuredClone(value);

export const v2Paths = {
  workspace: (workspaceId) => `workspaces/${workspaceId}`,
  member: (workspaceId, uid) => `workspaces/${workspaceId}/members/${uid}`,
  // Top-level mirror of each active membership doc, kept in sync alongside
  // it (see FirebaseTrackToZeroRepository.saveMembership/acceptMemberInvite).
  // Exists purely so listMembershipsForUser can query without a
  // collectionGroup - Firestore security rules cannot prove a field-based
  // rule safe for a collectionGroup query whose parent path is a wildcard
  // (confirmed: the same rule+query works at the top level and for a
  // single, known-workspace nested query, but is unconditionally denied
  // once collectionGroup + wildcard parent are combined, regardless of
  // rule wording) - a real Firestore/rules-engine limitation, not a bug in
  // any one rule.
  memberIndex: (workspaceId, uid) => `member_index/${workspaceId}_${uid}`,
  memberInvite: (workspaceId, inviteId) => `workspaces/${workspaceId}/member_invites/${inviteId}`,
  person: (workspaceId, personId) => `workspaces/${workspaceId}/people/${personId}`,
  debt: (workspaceId, debtId) => `workspaces/${workspaceId}/debts/${debtId}`,
  plan: (workspaceId, planId) => `workspaces/${workspaceId}/plans/${planId}`,
  version: (workspaceId, planId, versionId) => `workspaces/${workspaceId}/plans/${planId}/versions/${versionId}`,
  expectedCheckpoint: (workspaceId, planId, versionId, checkpointId) =>
    `workspaces/${workspaceId}/plans/${planId}/versions/${versionId}/expected_schedule/${checkpointId}`,
  paymentEvent: (workspaceId, debtId, eventId) => `workspaces/${workspaceId}/debts/${debtId}/payment_events/${eventId}`,
  balanceSnapshot: (workspaceId, debtId, snapshotId) => `workspaces/${workspaceId}/debts/${debtId}/balance_snapshots/${snapshotId}`,
  migrationRun: (workspaceId, runId) => `workspaces/${workspaceId}/migration_runs/${runId}`,
  importBatch: (workspaceId, batchId) => `workspaces/${workspaceId}/import_batches/${batchId}`,
  scenario: (workspaceId, scenarioId) => `workspaces/${workspaceId}/scenarios/${scenarioId}`,
};

const pathFromEntity = (entity) => {
  if (entity.kind === "workspace") return v2Paths.workspace(entity.workspace.id);
  if (entity.kind === "membership") return v2Paths.member(entity.membership.workspaceId, entity.membership.uid);
  if (entity.kind === "person") return v2Paths.person(entity.person.workspaceId, entity.person.id);
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
    this.memberInvites = new Map(Object.entries(seed.memberInvites || {}).map(([key, value]) => [key, clone(value)]));
    this.people = new Map(Object.entries(seed.people || {}).map(([key, value]) => [key, clone(value)]));
    this.debts = new Map(Object.entries(seed.debts || {}).map(([key, value]) => [key, clone(value)]));
    this.plans = new Map(Object.entries(seed.plans || {}).map(([key, value]) => [key, clone(value)]));
    this.versions = new Map(Object.entries(seed.versions || {}).map(([key, value]) => [key, clone(value)]));
    this.paymentEvents = new Map(Object.entries(seed.paymentEvents || {}).map(([key, value]) => [key, clone(value)]));
    this.balanceSnapshots = new Map(Object.entries(seed.balanceSnapshots || {}).map(([key, value]) => [key, clone(value)]));
    this.expectedCheckpoints = new Map(Object.entries(seed.expectedCheckpoints || {}).map(([key, value]) => [key, clone(value)]));
    this.migrationRuns = new Map(Object.entries(seed.migrationRuns || {}).map(([key, value]) => [key, clone(value)]));
    this.importBatches = new Map(Object.entries(seed.importBatches || {}).map(([key, value]) => [key, clone(value)]));
    this.scenarios = new Map(Object.entries(seed.scenarios || {}).map(([key, value]) => [key, clone(value)]));
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
  listMembershipsForUser(uid) {
    return [...this.members.values()]
      .filter((membership) => membership.uid === uid && membership.status === "active")
      .sort((a, b) => String(a.workspaceId).localeCompare(String(b.workspaceId)))
      .map(clone);
  }
  saveMemberInvite(input) {
    const invite = createWorkspaceInvitation(input);
    this.memberInvites.set(this.key(invite.workspaceId, invite.id), invite);
    return clone(invite);
  }
  getMemberInvite(workspaceId, inviteId) {
    const key = this.key(workspaceId, inviteId);
    return this.memberInvites.has(key) ? clone(this.memberInvites.get(key)) : null;
  }
  listMemberInvites(workspaceId) {
    return [...this.memberInvites.values()].filter((invite) => invite.workspaceId === workspaceId).map(clone);
  }
  acceptMemberInvite({ workspaceId, inviteId, membership, acceptedAt, acceptedByUserId }) {
    const currentInvite = this.getMemberInvite(workspaceId, inviteId);
    if (!currentInvite) throw new Error("Invite not found");
    const savedMembership = this.saveMembership(membership);
    const acceptedInvite = createWorkspaceInvitation({
      ...currentInvite,
      status: "accepted",
      acceptedAt,
      acceptedByUserId,
      canceledAt: "",
      canceledByUserId: "",
    });
    this.memberInvites.set(this.key(workspaceId, inviteId), clone(acceptedInvite));
    return { membership: savedMembership, invite: clone(acceptedInvite) };
  }
  cancelMemberInvite({ workspaceId, inviteId, canceledAt, canceledByUserId }) {
    const currentInvite = this.getMemberInvite(workspaceId, inviteId);
    if (!currentInvite) throw new Error("Invite not found");
    const canceledInvite = createWorkspaceInvitation({
      ...currentInvite,
      status: "canceled",
      canceledAt,
      canceledByUserId,
    });
    this.memberInvites.set(this.key(workspaceId, inviteId), clone(canceledInvite));
    return clone(canceledInvite);
  }

  // DATA-HH1
  saveWorkspacePerson(input) {
    const person = createWorkspacePerson(input);
    this.people.set(this.key(person.workspaceId, person.id), clone(person));
    return person;
  }
  getWorkspacePerson(workspaceId, personId) {
    const key = this.key(workspaceId, personId);
    return this.people.has(key) ? clone(this.people.get(key)) : null;
  }
  listWorkspacePersons(workspaceId) {
    return [...this.people.values()].filter((person) => person.workspaceId === workspaceId).map(clone);
  }

  saveDebt(input) {
    const debt = createDebt(input);
    this.debts.set(this.key(debt.workspaceId, debt.id), clone(debt));
    return debt;
  }
  createDebtWithOpeningSnapshot({ debt: debtInput, openingSnapshot: snapshotInput }) {
    const debt = createDebt(debtInput);
    const openingSnapshot = createBalanceSnapshot({
      ...snapshotInput,
      workspaceId: debt.workspaceId,
      debtId: debt.id,
      balance: snapshotInput?.balance ?? debt.currentBalance,
    });
    this.debts.set(this.key(debt.workspaceId, debt.id), clone(debt));
    this.balanceSnapshots.set(this.key(`${openingSnapshot.workspaceId}/${openingSnapshot.debtId}`, openingSnapshot.id), clone(openingSnapshot));
    return { debt, openingSnapshot };
  }
  updateDebtFromImportCandidate({ workspaceId, debtId, metadataPatch = {}, balanceSnapshot: snapshotInput, actorId, updatedAt, expectedPriorState = null }) {
    const current = this.listDebts(workspaceId).find((debt) => debt.id === debtId);
    if (!current) throw new Error("Debt not found");
    const snapshot = createBalanceSnapshot({
      ...snapshotInput,
      workspaceId,
      debtId,
      source: "import",
      createdBy: snapshotInput?.createdBy || actorId,
      createdAt: snapshotInput?.createdAt || updatedAt,
    });
    // Idempotent retry (Part 27/49): mirrors the Firebase repository - the
    // same deterministic snapshot id already existing means this exact
    // resolution already succeeded once.
    const existingSnapshot = this.balanceSnapshots.get(this.key(`${snapshot.workspaceId}/${snapshot.debtId}`, snapshot.id));
    if (existingSnapshot) {
      return { debt: clone(current), balanceSnapshot: clone(existingSnapshot), idempotentReplay: true };
    }
    // Stale-review protection (Part 28): fail safely rather than overwrite a
    // debt that legitimately changed since this resolution's fingerprint.
    if (expectedPriorState) {
      const liveFingerprint = { currentBalance: Number(current.currentBalance ?? 0), updatedAt: current.updatedAt || current.createdAt || "" };
      if (liveFingerprint.currentBalance !== expectedPriorState.currentBalance || liveFingerprint.updatedAt !== expectedPriorState.updatedAt) {
        throw Object.assign(new Error("This debt changed since this review was created. Take one more look before we update it."), { code: "stale_review" });
      }
    }
    const debt = createDebt({
      ...current,
      ...metadataPatch,
      currentBalance: snapshot.balance,
      balanceStatus: "confirmed",
      updatedAt,
      updatedBy: actorId,
    });
    this.debts.set(this.key(workspaceId, debtId), clone(debt));
    this.balanceSnapshots.set(this.key(`${snapshot.workspaceId}/${snapshot.debtId}`, snapshot.id), clone(snapshot));
    return { debt, balanceSnapshot: snapshot };
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
  listPaymentEvents(workspaceId, debtId, { limit } = {}) {
    const events = [...this.paymentEvents.values()]
      .filter((e) => e.workspaceId === workspaceId && e.debtId === debtId)
      .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
    return Number.isFinite(limit) ? events.slice(0, limit) : events;
  }
  updatePaymentEvent() { throw new Error("PaymentEvent core facts are append-only; create a correction record"); }

  createBalanceSnapshot(input) {
    const snapshot = createBalanceSnapshot(input);
    this.balanceSnapshots.set(this.key(`${snapshot.workspaceId}/${snapshot.debtId}`, snapshot.id), clone(snapshot));
    return snapshot;
  }
  updateBalanceSnapshot() { throw new Error("BalanceSnapshot core facts are append-only; create a correction record"); }
  listBalanceSnapshots(workspaceId, debtId, { limit } = {}) {
    const snapshots = [...this.balanceSnapshots.values()]
      .filter((s) => s.workspaceId === workspaceId && s.debtId === debtId)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
    return Number.isFinite(limit) ? snapshots.slice(0, limit) : snapshots;
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
  saveOwnerWorkspaceBootstrap({ workspace, ownerMembership }) {
    const savedWorkspace = this.saveWorkspace(workspace);
    const savedMembership = this.saveMembership(ownerMembership);
    return { workspace: savedWorkspace, ownerMembership: savedMembership };
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
    if (parts[2] === "people") return this.getWorkspacePerson(workspaceId, parts[3]);
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
    if (parts[2] === "people") return this.people.delete(this.key(workspaceId, parts[3]));
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

  saveImportBatch(input) {
    const batch = createImportBatch(input);
    this.importBatches.set(this.key(batch.workspaceId, batch.id), clone(batch));
    return batch;
  }
  getImportBatch(workspaceId, id) { return this.importBatches.has(this.key(workspaceId, id)) ? clone(this.importBatches.get(this.key(workspaceId, id))) : null; }
  listImportBatches(workspaceId) {
    return [...this.importBatches.values()]
      .filter((batch) => batch.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
  }

  // UX-4
  saveScenario(input) {
    const scenario = createSavedScenario(input);
    this.scenarios.set(this.key(scenario.workspaceId, scenario.id), clone(scenario));
    return scenario;
  }
  getScenario(workspaceId, scenarioId) {
    const key = this.key(workspaceId, scenarioId);
    return this.scenarios.has(key) ? clone(this.scenarios.get(key)) : null;
  }
  listScenarios(workspaceId) {
    return [...this.scenarios.values()]
      .filter((scenario) => scenario.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || String(b.id).localeCompare(String(a.id)))
      .map(clone);
  }

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
