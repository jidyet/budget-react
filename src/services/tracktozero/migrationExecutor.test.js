import { describe, expect, it } from "vitest";
import { buildMigrationPreview } from "../adapters/legacyTrackToZeroAdapter";
import { InMemoryTrackToZeroRepository, v2Paths } from "../repositories/tracktozeroRepositories";
import { buildExpectedCheckpoints, simulatePlanVersion } from "../adapters/tracktozeroCalcAdapter";
import {
  collectWorkspacePaths,
  executeMigrationPreview,
  rollbackMigration,
  validateMigrationPreviewAgainstRepository,
} from "./migrationExecutor";
import { describeMigrationUxState, MIGRATION_UX_STATES } from "./migrationUxState";

const ts = "2026-08-13T00:00:00.000Z";

const personalFixture = () => ({
  legacyWorkspace: { uid: "owner-a", id: "owner-a" },
  legacyAccounts: [
    { id: "card", name: "Capital One Card", cur_bal: 1000, base_bal_v: 1200, min_due_v: 50, apr_v: 25, billType: "paydown", planned_v: 250, paid_v: 200 },
    { id: "loan", name: "SoFi Loan", cur_bal: 3000, min_due_v: 125, apr_v: "", billType: "paydown" },
    { id: "mortgage", name: "Home Mortgage", cur_bal: 250000, min_due_v: 1800, apr_v: 6, billType: "paydown" },
    { id: "electric", name: "Electric Utility", cur_bal: 0, min_due_v: 90, billType: "monthly", category: "Utilities" },
    { id: "mystery", name: "Family account", cur_bal: 100, min_due_v: 10 },
  ],
  legacyPlans: [{ id: "plan-a", strategy: "avalanche", monthly_extra: 100, items: [{ account_id: "card", include: true, extra_payment: 100 }] }],
});

const confirmedPersonalPreview = () => buildMigrationPreview({
  ...personalFixture(),
  confirmations: { mystery: { classification: "not_debt" } },
  asOf: ts,
  previewGeneratedAt: ts,
});

const payoffSummary = (debts, version) => {
  const rows = simulatePlanVersion({ debts, planVersion: version, startMonth: 8, startYear: 2026, maxMonths: 240 });
  return {
    strategy: version.strategy,
    payoffOrderByDebt: version.startingDebtSnapshot.filter((item) => item.includedInCorePayoffPlan).map((item) => item.debtId),
    monthsToZero: rows.length,
    payoffMonth: rows.at(-1)?.month || "",
    totalInterest: Number(rows.reduce((sum, row) => sum + Number(row.total_interest || 0), 0).toFixed(6)),
    finalRemainingDebt: Number((rows.at(-1)?.remaining_debt || 0).toFixed(6)),
  };
};

const checkpointSortValue = (period) => {
  const parsed = Date.parse(`1 ${period} UTC`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const checkpointSummary = (checkpoints) => [...checkpoints]
  .sort((a, b) => checkpointSortValue(a.period) - checkpointSortValue(b.period))
  .slice(0, 5)
  .map((checkpoint) => ({
    period: checkpoint.period,
    expectedTotalBalance: Number(checkpoint.expectedTotalBalance.toFixed(6)),
    projectedZeroDate: checkpoint.projectedZeroDate,
  }));

const largeFixture = () => {
  const legacyMembers = [
    { uid: "large-owner", role: "owner", status: "active" },
    { uid: "large-member-a", role: "member", status: "active" },
    { uid: "large-member-b", role: "member", status: "active" },
    { uid: "large-member-c", role: "member", status: "active" },
  ];
  const debtAccounts = Array.from({ length: 40 }, (_, index) => ({
    id: `debt-known-${index + 1}`,
    name: `Synthetic Credit Card ${index + 1}`,
    cur_bal: 500 + index * 25,
    base_bal_v: 600 + index * 25,
    min_due_v: 35 + (index % 5),
    apr_v: 12 + (index % 12),
    billType: "paydown",
    owner: index % 2 ? "Member A" : "Owner",
    planned_v: 1000,
    paid_v: 999,
  }));
  const unknownApr = Array.from({ length: 10 }, (_, index) => ({
    id: `debt-unknown-${index + 1}`,
    name: `Synthetic Personal Loan ${index + 1}`,
    cur_bal: 1200 + index * 50,
    min_due_v: 80,
    apr_v: "",
    billType: "paydown",
    owner: "Member B",
  }));
  const mortgages = Array.from({ length: 10 }, (_, index) => ({
    id: `mortgage-${index + 1}`,
    name: `Synthetic Mortgage ${index + 1}`,
    cur_bal: 150000 + index * 1000,
    min_due_v: 1400,
    apr_v: 5 + (index % 3),
    billType: "paydown",
    owner: "Owner",
  }));
  const expenses = Array.from({ length: 50 }, (_, index) => ({
    id: `expense-${index + 1}`,
    name: `Synthetic Utility ${index + 1}`,
    cur_bal: 0,
    min_due_v: 75,
    billType: "monthly",
    category: index % 2 ? "Utilities" : "Subscriptions",
  }));
  const ambiguous = Array.from({ length: 10 }, (_, index) => ({
    id: `ambiguous-${index + 1}`,
    name: `Synthetic Family Record ${index + 1}`,
    cur_bal: 100 + index,
    min_due_v: 10,
  }));
  return {
    legacyWorkspace: { id: "large-house", type: "household", memberIds: legacyMembers.map((member) => member.uid), ownerId: "large-owner" },
    legacyMembers,
    legacyAccounts: [...debtAccounts, ...unknownApr, ...mortgages, ...expenses, ...ambiguous],
    legacyPlans: [
      { id: "large-plan-avalanche", strategy: "avalanche", monthly_extra: 250, items: debtAccounts.slice(0, 20).map((account) => ({ account_id: account.id, include: true })) },
      { id: "large-plan-snowball", strategy: "snowball", monthly_extra: 150, items: [...unknownApr, ...debtAccounts.slice(20, 30)].map((account) => ({ account_id: account.id, include: true })) },
    ],
    confirmations: Object.fromEntries(ambiguous.map((account) => [account.id, { classification: "not_debt" }])),
  };
};

describe("Phase 4 migration preview", () => {
  it("is deterministic, zero-write, fingerprinted, and digest-bound", () => {
    const source = personalFixture();
    const a = buildMigrationPreview({ ...source, asOf: ts, previewGeneratedAt: ts });
    const b = buildMigrationPreview({ ...source, asOf: ts, previewGeneratedAt: ts });
    expect(a).toEqual(b);
    expect(a.writesPerformed).toBe(0);
    expect(a.sourceFingerprint).toMatch(/^[a-f0-9]{8}$/);
    expect(a.previewDigest).toMatch(/^[a-f0-9]{8}$/);
    expect(a.candidateWorkspace.activePlanId).toBe("");
    expect(a.ambiguousRecords.map((record) => record.id)).toContain("mystery");
    expect(a.expectedTargetPaths).toEqual([...a.expectedTargetPaths].sort());
  });

  it("classifies debts, exclusions, unknown APR, mortgage exclusion, planned_v, and paid_v safely", () => {
    const preview = confirmedPersonalPreview();
    expect(preview.ambiguousRecords).toHaveLength(0);
    expect(preview.excludedLegacyExpenses.map((record) => record.id)).toEqual(expect.arrayContaining(["electric", "mystery"]));
    expect(preview.candidateDebts).toHaveLength(3);
    expect(preview.candidateDebts.find((debt) => debt.id === preview.sourceToTargetIdMap.debts.loan).aprStatus).toBe("unknown");
    expect(preview.candidateDebts.find((debt) => debt.id === preview.sourceToTargetIdMap.debts.mortgage).includedInCorePayoffPlan).toBe(false);
    expect(preview.candidatePaymentEvents).toEqual([]);
    expect(preview.candidateDraftPlans[0].status).toBe("draft");
    expect(preview.candidateWorkspace.activePlanId).toBe("");
    expect(preview.warnings.join(" ")).toMatch(/planned_v/);
    expect(preview.warnings.join(" ")).toMatch(/paid_v/);
  });

  it("builds household migration candidates with conservative role mapping and ambiguity blocking", () => {
    const preview = buildMigrationPreview({
      legacyWorkspace: { id: "house-1", type: "household", memberIds: ["owner-h", "member-h"], ownerId: "owner-h" },
      legacyMembers: [
        { uid: "owner-h", role: "owner", status: "active" },
        { uid: "member-h", role: "member", status: "active" },
      ],
      legacyAccounts: [
        { id: "shared-card", name: "Shared Credit Card", owner: "Baba", cur_bal: 500, min_due_v: 25, apr_v: 21, billType: "paydown" },
        { id: "shared-mystery", name: "Shared thing", cur_bal: 50, min_due_v: 5 },
      ],
      legacyPlans: [{ id: "shared-plan", strategy: "snowball", monthly_extra: 50, items: [{ account_id: "shared-card", include: true }] }],
      asOf: ts,
      previewGeneratedAt: ts,
    });
    expect(preview.sourceIdentity.type).toBe("household");
    expect(preview.candidateMemberships.find((member) => member.uid === "owner-h").role).toBe("owner");
    expect(preview.candidateMemberships.find((member) => member.uid === "member-h").role).toBe("contributor");
    expect(preview.candidateDebts[0].ownerLabel).toBe("Baba");
    expect(preview.ambiguousRecords.map((record) => record.id)).toContain("shared-mystery");
  });
});

describe("Phase 4 migration execution, resume, validation, and rollback", () => {
  it("blocks ambiguity, missing confirmation, digest mismatch, source drift, and unauthorized actors before writes", async () => {
    const ambiguous = buildMigrationPreview({ ...personalFixture(), asOf: ts, previewGeneratedAt: ts });
    const repo = new InMemoryTrackToZeroRepository();
    await expect(executeMigrationPreview({
      repository: repo,
      preview: ambiguous,
      sourceFingerprint: ambiguous.sourceFingerprint,
      confirmedPreviewDigest: ambiguous.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
    })).rejects.toThrow(/need confirmation/i);

    const preview = confirmedPersonalPreview();
    await expect(executeMigrationPreview({ repository: repo, preview, sourceFingerprint: preview.sourceFingerprint, confirmedPreviewDigest: preview.previewDigest, actorId: "owner-a" })).rejects.toThrow(/confirmation/i);
    await expect(executeMigrationPreview({ repository: repo, preview, sourceFingerprint: preview.sourceFingerprint, confirmedPreviewDigest: "bad", explicitConfirmation: true, actorId: "owner-a" })).rejects.toThrow(/digest/i);
    await expect(executeMigrationPreview({ repository: repo, preview, sourceFingerprint: "drift", confirmedPreviewDigest: preview.previewDigest, explicitConfirmation: true, actorId: "owner-a" })).rejects.toThrow(/fingerprint/i);
    await expect(executeMigrationPreview({ repository: repo, preview, sourceFingerprint: preview.sourceFingerprint, confirmedPreviewDigest: preview.previewDigest, explicitConfirmation: true, actorId: "viewer" })).rejects.toThrow(/owner\/admin/i);
    expect(await collectWorkspacePaths({ repository: repo, workspaceId: preview.candidateWorkspace.id })).toEqual([]);
  });

  it("executes idempotently, resumes partial failure, validates, and blocks rollback after native writes", async () => {
    const preview = confirmedPersonalPreview();
    const repo = new InMemoryTrackToZeroRepository();
    await expect(executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
      failAfterWrites: 4,
    })).rejects.toThrow(/Injected/);
    let run = repo.getMigrationRun(preview.candidateWorkspace.id, `migration-${preview.previewDigest}`);
    expect(run.migrationState).toBe("partial_failed");
    expect(run.completedPaths.length).toBeGreaterThan(0);

    const result = await executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
    });
    expect(result.validation.ok).toBe(true);
    run = repo.getMigrationRun(preview.candidateWorkspace.id, `migration-${preview.previewDigest}`);
    expect(run.migrationState).toBe("rollback_allowed");

    const second = await executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
    });
    expect(second.validation.ok).toBe(true);
    expect(repo.listDebts(preview.candidateWorkspace.id)).toHaveLength(3);
    expect(repo.listPaymentEvents(preview.candidateWorkspace.id, preview.candidateDebts[0].id)).toHaveLength(0);
    expect(repo.getWorkspace(preview.candidateWorkspace.id).activePlanId).toBe("");

    repo.createDebtWithOpeningSnapshot({
      debt: {
        id: "native-after-cutover",
        workspaceId: preview.candidateWorkspace.id,
        name: "Native",
        currentBalance: 10,
        minimumRequiredPayment: 1,
        createdAt: ts,
        createdBy: "owner-a",
        openingBalanceSnapshotId: "opening-native-after-cutover",
      },
      openingSnapshot: {
        id: "opening-native-after-cutover",
        workspaceId: preview.candidateWorkspace.id,
        debtId: "native-after-cutover",
        balance: 10,
        observedAt: ts,
        source: "manual",
        createdAt: ts,
        createdBy: "owner-a",
      },
    });
    await expect(rollbackMigration({ repository: repo, preview, actorId: "owner-a" })).rejects.toThrow(/Rollback blocked/);
  });

  it("rolls back migration-created financial data while preserving unrelated workspaces", async () => {
    const preview = confirmedPersonalPreview();
    const repo = new InMemoryTrackToZeroRepository();
    repo.saveWorkspace({ id: "unrelated", type: "personal", createdAt: ts, createdBy: "other" });
    repo.saveMembership({ workspaceId: "unrelated", uid: "other", role: "owner", createdAt: ts, createdBy: "other" });
    await executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
    });
    expect((await validateMigrationPreviewAgainstRepository({ repository: repo, preview })).ok).toBe(true);
    const rollback = await rollbackMigration({ repository: repo, preview, actorId: "owner-a" });
    expect(rollback.deletedPaths).toContain(v2Paths.debt(preview.candidateWorkspace.id, preview.candidateDebts[0].id));
    expect(repo.listDebts(preview.candidateWorkspace.id)).toEqual([]);
    expect(repo.listPlans(preview.candidateWorkspace.id)).toEqual([]);
    expect(repo.getWorkspace("unrelated").id).toBe("unrelated");
    expect(repo.getMigrationRun(preview.candidateWorkspace.id, `migration-${preview.previewDigest}`).migrationState).toBe("rolled_back");
  });

  it("proves projection parity before vs after persistence migration", async () => {
    const preview = confirmedPersonalPreview();
    const repo = new InMemoryTrackToZeroRepository();
    const beforeVersion = preview.candidatePlanVersions[0];
    const beforeSummary = payoffSummary(preview.candidateDebts, beforeVersion);
    const beforeCheckpoints = buildExpectedCheckpoints({ debts: preview.candidateDebts, planVersion: beforeVersion, startMonth: 8, startYear: 2026, maxMonths: 60 });

    await executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "owner-a",
    });

    const persistedDebts = repo.listDebts(preview.candidateWorkspace.id);
    const persistedVersion = repo.listPlanVersions(preview.candidateWorkspace.id, preview.candidateDraftPlans[0].id)[0];
    const afterSummary = payoffSummary(persistedDebts, persistedVersion);
    const afterCheckpoints = repo.listExpectedCheckpoints(preview.candidateWorkspace.id, persistedVersion.planId, persistedVersion.id);

    expect(afterSummary).toEqual(beforeSummary);
    expect(checkpointSummary(afterCheckpoints)).toEqual(checkpointSummary(beforeCheckpoints));
  });

  it("proves large synthetic fixture preview, execution, validation, and rollback", async () => {
    const source = largeFixture();
    const unresolved = buildMigrationPreview({ ...source, confirmations: {}, asOf: ts, previewGeneratedAt: ts });
    expect(unresolved.ambiguousRecords).toHaveLength(10);

    const preview = buildMigrationPreview({ ...source, asOf: ts, previewGeneratedAt: ts });
    expect(preview.writesPerformed).toBe(0);
    expect(source.legacyAccounts).toHaveLength(120);
    expect(preview.candidateMemberships).toHaveLength(4);
    expect(preview.candidateDebts).toHaveLength(60);
    expect(preview.excludedLegacyExpenses).toHaveLength(60);
    expect(preview.ambiguousRecords).toHaveLength(0);
    expect(preview.initialBalanceSnapshots).toHaveLength(60);
    expect(preview.candidateDraftPlans).toHaveLength(2);
    expect(preview.expectedTargetPaths).toHaveLength(153);
    expect(preview.expectedWriteCount).toBe(154);
    expect(preview.candidateDebts.filter((debt) => debt.aprStatus === "unknown")).toHaveLength(10);
    expect(preview.candidateDebts.filter((debt) => debt.debtType === "mortgage" && debt.includedInCorePayoffPlan === false)).toHaveLength(10);

    const sourceBefore = structuredClone(source);
    const repo = new InMemoryTrackToZeroRepository();
    const result = await executeMigrationPreview({
      repository: repo,
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "large-owner",
    });
    expect(result.validation.ok).toBe(true);
    expect(result.writesPerformed).toBe(153);
    expect(repo.listDebts(preview.candidateWorkspace.id)).toHaveLength(60);
    expect(repo.listPlans(preview.candidateWorkspace.id)).toHaveLength(2);
    expect(repo.listBalanceSnapshots(preview.candidateWorkspace.id, preview.candidateDebts[0].id)).toHaveLength(1);
    expect(source).toEqual(sourceBefore);

    const rollback = await rollbackMigration({ repository: repo, preview, actorId: "large-owner" });
    expect(rollback.manifest.migrationState).toBe("rolled_back");
    expect(repo.listDebts(preview.candidateWorkspace.id)).toEqual([]);
    expect(repo.listPlans(preview.candidateWorkspace.id)).toEqual([]);
  });
});

describe("Phase 4 migration UX state contract", () => {
  it("covers loading, preview, confirmation, ready, in-progress, success, rollback, and failure states safely", () => {
    const needsConfirmation = buildMigrationPreview({ ...personalFixture(), asOf: ts, previewGeneratedAt: ts });
    const ready = confirmedPersonalPreview();
    const success = { manifest: { rollbackEligible: true }, validation: { ok: true } };
    const validationFailed = { ok: false, mismatches: [{ path: "x" }] };

    expect(describeMigrationUxState({ loading: true }).state).toBe(MIGRATION_UX_STATES.LOADING_SOURCE);
    expect(describeMigrationUxState({ preview: { expectedTargetPaths: [] } }).state).toBe(MIGRATION_UX_STATES.PREVIEW_READY);
    expect(describeMigrationUxState({ preview: needsConfirmation }).state).toBe(MIGRATION_UX_STATES.NEEDS_CONFIRMATION);
    expect(describeMigrationUxState({ preview: ready }).state).toBe(MIGRATION_UX_STATES.READY_TO_MIGRATE);
    expect(describeMigrationUxState({ migrating: true }).state).toBe(MIGRATION_UX_STATES.MIGRATING);
    const failed = describeMigrationUxState({ migrationError: new Error("PERMISSION_DENIED raw Firebase stack") });
    expect(failed.state).toBe(MIGRATION_UX_STATES.MIGRATION_FAILED);
    expect(failed.showSuccess).toBe(false);
    expect(failed.world2Authoritative).toBe(false);
    expect(failed.message).not.toMatch(/PERMISSION_DENIED|Firebase/i);
    const invalid = describeMigrationUxState({ validation: validationFailed });
    expect(invalid.state).toBe(MIGRATION_UX_STATES.VALIDATION_FAILED);
    expect(invalid.showSuccess).toBe(false);
    const rollbackAvailable = describeMigrationUxState({ migrationResult: success });
    expect(rollbackAvailable.state).toBe(MIGRATION_UX_STATES.ROLLBACK_AVAILABLE);
    expect(rollbackAvailable.rollbackActionAvailable).toBe(true);
    const succeeded = describeMigrationUxState({ migrationResult: { validation: { ok: true } } });
    expect(succeeded.state).toBe(MIGRATION_UX_STATES.MIGRATION_SUCCEEDED);
    expect(succeeded.showSuccess).toBe(true);
    const blocked = describeMigrationUxState({ rollback: { blocked: true } });
    expect(blocked.state).toBe(MIGRATION_UX_STATES.ROLLBACK_BLOCKED);
    expect(blocked.rollbackActionAvailable).toBe(false);
  });
});
