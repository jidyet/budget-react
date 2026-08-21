import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService, getUserSafeTrackToZeroError } from "./v2AsyncApplicationService";
import { V2_DATA_MODES } from "./v2ApplicationService";

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

describe("TrackToZero v2 async application service", () => {
  it("loads the same command-center snapshot through async repository calls", async () => {
    const { service } = makeService();
    const snapshot = await service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.workspace.id).toBe("personal-seed");
    expect(snapshot.activeContext.plan.id).toBe("personal-plan");
    expect(snapshot.activeContext.version.id).toBe("personal-version-1");
    expect(snapshot.targetDebt).toBeTruthy();
    expect(snapshot.projectedZeroDate).toBeTruthy();
    expect(snapshot.balanceHistoryByDebt["personal-capital-one"]).toHaveLength(3);
    // Expected schedules use the engine's "Mon YYYY" labels. Normalized
    // checkpoint matching puts this seed slightly behind, not in review.
    expect(snapshot.status.code).toBe("slightly_behind");
  });

  it("returns bounded, workspace-scoped raw records for the Activity feed (UX-7)", async () => {
    const { service } = makeService();
    const page = await service.getActivityFeed("personal-seed", { limit: 2 });
    expect(page.records.balanceSnapshots.length).toBeGreaterThan(0);
    // Bounded per-debt, not unbounded: no single debt's snapshot history in
    // this page can exceed (cursor + limit) even though the seed carries
    // more history than that for personal-capital-one.
    const perDebtCounts = page.records.balanceSnapshots.reduce((counts, snap) => {
      counts[snap.debtId] = (counts[snap.debtId] || 0) + 1;
      return counts;
    }, {});
    expect(Object.values(perDebtCounts).every((count) => count <= 2)).toBe(true);
    expect(page.members.length).toBeGreaterThan(0);
    expect(page.limit).toBe(2);
    expect(page.cursor).toBe(0);
    // personal-capital-one has more than 2 balance snapshots in the seed, so
    // a limit:2 page must NOT claim it already has everything.
    expect(page.exhausted).toBe(false);

    const bigPage = await service.getActivityFeed("personal-seed", { limit: 100 });
    expect(bigPage.exhausted).toBe(true);
  });

  it("persists a real projectedZeroDate on newly created and reforecast PlanVersions (UX-7)", async () => {
    const { repository, service } = makeService();
    await service.createNewDebt("personal-seed", {
      name: "Fresh Card", ownerType: "member", currentBalance: 1000, apr: 0.2, minimumRequiredPayment: 50,
    });
    const { version } = await service.createDraftPlan("personal-seed", { strategy: "avalanche", extraMonthlyPayment: 50 });
    expect(version.projectedZeroDate).toBeTruthy();

    const reforecast = await service.applyReforecast("personal-seed", { extraMonthlyPayment: 75 });
    expect(reforecast.version.projectedZeroDate).toBeTruthy();
    expect(repository.getPlanVersion("personal-seed", "personal-plan", reforecast.version.id).projectedZeroDate).toBe(reforecast.version.projectedZeroDate);
  });

  it("keeps legacy preview mode read-only in async runtime", async () => {
    const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
    const service = createTrackToZeroV2AsyncAppService({
      repository,
      actorId: "seed-owner",
      mode: V2_DATA_MODES.legacyPreview,
      asOf: V2_TEST_NOW,
    });
    await expect(service.recordPayment("personal-seed", "personal-sofi", { amount: 10 })).rejects.toThrow(/read-only/i);
    expect(repository.listPaymentEvents("personal-seed", "personal-sofi")).toHaveLength(0);
  });

  it("bootstraps personal and household owner workspaces idempotently", async () => {
    const repository = new InMemoryTrackToZeroRepository();
    const service = createTrackToZeroV2AsyncAppService({ repository, actorId: "owner-a", asOf: V2_TEST_NOW });

    await service.bootstrapOwnerWorkspace("personal-owner-a", { type: "personal", displayName: "Owner A", email: "owner@example.test" });
    await service.bootstrapOwnerWorkspace("personal-owner-a", { type: "personal", displayName: "Owner A", email: "owner@example.test" });
    await service.bootstrapOwnerWorkspace("household-owner-a", { type: "household", displayName: "Owner A", email: "owner@example.test" });

    expect(repository.listWorkspaces().map((workspace) => workspace.id).sort()).toEqual(["household-owner-a", "personal-owner-a"]);
    expect(repository.listMemberships("personal-owner-a")).toHaveLength(1);
    expect(repository.listMemberships("personal-owner-a")[0]).toMatchObject({ uid: "owner-a", role: "owner" });
    expect(repository.listMemberships("household-owner-a")[0]).toMatchObject({ uid: "owner-a", role: "owner" });
  });

  it("creates pending member invites without granting membership access", async () => {
    const repository = new InMemoryTrackToZeroRepository();
    const ownerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "owner-a", asOf: V2_TEST_NOW });
    await ownerService.bootstrapOwnerWorkspace("household-owner-a", { type: "household", displayName: "Owner A", email: "owner@example.test" });

    const invite = await ownerService.createMemberInvite("household-owner-a", { email: "future@example.test", role: "viewer" });

    expect(invite).toMatchObject({ status: "pending", role: "viewer", emailNormalized: "future@example.test", delivery: "copy_link" });
    expect(invite.joinUrl).toContain("/join?workspace=household-owner-a&token=");
    expect(repository.listMemberInvites("household-owner-a")).toHaveLength(1);
    expect(repository.getMembership("household-owner-a", "future-user")).toBeNull();
    const futureService = createTrackToZeroV2AsyncAppService({ repository, actorId: "future-user", asOf: V2_TEST_NOW });
    await expect(futureService.getWorkspaceSnapshot("household-owner-a")).rejects.toThrow(/not a member/i);
  });

  it("accepts a valid invite exactly once and never creates duplicate memberships", async () => {
    const repository = new InMemoryTrackToZeroRepository();
    const ownerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "owner-a", asOf: V2_TEST_NOW });
    await ownerService.bootstrapOwnerWorkspace("household-owner-a", { type: "household", displayName: "Owner A", email: "owner@example.test" });
    const invite = await ownerService.createMemberInvite("household-owner-a", { email: "future@example.test", role: "viewer" });
    const token = new URL(`https://tracktozero.test${invite.joinUrl}`).searchParams.get("token");
    const futureService = createTrackToZeroV2AsyncAppService({ repository, actorId: "future-user", asOf: V2_TEST_NOW });

    const accepted = await futureService.acceptMemberInvite("household-owner-a", {
      token,
      displayName: "Future User",
      email: "future@example.test",
    });
    expect(accepted.membership).toMatchObject({ workspaceId: "household-owner-a", uid: "future-user", role: "viewer", acceptedInviteId: invite.id });
    expect(repository.listMemberships("household-owner-a").filter((membership) => membership.uid === "future-user")).toHaveLength(1);

    const acceptedAgain = await futureService.acceptMemberInvite("household-owner-a", {
      token,
      displayName: "Future User",
      email: "future@example.test",
    });
    expect(acceptedAgain.alreadyAccepted).toBe(true);
    expect(repository.listMemberships("household-owner-a").filter((membership) => membership.uid === "future-user")).toHaveLength(1);
  });

  it("blocks invite acceptance when the signed-in email does not match the invited email", async () => {
    const repository = new InMemoryTrackToZeroRepository();
    const ownerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "owner-a", asOf: V2_TEST_NOW });
    await ownerService.bootstrapOwnerWorkspace("household-owner-a", { type: "household", displayName: "Owner A", email: "owner@example.test" });
    const invite = await ownerService.createMemberInvite("household-owner-a", { email: "future@example.test", role: "viewer" });
    const token = new URL(`https://tracktozero.test${invite.joinUrl}`).searchParams.get("token");
    const futureService = createTrackToZeroV2AsyncAppService({ repository, actorId: "future-user", asOf: V2_TEST_NOW });

    await expect(futureService.acceptMemberInvite("household-owner-a", {
      token,
      displayName: "Future User",
      email: "other@example.test",
    })).rejects.toThrow(/future@example\.test/i);
    expect(repository.getMembership("household-owner-a", "future-user")).toBeNull();
  });

  it("creates manual debts with an opening balance snapshot and preserves APR/mortgage truth", async () => {
    const { repository, service } = makeService();

    const debt = await service.createNewDebt("personal-seed", {
      clientRequestId: "manual-card-001",
      name: "Manual Card",
      debtType: "credit_card",
      currentBalance: 300,
      balanceAsOf: "2026-08-10T00:00:00.000Z",
      minimumRequiredPayment: 30,
      aprStatus: "unknown",
      apr: null,
      includedInCorePayoffPlan: true,
    });

    expect(debt.id).toBe("debt-manual-card-001");
    expect(debt.apr).toBeNull();
    expect(debt.aprStatus).toBe("unknown");
    expect(debt.openingBalanceSnapshotId).toBe(`opening-${debt.id}`);
    const snapshots = repository.listBalanceSnapshots("personal-seed", debt.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      id: debt.openingBalanceSnapshotId,
      debtId: debt.id,
      balance: 300,
      observedAt: "2026-08-10T00:00:00.000Z",
      source: "manual",
      createdBy: "seed-owner",
    });

    const mortgage = await service.createNewDebt("personal-seed", {
      clientRequestId: "manual-mortgage-001",
      name: "Optional Mortgage",
      debtType: "mortgage",
      currentBalance: 250000,
      minimumRequiredPayment: 1800,
      aprStatus: "known",
      apr: 6.1,
    });
    expect(mortgage.includedInCorePayoffPlan).toBe(false);
  });

  it("UX-9: an omitted minimum payment stays unknown (null), never a silent confirmed $0, through both creation and later edit", async () => {
    const { service } = makeService();

    const debt = await service.createNewDebt("personal-seed", {
      clientRequestId: "manual-unknown-min-001",
      name: "Unknown Minimum Card",
      debtType: "credit_card",
      currentBalance: 400,
      minimumRequiredPayment: 45,
      aprStatus: "unknown",
    });
    expect(debt.minimumRequiredPayment).toBe(45);

    // Editing the debt to explicitly null out a previously-known minimum
    // payment (the Review & edit drawer's blank-field case) must clear it
    // to unknown, not coerce it back to a confirmed $0.
    const cleared = await service.updateDebt("personal-seed", debt.id, { minimumRequiredPayment: null });
    expect(cleared.minimumRequiredPayment).toBeNull();
  });

  it("keeps manual debt creation idempotent for the same client request", async () => {
    const { repository, service } = makeService();

    const input = {
      clientRequestId: "retry-card-001",
      name: "Retry Card",
      debtType: "credit_card",
      currentBalance: 500,
      minimumRequiredPayment: 50,
      aprStatus: "known",
      apr: 17.99,
    };
    const first = await service.createNewDebt("personal-seed", input);
    const second = await service.createNewDebt("personal-seed", input);

    expect(second.id).toBe(first.id);
    expect(repository.listDebts("personal-seed").filter((debt) => debt.id === first.id)).toHaveLength(1);
    expect(repository.listBalanceSnapshots("personal-seed", first.id).filter((snapshot) => snapshot.id === first.openingBalanceSnapshotId)).toHaveLength(1);
  });

  it("runs a full import review -> approval -> commit cycle and never creates a Debt before explicit confirmation", async () => {
    const { repository, service } = makeService();
    const candidate = {
      candidateId: "cand-1",
      source: "excel",
      creditorName: "SoFi",
      accountName: "SoFi Loan",
      debtType: "personal_loan",
      currentBalance: 4000,
      statementDate: null,
      apr: null,
      aprStatus: "unknown",
      minimumPayment: 100,
      dueDate: null,
      ownerSuggestion: "",
      includedInCorePayoffPlan: true,
      warnings: [],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const debtsBefore = repository.listDebts("personal-seed").length;

    const batch = await service.createImportBatch("personal-seed", { sourceType: "excel", sourceFilename: "import.xlsx", candidates: [candidate], warnings: ["APR column not found"] });
    expect(batch.status).toBe("review_required");
    // Parsing/review alone must never create authoritative debts.
    expect(repository.listDebts("personal-seed")).toHaveLength(debtsBefore);

    const excluded = await service.decideImportCandidate("personal-seed", batch.id, "cand-1", { decision: "excluded" });
    expect(excluded.rejectedCount).toBe(1);
    expect(repository.listDebts("personal-seed")).toHaveLength(debtsBefore);

    const confirmed = await service.decideImportCandidate("personal-seed", batch.id, "cand-1", { decision: "confirmed" });
    expect(confirmed.confirmedCount).toBe(1);
    expect(repository.listDebts("personal-seed")).toHaveLength(debtsBefore);

    const { batch: committed, createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(committed.status).toBe("committed");
    expect(createdDebts).toHaveLength(1);
    expect(createdDebts[0].name).toBe("SoFi Loan");
    expect(createdDebts[0].aprStatus).toBe("unknown");
    expect(createdDebts[0].apr).toBeNull();
    const snapshot = repository.listBalanceSnapshots("personal-seed", createdDebts[0].id)[0];
    expect(snapshot).toMatchObject({ balance: 4000, source: "import" });
    expect(repository.listPaymentEvents?.("personal-seed", createdDebts[0].id) || []).toHaveLength(0);
    expect(repository.listDebts("personal-seed")).toHaveLength(debtsBefore + 1);

    // Idempotent retry: committing the same already-committed batch again changes nothing.
    const retry = await service.commitImportBatch("personal-seed", batch.id);
    expect(retry.createdDebts).toHaveLength(0);
    expect(repository.listDebts("personal-seed")).toHaveLength(debtsBefore + 1);
    expect(repository.listBalanceSnapshots("personal-seed", createdDebts[0].id)).toHaveLength(1);
  });

  it("UX-9: a committed import candidate with no parsed minimum payment stores unknown (null), never a silent confirmed $0", async () => {
    const { repository, service } = makeService();
    const candidate = {
      candidateId: "cand-no-min",
      source: "excel",
      creditorName: "Discover",
      accountName: "Discover Card",
      debtType: "credit_card",
      currentBalance: 900,
      statementDate: null,
      apr: null,
      aprStatus: "unknown",
      minimumPayment: null,
      dueDate: null,
      ownerSuggestion: "",
      includedInCorePayoffPlan: true,
      warnings: [],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const batch = await service.createImportBatch("personal-seed", { sourceType: "excel", sourceFilename: "import2.xlsx", candidates: [candidate], warnings: [] });
    await service.decideImportCandidate("personal-seed", batch.id, "cand-no-min", { decision: "confirmed" });
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);

    expect(createdDebts[0].minimumRequiredPayment).toBeNull();
    expect(repository.listDebts("personal-seed").find((debt) => debt.id === createdDebts[0].id).minimumRequiredPayment).toBeNull();
  });

  it("denies import creation for a role without manageDebts permission", async () => {
    const { service } = makeService("seed-contributor");
    await expect(service.createImportBatch("household-seed", { sourceType: "excel", sourceFilename: "x.xlsx", candidates: [] })).rejects.toThrow(/cannot import/i);
  });

  it("completes the fresh first-plan flow: preview is zero-write, activation creates PlanVersion 1 + checkpoints + activePlanId, and no PaymentEvents are fabricated", async () => {
    const repository = new InMemoryTrackToZeroRepository();
    const service = createTrackToZeroV2AsyncAppService({ repository, actorId: "owner-a", asOf: V2_TEST_NOW });
    await service.bootstrapOwnerWorkspace("ws-fresh", { type: "personal", displayName: "Owner A" });
    const debt = await service.createNewDebt("ws-fresh", {
      clientRequestId: "first-debt",
      name: "Chase Card",
      debtType: "credit_card",
      currentBalance: 1000,
      minimumRequiredPayment: 30,
      aprStatus: "known",
      apr: 22,
      includedInCorePayoffPlan: true,
    });

    const preview = await service.previewDraftPlan("ws-fresh", { strategy: "avalanche", extraMonthlyPayment: 50 });
    expect(preview.startingTotalBalance).toBe(1000);
    expect(preview.payoffOrder.map((d) => d.id)).toEqual([debt.id]);
    expect(preview.monthsToZero).toBeGreaterThan(0);
    // Preview must not create anything - no plans/versions/checkpoints yet.
    expect(repository.listPlans("ws-fresh")).toHaveLength(0);
    expect(repository.getWorkspace("ws-fresh").activePlanId).toBe("");

    const { plan, version } = await service.createDraftPlan("ws-fresh", { strategy: "avalanche", extraMonthlyPayment: 50 });
    await service.activatePlan("ws-fresh", plan.id, version.id);

    const workspace = repository.getWorkspace("ws-fresh");
    expect(workspace.activePlanId).toBe(plan.id);
    const versions = repository.listPlanVersions("ws-fresh", plan.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(repository.listExpectedCheckpoints("ws-fresh", plan.id, version.id).length).toBeGreaterThan(0);
    expect(repository.listPaymentEvents("ws-fresh", debt.id)).toHaveLength(0);
    expect(() => repository.updatePlanVersion()).toThrow(/immutable/i);

    const snapshot = await service.getWorkspaceSnapshot("ws-fresh");
    expect(snapshot.activeContext.plan.id).toBe(plan.id);
    expect(snapshot.status.code).toBeTruthy();
  });

  it("previewDraftPlan performs zero writes even when called repeatedly with different strategies", async () => {
    const { repository, service } = makeService();
    await service.previewDraftPlan("personal-seed", { strategy: "snowball", extraMonthlyPayment: 25 });
    await service.previewDraftPlan("personal-seed", { strategy: "avalanche", extraMonthlyPayment: 200 });
    expect(repository.listPlans("personal-seed")).toHaveLength(1); // only the pre-seeded plan, nothing added
  });

  it("records payment and balance append-only facts with actor attribution", async () => {
    const { repository, service } = makeService("seed-contributor");
    const payment = await service.recordPayment("household-seed", "household-samsung", { amount: 40, notes: "paid from app" });
    const snapshot = await service.recordBalanceSnapshot("household-seed", "household-samsung", { balance: 470 });

    expect(payment.createdBy).toBe("seed-contributor");
    expect(payment.source).toBe("manual");
    expect(snapshot.createdBy).toBe("seed-contributor");
    expect(repository.listPaymentEvents("household-seed", "household-samsung")[0].id).toBe(payment.id);
    expect(repository.listBalanceSnapshots("household-seed", "household-samsung")[0].id).toBe(snapshot.id);
    expect(repository.listBalanceSnapshots("household-seed", "household-samsung").length).toBeGreaterThan(1);
  });

  it("applies reforecast through atomic repository boundary and preserves the prior version", async () => {
    const { repository, service } = makeService();
    const before = repository.listPlanVersions("personal-seed", "personal-plan");
    const applied = await service.applyReforecast("personal-seed", { extraMonthlyPayment: 275 });
    const after = repository.listPlanVersions("personal-seed", "personal-plan");

    expect(after).toHaveLength(before.length + 1);
    expect(after[0]).toEqual(before[0]);
    expect(applied.workspace.activePlanId).toBe("personal-plan");
    expect(applied.plan.activeVersionId).toBe(after.at(-1).id);
  });

  it("translates permission and repository failures into safe UI language", () => {
    expect(getUserSafeTrackToZeroError({ code: "permission-denied", message: "FirebaseError: Missing or insufficient permissions" })).toEqual({
      kind: "permission_denied",
      message: "This account does not have access to that TrackToZero workspace or action.",
    });
    expect(getUserSafeTrackToZeroError(new Error("FIRESTORE_EMULATOR_HOST missing")).message).toMatch(/temporarily unavailable/);
  });
});

describe("TrackToZero v2 async application service: zero-balance debt must never become the current target (regression)", () => {
  const zeroOutDebt = (repository, debt) => {
    repository.saveDebt({ ...debt, currentBalance: 0 });
    repository.createBalanceSnapshot({
      id: `snap-zero-${debt.id}-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: debt.workspaceId,
      debtId: debt.id,
      balance: 0,
      observedAt: V2_TEST_NOW,
      createdBy: "seed-owner",
    });
  };

  it("REPRODUCTION: with no active plan, a $0 balance debt sitting first in the list must not be shown as targetDebt", async () => {
    const { repository, service } = makeService();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    zeroOutDebt(repository, repository.listDebts("personal-seed")[0]);

    const snapshot = await service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.targetDebt?.name).toBe("SoFi Personal Loan");
  });

  it("with no active plan and every included debt already paid off, targetDebt is null rather than any zero-balance debt", async () => {
    const { repository, service } = makeService();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    for (const debt of repository.listDebts("personal-seed")) {
      zeroOutDebt(repository, debt);
    }
    const snapshot = await service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.targetDebt).toBeNull();
  });
});

describe("TrackToZero v2 async application service: household ownership foundation", () => {
  it("Personal workspace always assigns the new debt to the signed-in member, ignoring any owner input", async () => {
    const { service } = makeService();
    const debt = await service.createNewDebt("personal-seed", {
      name: "New Card",
      currentBalance: 500,
      minimumRequiredPayment: 25,
      aprStatus: "unknown",
      ownerType: "joint",
      ownerId: "someone-else",
    });
    expect(debt.ownerType).toBe("member");
    expect(debt.ownerId).toBe("seed-owner");
    expect(debt.ownerLabel).toBe("You");
  });

  it("Household workspace resolves a verified member selection to that member's real display name, and rejects an unverified id", async () => {
    const { service } = makeService();
    const debt = await service.createNewDebt("household-seed", {
      name: "Shared Card",
      currentBalance: 500,
      minimumRequiredPayment: 25,
      aprStatus: "unknown",
      ownerType: "member",
      ownerId: "seed-admin",
    });
    expect(debt.ownerId).toBe("seed-admin");
    expect(debt.ownerLabel).toBe("Baba");

    await expect(
      service.createNewDebt("household-seed", {
        name: "Sketchy Debt",
        currentBalance: 500,
        minimumRequiredPayment: 25,
        aprStatus: "unknown",
        ownerType: "member",
        ownerId: "not-a-real-member",
      })
    ).rejects.toThrow(/verified household member/i);
  });

  it("commitImportBatch never lets the parser's raw ownerSuggestion become the authoritative owner", async () => {
    const { repository, service } = makeService();
    const candidate = {
      candidateId: "cand-owner-1",
      source: "pdf",
      creditorName: "Chase",
      accountName: "Chase Card",
      debtType: "credit_card",
      currentBalance: 900,
      apr: null,
      aprStatus: "unknown",
      minimumPayment: 40,
      dueDate: null,
      ownerSuggestion: "For Undeliverable Mail Only",
      ownerType: "member",
      ownerId: "seed-admin",
      includedInCorePayoffPlan: true,
      warnings: [],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "chase.pdf", candidates: [candidate] });
    await service.decideImportCandidate("household-seed", batch.id, "cand-owner-1", { decision: "confirmed" });
    const { createdDebts } = await service.commitImportBatch("household-seed", batch.id);

    expect(createdDebts).toHaveLength(1);
    expect(createdDebts[0].ownerLabel).not.toMatch(/undeliverable/i);
    expect(createdDebts[0].ownerId).toBe("seed-admin");
    expect(createdDebts[0].ownerLabel).toBe("Baba");
    expect((await repository.listDebts("household-seed")).find((debt) => debt.id === createdDebts[0].id).ownerLabel).toBe("Baba");
  });

  it("household ownership survives persistence through the async repository boundary", async () => {
    const { repository, service } = makeService();
    const debt = await service.createNewDebt("household-seed", {
      name: "Persisted Card",
      currentBalance: 250,
      minimumRequiredPayment: 15,
      aprStatus: "unknown",
      ownerType: "member",
      ownerId: "seed-contributor",
    });
    const reloaded = (await repository.listDebts("household-seed")).find((candidate) => candidate.id === debt.id);
    expect(reloaded.ownerType).toBe("member");
    expect(reloaded.ownerId).toBe("seed-contributor");
    expect(reloaded.ownerLabel).toBe("Contributor");
  });

  it("household summary totals count every included debt exactly once, and Personal workspaces get empty ownership breakdowns", async () => {
    const { repository, service } = makeService();
    repository.putWorkspace({ ...repository.getWorkspace("household-seed"), activePlanId: "" });
    await service.createNewDebt("household-seed", { name: "Admin Debt", currentBalance: 1000, minimumRequiredPayment: 25, aprStatus: "unknown", ownerType: "member", ownerId: "seed-admin" });
    await service.createNewDebt("household-seed", { name: "Joint Debt", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "unknown", ownerType: "joint" });

    const snapshot = await service.getWorkspaceSnapshot("household-seed");
    const summary = snapshot.portfolioSummary;
    expect(summary.includedDebt).toBe(snapshot.totalIncludedDebt);
    const bucketTotal = summary.memberDebt.reduce((sum, member) => sum + member.total, 0) + summary.jointDebt + summary.unassignedDebt;
    expect(bucketTotal).toBeCloseTo(summary.includedDebt, 2);
    expect(summary.jointDebt).toBeGreaterThanOrEqual(500);

    const personalSnapshot = await service.getWorkspaceSnapshot("personal-seed");
    expect(personalSnapshot.portfolioSummary.memberDebt).toEqual([]);
    expect(personalSnapshot.portfolioSummary.jointDebt).toBe(0);
  });
});

describe("TrackToZero v2 async application service: payoff queue ordering", () => {
  it("payoffQueue matches previewDraftPlan's order for the same strategy (single shared sort, no drift between sync/async)", async () => {
    const { service } = makeService();
    // household-seed's active plan already uses "snowball" - preview with the
    // SAME strategy so this is a fair apples-to-apples order comparison.
    const preview = await service.previewDraftPlan("household-seed", { strategy: "snowball" });
    const snapshot = await service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.activeContext.version.strategy).toBe("snowball");
    expect(snapshot.payoffQueue.map((d) => d.id)).toEqual(preview.payoffOrder.map((d) => d.id));
  });

  it("a Joint-owned debt appears exactly once in the async payoff queue", async () => {
    const { repository, service } = makeService();
    await Promise.resolve(repository.putWorkspace({ ...repository.getWorkspace("household-seed"), activePlanId: "" }));
    const joint = await service.createNewDebt("household-seed", { name: "Joint Queue Debt", currentBalance: 300, minimumRequiredPayment: 20, aprStatus: "unknown", ownerType: "joint" });
    const snapshot = await service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.payoffQueue.filter((debt) => debt.id === joint.id)).toHaveLength(1);
  });
});

describe("TrackToZero v2 async application service: import owner auto-suggest (convenience pre-fill, still human-confirmed)", () => {
  it("pre-selects a verified household member when the parser's ownerSuggestion matches their real name", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "pdf",
      sourceFilename: "boa.pdf",
      candidates: [{
        candidateId: "cand-suggest-1",
        source: "pdf",
        creditorName: "Bank of America",
        accountName: "BOA Visa",
        debtType: "credit_card",
        currentBalance: 11184.44,
        apr: null,
        aprStatus: "unknown",
        minimumPayment: 357,
        dueDate: null,
        ownerSuggestion: "Baba K Yusuf",
        includedInCorePayoffPlan: true,
        warnings: [],
        duplicateStatus: "new",
        decision: "pending_review",
      }],
    });
    const candidate = batch.candidates[0];
    expect(candidate.ownerType).toBe("member");
    expect(candidate.ownerId).toBe("seed-admin");
  });

  it("leaves the candidate unmatched when the suggested name matches no real member (never invents one)", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "pdf",
      sourceFilename: "boa.pdf",
      candidates: [{
        candidateId: "cand-suggest-2",
        source: "pdf",
        creditorName: "Bank of America",
        accountName: "BOA Visa",
        debtType: "credit_card",
        currentBalance: 500,
        apr: null,
        aprStatus: "unknown",
        minimumPayment: 25,
        dueDate: null,
        ownerSuggestion: "Kristina K Davis",
        includedInCorePayoffPlan: true,
        warnings: [],
        duplicateStatus: "new",
        decision: "pending_review",
      }],
    });
    expect(batch.candidates[0].ownerType).not.toBe("member");
  });
});

describe("TrackToZero v2 async application service: DATA-1B import reconciliation", () => {
  const importCandidate = (overrides = {}) => ({
    candidateId: "cand-reconcile-1",
    source: "pdf",
    creditorName: "Firstmark Services",
    accountName: "Firstmark Loan ending in 1234",
    accountReferenceSafe: "last4:1234",
    debtType: "student_loan",
    currentBalance: 11880,
    statementDate: "2026-08-10",
    apr: 7.5,
    aprStatus: "known",
    minimumPayment: 190,
    dueDate: "2026-08-21",
    ownerSuggestion: "You",
    ownerType: "member",
    ownerId: "seed-owner",
    includedInCorePayoffPlan: true,
    warnings: [],
    duplicateStatus: "new",
    decision: "pending_review",
    ...overrides,
  });

  it("suggests an existing debt match and resolves update-existing as BalanceSnapshot only, preserving PlanVersion history", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234",
      name: "Firstmark Student Loan",
      accountReferenceSafe: "last4:1234",
      debtType: "student_loan",
      currentBalance: 12000,
      minimumRequiredPayment: 180,
      aprStatus: "known",
      apr: 7.25,
      includedInCorePayoffPlan: true,
    });
    const versionsBefore = repository.listPlanVersions("personal-seed", "personal-plan");
    const paymentsBefore = repository.listPaymentEvents("personal-seed", existing.id);
    const snapshotsBefore = repository.listBalanceSnapshots("personal-seed", existing.id);

    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "pdf",
      sourceFilename: "firstmark.pdf",
      candidates: [importCandidate()],
    });
    expect(batch.candidates[0].targetDebtId).toBe(existing.id);
    expect(batch.candidates[0].evidence.reconciliation.classification).toBe("strong_match");

    await service.resolveImportCandidateMatch("personal-seed", batch.id, "cand-reconcile-1", {
      decision: "update_existing",
      targetDebtId: existing.id,
      metadataUpdates: { apr: 7.5, aprStatus: "known", minimumRequiredPayment: 190, dueDay: 21 },
    });
    const { createdDebts, updatedDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts).toHaveLength(0);
    expect(updatedDebts).toHaveLength(1);

    const updated = repository.listDebts("personal-seed").find((debt) => debt.id === existing.id);
    expect(updated.currentBalance).toBe(11880);
    expect(updated.apr).toBeCloseTo(0.075, 6);
    expect(updated.minimumRequiredPayment).toBe(190);
    expect(updated.dueDay).toBe(21);
    expect(repository.listPaymentEvents("personal-seed", existing.id)).toEqual(paymentsBefore);
    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(snapshotsBefore.length + 1);
    expect(repository.listPlanVersions("personal-seed", "personal-plan")).toEqual(versionsBefore);
  });

  it("lets the reviewer choose new debt even when the creditor resembles an existing debt", async () => {
    const { repository, service } = makeService();
    await service.createNewDebt("personal-seed", {
      clientRequestId: "chase-1234",
      name: "Chase Freedom",
      accountReferenceSafe: "last4:1234",
      debtType: "credit_card",
      currentBalance: 1000,
      minimumRequiredPayment: 35,
      aprStatus: "known",
      apr: 22,
    });
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel",
      sourceFilename: "chase.xlsx",
      candidates: [importCandidate({
        candidateId: "new-chase-line",
        creditorName: "Chase Line of Credit",
        accountName: "Chase Line of Credit ending in 9999",
        accountReferenceSafe: "last4:9999",
        debtType: "line_of_credit",
        currentBalance: 2500,
        minimumPayment: 80,
      })],
    });
    await service.resolveImportCandidateMatch("personal-seed", batch.id, "new-chase-line", { decision: "new_debt" });
    const { createdDebts, updatedDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts).toHaveLength(1);
    expect(updatedDebts).toHaveLength(0);
    expect(createdDebts[0]).toMatchObject({ name: "Chase Line of Credit ending in 9999", accountReferenceSafe: "last4:9999" });
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 1);
  });

  it("BETA-3.1: a bare day-of-month due date ('day:N', no calendar year/month) becomes the correct Debt.dueDay, not a garbage date", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel",
      sourceFilename: "bare-day.xlsx",
      candidates: [importCandidate({ candidateId: "bare-day-1", accountReferenceSafe: "", creditorName: "Bare Day Card", accountName: "Bare Day Card", dueDate: "day:15" })],
    });
    await service.resolveImportCandidateMatch("personal-seed", batch.id, "bare-day-1", { decision: "new_debt" });
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts).toHaveLength(1);
    expect(createdDebts[0].dueDay).toBe(15);
    expect(repository.listDebts("personal-seed").find((debt) => debt.id === createdDebts[0].id).dueDay).toBe(15);
  });

  it("persists an unsure/needs-review decision across reload and commits no authoritative mutation", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "pdf",
      sourceFilename: "unclear.pdf",
      candidates: [importCandidate({ candidateId: "unsure-1", accountReferenceSafe: "", creditorName: "Firstmark", accountName: "Firstmark Loan" })],
    });
    await service.resolveImportCandidateMatch("personal-seed", batch.id, "unsure-1", { decision: "unsure" });
    const reloaded = repository.getImportBatch("personal-seed", batch.id);
    expect(reloaded.candidates[0].decision).toBe("needs_information");
    expect(reloaded.candidates[0].evidence.reconciliation.resolution.status).toBe("open");
    const committed = await service.commitImportBatch("personal-seed", batch.id);
    expect(committed.createdDebts).toHaveLength(0);
    expect(committed.updatedDebts).toHaveLength(0);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount);
  });

  it("flags a duplicate reimport and does not create another snapshot without an explicit update-existing resolution", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "boa-9999",
      name: "Bank of America Cash Rewards",
      accountReferenceSafe: "last4:9999",
      debtType: "credit_card",
      currentBalance: 5000,
      minimumRequiredPayment: 150,
      aprStatus: "known",
      apr: 20,
    });
    const source = importCandidate({
      candidateId: "boa-1",
      creditorName: "BofA",
      accountName: "BofA Cash Rewards",
      accountReferenceSafe: "last4:9999",
      debtType: "credit_card",
      currentBalance: 4900,
      statementDate: "2026-08-12",
      minimumPayment: 150,
    });
    const first = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "boa.pdf", candidates: [source] });
    await service.resolveImportCandidateMatch("personal-seed", first.id, "boa-1", { decision: "update_existing", targetDebtId: existing.id });
    await service.commitImportBatch("personal-seed", first.id);
    const snapshotCount = repository.listBalanceSnapshots("personal-seed", existing.id).length;

    const duplicate = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "boa-again.pdf", candidates: [source] });
    expect(duplicate.duplicateCount).toBe(1);
    expect(duplicate.candidates[0].evidence.reconciliation.classification).toBe("duplicate_import");
    const committed = await service.commitImportBatch("personal-seed", duplicate.id);
    expect(committed.createdDebts).toHaveLength(0);
    expect(committed.updatedDebts).toHaveLength(0);
    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(snapshotCount);
    expect(repository.listPaymentEvents("personal-seed", existing.id)).toHaveLength(0);
  });
});

describe("TrackToZero v2 async application service: UX-0 end-to-end - a failed-import balance never becomes a confirmed payoff after commit", () => {
  it("REPRODUCTION: commitImportBatch propagates the candidate's unresolved balanceStatus onto the created Debt (async)", async () => {
    const { repository, service } = makeService();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const candidate = {
      candidateId: "cand-unresolved-async-1",
      source: "pdf",
      creditorName: "Chase",
      accountName: "Chase Card",
      debtType: "credit_card",
      currentBalance: 0,
      balanceStatus: "unresolved",
      apr: null,
      aprStatus: "unknown",
      minimumPayment: null,
      dueDate: null,
      ownerSuggestion: "",
      includedInCorePayoffPlan: true,
      warnings: [],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "chase.pdf", candidates: [candidate] });
    await service.decideImportCandidate("personal-seed", batch.id, "cand-unresolved-async-1", { decision: "confirmed" });
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);

    expect(createdDebts[0].balanceStatus).toBe("unresolved");
    const snapshot = await service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.portfolioSummary.needsReviewDebtIds).toContain(createdDebts[0].id);
    expect(snapshot.payoffQueue.some((d) => d.id === createdDebts[0].id)).toBe(false);
  });
});
