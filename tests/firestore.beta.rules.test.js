import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

// BETA-3: dedicated rules-unit-tests for the controlled-beta allowlist gate
// added ONLY in firestore.beta.rules (never firestore.rules, which is what
// `firebase deploy` ships to production). This does not re-run the full
// V2 security/atomicity matrix (already proven 69/69 against the
// unmodified functions this file's gate wraps, in
// tests/firestore.v2.rules.test.js) - it proves the NEW allowlist behavior
// specifically, plus a few representative "normal V2 behavior still works
// for an approved tester" smoke checks so a change here can't silently
// break ordinary functionality.

const PROJECT_ID = "demo-budget-react-v2";
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "").split(":");
let testEnv;

const now = () => new Date("2026-01-01T00:00:00.000Z");
const inviteExpiry = () => new Date("2027-01-08T00:00:00.000Z");
const ws = (id = "w1", createdBy = "owner") => ({ id, type: "household", status: "active", activePlanId: "", createdAt: now(), createdBy });
const member = (workspaceId, uid, role) => ({ workspaceId, uid, role, status: "active", createdAt: now(), createdBy: "owner" });
const debt = (workspaceId = "w1", id = "d1", createdBy = "owner") => ({ id, workspaceId, name: "Card", status: "active", currentBalance: 100, minimumRequiredPayment: 10, createdBy, createdAt: now(), openingBalanceSnapshotId: `opening-${id}` });
const invite = (workspaceId = "w1", id = "invite1", createdBy = "owner", emailNormalized = "invitee@example.test") => ({
  id,
  workspaceId,
  workspaceName: "Test household",
  emailNormalized,
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
const allowlistEntry = (email, status = "active") => ({ email, status, cohort: 1, addedAt: now(), addedBy: "operator-tool" });

async function seed(callback) {
  await testEnv.withSecurityRulesDisabled(async (context) => callback(context.firestore()));
}

test.before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set - refusing to run beta rules tests outside the dedicated emulator runner."
    );
  }
  const rulesPath = process.env.TRACKTOZERO_V2_RULES_FILE || "firestore.beta.rules";
  const rules = await readFile(resolve(rulesPath), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: EMULATOR_HOST, port: Number(EMULATOR_PORT), rules },
  });
});
test.beforeEach(async () => testEnv.clearFirestore());
test.after(async () => testEnv.cleanup());

// ── Allowlist document access ──────────────────────────────────────────

test("unauthenticated user cannot read any beta_allowlist doc", async () => {
  await seed((db) => db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test")));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(anon.doc("beta_allowlist/approved@example.test").get());
});

test("a signed-in user can read their OWN beta_allowlist doc", async () => {
  await seed((db) => db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test")));
  const approved = testEnv.authenticatedContext("u1", { email: "approved@example.test" }).firestore();
  await assertSucceeds(approved.doc("beta_allowlist/approved@example.test").get());
});

// REGRESSION (found via live Gate-10 QA): a NOT-YET-APPROVED user reading
// their own (nonexistent) beta_allowlist doc must succeed as a normal
// "not found" read, never be denied as permission-denied - the client's
// own "you're on the waitlist" UI depends on being able to tell these two
// outcomes apart. The original rule dereferenced resource.data, which is
// undefined for a missing document, so this read was wrongly denied
// outright before this fix.
test("a signed-in user can read their OWN beta_allowlist doc even when it does NOT exist yet - resolves to not-found, not permission-denied", async () => {
  const notYetApproved = testEnv.authenticatedContext("u1", { email: "not-yet-approved@example.test" }).firestore();
  const snap = await assertSucceeds(notYetApproved.doc("beta_allowlist/not-yet-approved@example.test").get());
  assert.equal(snap.exists, false);
});

test("a signed-in user cannot read someone ELSE's beta_allowlist doc", async () => {
  await seed((db) => db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test")));
  const other = testEnv.authenticatedContext("u2", { email: "other@example.test" }).firestore();
  await assertFails(other.doc("beta_allowlist/approved@example.test").get());
});

test("no client can list/enumerate the beta_allowlist collection", async () => {
  await seed(async (db) => {
    await db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test"));
    await db.doc("beta_allowlist/other@example.test").set(allowlistEntry("other@example.test"));
  });
  const approved = testEnv.authenticatedContext("u1", { email: "approved@example.test" }).firestore();
  await assertFails(approved.collection("beta_allowlist").get());
});

test("no client can create, update, or delete a beta_allowlist doc - not even their own", async () => {
  const approved = testEnv.authenticatedContext("u1", { email: "self-add@example.test" }).firestore();
  await assertFails(approved.doc("beta_allowlist/self-add@example.test").set(allowlistEntry("self-add@example.test")));

  await seed((db) => db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test")));
  const other = testEnv.authenticatedContext("u2", { email: "attacker@example.test" }).firestore();
  await assertFails(other.doc("beta_allowlist/new-victim@example.test").set(allowlistEntry("new-victim@example.test")));
  await assertFails(other.doc("beta_allowlist/approved@example.test").update({ status: "revoked" }));
  await assertFails(other.doc("beta_allowlist/approved@example.test").delete());
});

// ── Workspace bootstrap gate ───────────────────────────────────────────

test("an approved tester CAN bootstrap a personal workspace", async () => {
  await seed((db) => db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test")));
  const approved = testEnv.authenticatedContext("owner", { email: "approved@example.test" }).firestore();
  await assertSucceeds(approved.doc("workspaces/new").set(ws("new", "owner")));
  await assertSucceeds(approved.doc("workspaces/new/members/owner").set(member("new", "owner", "owner")));
  await assertSucceeds(approved.doc("member_index/new_owner").set(member("new", "owner", "owner")));
});

test("an authenticated but UNAPPROVED user cannot bootstrap a workspace at all", async () => {
  const unapproved = testEnv.authenticatedContext("stranger", { email: "not-approved@example.test" }).firestore();
  await assertFails(unapproved.doc("workspaces/new").set(ws("new", "stranger")));
});

test("an unauthenticated user cannot bootstrap a workspace", async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(anon.doc("workspaces/new").set(ws("new", "anon")));
});

test("a REVOKED allowlist entry (status != active) is treated as not approved", async () => {
  await seed((db) => db.doc("beta_allowlist/revoked@example.test").set(allowlistEntry("revoked@example.test", "revoked")));
  const revoked = testEnv.authenticatedContext("u1", { email: "revoked@example.test" }).firestore();
  await assertFails(revoked.doc("workspaces/new").set(ws("new", "u1")));
});

test("being on the allowlist does not by itself grant access to an EXISTING workspace the user is not a member of", async () => {
  await seed(async (db) => {
    await db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test"));
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/debts/d1").set(debt());
  });
  const approvedButNotAMember = testEnv.authenticatedContext("outsider", { email: "approved@example.test" }).firestore();
  await assertFails(approvedButNotAMember.doc("workspaces/w1").get());
  await assertFails(approvedButNotAMember.doc("workspaces/w1/debts/d1").get());
});

// ── Invite acceptance: beta approval AND email binding both required ───

test("an approved tester with the CORRECT invite email can accept", async () => {
  await seed(async (db) => {
    await db.doc("beta_allowlist/approved-owner@example.test").set(allowlistEntry("approved-owner@example.test"));
    await db.doc("beta_allowlist/approved-invitee@example.test").set(allowlistEntry("approved-invitee@example.test"));
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/member_invites/invite1").set(invite("w1", "invite1", "owner", "approved-invitee@example.test"));
  });
  const invitee = testEnv.authenticatedContext("future-user", { email: "approved-invitee@example.test" }).firestore();
  const batch = invitee.batch();
  batch.set(invitee.doc("workspaces/w1/members/future-user"), { workspaceId: "w1", uid: "future-user", role: "viewer", status: "active", createdAt: now(), createdBy: "future-user", acceptedInviteId: "invite1" });
  batch.update(invitee.doc("workspaces/w1/member_invites/invite1"), { status: "accepted", acceptedAt: now(), acceptedByUserId: "future-user" });
  await assertSucceeds(batch.commit());
});

test("an APPROVED tester with the WRONG email is still denied acceptance - beta approval never overrides invite email binding", async () => {
  await seed(async (db) => {
    // The attacker himself IS on the beta allowlist under their own real email -
    // proving approval alone is not sufficient without the matching invite email.
    await db.doc("beta_allowlist/attacker@example.test").set(allowlistEntry("attacker@example.test"));
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/member_invites/invite1").set(invite("w1", "invite1", "owner", "someone-else@example.test"));
  });
  const attacker = testEnv.authenticatedContext("attacker-uid", { email: "attacker@example.test" }).firestore();
  const batch = attacker.batch();
  batch.set(attacker.doc("workspaces/w1/members/attacker-uid"), { workspaceId: "w1", uid: "attacker-uid", role: "viewer", status: "active", createdAt: now(), createdBy: "attacker-uid", acceptedInviteId: "invite1" });
  batch.update(attacker.doc("workspaces/w1/member_invites/invite1"), { status: "accepted", acceptedAt: now(), acceptedByUserId: "attacker-uid" });
  await assertFails(batch.commit());
});

test("an UNAPPROVED user with the correct invite email is still denied acceptance - invite validity alone is not sufficient in beta", async () => {
  await seed(async (db) => {
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/member_invites/invite1").set(invite("w1", "invite1", "owner", "unapproved-invitee@example.test"));
  });
  const invitee = testEnv.authenticatedContext("future-user", { email: "unapproved-invitee@example.test" }).firestore();
  const batch = invitee.batch();
  batch.set(invitee.doc("workspaces/w1/members/future-user"), { workspaceId: "w1", uid: "future-user", role: "viewer", status: "active", createdAt: now(), createdBy: "future-user", acceptedInviteId: "invite1" });
  batch.update(invitee.doc("workspaces/w1/member_invites/invite1"), { status: "accepted", acceptedAt: now(), acceptedByUserId: "future-user" });
  await assertFails(batch.commit());
});

// ── Representative smoke: ordinary V2 behavior still works once approved ─

test("smoke: an approved, already-a-member tester can still create a debt normally (the gate doesn't break ordinary financial writes)", async () => {
  await seed(async (db) => {
    await db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test"));
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
  });
  const owner = testEnv.authenticatedContext("owner", { email: "approved@example.test" }).firestore();
  const batch = owner.batch();
  batch.set(owner.doc("workspaces/w1/debts/d1"), debt());
  batch.set(owner.doc("workspaces/w1/debts/d1/balance_snapshots/opening-d1"), { id: "opening-d1", workspaceId: "w1", debtId: "d1", balance: 100, observedAt: now(), source: "manual", createdAt: now(), createdBy: "owner" });
  await assertSucceeds(batch.commit());
});

test("smoke: Viewer role still cannot write, regardless of beta approval", async () => {
  await seed(async (db) => {
    await db.doc("beta_allowlist/approved@example.test").set(allowlistEntry("approved@example.test"));
    await db.doc("workspaces/w1").set(ws("w1", "owner"));
    await db.doc("workspaces/w1/members/owner").set(member("w1", "owner", "owner"));
    await db.doc("workspaces/w1/members/viewer").set(member("w1", "viewer", "viewer"));
  });
  const viewer = testEnv.authenticatedContext("viewer", { email: "approved@example.test" }).firestore();
  await assertFails(viewer.doc("workspaces/w1/debts/d1").set(debt()));
});
