import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { FirebaseTrackToZeroRepository } from "../src/services/repositories/firebaseTrackToZeroRepository.js";
import { runTrackToZeroRepositoryContractSuite } from "./support/trackToZeroRepositoryContract.js";

// Proves the *real* FirebaseTrackToZeroRepository write/read path is genuinely
// gated by firestore.v2.rules (not just client-side checks), using authenticated
// client-SDK contexts (never the Admin SDK) for every asserted operation. Fixture
// builders are duplicated (not imported) from firestore.v2.rules.test.js on
// purpose - the two suites test different things (raw documents vs. repository
// calls) and shouldn't need to evolve in lockstep.

const PROJECT_ID = "demo-budget-react-v2";
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

let testEnv;

const now = () => new Date("2026-01-01T00:00:00.000Z");
const later = () => new Date("2026-02-01T00:00:00.000Z");

const repoAs = (uid) => new FirebaseTrackToZeroRepository(testEnv.authenticatedContext(uid).firestore());

async function seedBaseWorkspace(workspaceId = "w1") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`workspaces/${workspaceId}`).set({
      id: workspaceId, type: "household", status: "active", activePlanId: "", createdAt: now(), createdBy: "owner",
    });
    for (const [uid, role] of [["owner", "owner"], ["admin", "admin"], ["contrib", "contributor"], ["viewer", "viewer"]]) {
      await db.doc(`workspaces/${workspaceId}/members/${uid}`).set({
        workspaceId, uid, role, status: "active", createdAt: now(), createdBy: "owner",
      });
    }
  });
}

async function createDebtWithOpeningSnapshot(repo, input = {}) {
  const debt = {
    id: input.id || "d1",
    workspaceId: input.workspaceId || "w1",
    name: input.name || "Card",
    currentBalance: input.currentBalance ?? 100,
    minimumRequiredPayment: input.minimumRequiredPayment ?? 10,
    aprStatus: input.aprStatus || "unknown",
    createdAt: input.createdAt || now(),
    createdBy: input.createdBy || "admin",
    openingBalanceSnapshotId: input.openingBalanceSnapshotId || `opening-${input.id || "d1"}`,
  };
  return repo.createDebtWithOpeningSnapshot({
    debt,
    openingSnapshot: {
      id: debt.openingBalanceSnapshotId,
      workspaceId: debt.workspaceId,
      debtId: debt.id,
      balance: debt.currentBalance,
      observedAt: input.observedAt || now(),
      source: "manual",
      createdAt: input.createdAt || now(),
      createdBy: debt.createdBy,
    },
  });
}

test.before(async () => {
  // Fail closed: refuse to run rather than guess at a default emulator
  // address. @firebase/rules-unit-testing's initializeTestEnvironment is
  // structurally incapable of reaching production Firestore (it only ever
  // connects to a local emulator host:port, never a real GCP project), but
  // requiring this explicitly means a misconfigured/missing emulator fails
  // loudly here instead of quietly retrying against whatever happens to be
  // listening on a hardcoded default port.
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set - refusing to run. " +
      "Run via `npm run test:firestore:v2`, which starts the emulator and sets this."
    );
  }
  const rules = await readFile(resolve("firestore.v2.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: EMULATOR_HOST, port: Number(EMULATOR_PORT), rules },
  });
});
test.beforeEach(async () => testEnv.clearFirestore());
test.after(async () => testEnv.cleanup());

// ── Per-entity round-trips through the real repository, gated by real rules ──

test("workspace: creator can bootstrap workspace + owner membership and read back, non-member cannot read", async () => {
  const created = await repoAs("creator").saveWorkspace({ id: "w-new", type: "personal", createdAt: now(), createdBy: "creator" });
  assert.equal(created.id, "w-new");
  // Creating the workspace alone does not grant read access - isViewerPlus
  // requires an active membership doc too, exactly as the app's real bootstrap
  // flow works (see the existing "workspace creator can bootstrap owner
  // membership" test in firestore.v2.rules.test.js).
  await repoAs("creator").saveMembership({ workspaceId: "w-new", uid: "creator", role: "owner", createdAt: now(), createdBy: "creator" });
  const fetched = await repoAs("creator").getWorkspace("w-new");
  assert.equal(fetched.type, "personal");
  await assertFails(repoAs("outsider").getWorkspace("w-new"));
});

test("membership: raw email invite is pending-only and does not grant workspace access", async () => {
  await seedBaseWorkspace();
  const invite = await repoAs("owner").saveMemberInvite({
    id: "invite-1",
    workspaceId: "w1",
    email: "future@example.test",
    role: "viewer",
    status: "pending",
    createdAt: now().toISOString(),
    createdBy: "owner",
  });
  assert.equal(invite.status, "pending");
  assert.equal((await repoAs("owner").listMemberInvites("w1")).length, 1);
  await assertFails(repoAs("owner").saveMembership({ workspaceId: "w1", uid: "new-viewer", role: "viewer", createdAt: now(), createdBy: "owner" }));
  await assertFails(repoAs("new-viewer").getWorkspace("w1"));
  await assertFails(repoAs("contrib").saveMembership({ workspaceId: "w1", uid: "new-viewer-2", role: "viewer", createdAt: now(), createdBy: "contrib" }));
});

test("debt: admin can write, viewer can read, contributor cannot write", async () => {
  await seedBaseWorkspace();
  const { debt: created } = await createDebtWithOpeningSnapshot(repoAs("admin"), { id: "d1", createdBy: "admin" });
  assert.equal(created.name, "Card");
  const listed = await repoAs("viewer").listDebts("w1");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "d1");
  const snapshots = await repoAs("viewer").listBalanceSnapshots("w1", "d1");
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].id, "opening-d1");
  await assertFails(createDebtWithOpeningSnapshot(repoAs("contrib"), { id: "d2", name: "Loan", currentBalance: 200, minimumRequiredPayment: 20, createdBy: "contrib" }));
  await assertFails(repoAs("admin").saveDebt({ id: "standalone", workspaceId: "w1", name: "Standalone", currentBalance: 200, minimumRequiredPayment: 20, createdAt: now(), createdBy: "admin", openingBalanceSnapshotId: "missing-opening" }));
  const afterStandaloneDenied = await repoAs("viewer").listDebts("w1");
  assert.equal(afterStandaloneDenied.length, 1);
});

test("debt + opening snapshot batch fails closed when opening snapshot is invalid", async () => {
  await seedBaseWorkspace();
  await assertFails(repoAs("admin").createDebtWithOpeningSnapshot({
    debt: {
      id: "bad-opening",
      workspaceId: "w1",
      name: "Bad Opening",
      currentBalance: 100,
      minimumRequiredPayment: 10,
      aprStatus: "unknown",
      createdAt: now(),
      createdBy: "admin",
      openingBalanceSnapshotId: "opening-bad-opening",
    },
    openingSnapshot: {
      id: "opening-bad-opening",
      workspaceId: "w1",
      debtId: "bad-opening",
      balance: 100,
      observedAt: now(),
      source: "manual",
      createdAt: now(),
      createdBy: "not-admin",
    },
  }));
  const debts = await repoAs("viewer").listDebts("w1");
  assert.equal(debts.some((debt) => debt.id === "bad-opening"), false);
  const snapshots = await repoAs("viewer").listBalanceSnapshots("w1", "bad-opening");
  assert.equal(snapshots.length, 0);
});

test("plan + planVersion: admin can write, viewer can read, contributor cannot write", async () => {
  await seedBaseWorkspace();
  const plan = await repoAs("admin").savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  assert.equal(plan.status, "draft");
  const fetchedPlan = await repoAs("viewer").getPlan("w1", "p1");
  assert.equal(fetchedPlan.status, "draft");

  const version = await repoAs("admin").savePlanVersion({
    id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche",
    asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation",
  });
  assert.equal(version.strategy, "avalanche");
  const fetchedVersion = await repoAs("viewer").getPlanVersion("w1", "p1", "v1");
  assert.equal(fetchedVersion.strategy, "avalanche");

  await assertFails(repoAs("contrib").savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "contrib" }));
});

test("payment event: contributor can append, viewer can read independently, viewer cannot append", async () => {
  await seedBaseWorkspace();
  await createDebtWithOpeningSnapshot(repoAs("admin"), { id: "d1", createdBy: "admin" });
  const created = await repoAs("contrib").createPaymentEvent({ id: "e1", workspaceId: "w1", debtId: "d1", amount: 25, paidAt: now(), createdAt: now(), createdBy: "contrib" });
  assert.equal(created.amount, 25);
  const fetched = await repoAs("viewer").getPaymentEvent("w1", "d1", "e1");
  assert.equal(fetched.amount, 25);
  await assertFails(repoAs("viewer").createPaymentEvent({ id: "e2", workspaceId: "w1", debtId: "d1", amount: 15, paidAt: now(), createdAt: now(), createdBy: "viewer" }));
});

test("balance snapshot: contributor can append, viewer can read with correct ordering, viewer cannot append", async () => {
  await seedBaseWorkspace();
  await createDebtWithOpeningSnapshot(repoAs("admin"), { id: "d1", createdBy: "admin", openingBalanceSnapshotId: "s1" });
  await repoAs("contrib").createBalanceSnapshot({ id: "s2", workspaceId: "w1", debtId: "d1", balance: 90, observedAt: later(), createdAt: now(), createdBy: "contrib" });

  const listed = await repoAs("viewer").listBalanceSnapshots("w1", "d1");
  assert.equal(listed.length, 2);
  assert.equal(listed[0].id, "s2", "newest observedAt must sort first");
  assert.equal(listed[1].id, "s1");

  await assertFails(repoAs("viewer").createBalanceSnapshot({ id: "s3", workspaceId: "w1", debtId: "d1", balance: 80, observedAt: now(), createdAt: now(), createdBy: "viewer" }));
});

test("expected checkpoint: admin can create, viewer can read, contributor cannot create", async () => {
  await seedBaseWorkspace();
  await repoAs("admin").savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  await repoAs("admin").savePlanVersion({
    id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche",
    asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation",
  });
  const checkpoint = await repoAs("admin").createExpectedCheckpoint({ id: "c1", workspaceId: "w1", planId: "p1", planVersionId: "v1", period: "2026-01", expectedTotalBalance: 100 });
  assert.equal(checkpoint.period, "2026-01");
  const fetched = await repoAs("viewer").getExpectedCheckpoint("w1", "p1", "v1", "c1");
  assert.equal(fetched.expectedTotalBalance, 100);
  await assertFails(repoAs("contrib").createExpectedCheckpoint({ id: "c2", workspaceId: "w1", planId: "p1", planVersionId: "v1", period: "2026-02", expectedTotalBalance: 90 }));
});

// ── activatePlan: atomic switch + failed-attempt-leaves-no-partial-state proof ──

test("activatePlan succeeds atomically for an authorized role: workspace pointer + plan statuses update together", async () => {
  await seedBaseWorkspace();
  await repoAs("admin").savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  await repoAs("admin").savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  await repoAs("admin").savePlanVersion({ id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche", asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation" });
  await repoAs("admin").savePlanVersion({ id: "v2", planId: "p2", workspaceId: "w1", versionNumber: 1, strategy: "snowball", asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation" });

  await assertSucceeds(repoAs("owner").activatePlan({ workspaceId: "w1", planId: "p1", versionId: "v1", actorId: "owner", activatedAt: now() }));
  await assertSucceeds(repoAs("owner").activatePlan({ workspaceId: "w1", planId: "p2", versionId: "v2", actorId: "owner", activatedAt: later() }));

  const workspace = await repoAs("viewer").getWorkspace("w1");
  assert.equal(workspace.activePlanId, "p2");
  const plan1 = await repoAs("viewer").getPlan("w1", "p1");
  assert.equal(plan1.status, "archived");
  const plan2 = await repoAs("viewer").getPlan("w1", "p2");
  assert.equal(plan2.status, "active");
  assert.equal(plan2.activeVersionId, "v2");
});

test("activatePlan denied for an unauthorized role leaves no partial state", async () => {
  await seedBaseWorkspace();
  await repoAs("admin").savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  await repoAs("admin").savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: now(), createdBy: "admin" });
  await repoAs("admin").savePlanVersion({ id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche", asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation" });
  await repoAs("admin").savePlanVersion({ id: "v2", planId: "p2", workspaceId: "w1", versionNumber: 1, strategy: "snowball", asOf: now(), extraMonthlyPayment: 0, createdAt: now(), createdBy: "admin", createdBecause: "activation" });
  await repoAs("owner").activatePlan({ workspaceId: "w1", planId: "p1", versionId: "v1", actorId: "owner", activatedAt: now() });

  // contributor is below Admin+ for plans/{planId} and workspace update - the
  // transaction must fail closed, and none of its writes may land.
  await assertFails(repoAs("contrib").activatePlan({ workspaceId: "w1", planId: "p2", versionId: "v2", actorId: "contrib", activatedAt: later() }));

  const workspace = await repoAs("viewer").getWorkspace("w1");
  assert.equal(workspace.activePlanId, "p1", "workspace pointer must be unchanged after the failed attempt");
  const plan1 = await repoAs("viewer").getPlan("w1", "p1");
  assert.equal(plan1.status, "active", "previously active plan must still be active");
  const plan2 = await repoAs("viewer").getPlan("w1", "p2");
  assert.equal(plan2.status, "draft", "the target plan must not have been partially activated");
});

// ── Shared repository-contract parity suite, run against the real Firebase repo ──

describe("shared repository contract (Firebase-backed)", () => {
  // The shared suite's fixtures always use workspace "w1" and the "owner" repo.
  // The contract helper bootstraps the workspace + owner membership atomically
  // through repository.saveOwnerWorkspaceBootstrap(), mirroring the production
  // onboarding path without using a rules-disabled shortcut.
  runTrackToZeroRepositoryContractSuite({
    describe,
    it,
    createRepository: async () => repoAs("owner"),
    switchActivePlan: (repo, args) => repo.activatePlan(args),
  });
});
