// UX-9 fix: "Use Snowball"/"Use Avalanche" from Compare/Inspect is the ONLY
// reachable strategy-commit action in the live Plan tab (the legacy
// FirstPlanBuilder create+activate flow in TrackToZeroV2App.jsx is dead
// code, never rendered). It unconditionally called applyReforecast, which
// requires an existing active plan/version - so a genuinely fresh
// workspace with no active plan yet could never activate its first plan at
// all, throwing "No active plan to reforecast" instead. Branch on whether
// an active plan already exists: reforecast (new version of the existing
// plan) when one does, create-then-activate (the real first plan) when it
// doesn't.
//
// GATE-10B.1: the same "no active plan" gap turned out to exist in two more
// places that reached applyReforecast directly - Saved Scenarios' Apply
// button (service.applyScenario) and Finish By's "Apply this payment
// increase" - both reproduced live as "apply scenario: No active plan to
// reforecast" against a real, brand-new household. applyPlanChange
// generalizes this branch (any set of PlanVersion overrides, not just
// {strategy}) so all three call sites share one first-activation-vs-
// reforecast decision instead of three copies of the same branch.
export async function applyPlanChange(service, workspaceId, hasActivePlan, { draftOverrides = {}, reforecastOverrides = {} } = {}) {
  if (hasActivePlan) {
    await service.applyReforecast(workspaceId, reforecastOverrides);
    return;
  }
  const { plan, version } = await service.createDraftPlan(workspaceId, draftOverrides);
  await service.activatePlan(workspaceId, plan.id, version.id);
}

export async function activateOrReforecastStrategy(service, workspaceId, strategy, hasActivePlan) {
  await applyPlanChange(service, workspaceId, hasActivePlan, { draftOverrides: { strategy }, reforecastOverrides: { strategy } });
}
