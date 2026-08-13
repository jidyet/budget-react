import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { FirebaseTrackToZeroRepository } from "../src/services/repositories/firebaseTrackToZeroRepository.js";
import { buildMigrationPreview } from "../src/services/adapters/legacyTrackToZeroAdapter.js";
import { executeMigrationPreview, rollbackMigration } from "../src/services/tracktozero/migrationExecutor.js";

const PROJECT_ID = "demo-budget-react-v2";
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const ts = "2026-08-13T00:00:00.000Z";
let testEnv;

const repoAs = (uid, token = {}) => new FirebaseTrackToZeroRepository(testEnv.authenticatedContext(uid, token).firestore());
const previewFixture = () => buildMigrationPreview({
  legacyWorkspace: { id: "legacy-house", type: "household", memberIds: ["owner", "contrib"], ownerId: "owner" },
  legacyMembers: [
    { uid: "owner", role: "owner", status: "active" },
    { uid: "contrib", role: "member", status: "active" },
  ],
  legacyAccounts: [
    { id: "card", name: "Shared Credit Card", cur_bal: 1200, base_bal_v: 1500, min_due_v: 60, apr_v: 24, billType: "paydown", planned_v: 250, paid_v: 180 },
    { id: "loan", name: "Shared Loan", cur_bal: 2200, min_due_v: 120, apr_v: "", billType: "paydown" },
    { id: "mortgage", name: "House Mortgage", cur_bal: 250000, min_due_v: 1800, apr_v: 6, billType: "paydown" },
    { id: "utility", name: "Water Utility", cur_bal: 0, billType: "monthly", category: "Utilities" },
    { id: "mystery", name: "Mystery Shared", cur_bal: 80, min_due_v: 8 },
  ],
  legacyPlans: [{ id: "legacy-plan", strategy: "avalanche", monthly_extra: 100, items: [{ account_id: "card", include: true }] }],
  confirmations: { mystery: { classification: "not_debt" } },
  asOf: ts,
  previewGeneratedAt: ts,
});

const largeFixture = () => {
  const members = [
    { uid: "large-owner", role: "owner", status: "active" },
    { uid: "large-member-a", role: "member", status: "active" },
    { uid: "large-member-b", role: "member", status: "active" },
    { uid: "large-member-c", role: "member", status: "active" },
  ];
  const known = Array.from({ length: 40 }, (_, index) => ({
    id: `large-known-${index + 1}`,
    name: `Synthetic Credit Card ${index + 1}`,
    cur_bal: 500 + index * 25,
    base_bal_v: 650 + index * 25,
    min_due_v: 35 + (index % 6),
    apr_v: 12 + (index % 12),
    billType: "paydown",
    planned_v: 900,
    paid_v: 800,
  }));
  const unknown = Array.from({ length: 10 }, (_, index) => ({
    id: `large-unknown-${index + 1}`,
    name: `Synthetic Personal Loan ${index + 1}`,
    cur_bal: 1200 + index * 50,
    min_due_v: 80,
    apr_v: "",
    billType: "paydown",
  }));
  const mortgages = Array.from({ length: 10 }, (_, index) => ({
    id: `large-mortgage-${index + 1}`,
    name: `Synthetic Mortgage ${index + 1}`,
    cur_bal: 150000 + index * 1000,
    min_due_v: 1400,
    apr_v: 5 + (index % 3),
    billType: "paydown",
  }));
  const expenses = Array.from({ length: 50 }, (_, index) => ({
    id: `large-expense-${index + 1}`,
    name: `Synthetic Utility ${index + 1}`,
    cur_bal: 0,
    billType: "monthly",
    category: "Utilities",
  }));
  const ambiguous = Array.from({ length: 10 }, (_, index) => ({
    id: `large-ambiguous-${index + 1}`,
    name: `Synthetic Family Record ${index + 1}`,
    cur_bal: 100 + index,
    min_due_v: 10,
  }));
  return {
    legacyWorkspace: { id: "large-house", type: "household", memberIds: members.map((member) => member.uid), ownerId: "large-owner" },
    legacyMembers: members,
    legacyAccounts: [...known, ...unknown, ...mortgages, ...expenses, ...ambiguous],
    legacyPlans: [
      { id: "large-plan-avalanche", strategy: "avalanche", monthly_extra: 250, items: known.slice(0, 20).map((account) => ({ account_id: account.id, include: true })) },
      { id: "large-plan-snowball", strategy: "snowball", monthly_extra: 150, items: [...unknown, ...known.slice(20, 30)].map((account) => ({ account_id: account.id, include: true })) },
    ],
    confirmations: Object.fromEntries(ambiguous.map((account) => [account.id, { classification: "not_debt" }])),
  };
};

test.before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required; run via npm run test:firestore:v2");
  const rules = await readFile(resolve("firestore.v2.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: EMULATOR_HOST, port: Number(EMULATOR_PORT), rules },
  });
});
test.beforeEach(async () => testEnv.clearFirestore());
test.after(async () => testEnv.cleanup());

test("Phase 4 migration executes, validates, rolls back, and respects emulator v2 rules", async () => {
  const preview = previewFixture();
  const ownerRepo = repoAs("owner", { trackToZeroMigrationOperator: true });
  const result = await executeMigrationPreview({
    repository: ownerRepo,
    preview,
    sourceFingerprint: preview.sourceFingerprint,
    confirmedPreviewDigest: preview.previewDigest,
    explicitConfirmation: true,
    actorId: "owner",
  });
  assert.equal(result.validation.ok, true);
  assert.equal((await repoAs("contrib").listDebts(preview.candidateWorkspace.id)).length, 3);
  assert.equal((await repoAs("contrib").listPaymentEvents(preview.candidateWorkspace.id, preview.candidateDebts[0].id)).length, 0);
  assert.equal((await repoAs("contrib").getWorkspace(preview.candidateWorkspace.id)).activePlanId, "");
  assert.equal((await ownerRepo.getMigrationRun(preview.candidateWorkspace.id, `migration-${preview.previewDigest}`)).migrationState, "rollback_allowed");

  await assert.rejects(
    rollbackMigration({ repository: repoAs("owner"), preview, actorId: "owner" }),
    /Missing or insufficient permissions|permission|PERMISSION_DENIED/i
  );
  const rollback = await rollbackMigration({ repository: ownerRepo, preview, actorId: "owner" });
  assert.equal(rollback.manifest.migrationState, "rolled_back");
  assert.equal((await ownerRepo.listDebts(preview.candidateWorkspace.id)).length, 0);
  assert.equal((await ownerRepo.listPlans(preview.candidateWorkspace.id)).length, 0);
});

test("Phase 4 migration denies non-owner operators and blocks rollback after native writes", async () => {
  const preview = previewFixture();
  await assert.rejects(
    executeMigrationPreview({
      repository: repoAs("contrib", { trackToZeroMigrationOperator: true }),
      preview,
      sourceFingerprint: preview.sourceFingerprint,
      confirmedPreviewDigest: preview.previewDigest,
      explicitConfirmation: true,
      actorId: "contrib",
    }),
    /owner\/admin/i
  );
  const ownerRepo = repoAs("owner", { trackToZeroMigrationOperator: true });
  await executeMigrationPreview({
    repository: ownerRepo,
    preview,
    sourceFingerprint: preview.sourceFingerprint,
    confirmedPreviewDigest: preview.previewDigest,
    explicitConfirmation: true,
    actorId: "owner",
  });
  await ownerRepo.saveDebt({
    id: "native-write",
    workspaceId: preview.candidateWorkspace.id,
    name: "Native debt",
    currentBalance: 10,
    minimumRequiredPayment: 1,
    createdAt: ts,
    createdBy: "owner",
  });
  await assert.rejects(
    rollbackMigration({ repository: ownerRepo, preview, actorId: "owner" }),
    /native or unrelated writes/i
  );
});

test("Phase 4 large synthetic fixture executes, validates, and rolls back under emulator rules", async () => {
  const source = largeFixture();
  const unresolved = buildMigrationPreview({ ...source, confirmations: {}, asOf: ts, previewGeneratedAt: ts });
  assert.equal(source.legacyAccounts.length, 120);
  assert.equal(unresolved.ambiguousRecords.length, 10);
  const preview = buildMigrationPreview({ ...source, asOf: ts, previewGeneratedAt: ts });
  assert.equal(preview.writesPerformed, 0);
  assert.equal(preview.candidateMemberships.length, 4);
  assert.equal(preview.candidateDebts.length, 60);
  assert.equal(preview.excludedLegacyExpenses.length, 60);
  assert.equal(preview.ambiguousRecords.length, 0);
  assert.equal(preview.initialBalanceSnapshots.length, 60);
  assert.equal(preview.candidateDraftPlans.length, 2);
  assert.equal(preview.expectedTargetPaths.length, 153);
  assert.equal(preview.expectedWriteCount, 154);

  const sourceBefore = structuredClone(source);
  const ownerRepo = repoAs("large-owner", { trackToZeroMigrationOperator: true });
  const result = await executeMigrationPreview({
    repository: ownerRepo,
    preview,
    sourceFingerprint: preview.sourceFingerprint,
    confirmedPreviewDigest: preview.previewDigest,
    explicitConfirmation: true,
    actorId: "large-owner",
  });
  assert.equal(result.validation.ok, true);
  assert.equal(result.writesPerformed, 153);
  assert.equal((await ownerRepo.listDebts(preview.candidateWorkspace.id)).length, 60);
  assert.equal((await ownerRepo.listPlans(preview.candidateWorkspace.id)).length, 2);
  assert.deepEqual(source, sourceBefore);

  const rollback = await rollbackMigration({ repository: ownerRepo, preview, actorId: "large-owner" });
  assert.equal(rollback.manifest.migrationState, "rolled_back");
  assert.equal((await ownerRepo.listDebts(preview.candidateWorkspace.id)).length, 0);
  assert.equal((await ownerRepo.listPlans(preview.candidateWorkspace.id)).length, 0);
});
