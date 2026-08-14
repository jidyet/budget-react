import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { FirebaseTrackToZeroRepository } from "../src/services/repositories/firebaseTrackToZeroRepository.js";
import { createTrackToZeroV2AsyncAppService } from "../src/services/tracktozero/v2AsyncApplicationService.js";
import { buildExpectedCheckpoints } from "../src/services/adapters/tracktozeroCalcAdapter.js";
import { createStartingDebtSnapshotItem } from "../src/domain/tracktozero/models.js";
import { assertTrackToZeroV2EmulatorConfig, TRACKTOZERO_V2_EMULATOR_PROJECT_ID } from "../src/services/tracktozero/repositoryRuntime.js";

const PROJECT_ID = TRACKTOZERO_V2_EMULATOR_PROJECT_ID;
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "").split(":");
const AS_OF = "2026-08-13T12:00:00.000Z";

let testEnv;

const repoAs = (uid) => new FirebaseTrackToZeroRepository(testEnv.authenticatedContext(uid).firestore());
const serviceAs = (uid) => createTrackToZeroV2AsyncAppService({ repository: repoAs(uid), actorId: uid, asOf: AS_OF });
const date = (iso = AS_OF) => new Date(iso);

const personalDebts = [
  { id: "p-card", workspaceId: "personal-e2e", name: "Personal Card", status: "active", debtType: "credit_card", currentBalance: 1200, startingBalance: 1500, aprStatus: "known", apr: 0.24, minimumRequiredPayment: 80, dueDay: 18, ownerLabel: "Owner", includedInCorePayoffPlan: true, createdAt: AS_OF, createdBy: "owner" },
  { id: "p-unknown", workspaceId: "personal-e2e", name: "Unknown APR Loan", status: "active", debtType: "personal_loan", currentBalance: 800, startingBalance: 800, aprStatus: "unknown", apr: null, minimumRequiredPayment: 60, dueDay: 9, ownerLabel: "Owner", includedInCorePayoffPlan: true, createdAt: AS_OF, createdBy: "owner" },
  { id: "p-mortgage", workspaceId: "personal-e2e", name: "Mortgage", status: "active", debtType: "mortgage", currentBalance: 240000, startingBalance: 240000, aprStatus: "known", apr: 0.06, minimumRequiredPayment: 1600, dueDay: 1, ownerLabel: "Owner", includedInCorePayoffPlan: false, createdAt: AS_OF, createdBy: "owner" },
];

const householdDebts = [
  { id: "h-card", workspaceId: "household-e2e", name: "Household Card", status: "active", debtType: "credit_card", currentBalance: 3200, startingBalance: 3400, aprStatus: "known", apr: 0.279, minimumRequiredPayment: 120, dueDay: 22, ownerLabel: "Admin", includedInCorePayoffPlan: true, createdAt: AS_OF, createdBy: "owner" },
  { id: "h-finance", workspaceId: "household-e2e", name: "Shared Financing", status: "active", debtType: "no_interest_plan", currentBalance: 500, startingBalance: 600, aprStatus: "no_interest", apr: 0, minimumRequiredPayment: 45, dueDay: 12, ownerLabel: "Owner", includedInCorePayoffPlan: true, createdAt: AS_OF, createdBy: "owner" },
];

const versionFor = ({ workspaceId, planId, versionId, debts, strategy = "avalanche", extraMonthlyPayment = 100, versionNumber = 1 }) => ({
  id: versionId,
  planId,
  workspaceId,
  versionNumber,
  strategy,
  asOf: AS_OF,
  startingDebtSnapshot: debts.map(createStartingDebtSnapshotItem),
  extraMonthlyPayment,
  projectedZeroDate: "",
  createdAt: AS_OF,
  createdBy: "owner",
  createdBecause: versionNumber === 1 ? "activation" : "reforecast",
});

async function seedWorkspace({ repository, workspaceId, type, debts, strategy, extraMonthlyPayment }) {
  const owner = repository;
  await owner.saveWorkspace({ id: workspaceId, type, status: "active", activePlanId: "", createdAt: date(), createdBy: "owner" });
  const members = type === "household"
    ? [["owner", "owner"], ["admin", "admin"], ["contrib", "contributor"], ["viewer", "viewer"]]
    : [["owner", "owner"]];
  for (const [uid, role] of members) {
    await owner.saveMembership({ workspaceId, uid, role, status: "active", displayName: uid, createdAt: date(), createdBy: "owner" });
  }
  for (const debt of debts) {
    await owner.saveDebt(debt);
    await owner.createBalanceSnapshot({ id: `snap-${debt.id}`, workspaceId, debtId: debt.id, balance: debt.currentBalance, observedAt: date(), source: "manual", createdAt: date(), createdBy: "owner" });
  }
  const planId = `${workspaceId}-plan`;
  const versionId = `${workspaceId}-version-1`;
  await owner.savePlan({ id: planId, workspaceId, status: "draft", activeVersionId: "", createdAt: date(), createdBy: "owner" });
  const version = versionFor({ workspaceId, planId, versionId, debts, strategy, extraMonthlyPayment });
  await owner.savePlanVersion(version);
  await owner.activatePlan({ workspaceId, planId, versionId, actorId: "owner", activatedAt: date() });
  for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: version, startMonth: 8, startYear: 2026 }).slice(0, 12)) {
    await owner.createExpectedCheckpoint(checkpoint);
  }
  if (type === "household") {
    await owner.createPaymentEvent({ id: "h-existing-payment", workspaceId, debtId: debts[0].id, amount: 100, paidAt: date(), source: "manual", notes: "fixture", createdAt: date(), createdBy: "owner" });
  }
}

async function seedAll() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const repository = new FirebaseTrackToZeroRepository(context.firestore());
    await seedWorkspace({ repository, workspaceId: "personal-e2e", type: "personal", debts: personalDebts, strategy: "avalanche", extraMonthlyPayment: 150 });
    await seedWorkspace({ repository, workspaceId: "household-e2e", type: "household", debts: householdDebts, strategy: "snowball", extraMonthlyPayment: 200 });
  });
}

const hasFirebaseTypeLeak = (value) => {
  if (!value || typeof value !== "object") return false;
  if (typeof value.toDate === "function") return true;
  if (value.constructor?.name && /Timestamp|DocumentReference|DocumentSnapshot|QuerySnapshot/.test(value.constructor.name)) return true;
  return Object.values(value).some(hasFirebaseTypeLeak);
};

test.before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set - refusing Phase 3b Firebase UI runtime tests.");
  }
  assertTrackToZeroV2EmulatorConfig({ projectId: PROJECT_ID, emulatorHost: process.env.FIRESTORE_EMULATOR_HOST });
  const rules = await readFile(resolve(process.env.TRACKTOZERO_V2_RULES_FILE || "firestore.v2.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: EMULATOR_HOST, port: Number(EMULATOR_PORT), rules },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedAll();
});

test.after(async () => testEnv.cleanup());

test("Firebase-backed Home loads domain state, warnings, status, mortgage exclusion, and no Firebase types leak", async () => {
  const snapshot = await serviceAs("owner").getWorkspaceSnapshot("personal-e2e");
  assert.equal(snapshot.workspace.id, "personal-e2e");
  assert.equal(snapshot.activeContext.plan.id, "personal-e2e-plan");
  assert.equal(snapshot.activeContext.version.id, "personal-e2e-version-1");
  assert.ok(snapshot.targetDebt);
  assert.ok(snapshot.projectedZeroDate);
  assert.ok(snapshot.warnings.some((warning) => warning.code === "unknown_apr"));
  assert.equal(snapshot.includedDebts.some((debt) => debt.debtType === "mortgage"), false);
  assert.equal(hasFirebaseTypeLeak(snapshot), false);
});

test("Debt operations persist for Owner/Admin and are denied by rules for Contributor/Viewer/Non-member", async () => {
  const ownerDebt = await serviceAs("owner").createNewDebt("household-e2e", { name: "Owner Added", currentBalance: 100, minimumRequiredPayment: 10, aprStatus: "unknown" });
  assert.equal((await repoAs("owner").listDebts("household-e2e")).some((debt) => debt.id === ownerDebt.id), true);
  assert.equal((await repoAs("owner").listBalanceSnapshots("household-e2e", ownerDebt.id)).some((snapshot) => snapshot.id === ownerDebt.openingBalanceSnapshotId && snapshot.balance === 100), true);
  const adminDebt = await serviceAs("admin").createNewDebt("household-e2e", { name: "Admin Added", currentBalance: 200, minimumRequiredPayment: 20, aprStatus: "known", apr: 0.2 });
  assert.equal((await repoAs("viewer").listDebts("household-e2e")).some((debt) => debt.id === adminDebt.id), true);
  assert.equal((await repoAs("viewer").listBalanceSnapshots("household-e2e", adminDebt.id)).some((snapshot) => snapshot.id === adminDebt.openingBalanceSnapshotId && snapshot.balance === 200), true);

  await assertFails(repoAs("contrib").saveDebt({ id: "bad-contrib", workspaceId: "household-e2e", name: "Denied", currentBalance: 1, minimumRequiredPayment: 1, createdAt: date(), createdBy: "contrib" }));
  await assertFails(repoAs("viewer").saveDebt({ id: "bad-viewer", workspaceId: "household-e2e", name: "Denied", currentBalance: 1, minimumRequiredPayment: 1, createdAt: date(), createdBy: "viewer" }));
  await assertFails(repoAs("outsider").listDebts("household-e2e"));
});

test("PaymentEvent appends for Owner/Admin/Contributor, denies Viewer/Non-member, and survives reload", async () => {
  for (const uid of ["owner", "admin", "contrib"]) {
    const event = await serviceAs(uid).recordPayment("household-e2e", "h-finance", { amount: 25, notes: uid });
    const reloaded = await repoAs(uid).getPaymentEvent("household-e2e", "h-finance", event.id);
    assert.equal(reloaded.createdBy, uid);
    assert.equal(reloaded.source, "manual");
    assert.equal(reloaded.amount, 25);
  }
  await assertFails(repoAs("viewer").createPaymentEvent({ id: "viewer-pay", workspaceId: "household-e2e", debtId: "h-finance", amount: 1, paidAt: date(), source: "manual", createdAt: date(), createdBy: "viewer" }));
  await assertFails(repoAs("outsider").createPaymentEvent({ id: "outsider-pay", workspaceId: "household-e2e", debtId: "h-finance", amount: 1, paidAt: date(), source: "manual", createdAt: date(), createdBy: "outsider" }));
});

test("BalanceSnapshot appends preserve older snapshots and refresh directional status", async () => {
  const before = await repoAs("viewer").listBalanceSnapshots("household-e2e", "h-finance");
  const snapshot = await serviceAs("contrib").recordBalanceSnapshot("household-e2e", "h-finance", { balance: 450, notes: "confirmed" });
  const after = await repoAs("viewer").listBalanceSnapshots("household-e2e", "h-finance");
  assert.equal(after[0].id, snapshot.id);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.some((item) => item.id === before[0].id), true);
  assert.ok((await serviceAs("viewer").getWorkspaceSnapshot("household-e2e")).status.code);
  await assertFails(repoAs("viewer").createBalanceSnapshot({ id: "viewer-snap", workspaceId: "household-e2e", debtId: "h-finance", balance: 1, observedAt: date(), source: "manual", createdAt: date(), createdBy: "viewer" }));
});

test("Plan create/activate uses active pointers and switch remains atomic", async () => {
  const service = serviceAs("owner");
  const before = await service.getWorkspaceSnapshot("household-e2e");
  const { plan, version } = await service.createDraftPlan("household-e2e", { strategy: "avalanche", extraMonthlyPayment: 50 });
  await service.activatePlan("household-e2e", plan.id, version.id);
  const after = await service.getWorkspaceSnapshot("household-e2e");
  assert.equal(after.workspace.activePlanId, plan.id);
  assert.equal(after.activeContext.plan.activeVersionId, version.id);
  assert.equal((await repoAs("viewer").getPlan("household-e2e", before.activeContext.plan.id)).status, "archived");
  await assertFails(repoAs("contrib").savePlan({ id: "bad-plan", workspaceId: "household-e2e", status: "draft", createdAt: date(), createdBy: "contrib" }));
});

test("Scenario preview is zero-write against Firestore", async () => {
  const repo = repoAs("owner");
  const before = {
    plans: (await repo.listPlans("household-e2e")).length,
    versions: (await repo.listPlanVersions("household-e2e", "household-e2e-plan")).length,
    events: (await repo.listPaymentEvents("household-e2e", "h-card")).length,
    snapshots: (await repo.listBalanceSnapshots("household-e2e", "h-card")).length,
  };
  const preview = await serviceAs("owner").previewScenario("household-e2e", { extraMonthlyPayment: 100 });
  assert.ok(preview);
  assert.deepEqual({
    plans: (await repo.listPlans("household-e2e")).length,
    versions: (await repo.listPlanVersions("household-e2e", "household-e2e-plan")).length,
    events: (await repo.listPaymentEvents("household-e2e", "h-card")).length,
    snapshots: (await repo.listBalanceSnapshots("household-e2e", "h-card")).length,
  }, before);
});

test("Reforecast preview is zero-write; apply creates N+1, preserves N, and failed direct apply leaves N authoritative", async () => {
  const repo = repoAs("owner");
  const beforeSnapshot = await serviceAs("owner").getWorkspaceSnapshot("household-e2e");
  const beforeVersions = await repo.listPlanVersions("household-e2e", "household-e2e-plan");
  const preview = await serviceAs("owner").previewReforecast("household-e2e", { extraMonthlyPayment: 325 });
  assert.ok(preview);
  assert.deepEqual(await repo.listPlanVersions("household-e2e", "household-e2e-plan"), beforeVersions);

  const applied = await serviceAs("owner").applyReforecast("household-e2e", { extraMonthlyPayment: 325 });
  const afterVersions = await repo.listPlanVersions("household-e2e", "household-e2e-plan");
  assert.equal(afterVersions.length, beforeVersions.length + 1);
  assert.deepEqual(afterVersions[0], beforeVersions[0]);
  assert.equal(applied.workspace.activePlanId, beforeSnapshot.workspace.activePlanId);
  assert.equal(applied.plan.activeVersionId, afterVersions.at(-1).id);

  const activeBeforeFailure = (await repo.getPlan("household-e2e", "household-e2e-plan")).activeVersionId;
  await assertFails(repoAs("viewer").reforecastActivePlan({
    workspaceId: "household-e2e",
    planId: "household-e2e-plan",
    priorVersionId: activeBeforeFailure,
    nextVersion: versionFor({ workspaceId: "household-e2e", planId: "household-e2e-plan", versionId: "viewer-denied-version", debts: householdDebts, versionNumber: 99 }),
    actorId: "viewer",
    appliedAt: date(),
  }));
  assert.equal((await repo.getPlan("household-e2e", "household-e2e-plan")).activeVersionId, activeBeforeFailure);
  const deniedDoc = await getDoc(doc(testEnv.authenticatedContext("owner").firestore(), "workspaces/household-e2e/plans/household-e2e-plan/versions/viewer-denied-version"));
  assert.equal(deniedDoc.exists(), false);
});

test("Non-member cannot access workspace financial data through Firebase-backed app service", async () => {
  await assert.rejects(() => serviceAs("outsider").getWorkspaceSnapshot("household-e2e"));
});
