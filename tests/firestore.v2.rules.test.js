import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-budget-react-v2";
let testEnv;

const now = () => new Date("2026-01-01T00:00:00.000Z");
const inviteExpiry = () => new Date("2027-01-08T00:00:00.000Z");
const ws = (id = "w1", createdBy = "owner") => ({ id, type: "household", status: "active", activePlanId: "", createdAt: now(), createdBy });
const member = (workspaceId, uid, role) => ({ workspaceId, uid, role, status: "active", createdAt: now(), createdBy: "owner" });
const debt = (workspaceId = "w1", id = "d1", createdBy = "owner") => ({ id, workspaceId, name: "Card", status: "active", currentBalance: 100, minimumRequiredPayment: 10, createdBy, openingBalanceSnapshotId: `opening-${id}` });
const payment = (workspaceId = "w1", debtId = "d1", uid = "contrib") => ({ id: "p1", workspaceId, debtId, amount: 25, paidAt: now(), source: "manual", createdAt: now(), createdBy: uid });
const snapshot = (workspaceId = "w1", debtId = "d1", uid = "contrib") => ({ id: "s1", workspaceId, debtId, balance: 75, observedAt: now(), source: "manual", createdAt: now(), createdBy: uid });
const plan = (workspaceId = "w1", id = "plan1") => ({ id, workspaceId, status: "draft", activeVersionId: "", createdAt: now(), createdBy: "owner" });
const version = (workspaceId = "w1", planId = "plan1", id = "v1") => ({ id, workspaceId, planId, versionNumber: 1, strategy: "avalanche", asOf: now(), startingDebtSnapshot: [], extraMonthlyPayment: 0, createdAt: now(), createdBy: "owner", createdBecause: "activation" });
const invite = (workspaceId = "w1", id = "invite1", createdBy = "owner") => ({
  id,
  workspaceId,
  workspaceName: "Test household",
  emailNormalized: "future@example.test",
  role: "viewer",
  status: "pending",
  tokenHash: id,
  invitedByUserId: createdBy,
  invitedByName: "Owner",
  createdAt: now(),
  createdBy,
  expiresAt: inviteExpiry(),
  acceptedAt: null,
  acceptedByUserId: "",
  canceledAt: null,
  canceledByUserId: "",
});
const person = (workspaceId = "w1", id = "person1", createdBy = "owner", displayName = "Babajide Yusuf") => ({
  id, workspaceId, displayName, normalizedName: String(displayName).trim().toLowerCase(), aliases: [], kind: "imported_person", status: "active",
  workspaceMembershipId: "", mergedIntoPersonId: "", source: "import_confirmed", createdAt: now(), createdBy,
});

const scenario = (workspaceId = "w1", id = "scenario1", createdBy = "owner", type = "recurring_extra") => ({
  id, workspaceId, name: "Aggressive payoff", type, status: "active",
  basePlanId: "plan1", basePlanVersionId: "v1", inputs: { extraMonthlyPayment: 50 },
  createdAt: now(), createdBy,
});

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

const openingSnapshot = (workspaceId = "w1", debtId = "d1", uid = "owner") => ({
  id: `opening-${debtId}`,
  workspaceId,
  debtId,
  balance: 100,
  observedAt: now(),
  source: "manual",
  createdAt: now(),
  createdBy: uid,
});

function debtWithOpeningSnapshotBatch(db, workspaceId, debtId, uid) {
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${workspaceId}/debts/${debtId}`), debt(workspaceId, debtId, uid));
  batch.set(db.doc(`workspaces/${workspaceId}/debts/${debtId}/balance_snapshots/opening-${debtId}`), openingSnapshot(workspaceId, debtId, uid));
  return batch.commit();
}

test.before(async () => {
  const rules = await readFile(resolve(process.env.TRACKTOZERO_V2_RULES_FILE || "firestore.v2.rules"), "utf8");
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: "127.0.0.1", port: 8080, rules } });
});
test.beforeEach(async () => testEnv.clearFirestore());
test.after(async () => testEnv.cleanup());

test("workspace creator can bootstrap owner membership", async () => {
  const db = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(db.doc("workspaces/new").set(ws("new", "owner")));
  await assertSucceeds(db.doc("workspaces/new/members/owner").set(member("new", "owner", "owner")));
});

test("member_index mirror: owner can create their own index entry and find it via a top-level query (what listMembershipsForUser relies on)", async () => {
  const owner = testEnv.authenticatedContext("owner").firestore();
  await assertSucceeds(owner.doc("workspaces/new").set(ws("new", "owner")));
  await assertSucceeds(owner.doc("workspaces/new/members/owner").set(member("new", "owner", "owner")));
  await assertSucceeds(owner.doc("member_index/new_owner").set(member("new", "owner", "owner")));

  const ownSnap = await assertSucceeds(
    owner.collection("member_index").where("uid", "==", "owner").where("status", "==", "active").get()
  );
  if (ownSnap.docs.map((d) => d.id).join(",") !== "new_owner") {
    throw new Error(`Expected only new_owner in member_index results, got: ${ownSnap.docs.map((d) => d.id).join(",")}`);
  }

  // A different signed-in user cannot forge an index entry for someone
  // else's membership, and cannot read it either.
  const outsider = testEnv.authenticatedContext("outsider").firestore();
  await assertFails(outsider.doc("member_index/new_owner").set(member("new", "owner", "owner")));
  await assertFails(outsider.doc("member_index/new_owner").get());
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
  await assertSucceeds(debtWithOpeningSnapshotBatch(db, "w1", "d2", "admin"));
  await assertFails(db.doc("workspaces/w1/debts/standalone").set(debt("w1", "standalone", "admin")));
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

test("invited user can accept exactly their own pending invite by creating membership + accepted invite atomically", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/member_invites/invite-accept").set(invite("w1", "invite-accept", "owner"));
  });
  const invitee = testEnv.authenticatedContext("future-user", { email: "future@example.test" }).firestore();
  const batch = invitee.batch();
  batch.set(
    invitee.doc("workspaces/w1/members/future-user"),
    {
      workspaceId: "w1",
      uid: "future-user",
      role: "viewer",
      status: "active",
      displayName: "Future User",
      email: "future@example.test",
      acceptedInviteId: "invite-accept",
      createdAt: now(),
      createdBy: "future-user",
    }
  );
  batch.update(invitee.doc("workspaces/w1/member_invites/invite-accept"), {
    workspaceId: "w1",
    id: "invite-accept",
    workspaceName: "Test household",
    emailNormalized: "future@example.test",
    role: "viewer",
    status: "accepted",
    tokenHash: "invite-accept",
    invitedByUserId: "owner",
    invitedByName: "Owner",
    createdAt: now(),
    createdBy: "owner",
    expiresAt: inviteExpiry(),
    acceptedAt: now(),
    acceptedByUserId: "future-user",
  });
  await assertSucceeds(batch.commit());
});

test("invite acceptance is blocked when the authenticated email does not match the invite", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/member_invites/invite-mismatch").set(invite("w1", "invite-mismatch", "owner"));
  });
  const outsider = testEnv.authenticatedContext("future-user", { email: "other@example.test" }).firestore();
  const batch = outsider.batch();
  batch.set(
    outsider.doc("workspaces/w1/members/future-user"),
    {
      workspaceId: "w1",
      uid: "future-user",
      role: "viewer",
      status: "active",
      displayName: "Future User",
      email: "other@example.test",
      acceptedInviteId: "invite-mismatch",
      createdAt: now(),
      createdBy: "future-user",
    }
  );
  batch.update(outsider.doc("workspaces/w1/member_invites/invite-mismatch"), {
    workspaceId: "w1",
    id: "invite-mismatch",
    workspaceName: "Test household",
    emailNormalized: "future@example.test",
    role: "viewer",
    status: "accepted",
    tokenHash: "invite-mismatch",
    invitedByUserId: "owner",
    invitedByName: "Owner",
    createdAt: now(),
    createdBy: "owner",
    expiresAt: inviteExpiry(),
    acceptedAt: now(),
    acceptedByUserId: "future-user",
  });
  await assertFails(batch.commit());
});

// SEC-INVITE: the rule logic for these four cases (expiresAt > request.time,
// resource.data.status == "pending", and the get-only/no-list scoping on
// member_invites) already existed before this phase - these tests close a
// real coverage gap (confirmed via grep: no prior test exercised any of
// them), they do not change the rules themselves.
test("expired invite cannot be accepted", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/member_invites/invite-expired").set({
      ...invite("w1", "invite-expired", "owner"),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
  });
  const invitee = testEnv.authenticatedContext("future-user", { email: "future@example.test" }).firestore();
  const batch = invitee.batch();
  batch.set(invitee.doc("workspaces/w1/members/future-user"), {
    workspaceId: "w1", uid: "future-user", role: "viewer", status: "active",
    displayName: "Future User", email: "future@example.test", acceptedInviteId: "invite-expired",
    createdAt: now(), createdBy: "future-user",
  });
  batch.update(invitee.doc("workspaces/w1/member_invites/invite-expired"), {
    workspaceId: "w1", id: "invite-expired", workspaceName: "Test household",
    emailNormalized: "future@example.test", role: "viewer", status: "accepted",
    tokenHash: "invite-expired", invitedByUserId: "owner", invitedByName: "Owner",
    createdAt: now(), createdBy: "owner", expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    acceptedAt: now(), acceptedByUserId: "future-user",
  });
  await assertFails(batch.commit());
});

test("canceled invite cannot be accepted", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/member_invites/invite-canceled").set({
      ...invite("w1", "invite-canceled", "owner"),
      status: "canceled",
      canceledAt: now(),
      canceledByUserId: "owner",
    });
  });
  const invitee = testEnv.authenticatedContext("future-user", { email: "future@example.test" }).firestore();
  const batch = invitee.batch();
  batch.set(invitee.doc("workspaces/w1/members/future-user"), {
    workspaceId: "w1", uid: "future-user", role: "viewer", status: "active",
    displayName: "Future User", email: "future@example.test", acceptedInviteId: "invite-canceled",
    createdAt: now(), createdBy: "future-user",
  });
  batch.update(invitee.doc("workspaces/w1/member_invites/invite-canceled"), {
    workspaceId: "w1", id: "invite-canceled", workspaceName: "Test household",
    emailNormalized: "future@example.test", role: "viewer", status: "accepted",
    tokenHash: "invite-canceled", invitedByUserId: "owner", invitedByName: "Owner",
    createdAt: now(), createdBy: "owner", expiresAt: inviteExpiry(),
    acceptedAt: now(), acceptedByUserId: "future-user",
  });
  await assertFails(batch.commit());
});

test("replaying an already-accepted invite is denied, including by a different attacker uid", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    // Simulates the invite having already been legitimately accepted once
    // (status is already "accepted", not "pending").
    await db.doc("workspaces/w1/member_invites/invite-used").set({
      ...invite("w1", "invite-used", "owner"),
      status: "accepted",
      acceptedAt: now(),
      acceptedByUserId: "original-user",
    });
  });
  // The original invitee trying to "accept" a second time.
  const original = testEnv.authenticatedContext("original-user", { email: "future@example.test" }).firestore();
  const replayBatch = original.batch();
  replayBatch.set(original.doc("workspaces/w1/members/original-user-2"), {
    workspaceId: "w1", uid: "original-user-2", role: "viewer", status: "active",
    displayName: "Replay", email: "future@example.test", acceptedInviteId: "invite-used",
    createdAt: now(), createdBy: "original-user-2",
  });
  replayBatch.update(original.doc("workspaces/w1/member_invites/invite-used"), {
    workspaceId: "w1", id: "invite-used", workspaceName: "Test household",
    emailNormalized: "future@example.test", role: "viewer", status: "accepted",
    tokenHash: "invite-used", invitedByUserId: "owner", invitedByName: "Owner",
    createdAt: now(), createdBy: "owner", expiresAt: inviteExpiry(),
    acceptedAt: now(), acceptedByUserId: "original-user-2",
  });
  await assertFails(replayBatch.commit());

  // A different attacker uid attempting to claim the same already-used invite.
  const attacker = testEnv.authenticatedContext("attacker", { email: "future@example.test" }).firestore();
  const attackBatch = attacker.batch();
  attackBatch.set(attacker.doc("workspaces/w1/members/attacker"), {
    workspaceId: "w1", uid: "attacker", role: "viewer", status: "active",
    displayName: "Attacker", email: "future@example.test", acceptedInviteId: "invite-used",
    createdAt: now(), createdBy: "attacker",
  });
  attackBatch.update(attacker.doc("workspaces/w1/member_invites/invite-used"), {
    workspaceId: "w1", id: "invite-used", workspaceName: "Test household",
    emailNormalized: "future@example.test", role: "viewer", status: "accepted",
    tokenHash: "invite-used", invitedByUserId: "owner", invitedByName: "Owner",
    createdAt: now(), createdBy: "owner", expiresAt: inviteExpiry(),
    acceptedAt: now(), acceptedByUserId: "attacker",
  });
  await assertFails(attackBatch.commit());
});

test("a single invite is readable by id (unauthenticated join-preview) but the collection cannot be enumerated by a non-member", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/member_invites/invite-preview").set(invite("w1", "invite-preview", "owner"));
  });
  // The intentional public-preview path: get by exact id, no auth required.
  await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc("workspaces/w1/member_invites/invite-preview").get());
  // The permissive branch must NOT extend to listing/enumerating invites -
  // that stays scoped to workspace members, for both unauthenticated and
  // authenticated non-member readers.
  await assertFails(testEnv.unauthenticatedContext().firestore().collection("workspaces/w1/member_invites").get());
  await assertFails(testEnv.authenticatedContext("outsider").firestore().collection("workspaces/w1/member_invites").get());
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

// DATA-HH1
test("owner and admin can create/update household people; viewer can read but never write", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  const admin = testEnv.authenticatedContext("admin").firestore();
  const viewer = testEnv.authenticatedContext("viewer").firestore();

  await assertSucceeds(owner.doc("workspaces/w1/people/person1").set(person("w1", "person1", "owner")));
  await assertSucceeds(admin.doc("workspaces/w1/people/person2").set(person("w1", "person2", "admin", "Kristina Davis")));
  await assertSucceeds(admin.doc("workspaces/w1/people/person1").update({ workspaceId: "w1", id: "person1", aliases: ["Jide Yusuf"] }));

  await assertSucceeds(viewer.doc("workspaces/w1/people/person1").get());
  await assertFails(viewer.doc("workspaces/w1/people/person3").set(person("w1", "person3", "viewer")));
  await assertFails(viewer.doc("workspaces/w1/people/person1").update({ workspaceId: "w1", id: "person1", aliases: ["Should fail"] }));
});

test("contributor can read but cannot create or edit household people (manageDebts-tier only)", async () => {
  await seedWorkspace();
  await seed(async (db) => { await db.doc("workspaces/w1/people/person1").set(person()); });
  const contrib = testEnv.authenticatedContext("contrib").firestore();
  await assertSucceeds(contrib.doc("workspaces/w1/people/person1").get());
  await assertFails(contrib.doc("workspaces/w1/people/person4").set(person("w1", "person4", "contrib")));
  await assertFails(contrib.doc("workspaces/w1/people/person1").update({ workspaceId: "w1", id: "person1", aliases: ["Should fail"] }));
});

test("non-members and unauthenticated users cannot read or write household people", async () => {
  await seed(async (db) => { await db.doc("workspaces/w1/people/person1").set(person()); });
  await assertFails(testEnv.unauthenticatedContext().firestore().doc("workspaces/w1/people/person1").get());
  const outsider = testEnv.authenticatedContext("outsider").firestore();
  await assertFails(outsider.doc("workspaces/w1/people/person1").get());
  await assertFails(outsider.doc("workspaces/w1/people/person5").set(person("w1", "person5", "outsider")));
});

test("a person document from another workspace can never be forged into this one", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  // The path's workspaceId (w1) must match the document's own workspaceId field.
  await assertFails(owner.doc("workspaces/w1/people/cross").set(person("w2", "cross", "owner")));
});

test("a member can self-connect an unlinked household person, but cannot steal one already linked elsewhere", async () => {
  await seedWorkspace();
  await seed(async (db) => {
    await db.doc("workspaces/w1/people/person1").set(person("w1", "person1", "owner", "Future User"));
    await db.doc("workspaces/w1/members/future-user").set(member("w1", "future-user", "viewer"));
  });
  const future = testEnv.authenticatedContext("future-user", { email: "future@example.test" }).firestore();
  await assertSucceeds(future.doc("workspaces/w1/people/person1").update({
    workspaceId: "w1",
    id: "person1",
    displayName: "Future User",
    normalizedName: "future user",
    aliases: [],
    kind: "imported_person",
    status: "active",
    workspaceMembershipId: "future-user",
    mergedIntoPersonId: "",
    source: "import_confirmed",
    createdAt: now(),
    createdBy: "owner",
    updatedAt: now(),
    updatedBy: "future-user",
  }));

  await seed(async (db) => {
    await db.doc("workspaces/w1/people/person2").set({ ...person("w1", "person2", "owner", "Taken"), workspaceMembershipId: "admin" });
  });
  await assertFails(future.doc("workspaces/w1/people/person2").update({
    workspaceId: "w1",
    id: "person2",
    displayName: "Taken",
    normalizedName: "babajide yusuf",
    aliases: [],
    kind: "imported_person",
    status: "active",
    workspaceMembershipId: "future-user",
    mergedIntoPersonId: "",
    source: "import_confirmed",
    createdAt: now(),
    createdBy: "owner",
    updatedAt: now(),
    updatedBy: "future-user",
  }));
});

// UX-4
test("owner and admin can save/archive scenarios (managePlans-tier); viewer can read but never write, and no one can delete outright", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  const admin = testEnv.authenticatedContext("admin").firestore();
  const viewer = testEnv.authenticatedContext("viewer").firestore();

  await assertSucceeds(owner.doc("workspaces/w1/scenarios/scenario1").set(scenario("w1", "scenario1", "owner")));
  await assertSucceeds(admin.doc("workspaces/w1/scenarios/scenario2").set(scenario("w1", "scenario2", "admin", "goal_date")));
  await assertSucceeds(admin.doc("workspaces/w1/scenarios/scenario1").update({ workspaceId: "w1", id: "scenario1", status: "archived" }));

  await assertSucceeds(viewer.doc("workspaces/w1/scenarios/scenario1").get());
  await assertFails(viewer.doc("workspaces/w1/scenarios/scenario3").set(scenario("w1", "scenario3", "viewer")));
  await assertFails(viewer.doc("workspaces/w1/scenarios/scenario1").update({ workspaceId: "w1", id: "scenario1", status: "archived" }));

  await assertFails(owner.doc("workspaces/w1/scenarios/scenario1").delete());
});

test("contributor can read but cannot save or archive scenarios (managePlans-tier only)", async () => {
  await seedWorkspace();
  await seed(async (db) => { await db.doc("workspaces/w1/scenarios/scenario1").set(scenario()); });
  const contrib = testEnv.authenticatedContext("contrib").firestore();
  await assertSucceeds(contrib.doc("workspaces/w1/scenarios/scenario1").get());
  await assertFails(contrib.doc("workspaces/w1/scenarios/scenario4").set(scenario("w1", "scenario4", "contrib")));
  await assertFails(contrib.doc("workspaces/w1/scenarios/scenario1").update({ workspaceId: "w1", id: "scenario1", status: "archived" }));
});

test("non-members and unauthenticated users cannot read or write scenarios", async () => {
  await seed(async (db) => { await db.doc("workspaces/w1/scenarios/scenario1").set(scenario()); });
  await assertFails(testEnv.unauthenticatedContext().firestore().doc("workspaces/w1/scenarios/scenario1").get());
  const outsider = testEnv.authenticatedContext("outsider").firestore();
  await assertFails(outsider.doc("workspaces/w1/scenarios/scenario1").get());
  await assertFails(outsider.doc("workspaces/w1/scenarios/scenario5").set(scenario("w1", "scenario5", "outsider")));
});

test("a scenario document from another workspace can never be forged into this one", async () => {
  await seedWorkspace();
  const owner = testEnv.authenticatedContext("owner").firestore();
  await assertFails(owner.doc("workspaces/w1/scenarios/cross").set(scenario("w2", "cross", "owner")));
});
