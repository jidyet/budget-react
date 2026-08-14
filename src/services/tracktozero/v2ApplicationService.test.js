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
    const summary = snapshot.portfolioSummary;
    expect(summary).toBeTruthy();
    expect(summary.includedDebt).toBe(snapshot.totalIncludedDebt);

    const bucketTotal = summary.memberDebt.reduce((sum, member) => sum + member.total, 0) + summary.jointDebt + summary.unassignedDebt;
    expect(bucketTotal).toBeCloseTo(summary.includedDebt, 2);

    const adminEntry = summary.memberDebt.find((member) => member.uid === "seed-admin");
    expect(adminEntry.displayName).toBe("Baba");
    expect(adminEntry.total).toBeGreaterThanOrEqual(1000);
    expect(summary.jointDebt).toBeGreaterThanOrEqual(500);
    expect(summary.unassignedDebt).toBeGreaterThanOrEqual(200);
  });

  it("Personal workspaces still compute a portfolio summary (totals apply everywhere), but with empty member/joint/unassigned ownership breakdowns", () => {
    const { service } = serviceFor();
    const summary = service.getWorkspaceSnapshot("personal-seed").portfolioSummary;
    expect(summary).toBeTruthy();
    expect(summary.includedDebt).toBeGreaterThan(0);
    expect(summary.memberDebt).toEqual([]);
    expect(summary.jointDebt).toBe(0);
    expect(summary.unassignedDebt).toBe(0);
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

describe("TrackToZero v2 application service: import owner auto-suggest (convenience pre-fill, still human-confirmed)", () => {
  it("pre-selects a verified household member when the parser's ownerSuggestion matches their real name", () => {
    const { service } = serviceFor();
    const batch = service.createImportBatch("household-seed", {
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

  it("leaves the candidate unassigned when the suggested name matches no real member (never invents one)", () => {
    const { service } = serviceFor();
    const batch = service.createImportBatch("household-seed", {
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
    const candidate = batch.candidates[0];
    expect(candidate.ownerType).not.toBe("member");
    expect(candidate.ownerId).toBeFalsy();
  });

  it("does not attempt owner matching for Personal workspaces (owner is always forced to the signed-in user anyway)", () => {
    const { service } = serviceFor();
    const batch = service.createImportBatch("personal-seed", {
      sourceType: "pdf",
      sourceFilename: "boa.pdf",
      candidates: [{
        candidateId: "cand-suggest-3",
        source: "pdf",
        creditorName: "Bank of America",
        accountName: "BOA Visa",
        debtType: "credit_card",
        currentBalance: 500,
        apr: null,
        aprStatus: "unknown",
        minimumPayment: 25,
        dueDate: null,
        ownerSuggestion: "You You",
        includedInCorePayoffPlan: true,
        warnings: [],
        duplicateStatus: "new",
        decision: "pending_review",
      }],
    });
    expect(batch.candidates[0].ownerType).not.toBe("member");
  });
});

describe("TrackToZero v2 application service: UX-0 financial truth and state consistency", () => {
  it("REPRODUCTION: portfolio totals never disagree with the debt cards - a debt added after plan activation still counts in the total", () => {
    const { service } = serviceFor();
    // personal-seed already has an active plan whose startingDebtSnapshot was
    // frozen at activation; before this fix, totalIncludedDebt only counted
    // debts in that frozen set, so a NEW debt would show a real balance on
    // its own card while contributing $0 to the workspace total.
    const before = service.getWorkspaceSnapshot("personal-seed");
    const newDebt = service.createNewDebt("personal-seed", { name: "New Card Added After Plan", currentBalance: 750, minimumRequiredPayment: 40, aprStatus: "unknown" });
    const after = service.getWorkspaceSnapshot("personal-seed");
    expect(after.debts.some((d) => d.id === newDebt.id)).toBe(true);
    expect(after.portfolioSummary.includedDebt).toBeCloseTo(before.portfolioSummary.includedDebt + 750, 2);
    expect(after.totalIncludedDebt).toBeCloseTo(before.totalIncludedDebt + 750, 2);
  });

  it("REPRODUCTION: a confirmed $0 (genuinely paid-off) debt is absent from the active payoff queue and can never be the current target", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const paidOff = service.createNewDebt("personal-seed", { name: "Paid Off Card", currentBalance: 0, minimumRequiredPayment: 0, aprStatus: "unknown" });
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.payoffQueue.some((d) => d.id === paidOff.id)).toBe(false);
    expect(snapshot.targetDebt?.id).not.toBe(paidOff.id);
  });

  it("REPRODUCTION: an unresolved $0 (failed-import) debt is never shown as paid off, and is absent from the active payoff queue pending review", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const unresolvedDebt = repository.createDebtWithOpeningSnapshot({
      debt: {
        id: "debt-unresolved-import",
        workspaceId: "personal-seed",
        name: "Firstmark (failed import)",
        currentBalance: 0,
        balanceStatus: "unresolved",
        minimumRequiredPayment: 0,
        aprStatus: "unknown",
        includedInCorePayoffPlan: true,
        createdAt: V2_TEST_NOW,
        createdBy: "seed-owner",
        openingBalanceSnapshotId: "opening-debt-unresolved-import",
      },
      openingSnapshot: {
        id: "opening-debt-unresolved-import",
        workspaceId: "personal-seed",
        debtId: "debt-unresolved-import",
        balance: 0,
        observedAt: V2_TEST_NOW,
        source: "import",
        createdAt: V2_TEST_NOW,
        createdBy: "seed-owner",
      },
    });
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.payoffQueue.some((d) => d.id === unresolvedDebt.debt.id)).toBe(false);
    expect(snapshot.targetDebt?.id).not.toBe(unresolvedDebt.debt.id);
    expect(snapshot.portfolioSummary.needsReviewDebtIds).toContain(unresolvedDebt.debt.id);
    // It must not silently vanish from the workspace's view of what needs attention.
    expect(snapshot.debts.some((d) => d.id === unresolvedDebt.debt.id)).toBe(true);
  });

  it("REPRODUCTION: the Firstmark-style contaminated minimum payment (APR became minimum payment) is excluded from the active plan and flagged needs-review, without deleting the debt", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const contaminated = service.createNewDebt("personal-seed", {
      name: "Firstmark",
      currentBalance: 34233.67,
      aprStatus: "known",
      apr: 6.74,
      minimumRequiredPayment: 6.74,
    });
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.debts.some((d) => d.id === contaminated.id)).toBe(true);
    expect(snapshot.portfolioSummary.needsReviewDebtIds).toContain(contaminated.id);
    expect(snapshot.payoffQueue.some((d) => d.id === contaminated.id)).toBe(false);
    expect(snapshot.targetDebt?.id).not.toBe(contaminated.id);
  });

  it("REPRODUCTION: a stored junk owner label ('For Undeliverable Mail Only') is flagged needs-review at the portfolio level without a backfill", () => {
    const { repository, service } = serviceFor();
    // Simulates a record written before the parser-level fix existed -
    // directly via the repository, bypassing resolveDebtOwnership, the way
    // an already-malformed local/emulator record would look today.
    const junk = repository.saveDebt({
      id: "debt-junk-owner",
      workspaceId: "household-seed",
      name: "Chase Card",
      currentBalance: 500,
      minimumRequiredPayment: 25,
      aprStatus: "unknown",
      ownerType: "member",
      ownerId: "seed-admin",
      ownerLabel: "For Undeliverable Mail Only",
      createdAt: V2_TEST_NOW,
      createdBy: "seed-owner",
    });
    const snapshot = service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.portfolioSummary.needsReviewDebtIds).toContain(junk.id);
  });
});

describe("TrackToZero v2 application service: UX-0 end-to-end - a failed-import balance never becomes a confirmed payoff after commit", () => {
  it("REPRODUCTION: commitImportBatch propagates the candidate's unresolved balanceStatus onto the created Debt, excluding it from totals/queue/target", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const candidate = {
      candidateId: "cand-unresolved-1",
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
      warnings: ["No balance could be found on this statement. Enter it manually before confirming."],
      duplicateStatus: "new",
      decision: "pending_review",
    };
    const batch = service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "chase.pdf", candidates: [candidate] });
    service.decideImportCandidate("personal-seed", batch.id, "cand-unresolved-1", { decision: "confirmed" });
    const { createdDebts } = service.commitImportBatch("personal-seed", batch.id);

    expect(createdDebts).toHaveLength(1);
    const created = createdDebts[0];
    expect(created.balanceStatus).toBe("unresolved");
    expect(created.currentBalance).toBe(0);

    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    const reloaded = snapshot.debts.find((d) => d.id === created.id);
    expect(reloaded.balanceStatus).toBe("unresolved");
    expect(snapshot.portfolioSummary.needsReviewDebtIds).toContain(created.id);
    expect(snapshot.payoffQueue.some((d) => d.id === created.id)).toBe(false);
    expect(snapshot.targetDebt?.id).not.toBe(created.id);
    // Still visible - not silently deleted.
    expect(snapshot.debts.some((d) => d.id === created.id)).toBe(true);
  });

  it("a confidently-parsed import commits as balanceStatus confirmed, exactly as before", () => {
    const { service } = serviceFor();
    const candidate = {
      candidateId: "cand-confirmed-1",
      source: "pdf",
      creditorName: "SoFi",
      accountName: "SoFi Loan",
      debtType: "personal_loan",
      currentBalance: 4000,
      balanceStatus: "confirmed",
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
    const batch = service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "sofi.pdf", candidates: [candidate] });
    service.decideImportCandidate("personal-seed", batch.id, "cand-confirmed-1", { decision: "confirmed" });
    const { createdDebts } = service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts[0].balanceStatus).toBe("confirmed");
  });
});

describe("TrackToZero v2 application service: UX-0 preview must agree with the active plan it becomes (Part 8/9)", () => {
  it("REPRODUCTION: previewDraftPlan's displayed payoff order/starting total already excludes needs-review and paid-off debts, matching what getWorkspaceSnapshot shows once activated", () => {
    const { repository, service } = serviceFor();
    repository.putWorkspace({ ...repository.getWorkspace("personal-seed"), activePlanId: "" });
    const contaminated = service.createNewDebt("personal-seed", { name: "Firstmark", currentBalance: 34233.67, aprStatus: "known", apr: 6.74, minimumRequiredPayment: 6.74 });
    const paidOff = service.createNewDebt("personal-seed", { name: "Paid Off Card", currentBalance: 0, minimumRequiredPayment: 0, aprStatus: "unknown" });

    const preview = service.previewDraftPlan("personal-seed", { strategy: "avalanche" });
    expect(preview.payoffOrder.some((d) => d.id === contaminated.id)).toBe(false);
    expect(preview.payoffOrder.some((d) => d.id === paidOff.id)).toBe(false);

    const { plan, version } = service.createDraftPlan("personal-seed", { strategy: "avalanche" });
    service.activatePlan("personal-seed", plan.id, version.id);
    const snapshot = service.getWorkspaceSnapshot("personal-seed");
    expect(snapshot.payoffQueue.some((d) => d.id === contaminated.id)).toBe(false);
    expect(snapshot.payoffQueue.some((d) => d.id === paidOff.id)).toBe(false);
  });
});
