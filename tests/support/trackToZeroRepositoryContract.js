import assert from "node:assert/strict";
import { resolveActivePlanContext } from "../../src/services/tracktozero/activePlanService.js";

// Shared behavioral-contract suite, run against both InMemoryTrackToZeroRepository
// (synchronous) and FirebaseTrackToZeroRepository (async, Firestore-backed).
// Uses plain node:assert so it runs unmodified under either vitest's `describe`/`it`
// or node:test's `describe`/`it` - both are (name, fn) => void, and `await`ing a
// plain (non-Promise) value is a no-op, so writing every assertion as `async` here
// works transparently against either repository's return values.
//
// `switchActivePlan(repo, args)` is the one deliberate seam: the in-memory repo is
// driven through the existing synchronous `activatePlanTransaction` service function,
// while the Firebase repo is driven through its own async `activatePlan` method (a
// real Firestore transaction). This proves *behavioral* parity - same outcome - not
// literal same-function parity, which isn't achievable given the sync/async split.
// See TRACKTOZERO_PHASE2B_RESULTS.md for why.

const TS = "2026-01-01T00:00:00.000Z";
const TS2 = "2026-02-01T00:00:00.000Z";

async function bootstrapOwnerWorkspace(repo, workspaceId = "w1") {
  const workspace = { id: workspaceId, type: "household", createdAt: TS, createdBy: "owner" };
  const ownerMembership = { workspaceId, uid: "owner", role: "owner", status: "active", createdAt: TS, createdBy: "owner" };
  if (typeof repo.saveOwnerWorkspaceBootstrap === "function") {
    const result = await repo.saveOwnerWorkspaceBootstrap({ workspace, ownerMembership });
    return result.workspace;
  }
  const created = await repo.saveWorkspace(workspace);
  await repo.saveMembership(ownerMembership);
  return created;
}

export function runTrackToZeroRepositoryContractSuite({ describe, it, createRepository, switchActivePlan }) {
  describe("repository contract: workspace", () => {
    it("creates and reads back a workspace", async () => {
      const repo = await createRepository();
      const created = await bootstrapOwnerWorkspace(repo);
      assert.equal(created.id, "w1");
      assert.equal(created.type, "household");
      const fetched = await repo.getWorkspace("w1");
      assert.equal(fetched.id, "w1");
      assert.equal(fetched.createdBy, "owner");
      // Deliberately not asserting getWorkspace("missing") === null here: under
      // a real authorization layer, "doesn't exist" and "you have no membership
      // in it" are indistinguishable by design (Firestore denies the read
      // outright rather than revealing non-existence to a non-member) - so this
      // isn't a comparable behavior across the two repositories. The in-memory
      // repo's null-for-missing behavior is covered by trackToZeroDomain.test.js;
      // the Firebase repo's deny-for-unauthorized behavior is covered directly
      // in tests/firestore.v2.repository.test.js.
    });
  });

  describe("repository contract: membership", () => {
    it("creates and reads back the initial owner membership", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      const fetched = await repo.getMembership("w1", "owner");
      assert.equal(fetched.role, "owner");
      assert.equal(fetched.status, "active");
    });
  });

  describe("repository contract: debt", () => {
    it("creates, reads, and lists debts", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.saveDebt({ id: "d1", workspaceId: "w1", name: "Card", currentBalance: 100, minimumRequiredPayment: 10, createdAt: TS, createdBy: "owner" });
      await repo.saveDebt({ id: "d2", workspaceId: "w1", name: "Loan", currentBalance: 500, minimumRequiredPayment: 50, createdAt: TS, createdBy: "owner" });
      const listed = await repo.listDebts("w1");
      assert.equal(listed.length, 2);
      assert.deepEqual(listed.map((d) => d.id).sort(), ["d1", "d2"]);
    });
  });

  describe("repository contract: plan", () => {
    it("creates, reads, and lists plans", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      await repo.savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      const fetched = await repo.getPlan("w1", "p1");
      assert.equal(fetched.status, "draft");
      const listed = await repo.listPlans("w1");
      assert.equal(listed.length, 2);
    });
  });

  describe("repository contract: plan version", () => {
    it("creates a version, reads it back, and denies update as immutable", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      const version = await repo.savePlanVersion({
        id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche",
        asOf: TS, extraMonthlyPayment: 0, createdAt: TS, createdBy: "owner", createdBecause: "activation",
      });
      assert.equal(version.versionNumber, 1);
      const fetched = await repo.getPlanVersion("w1", "p1", "v1");
      assert.equal(fetched.strategy, "avalanche");
      await assert.rejects(async () => { await repo.updatePlanVersion(); }, /immutable/);
    });
  });

  describe("repository contract: active-plan resolution", () => {
    it("resolves via workspace.activePlanId (pure function, repository-agnostic)", () => {
      const context = resolveActivePlanContext({
        workspace: { id: "w1", activePlanId: "p2" },
        plans: [
          { id: "p1", status: "active", activeVersionId: "v1" },
          { id: "p2", status: "draft", activeVersionId: "v2" },
        ],
        versions: [{ id: "v2", planId: "p2" }],
      });
      assert.equal(context.plan.id, "p2");
    });
  });

  describe("repository contract: active-plan switching", () => {
    it("atomically activates one authoritative plan and demotes the previous one", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      await repo.savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      await repo.savePlanVersion({
        id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche",
        asOf: TS, extraMonthlyPayment: 0, createdAt: TS, createdBy: "owner", createdBecause: "activation",
      });
      await repo.savePlanVersion({
        id: "v2", planId: "p2", workspaceId: "w1", versionNumber: 1, strategy: "snowball",
        asOf: TS, extraMonthlyPayment: 0, createdAt: TS, createdBy: "owner", createdBecause: "activation",
      });

      await switchActivePlan(repo, { workspaceId: "w1", planId: "p1", versionId: "v1", actorId: "owner", activatedAt: TS });
      await switchActivePlan(repo, { workspaceId: "w1", planId: "p2", versionId: "v2", actorId: "owner", activatedAt: TS2 });

      const workspace = await repo.getWorkspace("w1");
      assert.equal(workspace.activePlanId, "p2");
      const plan1 = await repo.getPlan("w1", "p1");
      assert.equal(plan1.status, "archived");
      const plan2 = await repo.getPlan("w1", "p2");
      assert.equal(plan2.status, "active");
      assert.equal(plan2.activeVersionId, "v2");
    });
  });

  describe("repository contract: expected checkpoint", () => {
    it("creates, reads back, and denies update as immutable", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: TS, createdBy: "owner" });
      await repo.savePlanVersion({
        id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche",
        asOf: TS, extraMonthlyPayment: 0, createdAt: TS, createdBy: "owner", createdBecause: "activation",
      });
      const checkpoint = await repo.createExpectedCheckpoint({
        id: "c1", workspaceId: "w1", planId: "p1", planVersionId: "v1", period: "2026-01", expectedTotalBalance: 100,
      });
      assert.equal(checkpoint.period, "2026-01");
      const fetched = await repo.getExpectedCheckpoint("w1", "p1", "v1", "c1");
      assert.equal(fetched.expectedTotalBalance, 100);
      await assert.rejects(async () => { await repo.updateExpectedCheckpoint(); }, /immutable/);
    });
  });

  describe("repository contract: payment event", () => {
    it("appends a payment event and reads it back", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.saveDebt({ id: "d1", workspaceId: "w1", name: "Card", currentBalance: 100, minimumRequiredPayment: 10, createdAt: TS, createdBy: "owner" });
      const created = await repo.createPaymentEvent({
        id: "e1", workspaceId: "w1", debtId: "d1", amount: 25, paidAt: TS, createdAt: TS, createdBy: "owner",
      });
      assert.equal(created.amount, 25);
      const fetched = await repo.getPaymentEvent("w1", "d1", "e1");
      assert.equal(fetched.amount, 25);
      await assert.rejects(async () => { await repo.updatePaymentEvent(); }, /append-only/);
    });
  });

  describe("repository contract: balance snapshot", () => {
    it("appends snapshots and lists them newest-observedAt-first with a deterministic tiebreak", async () => {
      const repo = await createRepository();
      await bootstrapOwnerWorkspace(repo);
      await repo.saveDebt({ id: "d1", workspaceId: "w1", name: "Card", currentBalance: 100, minimumRequiredPayment: 10, createdAt: TS, createdBy: "owner" });
      await repo.createBalanceSnapshot({ id: "s1", workspaceId: "w1", debtId: "d1", balance: 100, observedAt: TS, createdAt: TS, createdBy: "owner" });
      await repo.createBalanceSnapshot({ id: "s2", workspaceId: "w1", debtId: "d1", balance: 90, observedAt: TS2, createdAt: TS, createdBy: "owner" });
      const listed = await repo.listBalanceSnapshots("w1", "d1");
      assert.equal(listed.length, 2);
      assert.equal(listed[0].id, "s2");
      assert.equal(listed[1].id, "s1");
      await assert.rejects(async () => { await repo.updateBalanceSnapshot(); }, /append-only/);
    });
  });
}
