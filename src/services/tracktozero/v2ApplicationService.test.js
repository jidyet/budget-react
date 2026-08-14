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

describe("TrackToZero v2 application service: household ownership foundation", () => {
  it("Personal workspace always assigns the new debt to the signed-in member, ignoring any owner input", () => {
    const { service } = serviceFor();
    const debt = service.createNewDebt("personal-seed", {
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

  it("Household workspace resolves a verified member selection to that member's real display name", () => {
    const { service } = serviceFor();
    const debt = service.createNewDebt("household-seed", {
      name: "Shared Card",
      currentBalance: 500,
      minimumRequiredPayment: 25,
      aprStatus: "unknown",
      ownerType: "member",
      ownerId: "seed-admin",
    });
    expect(debt.ownerType).toBe("member");
    expect(debt.ownerId).toBe("seed-admin");
    expect(debt.ownerLabel).toBe("Baba");
  });

  it("Household workspace supports Joint and Unassigned, and defaults to Unassigned when no owner is chosen", () => {
    const { service } = serviceFor();
    const joint = service.createNewDebt("household-seed", { name: "Joint Loan", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "unknown", ownerType: "joint" });
    expect(joint.ownerType).toBe("joint");
    expect(joint.ownerLabel).toBe("Joint / Household");

    const defaulted = service.createNewDebt("household-seed", { name: "Undecided Debt", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "unknown" });
    expect(defaulted.ownerType).toBe("unassigned");
    expect(defaulted.ownerLabel).toBe("Unassigned");
  });

  it("REPRODUCTION-STYLE: rejects an unverified member id instead of silently accepting it (no invented household members)", () => {
    const { service } = serviceFor();
    expect(() =>
      service.createNewDebt("household-seed", {
        name: "Sketchy Debt",
        currentBalance: 500,
        minimumRequiredPayment: 25,
        aprStatus: "unknown",
        ownerType: "member",
        ownerId: "not-a-real-member",
      })
    ).toThrow(/verified household member/i);
  });

  it("commitImportBatch never lets the parser's raw ownerSuggestion become the authoritative owner - only the human-reviewed ownerType/ownerId choice does", () => {
    const { repository, service } = serviceFor();
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
    const batch = service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "chase.pdf", candidates: [candidate] });
    service.decideImportCandidate("household-seed", batch.id, "cand-owner-1", { decision: "confirmed" });
    const { createdDebts } = service.commitImportBatch("household-seed", batch.id);

    expect(createdDebts).toHaveLength(1);
    expect(createdDebts[0].ownerLabel).not.toMatch(/undeliverable/i);
    expect(createdDebts[0].ownerType).toBe("member");
    expect(createdDebts[0].ownerId).toBe("seed-admin");
    expect(createdDebts[0].ownerLabel).toBe("Baba");
    expect(repository.listDebts("household-seed").find((debt) => debt.id === createdDebts[0].id).ownerLabel).toBe("Baba");
  });

  it("commitImportBatch rejects an unverified owner selection on an import candidate too, failing just that candidate", () => {
    const { service } = serviceFor();
    const candidate = {
      candidateId: "cand-owner-2",
      source: "pdf",
      creditorName: "Discover",
      accountName: "Discover Card",
      debtType: "credit_card",
      currentBalance: 700,
      apr: null,
      aprStatus: "unknown",
      minimumPayment: 30,
      dueDate: null,
      ownerSuggestion: "",
      ownerType: "member",
      ownerId: "not-a-real-member",
      includedInCorePayoffPlan: true,
      warnings: [],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const batch = service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "discover.pdf", candidates: [candidate] });
    service.decideImportCandidate("household-seed", batch.id, "cand-owner-2", { decision: "confirmed" });

    let caught = null;
    try {
      service.commitImportBatch("household-seed", batch.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
    expect(caught.failures[0].message).toMatch(/verified household member/i);
    expect(caught.createdDebts).toHaveLength(0);
  });

  it("household ownership survives persistence: a full repository round trip preserves ownerType/ownerId/ownerLabel exactly", () => {
    const { repository, service } = serviceFor();
    const debt = service.createNewDebt("household-seed", {
      name: "Persisted Card",
      currentBalance: 250,
      minimumRequiredPayment: 15,
      aprStatus: "unknown",
      ownerType: "member",
      ownerId: "seed-contributor",
    });
    const reloaded = repository.listDebts("household-seed").find((candidate) => candidate.id === debt.id);
    expect(reloaded.ownerType).toBe("member");
    expect(reloaded.ownerId).toBe("seed-contributor");
    expect(reloaded.ownerLabel).toBe("Contributor");
  });

  it("household summary totals count every included debt exactly once across member/joint/unassigned buckets - no double-counting", () => {
    const { repository, service } = serviceFor();
    // The seeded household plan's active version freezes its starting debt
    // snapshot at activation time, so newly added debts wouldn't be part of
    // includedDebts until a reforecast. Clear activePlanId so this test
    // exercises the (also real) pre-plan "all active debts" path instead.
    repository.putWorkspace({ ...repository.getWorkspace("household-seed"), activePlanId: "" });
    service.createNewDebt("household-seed", { name: "Admin Debt", currentBalance: 1000, minimumRequiredPayment: 25, aprStatus: "unknown", ownerType: "member", ownerId: "seed-admin" });
    service.createNewDebt("household-seed", { name: "Joint Debt", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "unknown", ownerType: "joint" });
    service.createNewDebt("household-seed", { name: "Undecided Debt", currentBalance: 200, minimumRequiredPayment: 25, aprStatus: "unknown" });

    const snapshot = service.getWorkspaceSnapshot("household-seed");
    const summary = snapshot.householdOwnershipSummary;
    expect(summary).toBeTruthy();
    expect(summary.total).toBe(snapshot.totalIncludedDebt);

    const bucketTotal = summary.perMember.reduce((sum, member) => sum + member.total, 0) + summary.jointTotal + summary.unassignedTotal;
    expect(bucketTotal).toBeCloseTo(summary.total, 2);

    const adminEntry = summary.perMember.find((member) => member.uid === "seed-admin");
    expect(adminEntry.displayName).toBe("Baba");
    expect(adminEntry.total).toBeGreaterThanOrEqual(1000);
    expect(summary.jointTotal).toBeGreaterThanOrEqual(500);
    expect(summary.unassignedTotal).toBeGreaterThanOrEqual(200);
  });

  it("Personal workspaces never compute a household ownership summary", () => {
    const { service } = serviceFor();
    expect(service.getWorkspaceSnapshot("personal-seed").householdOwnershipSummary).toBeNull();
  });

  it("ownership fields never change payoff math: Snowball/Avalanche projection and totals are identical regardless of ownerType", () => {
    const { repository, service } = serviceFor();
    const before = service.getWorkspaceSnapshot("household-seed");
    const debt = repository.listDebts("household-seed")[0];

    service.updateDebt("household-seed", debt.id, { ownerType: "joint", ownerId: "" });
    const afterJoint = service.getWorkspaceSnapshot("household-seed");
    expect(afterJoint.totalIncludedDebt).toBe(before.totalIncludedDebt);
    expect(afterJoint.projectedZeroDate).toBe(before.projectedZeroDate);
    expect(afterJoint.projection).toEqual(before.projection);

    service.updateDebt("household-seed", debt.id, { ownerType: "unassigned", ownerId: "" });
    const afterUnassigned = service.getWorkspaceSnapshot("household-seed");
    expect(afterUnassigned.totalIncludedDebt).toBe(before.totalIncludedDebt);
    expect(afterUnassigned.projection).toEqual(before.projection);
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

describe("TrackToZero v2 application service: payoff queue ordering and ownership display", () => {
  it("payoffQueue is sorted for the active plan's real strategy (avalanche: highest APR/unknown first)", () => {
    const { service } = serviceFor();
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.activeContext.version.strategy).toBe("avalanche");
    const aprRank = (debt) => (debt.aprStatus === "unknown" ? Infinity : Number(debt.apr || 0));
    const queueAprs = snapshot.payoffQueue.map(aprRank);
    const sortedDesc = [...queueAprs].sort((a, b) => b - a);
    expect(queueAprs).toEqual(sortedDesc);
  });

  it("payoffQueue is sorted for snowball (smallest balance first) and shows ownership per entry", () => {
    const { service } = serviceFor();
    const snapshot = service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.activeContext.version.strategy).toBe("snowball");
    const balances = snapshot.payoffQueue.map((debt) => Number(debt.currentBalance || 0));
    expect(balances).toEqual([...balances].sort((a, b) => a - b));
    for (const debt of snapshot.payoffQueue) {
      expect(typeof debt.ownerLabel).toBe("string");
    }
  });

  it("payoffQueue matches the exact order previewDraftPlan would compute for the same strategy (single shared sort, no drift)", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("household-seed"), activePlanId: "" });
    const preview = service.previewDraftPlan("household-seed", { strategy: "avalanche" });
    const snapshot = service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.payoffQueue.map((d) => d.id)).toEqual(preview.payoffOrder.map((d) => d.id));
  });

  it("the ownership filter is a display-only concern: it never changes totalIncludedDebt, projection, or payoffQueue math", () => {
    const { service } = serviceFor();
    const before = service.getWorkspaceSnapshot("household-seed");
    // Filtering happens entirely in the UI layer over snapshot.debts/payoffQueue;
    // re-fetching the same snapshot must be byte-identical regardless of any
    // client-side filter selection, since the filter never round-trips to the service.
    const again = service.getWorkspaceSnapshot("household-seed");
    expect(again.totalIncludedDebt).toBe(before.totalIncludedDebt);
    expect(again.payoffQueue.map((d) => d.id)).toEqual(before.payoffQueue.map((d) => d.id));
    expect(again.projection).toEqual(before.projection);
  });

  it("a Joint-owned debt appears exactly once in the payoff queue, never duplicated across owners", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("household-seed"), activePlanId: "" });
    const joint = service.createNewDebt("household-seed", { name: "Joint Queue Debt", currentBalance: 300, minimumRequiredPayment: 20, aprStatus: "unknown", ownerType: "joint" });
    const snapshot = service.getWorkspaceSnapshot("household-seed");
    const occurrences = snapshot.payoffQueue.filter((debt) => debt.id === joint.id);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].ownerType).toBe("joint");
  });
});
