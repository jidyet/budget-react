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
