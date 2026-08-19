import { describe, expect, it, vi } from "vitest";
import { activateOrReforecastStrategy, applyPlanChange } from "./planActivation.js";

// UX-9 regression: "Use Snowball"/"Use Avalanche" (the only reachable
// strategy-commit action in the live Plan tab) used to always call
// applyReforecast, which requires a pre-existing active plan/version. A
// genuinely fresh workspace with no active plan yet would get
// "No active plan to reforecast" instead of activating its first plan.
describe("activateOrReforecastStrategy", () => {
  it("reforecasts the existing plan when one is already active", async () => {
    const service = {
      applyReforecast: vi.fn().mockResolvedValue(undefined),
      createDraftPlan: vi.fn(),
      activatePlan: vi.fn(),
    };
    await activateOrReforecastStrategy(service, "ws-1", "snowball", true);
    expect(service.applyReforecast).toHaveBeenCalledWith("ws-1", { strategy: "snowball" });
    expect(service.createDraftPlan).not.toHaveBeenCalled();
    expect(service.activatePlan).not.toHaveBeenCalled();
  });

  it("creates and activates a first plan when no plan is active yet, never calling reforecast", async () => {
    const service = {
      applyReforecast: vi.fn(),
      createDraftPlan: vi.fn().mockResolvedValue({ plan: { id: "plan-1" }, version: { id: "version-1" } }),
      activatePlan: vi.fn().mockResolvedValue(undefined),
    };
    await activateOrReforecastStrategy(service, "ws-1", "avalanche", false);
    expect(service.createDraftPlan).toHaveBeenCalledWith("ws-1", { strategy: "avalanche" });
    expect(service.activatePlan).toHaveBeenCalledWith("ws-1", "plan-1", "version-1");
    expect(service.applyReforecast).not.toHaveBeenCalled();
  });
});

// GATE-10B.1: applyPlanChange generalizes the same branch for call sites
// whose overrides aren't just {strategy} - Saved Scenarios and Finish By,
// both reproduced live throwing "No active plan to reforecast" because they
// called applyReforecast directly with no first-activation branch.
describe("applyPlanChange", () => {
  it("reforecasts with the given overrides when a plan is already active", async () => {
    const service = {
      applyReforecast: vi.fn().mockResolvedValue(undefined),
      createDraftPlan: vi.fn(),
      activatePlan: vi.fn(),
    };
    await applyPlanChange(service, "ws-1", true, { reforecastOverrides: { extraMonthlyPayment: 200 } });
    expect(service.applyReforecast).toHaveBeenCalledWith("ws-1", { extraMonthlyPayment: 200 });
    expect(service.createDraftPlan).not.toHaveBeenCalled();
  });

  it("creates and activates a first plan with the draft overrides when no plan is active, never calling reforecast", async () => {
    const service = {
      applyReforecast: vi.fn(),
      createDraftPlan: vi.fn().mockResolvedValue({ plan: { id: "plan-1" }, version: { id: "version-1" } }),
      activatePlan: vi.fn().mockResolvedValue(undefined),
    };
    await applyPlanChange(service, "ws-1", false, { draftOverrides: { extraMonthlyPayment: 200 } });
    expect(service.createDraftPlan).toHaveBeenCalledWith("ws-1", { extraMonthlyPayment: 200 });
    expect(service.activatePlan).toHaveBeenCalledWith("ws-1", "plan-1", "version-1");
    expect(service.applyReforecast).not.toHaveBeenCalled();
  });

  it("defaults to empty overrides on either branch when none are given", async () => {
    const service = {
      applyReforecast: vi.fn().mockResolvedValue(undefined),
      createDraftPlan: vi.fn().mockResolvedValue({ plan: { id: "plan-1" }, version: { id: "version-1" } }),
      activatePlan: vi.fn().mockResolvedValue(undefined),
    };
    await applyPlanChange(service, "ws-1", true);
    expect(service.applyReforecast).toHaveBeenCalledWith("ws-1", {});
    await applyPlanChange(service, "ws-1", false);
    expect(service.createDraftPlan).toHaveBeenCalledWith("ws-1", {});
  });
});
