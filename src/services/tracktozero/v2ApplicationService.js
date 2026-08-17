import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { createStartingDebtSnapshotItem } from "../../domain/tracktozero/models.js";
import { isDebtNeedsReview, resolveDebtOwnership } from "../../domain/tracktozero/ownership.js";
import { matchImportedOwnerToIdentity } from "../../domain/tracktozero/personIdentity.js";
import { buildExpectedCheckpoints } from "../adapters/tracktozeroCalcAdapter.js";
import { deriveDebtPortfolioSummary } from "./portfolioSummary.js";
import { calculateWhatIfComparison } from "../calc/scenarioComparison.js";
import { activatePlanTransaction, resolveActivePlanContext } from "./activePlanService.js";
import {
  buildProjectionWithWarnings,
  derivePlanHealth,
  getEligiblePlanDebts,
  getIncludedDebts,
  monthKeyFromDate,
  sortDebtsForStrategy,
} from "./projectionStatusService.js";
import { V2_TEST_NOW } from "./v2SeedData.js";

export const V2_DATA_MODES = Object.freeze({
  interactive: "interactive_v2",
  legacyPreview: "legacy_preview",
});

export const hasPermission = (membership, permission) =>
  Boolean(ROLE_PERMISSIONS[membership?.role]?.[permission]);

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const stableIdPart = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 64);

const parseAsOf = (asOf) => {
  const date = new Date(asOf || V2_TEST_NOW);
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
};

const latestSnapshotsByDebt = (repository, workspaceId, debts) =>
  Object.fromEntries(
    debts.map((debt) => [debt.id, repository.listBalanceSnapshots(workspaceId, debt.id)[0] || null])
  );

const balanceHistoryByDebt = (repository, workspaceId, debts) =>
  Object.fromEntries(
    debts.map((debt) => [debt.id, [...repository.listBalanceSnapshots(workspaceId, debt.id)].reverse()])
  );

export const createTrackToZeroV2AppService = ({
  repository,
  actorId = "seed-owner",
  mode = V2_DATA_MODES.interactive,
  asOf = V2_TEST_NOW,
} = {}) => {
  if (!repository) throw new Error("TrackToZero v2 application service requires a repository");

  const assertInteractive = () => {
    if (mode !== V2_DATA_MODES.interactive) {
      throw new Error("Legacy Preview mode is read-only. No TrackToZero 2.0 writes are allowed here.");
    }
  };

  const getWorkspaces = () =>
    repository.listWorkspaces()
      .map((workspace) => ({ ...workspace }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  const getWorkspaceContext = (workspaceId) => {
    const workspace = repository.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = repository.getMembership(workspaceId, actorId) || repository.listMemberships?.(workspaceId)?.[0] || null;
    const members = repository.listMemberships?.(workspaceId) || [];
    // DATA-HH1: mirrors the async service's getWorkspaceContext exactly -
    // see its comment for why `people` lives here.
    const people = repository.listWorkspacePersons?.(workspaceId) || [];
    return { workspace, membership, members, people, permissions: ROLE_PERMISSIONS[membership?.role] || ROLE_PERMISSIONS.viewer };
  };

  const getActivePlanContext = (workspaceId) => {
    const workspace = repository.getWorkspace(workspaceId);
    const plans = repository.listPlans(workspaceId);
    const versions = plans.flatMap((plan) => repository.listPlanVersions?.(workspaceId, plan.id) || []);
    return resolveActivePlanContext({ workspace, plans, versions });
  };

  const getExpectedCheckpoints = (workspaceId, activeContext) => {
    if (!activeContext?.plan || !activeContext?.version) return [];
    return repository.listExpectedCheckpoints?.(workspaceId, activeContext.plan.id, activeContext.version.id) || [];
  };

  const getWorkspaceSnapshot = (workspaceId) => {
    const context = getWorkspaceContext(workspaceId);
    const debts = repository.listDebts(workspaceId);
    const activeContext = getActivePlanContext(workspaceId);
    const expectedCheckpoints = getExpectedCheckpoints(workspaceId, activeContext);
    const snapshotsByDebt = latestSnapshotsByDebt(repository, workspaceId, debts);
    const balanceHistory = balanceHistoryByDebt(repository, workspaceId, debts);
    const { month, year } = parseAsOf(asOf);
    const projectionWithWarnings = activeContext?.version
      ? buildProjectionWithWarnings({ debts, planVersion: activeContext.version, startMonth: month, startYear: year })
      : { projection: [], warnings: [] };
    // THE single Home/Plan plan-health derivation (UX-0 Part 9-10): folds the
    // balance-vs-checkpoint status together with the plan's own critical
    // warnings, so a critical warning (e.g. "balance grows instead of
    // shrinking") can never coexist with a positive/green status - they are
    // now structurally the same computation, not two independently-derived
    // values that happen to usually agree.
    const status = derivePlanHealth({
      debts,
      planVersion: activeContext?.version,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      projectionWarnings: projectionWithWarnings.warnings,
      asOf,
    });
    const includedDebts = getIncludedDebts(debts, activeContext?.version);
    // Needs-review debts (unresolved balance, contaminated minimum payment)
    // are excluded from the simulation (see getEligiblePlanDebts) and must
    // not become the "current target" or appear in the active payoff queue
    // either - both are still-authoritative plan outputs.
    const eligibleDebts = getEligiblePlanDebts(debts, activeContext?.version);
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    // A debt with a $0 (or lower) balance is already paid off and must never
    // be presented as "what to pay off next," even as a fallback when no
    // plan has been activated yet.
    const payableEligibleDebts = eligibleDebts.filter((debt) => debtBalance(debt) > 0);
    const projectedTarget = projectionWithWarnings.projection[0]?.payoff_target || "";
    const frozenTargetId = activeContext?.version?.startingDebtSnapshot?.find((item) => item.includedInCorePayoffPlan)?.debtId || "";
    const targetDebt = debts.find((debt) => debt.id === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.name === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.id === frozenTargetId && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || payableEligibleDebts[0]
      || null;
    // THE single shared debt-portfolio derivation (UX-0 Part 3) - computed
    // from the LIVE debt list, never the plan's frozen snapshot, so this can
    // never disagree with what the Debts page cards show (see
    // deriveDebtPortfolioSummary for why).
    const portfolioSummary = deriveDebtPortfolioSummary({
      workspace: context.workspace,
      members: context.members,
      people: context.people,
      debts,
      debtBalance,
    });
    // The same ordering payoffSimulate itself uses - the numbered queue
    // shown in the UI can never silently drift from what's actually being
    // paid off first. Excludes needs-review debts (see eligibleDebts above)
    // and any debt with a $0-or-less balance (already paid off, or an
    // unresolved balance with nothing safe to rank) - a confirmed-zero debt
    // must never appear as an active queue item (UX-0 Part 5).
    const payoffQueue = sortDebtsForStrategy(
      eligibleDebts.filter((debt) => debtBalance(debt) > 0),
      activeContext?.version?.strategy || "avalanche"
    );

    return {
      ...context,
      mode,
      asOf,
      debts,
      includedDebts,
      activeContext,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      balanceHistoryByDebt: balanceHistory,
      projection: projectionWithWarnings.projection,
      warnings: projectionWithWarnings.warnings,
      status,
      totalIncludedDebt: portfolioSummary.includedDebt,
      targetDebt,
      portfolioSummary,
      payoffQueue,
      projectedZeroDate: projectionWithWarnings.projection.at(-1)?.month || activeContext?.version?.projectedZeroDate || "",
    };
  };

  const updateDebt = (workspaceId, debtId, patch) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view this debt, but cannot edit debt terms.");
    const current = repository.listDebts(workspaceId).find((debt) => debt.id === debtId);
    if (!current) throw new Error("Debt not found");
    return repository.saveDebt({ ...current, ...patch, updatedAt: asOf, updatedBy: actorId });
  };

  const createNewDebt = (workspaceId, input) => {
    assertInteractive();
    const { workspace, membership, members, people } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view debts, but cannot add debt terms.");
    if (typeof repository.createDebtWithOpeningSnapshot !== "function") {
      throw new Error("Debt setup requires an opening balance snapshot.");
    }
    const ownership = resolveDebtOwnership({
      workspaceType: workspace.type,
      members,
      people,
      actorId,
      requested: { ownerType: input.ownerType, ownerId: input.ownerId },
    });
    const debtId = input.id || (input.clientRequestId ? `debt-${stableIdPart(input.clientRequestId)}` : id("debt"));
    const openingBalanceSnapshotId = input.openingBalanceSnapshotId || `opening-${debtId}`;
    const result = repository.createDebtWithOpeningSnapshot({
      debt: {
        ...input,
        ...ownership,
        id: debtId,
        workspaceId,
        createdAt: asOf,
        createdBy: actorId,
        openingBalanceSnapshotId,
      },
      openingSnapshot: {
        id: openingBalanceSnapshotId,
        workspaceId,
        debtId,
        balance: input.currentBalance,
        observedAt: input.balanceAsOf || input.observedAt || asOf,
        source: "manual",
        notes: "Opening balance",
        createdAt: asOf,
        createdBy: actorId,
      },
    });
    return result.debt;
  };

  const recordPayment = (workspaceId, debtId, { amount, paidAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot record payments in this workspace.");
    const activeContext = getActivePlanContext(workspaceId);
    return repository.createPaymentEvent({
      id: id("payment"),
      workspaceId,
      debtId,
      planId: activeContext?.plan?.id || "",
      planVersionId: activeContext?.version?.id || "",
      amount,
      paidAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  const recordBalanceSnapshot = (workspaceId, debtId, { balance, observedAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot update balances in this workspace.");
    return repository.createBalanceSnapshot({
      id: id("snapshot"),
      workspaceId,
      debtId,
      balance,
      observedAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  const createImportBatch = (workspaceId, { sourceType, sourceFilename = "", candidates = [], warnings = [], parserVersion = "1" } = {}) => {
    assertInteractive();
    const { workspace, membership, members, people } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot import debts into this workspace.");
    const batchId = id("import");
    // Convenience pre-fill only (mirrors the async service's createImportBatch
    // exactly - see its comment): an EXACT match against a real verified
    // member or an existing household person (DATA-HH1) pre-selects them;
    // "strong"/"possible" matches stay unassigned for explicit human review.
    const withOwnerSuggestions = workspace.type === "household"
      ? candidates.map((candidate) => {
          if (candidate.ownerType && candidate.ownerType !== "unassigned") return candidate;
          const match = matchImportedOwnerToIdentity({ rawName: candidate.ownerSuggestion, members, people });
          if (match.status !== "exact") return candidate;
          return match.kind === "member"
            ? { ...candidate, ownerType: "member", ownerId: match.membershipUid }
            : { ...candidate, ownerType: "person", ownerId: match.personId };
        })
      : candidates;
    return repository.saveImportBatch({
      id: batchId,
      workspaceId,
      createdBy: actorId,
      createdAt: asOf,
      sourceType,
      sourceFilename,
      status: withOwnerSuggestions.length ? "review_required" : "failed",
      candidateCount: withOwnerSuggestions.length,
      confirmedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      warnings,
      metadata: { parserVersion },
      candidates: withOwnerSuggestions.map((candidate) => ({ ...candidate, importBatchId: batchId, workspaceId })),
    });
  };

  const decideImportCandidate = (workspaceId, batchId, candidateId, { decision, patch = {} } = {}) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const batch = repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) =>
      candidate.candidateId === candidateId ? { ...candidate, ...patch, decision } : candidate);
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      confirmedCount: candidates.filter((c) => c.decision === "confirmed").length,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const commitImportBatch = (workspaceId, batchId) => {
    assertInteractive();
    const { workspace, membership, members, people } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot commit this import.");
    const batch = repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status === "committed") return { batch, createdDebts: [] };
    if (batch.status !== "review_required") throw new Error(`Import batch cannot be committed from status "${batch.status}".`);

    const createdDebts = [];
    const failures = [];
    for (const candidate of batch.candidates) {
      if (candidate.decision !== "confirmed") continue;
      const debtId = `debt-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`;
      const openingBalanceSnapshotId = `opening-${debtId}`;
      try {
        // candidate.ownerSuggestion is the parser's raw, non-authoritative
        // guess and is never written to the Debt - only the human-reviewed
        // ownerType/ownerId choice (verified below) becomes real ownership.
        const ownership = resolveDebtOwnership({
          workspaceType: workspace.type,
          members,
          people,
          actorId,
          requested: { ownerType: candidate.ownerType, ownerId: candidate.ownerId },
        });
        const result = repository.createDebtWithOpeningSnapshot({
          debt: {
            id: debtId,
            workspaceId,
            name: candidate.accountName || candidate.creditorName || "Imported debt",
            debtType: candidate.debtType,
            currentBalance: candidate.currentBalance,
            // Carries the parser/spreadsheet's confidence in this balance
            // through to the created Debt (see statementCandidateAdapter.js/
            // importCandidateAdapter.js) - a candidate whose balance was
            // never confidently found must never become a Debt that looks
            // like a confirmed $0 payoff (UX-0 Part 4/6).
            balanceStatus: candidate.balanceStatus || "confirmed",
            aprStatus: candidate.aprStatus,
            apr: candidate.aprStatus === "unknown" ? null : candidate.apr,
            minimumRequiredPayment: candidate.minimumPayment ?? 0,
            dueDay: null,
            ...ownership,
            includedInCorePayoffPlan: candidate.includedInCorePayoffPlan,
            createdAt: asOf,
            createdBy: actorId,
            openingBalanceSnapshotId,
          },
          openingSnapshot: {
            id: openingBalanceSnapshotId,
            workspaceId,
            debtId,
            balance: candidate.currentBalance,
            observedAt: candidate.statementDate || asOf,
            source: "import",
            notes: `Imported from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidate.candidateId}).`,
            createdAt: asOf,
            createdBy: actorId,
          },
        });
        createdDebts.push(result.debt);
      } catch (error) {
        failures.push({ candidateId: candidate.candidateId, message: error?.message || String(error) });
      }
    }

    const confirmedCount = batch.candidates.filter((c) => c.decision === "confirmed").length;
    const committed = failures.length === 0;
    const updatedBatch = repository.saveImportBatch({
      ...batch,
      status: committed ? "committed" : (createdDebts.length ? "review_required" : "failed"),
      confirmedCount,
      rejectedCount: batch.candidates.filter((c) => c.decision === "excluded").length,
      committedAt: committed ? asOf : null,
      updatedAt: asOf,
      updatedBy: actorId,
      failure: failures.length ? `${failures.length} candidate(s) failed to commit: ${failures.map((f) => f.candidateId).join(", ")}` : "",
      warnings: [...(batch.warnings || []), ...failures.map((f) => `Candidate ${f.candidateId} failed: ${f.message}`)],
    });
    if (failures.length) throw Object.assign(new Error(`Import commit incomplete: ${failures.length} of ${confirmedCount} confirmed debts failed. ${createdDebts.length} succeeded and were kept; the batch was not marked committed so it can be retried.`), { batch: updatedBatch, createdDebts, failures });
    return { batch: updatedBatch, createdDebts };
  };

  const previewDraftPlan = (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    const debts = repository.listDebts(workspaceId);
    const included = debtIds.length
      ? debts.filter((debt) => debtIds.includes(debt.id))
      : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    if (!included.length) return null;
    const snapshotsByDebt = latestSnapshotsByDebt(repository, workspaceId, included);
    const { month, year } = parseAsOf(asOf);
    const previewVersion = {
      id: "preview-first-plan", workspaceId, planId: "preview", versionNumber: 1, strategy, asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment, goalDate, createdAt: asOf, createdBy: actorId, createdBecause: "activation",
    };
    const { projection, warnings } = buildProjectionWithWarnings({ debts: included, planVersion: previewVersion, startMonth: month, startYear: year });
    // The displayed payoff order/starting total must reflect exactly what
    // was simulated above (buildProjectionWithWarnings already excludes
    // needs-review debts internally via getEligiblePlanDebts) - otherwise a
    // preview could show a needs-review or already-paid-off debt in the
    // order while the actual projection math silently excluded it (UX-0
    // Part 8/9: preview and reality must never disagree with each other).
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    const eligibleForDisplay = getEligiblePlanDebts(included, previewVersion).filter((debt) => debtBalance(debt) > 0);
    const startingTotalBalance = eligibleForDisplay.reduce((sum, debt) => sum + debtBalance(debt), 0);
    const payoffOrder = sortDebtsForStrategy(eligibleForDisplay, strategy);
    return {
      strategy,
      extraMonthlyPayment,
      includedDebts: included,
      payoffOrder,
      startingTotalBalance,
      monthsToZero: projection.length,
      projectedZeroDate: projection.at(-1)?.month || "",
      estimatedInterest: projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
      warnings,
      projection,
    };
  };

  const createDraftPlan = (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot create payoff plans.");
    const debts = repository.listDebts(workspaceId);
    const included = debtIds.length ? debts.filter((debt) => debtIds.includes(debt.id)) : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    const plan = repository.savePlan({ id: id("plan"), workspaceId, status: "draft", createdAt: asOf, createdBy: actorId });
    const versionInput = {
      id: id("version"),
      planId: plan.id,
      workspaceId,
      versionNumber: 1,
      strategy,
      asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment,
      goalDate,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "activation",
    };
    // UX-7: persist what this version projected at creation time (kept in
    // parity with the async service's createDraftPlan) - see the matching
    // comment there for why.
    const { month: draftMonth, year: draftYear } = parseAsOf(asOf);
    const draftProjection = buildProjectionWithWarnings({ debts: included, planVersion: versionInput, startMonth: draftMonth, startYear: draftYear }).projection;
    const version = repository.savePlanVersion({
      ...versionInput,
      projectedZeroDate: draftProjection.at(-1)?.month || "",
    });
    return { plan, version };
  };

  const activatePlan = (workspaceId, planId, versionId) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot activate payoff plans.");
    const context = activatePlanTransaction({ repository, workspaceId, planId, versionId, actorId, activatedAt: asOf });
    const debts = repository.listDebts(workspaceId);
    const { month, year } = parseAsOf(asOf);
    for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: context.version, startMonth: month, startYear: year }).slice(0, 36)) {
      repository.createExpectedCheckpoint(checkpoint);
    }
    return context;
  };

  const previewScenario = (workspaceId, { extraMonthlyPayment = 100 } = {}) => {
    const snapshot = getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const scenarioVersion = {
      ...snapshot.activeContext.version,
      extraMonthlyPayment: Number(snapshot.activeContext.version.extraMonthlyPayment || 0) + Number(extraMonthlyPayment || 0),
    };
    const scenarioProjection = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: scenarioVersion, startMonth: month, startYear: year }).projection;
    return calculateWhatIfComparison({ baselineRows: snapshot.projection, scenarioRows: scenarioProjection });
  };

  const previewReforecast = (workspaceId, overrides = {}) => {
    const snapshot = getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const proposedVersion = {
      ...snapshot.activeContext.version,
      ...overrides,
      id: `${snapshot.activeContext.version.id}-preview`,
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      createdBecause: "reforecast",
    };
    const proposed = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: proposedVersion, startMonth: month, startYear: year });
    return {
      priorVersion: snapshot.activeContext.version,
      proposedVersion,
      oldProjectedZeroDate: snapshot.projectedZeroDate,
      proposedZeroDate: proposed.projection.at(-1)?.month || "",
      warnings: proposed.warnings,
      projection: proposed.projection,
    };
  };

  const applyReforecast = (workspaceId, overrides = {}) => {
    assertInteractive();
    const { membership } = getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot reforecast payoff plans.");
    const snapshot = getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.plan || !snapshot.activeContext?.version) throw new Error("No active plan to reforecast");
    // UX-4.1 fix (kept in parity with the async service's applyReforecast):
    // re-derive startingDebtSnapshot from currently-eligible debts on every
    // reforecast, instead of carrying the old version's frozen snapshot
    // forward unchanged - otherwise a debt added after activation could
    // never actually join the plan no matter how many times it was
    // reforecasted.
    const included = snapshot.debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    const nextVersionInput = {
      ...snapshot.activeContext.version,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      ...overrides,
      id: id("version"),
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      asOf,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "reforecast",
    };
    // UX-7: persist this version's projected $0 date (kept in parity with
    // the async service's applyReforecast) - see the matching comment there.
    const { month: reforecastMonth, year: reforecastYear } = parseAsOf(asOf);
    const reforecastProjection = buildProjectionWithWarnings({ debts: included, planVersion: nextVersionInput, startMonth: reforecastMonth, startYear: reforecastYear }).projection;
    const nextVersion = repository.savePlanVersion({
      ...nextVersionInput,
      projectedZeroDate: reforecastProjection.at(-1)?.month || "",
    });
    return activatePlan(workspaceId, snapshot.activeContext.plan.id, nextVersion.id);
  };

  return {
    mode,
    actorId,
    getWorkspaces,
    getWorkspaceContext,
    getWorkspaceSnapshot,
    getActivePlanContext,
    createNewDebt,
    updateDebt,
    recordPayment,
    recordBalanceSnapshot,
    createImportBatch,
    decideImportCandidate,
    commitImportBatch,
    previewDraftPlan,
    createDraftPlan,
    activatePlan,
    previewScenario,
    previewReforecast,
    applyReforecast,
    getCurrentPeriod: () => monthKeyFromDate(asOf),
  };
};
