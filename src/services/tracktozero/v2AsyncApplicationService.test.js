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
