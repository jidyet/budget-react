import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-budget-react";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;

let testEnv;

function householdRoot({
  ownerId,
  ownerEmail = `${ownerId}@example.com`,
  joinMode = "approval",
  memberIds = [ownerId],
  memberCount = memberIds.length,
  name = "Test household",
  description = "Shared budget",
  joinCode = "ABC123",
  updatedBy = ownerId,
  updatedByLabel = "Owner User",
  dailyMessage = "Keep going",
} = {}) {
  const now = new Date();
  return {
    name,
    description,
    joinMode,
    joinCode,
    ownerId,
    ownerEmail,
    memberCount,
    memberIds,
    active: true,
    createdAt: now,
    updatedAt: now,
    updatedBy,
    updatedByLabel,
    dailyMessage,
  };
}

function householdDirectory({
  householdId = "home-1",
  ownerId,
  joinMode = "approval",
  memberCount = 1,
  name = "Test household",
  description = "Shared budget",
  joinCode = "ABC123",
} = {}) {
  const now = new Date();
  return {
    householdId,
    ownerId,
    name,
    nameLower: String(name || "").toLowerCase(),
    description,
    joinMode,
    joinCode,
    memberCount,
    active: true,
    updatedAt: now,
  };
}

function memberDoc({
  uid,
  role = "member",
  status = "active",
  label = "Member User",
  displayName = "Member User",
  email = `${uid}@example.com`,
} = {}) {
  const now = new Date();
  return {
    uid,
    role,
    status,
    label,
    displayName,
    email,
    photoURL: "",
    avatarColor: "#14b8a6",
    joinedAt: now,
    updatedAt: now,
  };
}

function feedbackDoc({
  userId,
  category = "bug",
  rating = 4,
  message = "This helped a lot.",
  page = "overview",
  userEmail = `${userId}@example.com`,
  userLabel = "Test User",
  workspaceMode = "solo",
} = {}) {
  const now = new Date();
  return {
    userId,
    userEmail,
    userLabel,
    page,
    category,
    rating,
    message,
    whatConfused: "Nothing major",
    whatHelped: "The dashboard",
    whatShouldChange: "Keep the flow simple",
    workspaceMode,
    version: "0.0.0-test",
    build: "test-build",
    status: "new",
    createdAt: now,
  };
}

async function seedData(callback) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await callback(db);
  });
}

test.before(async () => {
  const rules = await readFile(resolve("firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules,
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

test.after(async () => {
  await testEnv.cleanup();
});

test("signed-out users cannot read private user data", async () => {
  await seedData(async (db) => {
    await db.doc("users/alice/profile/main").set({ displayName: "Alice" });
  });

  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.doc("users/alice/profile/main").get());
});

test("users can read and write their own private user data", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();

  await assertSucceeds(
    db.doc("users/alice/profile/main").set({
      displayName: "Alice",
      updatedAt: new Date(),
    })
  );
  await assertSucceeds(db.doc("users/alice/profile/main").get());
});

test("users cannot read another user's private data", async () => {
  await seedData(async (db) => {
    await db.doc("users/alice/profile/main").set({ displayName: "Alice" });
  });

  const db = testEnv.authenticatedContext("bob").firestore();
  await assertFails(db.doc("users/alice/profile/main").get());
});

test("non-members can read active household roots but not member docs", async () => {
  await seedData(async (db) => {
    await db.doc("households/home-1").set(householdRoot({ ownerId: "owner-1" }));
    await db
      .doc("households/home-1/members/owner-1")
      .set(memberDoc({ uid: "owner-1", role: "owner" }));
  });

  const db = testEnv.authenticatedContext("outsider").firestore();
  await assertSucceeds(db.doc("households/home-1").get());
  await assertFails(db.doc("households/home-1/members/owner-1").get());
});

test("owners can create a valid household root document", async () => {
  const db = testEnv.authenticatedContext("owner-1").firestore();

  await assertSucceeds(
    db.doc("households/home-1").set(householdRoot({ ownerId: "owner-1" }))
  );
});

test("users cannot create a household root with a mismatched owner", async () => {
  const db = testEnv.authenticatedContext("owner-1").firestore();

  await assertFails(
    db.doc("households/home-1").set(householdRoot({ ownerId: "someone-else" }))
  );
});

test("open join lets a user create only their own member doc", async () => {
  await seedData(async (db) => {
    await db.doc("households/open-home").set(
      householdRoot({
        ownerId: "owner-1",
        joinMode: "open",
        memberIds: ["owner-1"],
        memberCount: 1,
        joinCode: "OPEN12",
        updatedByLabel: "Owner User",
      })
    );
    await db
      .doc("households/open-home/members/owner-1")
      .set(memberDoc({ uid: "owner-1", role: "owner", label: "Owner User", displayName: "Owner User" }));
    await db
      .doc("householdDirectory/open-home")
      .set(householdDirectory({ householdId: "open-home", ownerId: "owner-1", joinMode: "open", joinCode: "OPEN12" }));
  });

  const joinerDb = testEnv.authenticatedContext("joiner-1").firestore();

  await assertSucceeds(
    joinerDb
      .doc("households/open-home/members/joiner-1")
      .set(memberDoc({ uid: "joiner-1", role: "member", label: "Joiner User", displayName: "Joiner User" }))
  );

  await assertFails(
    joinerDb
      .doc("households/open-home/members/someone-else")
      .set(memberDoc({ uid: "someone-else", role: "member", label: "Wrong User", displayName: "Wrong User" }))
  );
});

test("pending invite lets a user join an approval household", async () => {
  await seedData(async (db) => {
    await db.doc("households/invite-home").set(
      householdRoot({
        ownerId: "owner-1",
        joinMode: "approval",
        memberIds: ["owner-1"],
        memberCount: 1,
        joinCode: "INV123",
        updatedByLabel: "Owner User",
      })
    );
    await db
      .doc("households/invite-home/members/owner-1")
      .set(memberDoc({ uid: "owner-1", role: "owner", label: "Owner User", displayName: "Owner User" }));
    await db
      .doc("householdDirectory/invite-home")
      .set(householdDirectory({ householdId: "invite-home", ownerId: "owner-1", joinMode: "approval", joinCode: "INV123" }));
    await db
      .doc("users/joiner-1/invites/invite-home")
      .set({
        householdId: "invite-home",
        householdName: "Test household",
        householdDescription: "Shared budget",
        joinCode: "INV123",
        joinMode: "approval",
        invitedByUid: "owner-1",
        invitedByEmail: "owner-1@example.com",
        invitedByName: "Owner User",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  });

  const joinerDb = testEnv.authenticatedContext("joiner-1").firestore();

  await assertSucceeds(
    joinerDb.doc("households/invite-home").update({
      memberIds: ["owner-1", "joiner-1"],
      memberCount: 2,
      updatedAt: new Date(),
      updatedBy: "joiner-1",
      updatedByLabel: "Joiner User",
    })
  );

  await assertSucceeds(
    joinerDb
      .doc("householdDirectory/invite-home")
      .update({
        householdId: "invite-home",
        ownerId: "owner-1",
        name: "Test household",
        nameLower: "test household",
        description: "Shared budget",
        joinCode: "INV123",
        joinMode: "approval",
        memberCount: 2,
        active: true,
        updatedAt: new Date(),
      })
  );

  await assertSucceeds(
    joinerDb
      .doc("households/invite-home/members/joiner-1")
      .set(memberDoc({ uid: "joiner-1", role: "member", label: "Joiner User", displayName: "Joiner User" }))
  );
});

test("members cannot promote themselves to owner", async () => {
  await seedData(async (db) => {
    await db.doc("households/home-1").set(
      householdRoot({
        ownerId: "owner-1",
        memberIds: ["owner-1", "member-1"],
        memberCount: 2,
      })
    );
    await db
      .doc("households/home-1/members/owner-1")
      .set(memberDoc({ uid: "owner-1", role: "owner", label: "Owner User", displayName: "Owner User" }));
    await db
      .doc("households/home-1/members/member-1")
      .set(memberDoc({ uid: "member-1", role: "member", label: "Member User", displayName: "Member User" }));
  });

  const memberDb = testEnv.authenticatedContext("member-1").firestore();

  await assertFails(
    memberDb.doc("households/home-1/members/member-1").update({
      role: "owner",
      updatedAt: new Date(),
    })
  );
});

test("admins cannot update the owner's member document", async () => {
  await seedData(async (db) => {
    await db.doc("households/home-1").set(
      householdRoot({
        ownerId: "owner-1",
        memberIds: ["owner-1", "admin-1"],
        memberCount: 2,
      })
    );
    await db
      .doc("households/home-1/members/owner-1")
      .set(memberDoc({ uid: "owner-1", role: "owner", label: "Owner User", displayName: "Owner" }));
    await db
      .doc("households/home-1/members/admin-1")
      .set(memberDoc({ uid: "admin-1", role: "admin", label: "Admin User", displayName: "Admin" }));
  });

  const adminDb = testEnv.authenticatedContext("admin-1").firestore();

  await assertFails(
    adminDb.doc("households/home-1/members/owner-1").update({
      displayName: "Changed owner name",
      updatedAt: new Date(),
    })
  );
});

test("feedback is private to the submitting user", async () => {
  const aliceDb = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(
    aliceDb.doc("feedback/fb-1").set(
      feedbackDoc({
        userId: "alice",
        userEmail: "alice@example.com",
        userLabel: "Alice",
      })
    )
  );
  await assertSucceeds(aliceDb.doc("feedback/fb-1").get());

  const bobDb = testEnv.authenticatedContext("bob").firestore();
  await assertFails(bobDb.doc("feedback/fb-1").get());
  await assertFails(
    bobDb.doc("feedback/fb-2").set(
      feedbackDoc({
        userId: "alice",
        userEmail: "alice@example.com",
        userLabel: "Alice",
      })
    )
  );
});
