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
    expect(snapshot.status.code).not.toBe("insufficient_data");
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

    expect(invite).toMatchObject({ status: "pending", role: "viewer", email: "future@example.test" });
    expect(repository.listMemberInvites("household-owner-a")).toHaveLength(1);
    expect(repository.getMembership("household-owner-a", "future-user")).toBeNull();
    const futureService = createTrackToZeroV2AsyncAppService({ repository, actorId: "future-user", asOf: V2_TEST_NOW });
    await expect(futureService.getWorkspaceSnapshot("household-owner-a")).rejects.toThrow(/not a member/i);
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
      message: "Your role allows viewing this information, but not changing it.",
    });
    expect(getUserSafeTrackToZeroError(new Error("FIRESTORE_EMULATOR_HOST missing")).message).toMatch(/temporarily unavailable/);
  });
});
