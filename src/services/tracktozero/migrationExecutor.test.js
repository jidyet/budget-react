import { describe, expect, it } from "vitest";
import { buildMigrationPreview } from "../adapters/legacyTrackToZeroAdapter";
import { InMemoryTrackToZeroRepository, v2Paths } from "../repositories/tracktozeroRepositories";
import {
  collectWorkspacePaths,
  executeMigrationPreview,
  rollbackMigration,
  validateMigrationPreviewAgainstRepository,
} from "./migrationExecutor";

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

    repo.saveDebt({ id: "native-after-cutover", workspaceId: preview.candidateWorkspace.id, name: "Native", currentBalance: 10, minimumRequiredPayment: 1, createdAt: ts, createdBy: "owner-a" });
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
});
