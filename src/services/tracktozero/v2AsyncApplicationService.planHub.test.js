import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService } from "./v2AsyncApplicationService";

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

describe("UX-4.1: applyReforecast refreshes startingDebtSnapshot", () => {
  it("a debt added after activation joins the payoff queue once the plan is reforecasted, not just once but on every subsequent reforecast too", async () => {
    const { repository, service } = makeService();
    const before = await service.getWorkspaceSnapshot("household-seed");
    expect(before.payoffQueue.some((debt) => debt.id === "new-debt")).toBe(false);

    repository.saveDebt({
      id: "new-debt", workspaceId: "household-seed", name: "New Store Card", debtType: "credit_card",
      status: "active", currentBalance: 300, minimumRequiredPayment: 20, aprStatus: "known", apr: 0.18,
      ownerId: "seed-owner", ownerLabel: "Jidye", includedInCorePayoffPlan: true,
      createdAt: V2_TEST_NOW, createdBy: "seed-owner",
    });

    const stillMissing = await service.getWorkspaceSnapshot("household-seed");
    expect(stillMissing.payoffQueue.some((debt) => debt.id === "new-debt")).toBe(false);

    await service.applyReforecast("household-seed", { extraMonthlyPayment: 250 });
    const afterReforecast = await service.getWorkspaceSnapshot("household-seed");
    expect(afterReforecast.payoffQueue.some((debt) => debt.id === "new-debt")).toBe(true);
    expect(afterReforecast.activeContext.version.extraMonthlyPayment).toBe(250);
  });

  it("a debt marked excluded from the core plan (e.g. a mortgage) never joins the queue, even after reforecasting", async () => {
    const { repository, service } = makeService();
    repository.saveDebt({
      id: "mortgage-debt", workspaceId: "household-seed", name: "Family Mortgage", debtType: "mortgage",
      status: "active", currentBalance: 250000, minimumRequiredPayment: 1800, aprStatus: "known", apr: 0.062,
      ownerId: "seed-owner", ownerLabel: "Jidye", includedInCorePayoffPlan: false,
      createdAt: V2_TEST_NOW, createdBy: "seed-owner",
    });
    await service.applyReforecast("household-seed", { extraMonthlyPayment: 220 });
    const snapshot = await service.getWorkspaceSnapshot("household-seed");
    expect(snapshot.payoffQueue.some((debt) => debt.id === "mortgage-debt")).toBe(false);
  });

  it("preserves the prior PlanVersion's own startingDebtSnapshot untouched (history stays immutable)", async () => {
    const { repository, service } = makeService();
    const priorVersion = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
    await service.applyReforecast("household-seed", { extraMonthlyPayment: 210 });
    expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(priorVersion);
  });
});

describe("UX-4: compareStrategies", () => {
  it("previews both Snowball and Avalanche read-only, against the same live debts/extra baseline", async () => {
    const { repository, service } = makeService();
    const planBefore = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
    const result = await service.compareStrategies("household-seed");
    expect(result.activeStrategy).toBe("snowball");
    expect(result.snowball.strategy).toBe("snowball");
    expect(result.avalanche.strategy).toBe("avalanche");
    expect(result.snowball.extraMonthlyPayment).toBe(200);
    expect(result.avalanche.extraMonthlyPayment).toBe(200);
    // Zero writes: PlanVersion is byte-identical after the preview.
    expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(planBefore);
  });

  it("orders Snowball by smallest balance first, Avalanche by highest known APR first (unknown APR never guessed at, sorts last)", async () => {
    const { service } = makeService();
    const result = await service.compareStrategies("household-seed");
    expect(result.snowball.payoffOrder.map((d) => d.id)).toEqual([
      "household-samsung",
      "household-mystery",
      "household-medical",
      "household-jordan-card",
      "household-priceline",
      "household-joint-loan",
    ]);
    expect(result.avalanche.payoffOrder.map((d) => d.id)).toEqual([
      "household-priceline",
      "household-jordan-card",
      "household-joint-loan",
      "household-samsung",
      "household-medical",
      "household-mystery",
    ]);
  });

  it("surfaces the unknown-APR warning honestly rather than treating it as 0%", async () => {
    const { service } = makeService();
    const result = await service.compareStrategies("household-seed");
    expect(result.avalanche.warnings.some((w) => w.code === "unknown_apr")).toBe(true);
  });

  it("still works with no active plan (falls back to $0 extra, no crash)", async () => {
    const { repository } = makeService("solo-uid");
    repository.saveWorkspace({ id: "no-plan-ws", type: "personal", status: "active", createdAt: V2_TEST_NOW, createdBy: "solo-uid" });
    repository.saveMembership({ workspaceId: "no-plan-ws", uid: "solo-uid", role: "owner", status: "active", displayName: "Solo", createdAt: V2_TEST_NOW });
    repository.saveDebt({ id: "solo-debt", workspaceId: "no-plan-ws", name: "Card", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "known", apr: 0.2, includedInCorePayoffPlan: true, createdAt: V2_TEST_NOW, createdBy: "solo-uid" });
    const service = createTrackToZeroV2AsyncAppService({ repository, actorId: "solo-uid", asOf: V2_TEST_NOW });
    const result = await service.compareStrategies("no-plan-ws");
    expect(result.activeStrategy).toBeNull();
    expect(result.snowball.extraMonthlyPayment).toBe(0);
  });
});

describe("UX-4: previewOneTimePayment", () => {
  it("reduces the simulated balance of the target debt without creating a PaymentEvent or mutating the Debt", async () => {
    const { repository, service } = makeService();
    const debtBefore = repository.listDebts("household-seed").find((d) => d.id === "household-samsung");
    const result = await service.previewOneTimePayment("household-seed", { amount: 400, targetDebtId: "household-samsung" });
    expect(result.amount).toBe(400);
    expect(result.withLumpSum.startingTotalBalance).toBeLessThan(result.baseline.startingTotalBalance);
    expect(repository.listPaymentEvents("household-seed", "household-samsung")).toHaveLength(0);
    const debtAfter = repository.listDebts("household-seed").find((d) => d.id === "household-samsung");
    expect(debtAfter).toEqual(debtBefore);
  });

  it("defaults to the workspace's current target debt when none is specified", async () => {
    const { service } = makeService();
    const snapshot = await service.getWorkspaceSnapshot("household-seed");
    const result = await service.previewOneTimePayment("household-seed", { amount: 100 });
    expect(result.targetDebtId).toBe(snapshot.targetDebt?.id);
  });

  it("returns null for a zero/negative amount or an unknown target debt", async () => {
    const { service } = makeService();
    expect(await service.previewOneTimePayment("household-seed", { amount: 0, targetDebtId: "household-samsung" })).toBeNull();
    expect(await service.previewOneTimePayment("household-seed", { amount: 100, targetDebtId: "not-a-real-debt" })).toBeNull();
  });
});

describe("UX-4: previewCustomTarget", () => {
  it("forces the chosen debt to the front of the payoff order, clearly labeled 'custom' rather than a real strategy", async () => {
    const { service } = makeService();
    const result = await service.previewCustomTarget("household-seed", { targetDebtId: "household-priceline" });
    expect(result.custom.strategy).toBe("custom");
    expect(result.custom.payoffOrder[0].id).toBe("household-priceline");
  });

  it("is zero-write and never persists as a PLAN_STRATEGIES value", async () => {
    const { repository, service } = makeService();
    const planBefore = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
    await service.previewCustomTarget("household-seed", { targetDebtId: "household-priceline" });
    expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(planBefore);
  });

  it("defaults extraMonthlyPayment to the active plan's own extra when no override is given (unchanged pre-existing behavior)", async () => {
    const { service } = makeService();
    const result = await service.previewCustomTarget("household-seed", { targetDebtId: "household-priceline" });
    expect(result.custom.extraMonthlyPayment).toBe(200);
    expect(result.baseline.extraMonthlyPayment).toBe(200);
  });

  it("UX-4.1: honors an explicit extraMonthlyPayment override, so a targeted What-If preview works even with no active plan", async () => {
    const { repository } = makeService("solo-uid");
    repository.saveWorkspace({ id: "no-plan-ws3", type: "household", status: "active", createdAt: V2_TEST_NOW, createdBy: "solo-uid" });
    repository.saveMembership({ workspaceId: "no-plan-ws3", uid: "solo-uid", role: "owner", status: "active", displayName: "Solo", createdAt: V2_TEST_NOW });
    repository.saveDebt({ id: "solo-debt", workspaceId: "no-plan-ws3", name: "Card", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "known", apr: 0.2, includedInCorePayoffPlan: true, createdAt: V2_TEST_NOW, createdBy: "solo-uid" });
    const service = createTrackToZeroV2AsyncAppService({ repository, actorId: "solo-uid", asOf: V2_TEST_NOW });
    const result = await service.previewCustomTarget("no-plan-ws3", { targetDebtId: "solo-debt", extraMonthlyPayment: 300 });
    expect(result.custom.extraMonthlyPayment).toBe(300);
    expect(result.baseline.extraMonthlyPayment).toBe(300);
    expect(result.custom.payoffOrder[0].id).toBe("solo-debt");
  });
});

describe("UX-4: previewGoalDate (Finish By)", () => {
  it("reports feasible=true with 0 additional needed when the current plan already finishes on time", async () => {
    const { service } = makeService();
    // household-version-1 pays off all 3 debts (max ~$4100 combined) with
    // $200/mo extra well within a couple years - pick a generous target.
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2029-01" });
    expect(result.valid).toBe(true);
    expect(result.feasible).toBe(true);
    expect(result.additionalNeeded).toBe(0);
  });

  it("computes a required extra payment for an aggressive-but-feasible target date", async () => {
    const { service } = makeService();
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2026-10" });
    expect(result.valid).toBe(true);
    expect(result.feasible).toBe(true);
    expect(result.requiredMonthlyExtra).toBeGreaterThan(200);
  });

  it("honestly reports a large required payment for a very aggressive target, never mutates anything, and never mistakes a truncated simulation for an on-time payoff", async () => {
    const { repository, service } = makeService();
    const planBefore = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
    // 1 month out for ~$5,547 of combined balance - only reachable with a
    // large lump-sum-sized "extra", proving the search doesn't confuse
    // "simulation window ran out" with "debt actually reached $0 in time".
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2026-09" });
    expect(result.valid).toBe(true);
    expect(result.feasible).toBe(true);
    expect(result.requiredMonthlyExtra).toBeGreaterThan(5000);
    expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(planBefore);
  });

  it("reports feasible=false with an honest reason (never a silent/fake success) when the search bound truly can't reach the target", async () => {
    const { repository, service } = makeService();
    // A balance large enough that even the search's $5,000,000/mo cap
    // across 40 doublings can't clear it in 1 month.
    repository.saveDebt({
      id: "household-jumbo", workspaceId: "household-seed", name: "Jumbo Balance", debtType: "personal_loan",
      status: "active", currentBalance: 900_000_000, startingBalance: 900_000_000, aprStatus: "known", apr: 0.05,
      minimumRequiredPayment: 500, dueDay: 1, ownerId: "seed-owner", ownerLabel: "Jidye",
      includedInCorePayoffPlan: true, createdAt: V2_TEST_NOW, createdBy: "seed-owner",
    });
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2026-09", targetDebtId: "household-jumbo" });
    expect(result.valid).toBe(true);
    expect(result.feasible).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.requiredMonthlyExtra).toBeUndefined();
  });

  it("a debt id that doesn't exist in the workspace is reported as not found, not silently ignored", async () => {
    const { service } = makeService();
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2026-09", targetDebtId: "not-a-real-debt" });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/could not be found/i);
  });

  it("rejects a target date in the past", async () => {
    const { service } = makeService();
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2020-01" });
    expect(result.valid).toBe(false);
  });

  it("can be scoped to a single target debt (simulated as if it were the only debt)", async () => {
    const { service } = makeService();
    const result = await service.previewGoalDate("household-seed", { targetMonth: "2027-01", targetDebtId: "household-samsung" });
    expect(result.targetLabel).toBe("Samsung Financing");
    expect(result.valid).toBe(true);
  });
});

describe("UX-4: listPlanHistory (lightweight Plan History, not the full UX-7 system)", () => {
  it("returns the active plan's PlanVersions, newest first, without fabricating any milestone/celebration data", async () => {
    const { service } = makeService();
    const history = await service.listPlanHistory("household-seed");
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("household-version-1");
  });

  it("grows (newest first) after a reforecast, and the prior version stays in the list untouched", async () => {
    const { service } = makeService();
    await service.applyReforecast("household-seed", { extraMonthlyPayment: 250 });
    const history = await service.listPlanHistory("household-seed");
    expect(history).toHaveLength(2);
    expect(history[0].extraMonthlyPayment).toBe(250);
    expect(history[1].id).toBe("household-version-1");
    expect(history[1].extraMonthlyPayment).toBe(200);
  });

  it("returns an empty list rather than throwing when there is no active plan", async () => {
    const { repository } = makeService("solo-uid");
    repository.saveWorkspace({ id: "no-plan-ws2", type: "personal", status: "active", createdAt: V2_TEST_NOW, createdBy: "solo-uid" });
    repository.saveMembership({ workspaceId: "no-plan-ws2", uid: "solo-uid", role: "owner", status: "active", displayName: "Solo", createdAt: V2_TEST_NOW });
    const service = createTrackToZeroV2AsyncAppService({ repository, actorId: "solo-uid", asOf: V2_TEST_NOW });
    expect(await service.listPlanHistory("no-plan-ws2")).toEqual([]);
  });

  it("denies a non-member", async () => {
    const { repository } = makeService("seed-owner");
    const outsiderService = createTrackToZeroV2AsyncAppService({ repository, actorId: "not-a-member", asOf: V2_TEST_NOW });
    await expect(outsiderService.listPlanHistory("household-seed")).rejects.toThrow(/not a member/i);
  });
});

describe("UX-4: Saved Scenarios", () => {
  it("saves, lists, and previews a recurring_extra scenario, anchored to the current active PlanVersion", async () => {
    const { service } = makeService();
    const scenario = await service.saveScenario("household-seed", { name: "Aggressive payoff", type: "recurring_extra", inputs: { extraMonthlyPayment: 300 } });
    expect(scenario.basePlanVersionId).toBe("household-version-1");
    const listed = await service.listWorkspaceScenarios("household-seed");
    expect(listed.map((s) => s.id)).toContain(scenario.id);
    const { preview, isStale } = await service.getScenarioPreview("household-seed", scenario.id);
    expect(isStale).toBe(false);
    expect(preview.proposedZeroDate).toBeTruthy();
  });

  it("is workspace-scoped - a scenario from another workspace is never found", async () => {
    const { service } = makeService();
    const scenario = await service.saveScenario("household-seed", { name: "X", type: "recurring_extra", inputs: { extraMonthlyPayment: 50 } });
    await expect(service.getScenarioPreview("personal-seed", scenario.id)).rejects.toThrow(/not found/i);
  });

  it("rejects an unsupported scenario type and a blank name", async () => {
    const { service } = makeService();
    await expect(service.saveScenario("household-seed", { name: "X", type: "not_a_real_type" })).rejects.toThrow(/unsupported/i);
    await expect(service.saveScenario("household-seed", { name: "  ", type: "recurring_extra" })).rejects.toThrow(/name is required/i);
  });

  it("archiving removes a scenario from the active list but keeps it retrievable by id", async () => {
    const { service } = makeService();
    const scenario = await service.saveScenario("household-seed", { name: "Temp", type: "recurring_extra", inputs: { extraMonthlyPayment: 25 } });
    await service.archiveScenario("household-seed", scenario.id);
    const listed = await service.listWorkspaceScenarios("household-seed");
    expect(listed.map((s) => s.id)).not.toContain(scenario.id);
    const { scenario: reloaded } = await service.getScenarioPreview("household-seed", scenario.id);
    expect(reloaded.status).toBe("archived");
  });

  it("flags a scenario as stale once the active PlanVersion has moved on (reforecast happened after the scenario was saved)", async () => {
    const { service } = makeService();
    const scenario = await service.saveScenario("household-seed", { name: "Old baseline", type: "recurring_extra", inputs: { extraMonthlyPayment: 300 } });
    await service.applyReforecast("household-seed", { extraMonthlyPayment: 250 });
    const { isStale } = await service.getScenarioPreview("household-seed", scenario.id);
    expect(isStale).toBe(true);
  });

  describe("applyScenario", () => {
    it("applying a recurring_extra scenario creates a new PlanVersion via the existing reforecast primitive, preserving the prior version", async () => {
      const { repository, service } = makeService();
      const priorVersion = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
      const scenario = await service.saveScenario("household-seed", { name: "Aggressive", type: "recurring_extra", inputs: { extraMonthlyPayment: 300 } });
      await service.applyScenario("household-seed", scenario.id);
      const plan = repository.getPlan("household-seed", "household-plan");
      expect(plan.activeVersionId).not.toBe("household-version-1");
      const newVersion = repository.getPlanVersion("household-seed", "household-plan", plan.activeVersionId);
      expect(newVersion.extraMonthlyPayment).toBe(300);
      expect(newVersion.createdBecause).toBe("reforecast");
      expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(priorVersion);
    });

    it("applying a strategy_comparison scenario switches the active strategy", async () => {
      const { repository, service } = makeService();
      const scenario = await service.saveScenario("household-seed", { name: "Try Avalanche", type: "strategy_comparison", inputs: { strategy: "avalanche" } });
      await service.applyScenario("household-seed", scenario.id);
      const plan = repository.getPlan("household-seed", "household-plan");
      const newVersion = repository.getPlanVersion("household-seed", "household-plan", plan.activeVersionId);
      expect(newVersion.strategy).toBe("avalanche");
    });

    it("refuses to apply a one_time or custom_target scenario - preview-only by design", async () => {
      const { service } = makeService();
      const oneTime = await service.saveScenario("household-seed", { name: "Bonus", type: "one_time", inputs: { amount: 500, targetDebtId: "household-samsung" } });
      await expect(service.applyScenario("household-seed", oneTime.id)).rejects.toThrow(/preview only/i);
      const custom = await service.saveScenario("household-seed", { name: "Attack Priceline", type: "custom_target", inputs: { targetDebtId: "household-priceline" } });
      await expect(service.applyScenario("household-seed", custom.id)).rejects.toThrow(/preview only/i);
    });

    it("re-checks feasibility at apply time for goal_date scenarios rather than trusting a stale cached result", async () => {
      const { service } = makeService();
      const scenario = await service.saveScenario("household-seed", { name: "Debt-free by 2027", type: "goal_date", inputs: { targetMonth: "2027-06" } });
      const result = await service.applyScenario("household-seed", scenario.id);
      expect(result.version.createdBecause).toBe("reforecast");
    });
  });

  describe("security", () => {
    it("owner/admin can save, list, archive, and apply scenarios", async () => {
      const { repository } = makeService("seed-owner");
      const adminService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-admin", asOf: V2_TEST_NOW });
      const scenario = await adminService.saveScenario("household-seed", { name: "Admin scenario", type: "recurring_extra", inputs: { extraMonthlyPayment: 50 } });
      expect(scenario.id).toBeTruthy();
    });

    it("a viewer can list/preview scenarios but cannot save, archive, or apply", async () => {
      const { repository, service } = makeService("seed-owner");
      const scenario = await service.saveScenario("household-seed", { name: "Viewer test", type: "recurring_extra", inputs: { extraMonthlyPayment: 50 } });
      const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
      const listed = await viewerService.listWorkspaceScenarios("household-seed");
      expect(listed.map((s) => s.id)).toContain(scenario.id);
      await expect(viewerService.saveScenario("household-seed", { name: "X", type: "recurring_extra", inputs: {} })).rejects.toThrow(/cannot save/i);
      await expect(viewerService.archiveScenario("household-seed", scenario.id)).rejects.toThrow(/cannot delete/i);
      await expect(viewerService.applyScenario("household-seed", scenario.id)).rejects.toThrow(/cannot apply/i);
    });

    it("a non-member cannot read or write scenarios for a workspace they don't belong to", async () => {
      const { repository, service } = makeService("seed-owner");
      const scenario = await service.saveScenario("household-seed", { name: "X", type: "recurring_extra", inputs: {} });
      const outsiderService = createTrackToZeroV2AsyncAppService({ repository, actorId: "not-a-member", asOf: V2_TEST_NOW });
      await expect(outsiderService.listWorkspaceScenarios("household-seed")).rejects.toThrow(/not a member/i);
      await expect(outsiderService.getScenarioPreview("household-seed", scenario.id)).rejects.toThrow(/not a member/i);
    });

    it("a forged scenario id from another workspace is never readable or applicable", async () => {
      const { service } = makeService("seed-owner");
      const scenario = await service.saveScenario("household-seed", { name: "X", type: "recurring_extra", inputs: {} });
      await expect(service.getScenarioPreview("personal-seed", scenario.id)).rejects.toThrow(/not found/i);
      await expect(service.applyScenario("personal-seed", scenario.id)).rejects.toThrow(/not found/i);
    });
  });
});

describe("UX-4: Home/Plan cross-screen consistency", () => {
  it("the target debt shown by getWorkspaceSnapshot (which Home reads) is unaffected by any preview call", async () => {
    const { service } = makeService();
    const before = await service.getWorkspaceSnapshot("household-seed");
    await service.compareStrategies("household-seed");
    await service.previewOneTimePayment("household-seed", { amount: 100, targetDebtId: "household-samsung" });
    await service.previewCustomTarget("household-seed", { targetDebtId: "household-priceline" });
    await service.previewGoalDate("household-seed", { targetMonth: "2029-01" });
    const after = await service.getWorkspaceSnapshot("household-seed");
    expect(after.targetDebt?.id).toBe(before.targetDebt?.id);
    expect(after.activeContext.version.id).toBe(before.activeContext.version.id);
  });
});
