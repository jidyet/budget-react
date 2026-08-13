export const resolveActivePlanContext = ({ workspace, plans = [], versions = [] } = {}) => {
  const activePlanId = workspace?.activePlanId || "";
  if (!activePlanId) return null;
  const plan = plans.find((candidate) => candidate.id === activePlanId) || null;
  if (!plan?.activeVersionId) return { workspace, plan, version: null };
  const version = versions.find((candidate) =>
    candidate.planId === plan.id && candidate.id === plan.activeVersionId
  ) || null;
  return { workspace, plan, version };
};

export const activatePlanTransaction = ({ repository, workspaceId, planId, versionId, actorId, activatedAt }) => {
  const workspace = repository.getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const nextPlan = repository.getPlan(workspaceId, planId);
  if (!nextPlan) throw new Error("Plan not found");
  const version = repository.getPlanVersion(workspaceId, planId, versionId);
  if (!version) throw new Error("PlanVersion not found");

  const previousPlanId = workspace.activePlanId || "";
  const updatedWorkspace = {
    ...workspace,
    activePlanId: planId,
    updatedAt: activatedAt,
    updatedBy: actorId,
  };
  repository.putWorkspace(updatedWorkspace);

  if (previousPlanId && previousPlanId !== planId) {
    const previous = repository.getPlan(workspaceId, previousPlanId);
    if (previous) repository.putPlan({ ...previous, status: "archived", updatedAt: activatedAt, updatedBy: actorId });
  }

  repository.putPlan({
    ...nextPlan,
    status: "active",
    activeVersionId: versionId,
    activatedAt,
    updatedAt: activatedAt,
    updatedBy: actorId,
  });

  return resolveActivePlanContext({
    workspace: repository.getWorkspace(workspaceId),
    plans: repository.listPlans(workspaceId),
    versions: [version],
  });
};

export const createReforecastVersion = ({ repository, priorVersion, overrides = {} }) => {
  const nextVersion = {
    ...priorVersion,
    ...overrides,
    id: overrides.id,
    versionNumber: Number(priorVersion.versionNumber || 1) + 1,
    createdBecause: "reforecast",
  };
  return repository.savePlanVersion(nextVersion);
};

