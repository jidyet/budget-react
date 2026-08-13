import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import {
  createBalanceSnapshot,
  createDebt,
  createExpectedCheckpoint,
  createPaymentEvent,
  createPayoffPlan,
  createPlanVersion,
  createWorkspace,
  createWorkspaceMembership,
} from "../../domain/tracktozero/models.js";
import { v2Paths } from "./tracktozeroRepositories.js";
import { fromFirestoreDoc, toFirestoreDoc } from "./firestoreTimestamps.js";

// Firebase-backed implementation of the TrackToZero v2 repository contract.
// Satisfies the same method set as InMemoryTrackToZeroRepository (see
// tracktozeroRepositories.js) so domain/use-case code stays persistence-agnostic
// wherever the sync/async boundary allows it (see activatePlan below for the one
// place it can't - documented in TRACKTOZERO_PHASE2B_RESULTS.md).
//
// Takes an injected Firestore instance rather than importing the app's global
// `db` from src/firebase.js, so it can be pointed at the Firestore emulator with
// per-role authenticated contexts in tests, and never depends on the v1 app's
// Firebase config/init gating.
export class FirebaseTrackToZeroRepository {
  constructor(firestoreInstance) {
    this.db = firestoreInstance;
  }

  // ── Workspace ──────────────────────────────────────────────────────────
  async saveWorkspace(input) {
    const workspace = createWorkspace(input);
    await setDoc(doc(this.db, v2Paths.workspace(workspace.id)), toFirestoreDoc("workspace", workspace));
    return workspace;
  }
  async getWorkspace(id) {
    const snap = await getDoc(doc(this.db, v2Paths.workspace(id)));
    return snap.exists() ? fromFirestoreDoc("workspace", snap.data()) : null;
  }
  async listWorkspaces() {
    const snap = await getDocs(collection(this.db, "workspaces"));
    return snap.docs.map((d) => fromFirestoreDoc("workspace", d.data()));
  }
  async putWorkspace(workspace) {
    await setDoc(doc(this.db, v2Paths.workspace(workspace.id)), toFirestoreDoc("workspace", workspace));
    return { ...workspace };
  }

  // ── Membership ─────────────────────────────────────────────────────────
  async saveMembership(input) {
    const membership = createWorkspaceMembership(input);
    await setDoc(doc(this.db, v2Paths.member(membership.workspaceId, membership.uid)), toFirestoreDoc("member", membership));
    return membership;
  }
  async getMembership(workspaceId, uid) {
    const snap = await getDoc(doc(this.db, v2Paths.member(workspaceId, uid)));
    return snap.exists() ? fromFirestoreDoc("member", snap.data()) : null;
  }
  async listMemberships(workspaceId) {
    const snap = await getDocs(collection(this.db, "workspaces", workspaceId, "members"));
    return snap.docs.map((d) => fromFirestoreDoc("member", d.data()));
  }

  // ── Debt ───────────────────────────────────────────────────────────────
  async saveDebt(input) {
    const debt = createDebt(input);
    await setDoc(doc(this.db, v2Paths.debt(debt.workspaceId, debt.id)), toFirestoreDoc("debt", debt));
    return debt;
  }
  async listDebts(workspaceId) {
    const snap = await getDocs(collection(this.db, "workspaces", workspaceId, "debts"));
    return snap.docs.map((d) => fromFirestoreDoc("debt", d.data()));
  }

  // ── Plan ───────────────────────────────────────────────────────────────
  async savePlan(input) {
    const plan = createPayoffPlan(input);
    await setDoc(doc(this.db, v2Paths.plan(plan.workspaceId, plan.id)), toFirestoreDoc("plan", plan));
    return plan;
  }
  async getPlan(workspaceId, planId) {
    const snap = await getDoc(doc(this.db, v2Paths.plan(workspaceId, planId)));
    return snap.exists() ? fromFirestoreDoc("plan", snap.data()) : null;
  }
  async putPlan(plan) {
    await setDoc(doc(this.db, v2Paths.plan(plan.workspaceId, plan.id)), toFirestoreDoc("plan", plan));
    return { ...plan };
  }
  async listPlans(workspaceId) {
    const snap = await getDocs(collection(this.db, "workspaces", workspaceId, "plans"));
    return snap.docs.map((d) => fromFirestoreDoc("plan", d.data()));
  }

  // ── PlanVersion (immutable) ────────────────────────────────────────────
  async savePlanVersion(input) {
    const version = createPlanVersion(input);
    await setDoc(
      doc(this.db, v2Paths.version(version.workspaceId, version.planId, version.id)),
      toFirestoreDoc("version", version)
    );
    return version;
  }
  async getPlanVersion(workspaceId, planId, versionId) {
    const snap = await getDoc(doc(this.db, v2Paths.version(workspaceId, planId, versionId)));
    return snap.exists() ? fromFirestoreDoc("version", snap.data()) : null;
  }
  async listPlanVersions(workspaceId, planId) {
    const colRef = collection(this.db, "workspaces", workspaceId, "plans", planId, "versions");
    const snap = await getDocs(query(colRef, orderBy("versionNumber", "asc"), orderBy("id", "asc")));
    return snap.docs.map((d) => fromFirestoreDoc("version", d.data()));
  }
  updatePlanVersion() {
    throw new Error("PlanVersion is immutable; create a new version instead");
  }

  // ── PaymentEvent (append-only) ─────────────────────────────────────────
  async createPaymentEvent(input) {
    const event = createPaymentEvent(input);
    await setDoc(
      doc(this.db, v2Paths.paymentEvent(event.workspaceId, event.debtId, event.id)),
      toFirestoreDoc("paymentEvent", event)
    );
    return event;
  }
  async getPaymentEvent(workspaceId, debtId, eventId) {
    const snap = await getDoc(doc(this.db, v2Paths.paymentEvent(workspaceId, debtId, eventId)));
    return snap.exists() ? fromFirestoreDoc("paymentEvent", snap.data()) : null;
  }
  async listPaymentEvents(workspaceId, debtId) {
    const colRef = collection(this.db, "workspaces", workspaceId, "debts", debtId, "payment_events");
    const snap = await getDocs(query(colRef, orderBy("paidAt", "desc"), orderBy("id", "desc")));
    return snap.docs.map((d) => fromFirestoreDoc("paymentEvent", d.data()));
  }
  updatePaymentEvent() {
    throw new Error("PaymentEvent core facts are append-only; create a correction record");
  }

  // ── BalanceSnapshot (append-only) ──────────────────────────────────────
  async createBalanceSnapshot(input) {
    const snapshot = createBalanceSnapshot(input);
    await setDoc(
      doc(this.db, v2Paths.balanceSnapshot(snapshot.workspaceId, snapshot.debtId, snapshot.id)),
      toFirestoreDoc("balanceSnapshot", snapshot)
    );
    return snapshot;
  }
  updateBalanceSnapshot() {
    throw new Error("BalanceSnapshot core facts are append-only; create a correction record");
  }
  async listBalanceSnapshots(workspaceId, debtId) {
    const colRef = collection(this.db, "workspaces", workspaceId, "debts", debtId, "balance_snapshots");
    const snap = await getDocs(query(colRef, orderBy("observedAt", "desc"), orderBy("id", "desc")));
    return snap.docs.map((d) => fromFirestoreDoc("balanceSnapshot", d.data()));
  }

  // ── ExpectedCheckpoint (immutable) ─────────────────────────────────────
  async createExpectedCheckpoint(input) {
    const checkpoint = createExpectedCheckpoint(input);
    await setDoc(
      doc(this.db, v2Paths.expectedCheckpoint(checkpoint.workspaceId, checkpoint.planId, checkpoint.planVersionId, checkpoint.id)),
      toFirestoreDoc("expectedCheckpoint", checkpoint)
    );
    return checkpoint;
  }
  async getExpectedCheckpoint(workspaceId, planId, versionId, checkpointId) {
    const snap = await getDoc(doc(this.db, v2Paths.expectedCheckpoint(workspaceId, planId, versionId, checkpointId)));
    return snap.exists() ? fromFirestoreDoc("expectedCheckpoint", snap.data()) : null;
  }
  async listExpectedCheckpoints(workspaceId, planId, versionId) {
    const colRef = collection(this.db, "workspaces", workspaceId, "plans", planId, "versions", versionId, "expected_schedule");
    const snap = await getDocs(query(colRef, orderBy("period", "asc"), orderBy("id", "asc")));
    return snap.docs.map((d) => fromFirestoreDoc("expectedCheckpoint", d.data()));
  }
  updateExpectedCheckpoint() {
    throw new Error("ExpectedCheckpoint is immutable once created");
  }

  // ── Active-plan switching ──────────────────────────────────────────────
  // Firebase-only: the existing activatePlanTransaction (src/services/tracktozero/
  // activePlanService.js) is written for the synchronous InMemoryTrackToZeroRepository
  // and cannot be reused against an async, Promise-returning repository. This method
  // implements the identical business rule - workspace pointer wins, previous plan
  // demoted, new plan activated with its version, all atomically - via a real
  // Firestore transaction. See TRACKTOZERO_PHASE2B_RESULTS.md for the full rationale.
  async activatePlan({ workspaceId, planId, versionId, actorId, activatedAt }) {
    return runTransaction(this.db, async (tx) => {
      const workspaceRef = doc(this.db, v2Paths.workspace(workspaceId));
      const planRef = doc(this.db, v2Paths.plan(workspaceId, planId));
      const versionRef = doc(this.db, v2Paths.version(workspaceId, planId, versionId));

      // ALL reads first (Firestore transactions forbid any get() after a write).
      const workspaceSnap = await tx.get(workspaceRef);
      const planSnap = await tx.get(planRef);
      const versionSnap = await tx.get(versionRef);
      if (!workspaceSnap.exists()) throw new Error("Workspace not found");
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!versionSnap.exists()) throw new Error("PlanVersion not found");

      const workspace = fromFirestoreDoc("workspace", workspaceSnap.data());
      const nextPlan = fromFirestoreDoc("plan", planSnap.data());
      const version = fromFirestoreDoc("version", versionSnap.data());

      const previousPlanId = workspace.activePlanId || "";
      let previousPlan = null;
      let previousPlanRef = null;
      if (previousPlanId && previousPlanId !== planId) {
        previousPlanRef = doc(this.db, v2Paths.plan(workspaceId, previousPlanId));
        const previousSnap = await tx.get(previousPlanRef);
        if (previousSnap.exists()) previousPlan = fromFirestoreDoc("plan", previousSnap.data());
      }

      // Now writes.
      const updatedWorkspace = { ...workspace, activePlanId: planId, updatedAt: activatedAt, updatedBy: actorId };
      tx.set(workspaceRef, toFirestoreDoc("workspace", updatedWorkspace));

      if (previousPlan) {
        const archivedPlan = { ...previousPlan, status: "archived", updatedAt: activatedAt, updatedBy: actorId };
        tx.set(previousPlanRef, toFirestoreDoc("plan", archivedPlan));
      }

      const updatedNextPlan = {
        ...nextPlan,
        status: "active",
        activeVersionId: versionId,
        activatedAt,
        updatedAt: activatedAt,
        updatedBy: actorId,
      };
      tx.set(planRef, toFirestoreDoc("plan", updatedNextPlan));

      // Build the result from already-known local state - no re-read/re-query
      // after writes (also forbidden, and unnecessary).
      return { workspace: updatedWorkspace, plan: updatedNextPlan, version };
    });
  }

  async reforecastActivePlan({ workspaceId, planId, priorVersionId, nextVersion, actorId, appliedAt }) {
    const validatedVersion = createPlanVersion(nextVersion);
    return runTransaction(this.db, async (tx) => {
      const workspaceRef = doc(this.db, v2Paths.workspace(workspaceId));
      const planRef = doc(this.db, v2Paths.plan(workspaceId, planId));
      const priorVersionRef = doc(this.db, v2Paths.version(workspaceId, planId, priorVersionId));
      const nextVersionRef = doc(this.db, v2Paths.version(workspaceId, planId, validatedVersion.id));

      const workspaceSnap = await tx.get(workspaceRef);
      const planSnap = await tx.get(planRef);
      const priorVersionSnap = await tx.get(priorVersionRef);
      const existingNextVersionSnap = await tx.get(nextVersionRef);
      if (!workspaceSnap.exists()) throw new Error("Workspace not found");
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!priorVersionSnap.exists()) throw new Error("Prior PlanVersion not found");
      if (existingNextVersionSnap.exists()) throw new Error("Next PlanVersion already exists");

      const workspace = fromFirestoreDoc("workspace", workspaceSnap.data());
      const plan = fromFirestoreDoc("plan", planSnap.data());
      const priorVersion = fromFirestoreDoc("version", priorVersionSnap.data());
      if (workspace.activePlanId !== planId) throw new Error("Plan is not the active workspace plan");
      if (plan.activeVersionId !== priorVersionId) throw new Error("Prior version is no longer authoritative");

      const updatedPlan = {
        ...plan,
        status: "active",
        activeVersionId: validatedVersion.id,
        updatedAt: appliedAt,
        updatedBy: actorId,
      };
      tx.set(nextVersionRef, toFirestoreDoc("version", validatedVersion));
      tx.set(planRef, toFirestoreDoc("plan", updatedPlan));

      return { workspace, plan: updatedPlan, priorVersion, version: validatedVersion };
    });
  }
}
