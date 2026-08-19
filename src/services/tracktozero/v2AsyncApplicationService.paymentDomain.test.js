import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService } from "./v2AsyncApplicationService";
import { resolveWorkingBalance } from "../../domain/tracktozero/paymentCycle.js";

// GATE-10B.1: service-level wiring tests for the payment-truth/dynamic-
// minimum hotfix. The pure math (working balance, cycle progress, the empty
// minimum-payment-rule registry) is already covered by
// paymentCycle.test.js/minimumPaymentRules.test.js - this file proves
// recordPayment/recordBalanceSnapshot/updateDebt actually wire those
// primitives together correctly against the real (in-memory) repository,
// including the financial-truth invariants the hotfix brief locks:
// PaymentEvent != BalanceSnapshot, current-cycle minimum != estimated next
// minimum, and the estimate never rewrites statement-confirmed truth.

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

const workingBalanceFor = (repository, workspaceId, debtId) => {
  const debt = repository.listDebts(workspaceId).find((candidate) => candidate.id === debtId);
  const [latestSnapshot] = repository.listBalanceSnapshots(workspaceId, debtId);
  const paymentEvents = repository.listPaymentEvents(workspaceId, debtId);
  return resolveWorkingBalance({ debt, latestSnapshot: latestSnapshot || null, paymentEvents });
};

describe("recordPayment - GATE-10B.1 working balance + dynamic minimum wiring", () => {
  it("PAY-08/Issue-5: recording a payment immediately moves the working balance, without creating a BalanceSnapshot", async () => {
    const { repository, service } = makeService();
    const snapshotsBefore = repository.listBalanceSnapshots("household-seed", "household-samsung").length;
    await service.recordPayment("household-seed", "household-samsung", { amount: 200, paidAt: "2026-08-14T00:00:00.000Z" });
    const working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(317); // 517 - 200
    expect(working.isEstimated).toBe(true);
    // PAY-09: PaymentEvent != BalanceSnapshot - no new confirmed observation was created.
    expect(repository.listBalanceSnapshots("household-seed", "household-samsung")).toHaveLength(snapshotsBefore);
  });

  it("PAY-19/MIN-DYN-01/MIN-DYN-07: the current-cycle required payment is untouched by recording a payment, even a large one", async () => {
    const { repository, service } = makeService();
    await service.recordPayment("household-seed", "household-samsung", { amount: 517, paidAt: "2026-08-14T00:00:00.000Z" });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.minimumRequiredPayment).toBe(45); // unchanged - the lender's current-cycle number is historical fact
  });

  it("PAY-13/BAL-08: a payment larger than the working balance floors at $0 and never marks the debt paid off on its own", async () => {
    const { repository, service } = makeService();
    await service.recordPayment("household-seed", "household-samsung", { amount: 5000, paidAt: "2026-08-14T00:00:00.000Z" });
    const working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(0);
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.status).toBe("active"); // no silent paid-off transition
  });

  it("MIN-DYN-03/MIN-DYN-13: recording a payment triggers a recalculation attempt (estimatedNextMinimumUpdatedAt moves), even though today's empty rule registry keeps the estimate 'unknown'", async () => {
    const { repository, service } = makeService();
    const before = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(before.estimatedNextMinimumUpdatedAt).toBeFalsy();
    await service.recordPayment("household-seed", "household-samsung", { amount: 200, paidAt: "2026-08-14T00:00:00.000Z" });
    const after = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(after.estimatedNextMinimumUpdatedAt).toBe(V2_TEST_NOW);
    expect(after.estimatedNextMinimumPayment).toBeNull();
    expect(after.estimatedNextMinimumSource).toBe("unknown");
  });

  it("PAY-16: Viewer cannot record a payment, and no recalculation is attempted", async () => {
    const { repository } = makeService();
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    await expect(viewerService.recordPayment("household-seed", "household-samsung", { amount: 50 })).rejects.toThrow(/cannot record payments/i);
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBeFalsy();
  });
});

describe("recordBalanceSnapshot - GATE-10B.1 reconciliation", () => {
  it("BAL-03/MIN-DYN-04: a new confirmed balance becomes the working balance and triggers recalculation", async () => {
    const { repository, service } = makeService();
    await service.recordBalanceSnapshot("household-seed", "household-samsung", { balance: 400, observedAt: "2026-08-15T00:00:00.000Z" });
    const working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(400);
    expect(working.isEstimated).toBe(false);
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBe(V2_TEST_NOW);
  });

  it("BAL-04/BAL-05: a payment recorded before a newer confirmed snapshot is not subtracted again; a payment recorded after the new snapshot subtracts once", async () => {
    const { repository, service } = makeService();
    await service.recordPayment("household-seed", "household-samsung", { amount: 100, paidAt: "2026-08-14T00:00:00.000Z" });
    await service.recordBalanceSnapshot("household-seed", "household-samsung", { balance: 430, observedAt: "2026-08-16T00:00:00.000Z" });
    let working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(430); // the Aug 14 payment is already reflected in the Aug 16 confirmed balance
    await service.recordPayment("household-seed", "household-samsung", { amount: 30, paidAt: "2026-08-17T00:00:00.000Z" });
    working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(400); // 430 - 30, subtracted exactly once
  });
});

describe("updateDebt - GATE-10B.1 required-payment provenance + recalculation scoping", () => {
  it("MIN-DYN-19: a manual minimumRequiredPayment edit is stamped user_confirmed", async () => {
    const { repository, service } = makeService();
    await service.updateDebt("household-seed", "household-samsung", { minimumRequiredPayment: 60 });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.minimumRequiredPayment).toBe(60);
    expect(debt.requiredPaymentSource).toBe("user_confirmed");
  });

  it("clearing minimumRequiredPayment resets its source to unknown, never leaving a stale 'confirmed' label on a null amount", async () => {
    const { repository, service } = makeService();
    await service.updateDebt("household-seed", "household-samsung", { minimumRequiredPayment: null });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.minimumRequiredPayment).toBeNull();
    expect(debt.requiredPaymentSource).toBe("unknown");
  });

  it("editing an unrelated field (name) does not trigger a recalculation attempt", async () => {
    const { repository, service } = makeService();
    await service.updateDebt("household-seed", "household-samsung", { name: "Samsung Financing (renamed)" });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBeFalsy();
  });

  it("MIN-DYN-13: editing APR does trigger a recalculation attempt", async () => {
    const { repository, service } = makeService();
    await service.updateDebt("household-seed", "household-samsung", { aprStatus: "known", apr: 15 });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBe(V2_TEST_NOW);
  });
});

describe("confirmDebtPaidOff - GATE-10B.1 explicit paid-off pathway (Issue 20)", () => {
  it("PAY-15: an explicit $0 confirmation records a BalanceSnapshot AND moves the debt's own confirmed balance, so isConfirmedZero actually fires", async () => {
    const { repository, service } = makeService();
    const snapshotsBefore = repository.listBalanceSnapshots("household-seed", "household-samsung").length;
    await service.confirmDebtPaidOff("household-seed", "household-samsung");
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.currentBalance).toBe(0);
    expect(debt.balanceStatus).toBe("confirmed");
    expect(debt.paidOffAt).toBe(V2_TEST_NOW);
    expect(repository.listBalanceSnapshots("household-seed", "household-samsung")).toHaveLength(snapshotsBefore + 1);
  });

  it("PAY-14: recording an ordinary payment alone (even one that exceeds the working balance) never triggers this path or sets paidOffAt", async () => {
    const { repository, service } = makeService();
    await service.recordPayment("household-seed", "household-samsung", { amount: 5000, paidAt: "2026-08-14T00:00:00.000Z" });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.currentBalance).toBe(517); // debt.currentBalance is untouched by recordPayment, by design
    expect(debt.paidOffAt).toBeFalsy();
  });

  it("Viewer cannot confirm a debt paid off", async () => {
    const { repository } = makeService();
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    await expect(viewerService.confirmDebtPaidOff("household-seed", "household-samsung")).rejects.toThrow(/cannot mark a debt paid off/i);
  });

  it("a Contributor (can record observations, cannot manage debt terms) is also refused - marking a debt Paid off is a debt-terms mutation, not a plain observation", async () => {
    const { repository } = makeService();
    const contributorService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-contributor", asOf: V2_TEST_NOW });
    await expect(contributorService.confirmDebtPaidOff("household-seed", "household-samsung")).rejects.toThrow(/cannot mark a debt paid off/i);
  });
});

// GATE-10B.1 regression: recalculateEstimatedNextMinimum writes to the Debt
// document itself, which the real Firestore rules gate at manageDebts
// (Admin/Owner), a stricter tier than recordPayment/recordBalanceSnapshot's
// own recordObservations (Contributor+). Reproduced live via the V2
// Firestore emulator suite - a Contributor's recordPayment call failed
// outright with PERMISSION_DENIED on this secondary write, even though the
// PaymentEvent itself was fully authorized. The fix gates the recalculation
// attempt on manageDebts so it degrades gracefully instead of ever blocking
// the primary, authorized action a Contributor is recording.
describe("recordPayment/recordBalanceSnapshot - GATE-10B.1 Contributor permission boundary", () => {
  it("a Contributor can record a payment successfully - the estimate recalculation never blocks it", async () => {
    const { repository } = makeService();
    const contributorService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-contributor", asOf: V2_TEST_NOW });
    await expect(contributorService.recordPayment("household-seed", "household-samsung", { amount: 50, paidAt: "2026-08-14T00:00:00.000Z" })).resolves.toBeTruthy();
    const working = workingBalanceFor(repository, "household-seed", "household-samsung");
    expect(working.amount).toBe(467); // 517 - 50, the primary financial fact still lands
  });

  it("a Contributor's payment does NOT trigger the estimate recalculation (no manageDebts, no debt-document write attempted)", async () => {
    const { repository } = makeService();
    const contributorService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-contributor", asOf: V2_TEST_NOW });
    await contributorService.recordPayment("household-seed", "household-samsung", { amount: 50 });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBeFalsy();
  });

  it("a Contributor can record a balance successfully - the estimate recalculation never blocks it", async () => {
    const { repository } = makeService();
    const contributorService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-contributor", asOf: V2_TEST_NOW });
    await expect(contributorService.recordBalanceSnapshot("household-seed", "household-samsung", { balance: 400 })).resolves.toBeTruthy();
  });

  it("an Owner's payment DOES trigger the estimate recalculation (has manageDebts)", async () => {
    const { repository, service } = makeService();
    await service.recordPayment("household-seed", "household-samsung", { amount: 50, paidAt: "2026-08-14T00:00:00.000Z" });
    const debt = repository.listDebts("household-seed").find((candidate) => candidate.id === "household-samsung");
    expect(debt.estimatedNextMinimumUpdatedAt).toBe(V2_TEST_NOW);
  });
});
