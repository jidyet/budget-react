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
export async function activateOrReforecastStrategy(service, workspaceId, strategy, hasActivePlan) {
  if (hasActivePlan) {
    await service.applyReforecast(workspaceId, { strategy });
    return;
  }
  const { plan, version } = await service.createDraftPlan(workspaceId, { strategy });
  await service.activatePlan(workspaceId, plan.id, version.id);
}
