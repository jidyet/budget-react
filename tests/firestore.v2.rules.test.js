import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-budget-react-v2";
let testEnv;

const now = () => new Date("2026-01-01T00:00:00.000Z");
const ws = (id = "w1", createdBy = "owner") => ({ id, type: "household", status: "active", activePlanId: "", createdAt: now(), createdBy });
const member = (workspaceId, uid, role) => ({ workspaceId, uid, role, status: "active", createdAt: now(), createdBy: "owner" });
const debt = (workspaceId = "w1", id = "d1") => ({ id, workspaceId, name: "Card", status: "active", currentBalance: 100, minimumRequiredPayment: 10, createdBy: "owner" });
const payment = (workspaceId = "w1", debtId = "d1", uid = "contrib") => ({ id: "p1", workspaceId, debtId, amount: 25, paidAt: now(), source: "manual", createdAt: now(), createdBy: uid });
const snapshot = (workspaceId = "w1", debtId = "d1", uid = "contrib") => ({ id: "s1", workspaceId, debtId, balance: 75, observedAt: now(), source: "manual", createdAt: now(), createdBy: uid });
const plan = (workspaceId = "w1", id = "plan1") => ({ id, workspaceId, status: "draft", activeVersionId: "", createdAt: now(), createdBy: "owner" });
const version = (workspaceId = "w1", planId = "plan1", id = "v1") => ({ id, workspaceId, planId, versionNumber: 1, strategy: "avalanche", asOf: now(), startingDebtSnapshot: [], extraMonthlyPayment: 0, createdAt: now(), createdBy: "owner", createdBecause: "activation" });
const invite = (workspaceId = "w1", id = "invite1", createdBy = "owner") => ({ id, workspaceId, email: "future@example.test", role: "viewer", status: "pending", createdAt: now(), createdBy });

async function seed(callback) {
  await testEnv.withSecurityRulesDisabled(async (context) => callback(context.firestore()));
}

async function seedWorkspace() {
  await seed(async (db) => {
    await db.doc("workspaces/w1").set(ws());
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/members/admin").set(member("w1", "admin", "admin"));
    await db.doc("workspaces/w1/members/contrib").set(member("w1", "contrib", "contributor"));
    await db.doc("workspaces/w1/members/viewer").set(member("w1", "viewer", "viewer"));
    await db.doc("workspaces/w1/debts/d1").set(debt());
    await db.doc("workspaces/w1/plans/plan1").set(plan());
    await db.doc("workspaces/w1/plans/plan1/versions/v1").set(version());
    await db.doc("workspaces/w1/debts/d1/payment_events/p1").set(payment());
    await db.doc("workspaces/w1/debts/d1/balance_snapshots/s1").set(snapshot());
  });
}

test.before(async () => {
  const rules = await readFile(resolve("firestore.v2.rules"), "utf8");
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: "127.0.0.1", port: 8080, rules } });
});
test.beforeEach(async () => testEnv.clearFirestore());
test.after(async () => testEnv.cleanup());

test("workspace creator can bootstrap owner membership", async () => {
  const db = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(db.doc("workspaces/new").set(ws("new", "owner")));
  await assertSucceeds(db.doc("workspaces/new/members/owner").set(member("new", "owner", "owner")));
});

test("unauthenticated and non-members cannot read/write financial data", async () => {
  await seedWorkspace();
  await assertFails(testEnv.unauthenticatedContext().firestore().doc("workspaces/w1/debts/d1").get());
  const outsider = testEnv.authenticatedContext("outsider").firestore();
  await assertFails(outsider.doc("workspaces/w1/debts/d1").get());
  await assertFails(outsider.doc("workspaces/w1/debts/d2").set(debt("w1", "d2")));
  await assertFails(outsider.doc("workspaces/w1/members/outsider").set(member("w1", "outsider", "owner")));
});

test("viewer is read-only", async () => {
  await seedWorkspace();
  const db = testEnv.authenticatedContext("viewer").firestore();
  await assertSucceeds(db.doc("workspaces/w1/debts/d1").get());
  await assertFails(db.doc("workspaces/w1/debts/d2").set(debt("w1", "d2")));
  await assertFails(db.doc("workspaces/w1/debts/d1/payment_events/p2").set(payment("w1", "d1", "viewer")));
});

test("contributor can append observations but cannot manage debts or plans", async () => {
  await seedWorkspace();
  const db = testEnv.authenticatedContext("contrib").firestore();
  await assertSucceeds(db.doc("workspaces/w1/debts/d1/payment_events/p2").set(payment("w1", "d1", "contrib")));
  await assertSucceeds(db.doc("workspaces/w1/debts/d1/balance_snapshots/s2").set(snapshot("w1", "d1", "contrib")));
  await assertFails(db.doc("workspaces/w1/debts/d1").update({ name: "Changed", workspaceId: "w1" }));
  await assertFails(db.doc("workspaces/w1/plans/plan2").set(plan("w1", "plan2")));
});

test("admin can manage financial docs but cannot promote to owner or demote owner", async () => {
  await seedWorkspace();
  const db = testEnv.authenticatedContext("admin").firestore();
  await assertSucceeds(db.doc("workspaces/w1/debts/d2").set(debt("w1", "d2")));
  await assertSucceeds(db.doc("workspaces/w1/plans/plan2").set(plan("w1", "plan2")));
  await assertFails(db.doc("workspaces/w1/members/admin").update({ role: "owner" }));
  await assertFails(db.doc("workspaces/w1/members/contrib").update({ role: "owner" }));
  await assertFails(db.doc("workspaces/w1/members/owner").update({ role: "viewer" }));
  await assertFails(db.doc("workspaces/w1/members/owner").delete());
});

test("raw-email invite creates no access-granting membership", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(owner.doc("workspaces/w1/member_invites/invite1").set(invite()));
  await assertFails(owner.doc("workspaces/w1/members/future-user").set(member("w1", "future-user", "viewer")));
  await assertFails(testEnv.authenticatedContext("future-user").firestore().doc("workspaces/w1").get());
  await assertFails(testEnv.authenticatedContext("future-user").firestore().doc("workspaces/w1/members/future-user").set(member("w1", "future-user", "viewer")));
});

test("cross-workspace member insertion is denied", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(owner.doc("workspaces/other").set(ws("other", "owner")));
  await assertFails(owner.doc("workspaces/other/members/admin").set(member("other", "admin", "admin")));
  await assertFails(testEnv.authenticatedContext("contrib").firestore().doc("workspaces/other/members/contrib").set(member("other", "contrib", "owner")));
});

test("viewer and contributor cannot self-promote or smuggle role changes", async () => {
  await seedWorkspace();
  await assertFails(testEnv.authenticatedContext("viewer").firestore().doc("workspaces/w1/members/viewer").update({ role: "admin", displayName: "Sneaky" }));
  await assertFails(testEnv.authenticatedContext("contrib").firestore().doc("workspaces/w1/members/contrib").update({ role: "admin", displayName: "Sneaky" }));
});

test("owner has full workspace control except in-place history deletion", async () => {
  await seedWorkspace();
  const db = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(db.doc("workspaces/w1/member_invites/new-viewer").set(invite("w1", "new-viewer", "owner")));
  await assertSucceeds(db.doc("workspaces/w1").delete());
  await assertFails(db.doc("workspaces/w1/debts/d1/payment_events/p1").delete());
});

test("plan versions and expected schedules are historical", async () => {
  await seedWorkspace();
  const admin = testEnv.authenticatedContext("admin").firestore();
  await assertSucceeds(admin.doc("workspaces/w1/plans/plan1/versions/v2").set(version("w1", "plan1", "v2")));
  await assertFails(admin.doc("workspaces/w1/plans/plan1/versions/v1").update({ strategy: "snowball" }));
  await assertSucceeds(admin.doc("workspaces/w1/plans/plan1/versions/v1/expected_schedule/c1").set({ id: "c1", workspaceId: "w1", planId: "plan1", planVersionId: "v1", period: "Jan 2026", expectedTotalBalance: 100 }));
  await assertFails(admin.doc("workspaces/w1/plans/plan1/versions/v1/expected_schedule/c1").update({ expectedTotalBalance: 50 }));
});

test("payment and balance core fields cannot be mutated", async () => {
  await seedWorkspace();
  const admin = testEnv.authenticatedContext("admin").firestore();
  await assertFails(admin.doc("workspaces/w1/debts/d1/payment_events/p1").update({ amount: 99 }));
  await assertFails(admin.doc("workspaces/w1/debts/d1/payment_events/p1").update({ debtId: "d2" }));
  await assertFails(admin.doc("workspaces/w1/debts/d1/payment_events/p1").update({ createdBy: "admin" }));
  await assertFails(admin.doc("workspaces/w1/debts/d1/payment_events/p1").update({ paidAt: new Date("2026-02-01T00:00:00.000Z") }));
  await assertSucceeds(admin.doc("workspaces/w1/debts/d1/payment_events/p1").update({ notes: "audited" }));
  await assertFails(admin.doc("workspaces/w1/debts/d1/balance_snapshots/s1").update({ balance: 10 }));
  await assertFails(admin.doc("workspaces/w1/debts/d1/balance_snapshots/s1").update({ observedAt: new Date("2026-02-01T00:00:00.000Z") }));
  await assertSucceeds(admin.doc("workspaces/w1/debts/d1/balance_snapshots/s1").update({ notes: "audited" }));
});
