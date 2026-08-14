import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2AppService, V2_DATA_MODES } from "./v2ApplicationService";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";

const serviceFor = (actorId = "seed-owner", mode = V2_DATA_MODES.interactive) => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  return { repository, service: createTrackToZeroV2AppService({ repository, actorId, mode, asOf: V2_TEST_NOW }) };
};

describe("TrackToZero v2 application service", () => {
  it("lists personal and household workspaces through the repository boundary", () => {
    const { service } = serviceFor();
    expect(service.getWorkspaces().map((workspace) => workspace.id)).toEqual(["household-seed", "personal-seed"]);
    expect(service.getWorkspaceSnapshot("household-seed").members.map((member) => member.role)).toEqual([
      "owner",
      "admin",
      "contributor",
      "viewer",
    ]);
  });

  it("builds Home command-center context from Workspace.activePlanId without guessing", () => {
    const { repository, service } = serviceFor();
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.activeContext.plan.id).toBe("personal-plan");
    expect(snapshot.targetDebt.name).toBeTruthy();
    expect(snapshot.projectedZeroDate).toBeTruthy();

    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const noPlan = service.getWorkspaceSnapshot("personal-seed");
    expect(noPlan.activeContext).toBeNull();
    expect(noPlan.status.code).toBe("insufficient_data");
  });

  it("keeps Legacy Preview mode read-only", () => {
    const { repository, service } = serviceFor("seed-owner", V2_DATA_MODES.legacyPreview);
    const beforeDebts = repository.listDebts("personal-seed").length;
    expect(() => service.createNewDebt("personal-seed", {
      name: "Should not write",
      currentBalance: 1,
      minimumRequiredPayment: 1,
      aprStatus: "unknown",
    })).toThrow(/read-only/i);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeDebts);
  });

  it("role-gates household actions: contributor can observe, viewer cannot, contributor cannot manage plan terms", () => {
    const contributor = serviceFor("seed-contributor").service;
    const payment = contributor.recordPayment("household-seed", "household-samsung", { amount: 25 });
    const snapshot = contributor.recordBalanceSnapshot("household-seed", "household-samsung", { balance: 490 });
    expect(payment.createdBy).toBe("seed-contributor");
    expect(snapshot.createdBy).toBe("seed-contributor");
    expect(() => contributor.createDraftPlan("household-seed", { strategy: "snowball" })).toThrow(/cannot create payoff plans/i);

    const viewer = serviceFor("seed-viewer").service;
    expect(() => viewer.recordPayment("household-seed", "household-samsung", { amount: 25 })).toThrow(/cannot record payments/i);
    expect(viewer.getWorkspaceSnapshot("household-seed").permissions.view).toBe(true);
  });

  it("scenario preview is side-effect-free", () => {
    const { repository, service } = serviceFor();
    const beforePlans = repository.listPlans("personal-seed");
    const beforeVersions = repository.listPlanVersions("personal-seed", "personal-plan");
    const beforeWorkspace = repository.getWorkspace("personal-seed");
    const preview = service.previewScenario("personal-seed", { extraMonthlyPayment: 100 });

    expect(preview.monthsSaved).toBeGreaterThanOrEqual(0);
    expect(repository.listPlans("personal-seed")).toEqual(beforePlans);
    expect(repository.listPlanVersions("personal-seed", "personal-plan")).toEqual(beforeVersions);
    expect(repository.getWorkspace("personal-seed")).toEqual(beforeWorkspace);
  });

  it("reforecast preview does not persist, while apply creates PlanVersion N+1 and preserves history", () => {
    const { repository, service } = serviceFor();
    const beforeVersions = repository.listPlanVersions("personal-seed", "personal-plan");
    const preview = service.previewReforecast("personal-seed", { extraMonthlyPayment: 250 });
    expect(preview.proposedVersion.versionNumber).toBe(2);
    expect(repository.listPlanVersions("personal-seed", "personal-plan")).toEqual(beforeVersions);

    const applied = service.applyReforecast("personal-seed", { extraMonthlyPayment: 250 });
    const afterVersions = repository.listPlanVersions("personal-seed", "personal-plan");
    expect(afterVersions).toHaveLength(beforeVersions.length + 1);
    expect(afterVersions[0]).toEqual(beforeVersions[0]);
    expect(applied.workspace.activePlanId).toBe("personal-plan");
    expect(applied.plan.activeVersionId).toBe(afterVersions.at(-1).id);
  });

  it("creates debts, payment events, and balance snapshots only inside World-2 repository state", () => {
    const { repository, service } = serviceFor();
    const debt = service.createNewDebt("personal-seed", {
      name: "Seed-only Card",
      currentBalance: 300,
      minimumRequiredPayment: 30,
      aprStatus: "unknown",
    });
    service.recordPayment("personal-seed", debt.id, { amount: 30 });
    service.recordBalanceSnapshot("personal-seed", debt.id, { balance: 270 });

    expect(repository.listDebts("personal-seed").some((candidate) => candidate.id === debt.id)).toBe(true);
    expect(debt.openingBalanceSnapshotId).toBeTruthy();
    expect(repository.listBalanceSnapshots("personal-seed", debt.id)[0].balance).toBe(270);
    expect(repository.listBalanceSnapshots("personal-seed", debt.id).some((snapshot) => snapshot.id === debt.openingBalanceSnapshotId && snapshot.balance === 300)).toBe(true);
  });
});

describe("TrackToZero v2 application service: zero-balance debt must never become the current target (regression)", () => {
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

  it("REPRODUCTION: with no active plan, a $0 balance debt sitting first in the list must not be shown as targetDebt", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    zeroOutDebt(repository, repository.listDebts("personal-seed")[0]);

    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.targetDebt?.name).toBe("SoFi Personal Loan");
  });

  it("with no active plan and every included debt already paid off, targetDebt is null rather than any zero-balance debt", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    for (const debt of repository.listDebts("personal-seed")) {
      zeroOutDebt(repository, debt);
    }
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.targetDebt).toBeNull();
  });
});
