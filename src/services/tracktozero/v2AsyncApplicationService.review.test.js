import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService } from "./v2AsyncApplicationService";
import { REVIEW_RESOLUTION_TYPES, REVIEW_STATUS, getReviewItemStatus } from "./reviewDomain.js";

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

const laterAsOf = (minutes) => new Date(new Date(V2_TEST_NOW).getTime() + minutes * 60000).toISOString();

const firstmarkCandidate = (overrides = {}) => ({
  candidateId: "cand-firstmark",
  source: "pdf",
  creditorName: "Firstmark Services",
  accountName: "Firstmark Loan ending in 1234",
  accountReferenceSafe: "last4:1234",
  debtType: "student_loan",
  currentBalance: 11880,
  statementDate: "2026-08-10",
  apr: 7.5,
  aprStatus: "known",
  minimumPayment: 190,
  dueDate: "2026-08-21",
  ownerType: "member",
  ownerId: "seed-owner",
  includedInCorePayoffPlan: true,
  warnings: [],
  duplicateStatus: "new",
  decision: "pending_review",
  ...overrides,
});

describe("REVIEW-1A Part 43: an OPEN review causes zero authoritative mutation", () => {
  it("creating, reading, listing, and counting an open review touches no Debt/BalanceSnapshot/PaymentEvent/PlanVersion", async () => {
    const { repository, service } = makeService();
    const debtsBefore = repository.listDebts("personal-seed");
    const versionsBefore = repository.listPlanVersions("personal-seed", "personal-plan");
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    const snapshot = await service.getReviewSnapshot("personal-seed");
    expect(snapshot.openCount).toBe(1);
    // Reload as a brand new repository/service instance state read (simulates page reload).
    const reloadedBatch = repository.getImportBatch("personal-seed", batch.id);
    expect(reloadedBatch.candidates).toHaveLength(1);
    expect(repository.listDebts("personal-seed")).toEqual(debtsBefore);
    expect(repository.listPlanVersions("personal-seed", "personal-plan")).toEqual(versionsBefore);
    expect(repository.listPaymentEvents("personal-seed", debtsBefore[0]?.id || "")).toEqual([]);
  });
});

describe("REVIEW-1A Part 44: defer / I'm not sure", () => {
  it("deferReview keeps the review OPEN with zero financial mutation and survives reload", async () => {
    const { repository, service } = makeService();
    const debtsBefore = repository.listDebts("personal-seed");
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "unclear.pdf", candidates: [firstmarkCandidate({ accountReferenceSafe: "" })] });
    await service.deferReview("personal-seed", batch.id, "cand-firstmark");
    const reloaded = repository.getImportBatch("personal-seed", batch.id);
    expect(reloaded.candidates[0].reviewResolution.type).toBe(REVIEW_RESOLUTION_TYPES.deferred);
    expect(getReviewItemStatus(reloaded.candidates[0])).toBe(REVIEW_STATUS.open);
    expect(repository.listDebts("personal-seed")).toEqual(debtsBefore);
    const snapshot = await service.getReviewSnapshot("personal-seed");
    expect(snapshot.openCount).toBe(1);
  });
});

describe("REVIEW-1A Part 45/26: Update Existing is atomic and stamps committedOutcome only after success", () => {
  it("resolveAsExistingDebt + commit produces exactly one BalanceSnapshot, confirmed metadata, and a RESOLVED review", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id, metadataUpdates: { apr: 7.5, aprStatus: "known" } });

    // Before commit: decided, but NOT yet resolved (Part 4 - mutation hasn't happened).
    const beforeCommit = repository.getImportBatch("personal-seed", batch.id);
    expect(getReviewItemStatus(beforeCommit.candidates[0])).toBe(REVIEW_STATUS.open);

    const { updatedDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(updatedDebts).toHaveLength(1);
    const afterCommit = repository.getImportBatch("personal-seed", batch.id);
    expect(afterCommit.candidates[0].committedOutcome.type).toBe(REVIEW_RESOLUTION_TYPES.updatedExistingDebt);
    expect(getReviewItemStatus(afterCommit.candidates[0])).toBe(REVIEW_STATUS.resolved);
    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(2); // opening + import
  });
});

describe("REVIEW-1A Part 46: Update Existing failure leaves the review OPEN with no orphan snapshot", () => {
  it("an induced repository failure during commit does not partially mutate state, and the review stays actionable", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const snapshotsBefore = repository.listBalanceSnapshots("personal-seed", existing.id).length;
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id });

    const real = repository.updateDebtFromImportCandidate.bind(repository);
    repository.updateDebtFromImportCandidate = () => { throw new Error("Simulated repository outage"); };
    await expect(service.commitImportBatch("personal-seed", batch.id)).rejects.toThrow(/incomplete/);
    repository.updateDebtFromImportCandidate = real;

    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(snapshotsBefore);
    const afterFailedAttempt = repository.getImportBatch("personal-seed", batch.id);
    expect(afterFailedAttempt.candidates[0].committedOutcome).toBeUndefined();
    expect(getReviewItemStatus(afterFailedAttempt.candidates[0])).toBe(REVIEW_STATUS.open);
    expect(afterFailedAttempt.status).not.toBe("committed");
  });
});

describe("REVIEW-1A Part 47/48: Create New Debt is atomic, and failure leaves no orphan Debt", () => {
  it("resolveAsNewDebt + commit creates Debt + opening BalanceSnapshot atomically and resolves the review", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", { sourceType: "excel", sourceFilename: "new.xlsx", candidates: [firstmarkCandidate({ accountReferenceSafe: "last4:9999" })] });
    await service.resolveAsNewDebt("personal-seed", batch.id, "cand-firstmark");
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts).toHaveLength(1);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 1);
    const afterCommit = repository.getImportBatch("personal-seed", batch.id);
    expect(afterCommit.candidates[0].committedOutcome.type).toBe(REVIEW_RESOLUTION_TYPES.createdNewDebt);
  });

  it("an induced failure during new-debt creation leaves no orphan Debt and the review stays retryable", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", { sourceType: "excel", sourceFilename: "new.xlsx", candidates: [firstmarkCandidate({ accountReferenceSafe: "last4:9999" })] });
    await service.resolveAsNewDebt("personal-seed", batch.id, "cand-firstmark");

    const real = repository.createDebtWithOpeningSnapshot.bind(repository);
    repository.createDebtWithOpeningSnapshot = () => { throw new Error("Simulated repository outage"); };
    await expect(service.commitImportBatch("personal-seed", batch.id)).rejects.toThrow(/incomplete/);
    repository.createDebtWithOpeningSnapshot = real;
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount);

    // Retry after the outage clears: succeeds cleanly, exactly one debt created.
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts).toHaveLength(1);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 1);
  });
});

describe("REVIEW-1A Part 27/49: resolution is idempotent under retry / double submission", () => {
  it("calling updateDebtFromImportCandidate twice with the same resolution never creates a duplicate BalanceSnapshot", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const args = {
      workspaceId: "personal-seed", debtId: existing.id, metadataPatch: {},
      balanceSnapshot: { id: "import-retry-test", workspaceId: "personal-seed", debtId: existing.id, balance: 11880, observedAt: V2_TEST_NOW, createdBy: "seed-owner", createdAt: V2_TEST_NOW },
      actorId: "seed-owner", updatedAt: V2_TEST_NOW,
    };
    const first = repository.updateDebtFromImportCandidate(args);
    expect(first.idempotentReplay).toBeUndefined();
    const second = repository.updateDebtFromImportCandidate(args);
    expect(second.idempotentReplay).toBe(true);
    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(2); // opening + exactly one import snapshot
  });

  it("retrying a partially-failed batch commit does not duplicate the already-succeeded candidate's mutation", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "two.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "ok-one", accountReferenceSafe: "last4:9999" }), firstmarkCandidate({ candidateId: "fails-one", accountReferenceSafe: "last4:8888" })],
    });
    await service.resolveAsNewDebt("personal-seed", batch.id, "ok-one");
    await service.resolveAsNewDebt("personal-seed", batch.id, "fails-one");

    let failNext = true;
    const real = repository.createDebtWithOpeningSnapshot.bind(repository);
    repository.createDebtWithOpeningSnapshot = (args) => {
      if (args.debt.id.includes("fails-one") && failNext) throw new Error("Simulated outage for fails-one");
      return real(args);
    };
    await expect(service.commitImportBatch("personal-seed", batch.id)).rejects.toThrow(/incomplete/);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 1);

    failNext = false;
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    repository.createDebtWithOpeningSnapshot = real;
    expect(createdDebts).toHaveLength(2); // ok-one replayed idempotently + fails-one newly created
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 2);
  });
});

describe("REVIEW-1A Part 28/50: stale-review protection", () => {
  it("resolves normally when the target debt has not changed since the review was created", async () => {
    const { service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id });
    const { updatedDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(updatedDebts).toHaveLength(1);
  });

  it("L: a debt that legitimately changed after the review's fingerprint was captured is NOT silently overwritten", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 34233, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id });

    // The user legitimately updates the debt's balance in the meantime (a
    // real, later observation) BEFORE the reviewer's resolution is committed.
    await service.recordBalanceSnapshot("personal-seed", existing.id, { balance: 33500, observedAt: laterAsOf(5) });
    repository.saveDebt({ ...repository.listDebts("personal-seed").find((d) => d.id === existing.id), currentBalance: 33500, updatedAt: laterAsOf(5) });

    await expect(service.commitImportBatch("personal-seed", batch.id)).rejects.toThrow(/incomplete/);
    const live = repository.listDebts("personal-seed").find((d) => d.id === existing.id);
    expect(live.currentBalance).toBe(33500); // newer truth preserved, not overwritten by the stale import
    const afterAttempt = repository.getImportBatch("personal-seed", batch.id);
    expect(afterAttempt.candidates[0].committedOutcome).toBeUndefined();
    expect(getReviewItemStatus(afterAttempt.candidates[0])).toBe(REVIEW_STATUS.open);
  });
});

describe("REVIEW-1A Part 51: cross-workspace isolation", () => {
  it("a review's target debt lookup is scoped to its own workspace - a Workspace B debt id is never found from Workspace A", async () => {
    const { repository, service } = makeService();
    const householdDebt = repository.listDebts("household-seed")[0];
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    await expect(
      service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: householdDebt.id })
    ).rejects.toThrow(/not found/i);
  });

  it("an actor who is not a member of the target workspace cannot read or resolve its reviews", async () => {
    const { repository } = makeService();
    const batch = repository.saveImportBatch({
      id: "outsider-batch", workspaceId: "household-seed", createdBy: "seed-owner", createdAt: V2_TEST_NOW,
      sourceType: "pdf", sourceFilename: "x.pdf", status: "review_required", candidates: [firstmarkCandidate()],
    });
    const outsiderService = createTrackToZeroV2AsyncAppService({ repository, actorId: "not-a-member", asOf: V2_TEST_NOW });
    await expect(outsiderService.getReviewSnapshot("household-seed")).rejects.toThrow(/not a member/i);
    await expect(outsiderService.resolveAsNewDebt("household-seed", batch.id, "cand-firstmark")).rejects.toThrow(/not a member/i);
  });

  it("a viewer (read-only role) cannot resolve a review", async () => {
    const { repository, service } = makeService("seed-owner");
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [firstmarkCandidate()] });
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    await expect(viewerService.resolveAsNewDebt("household-seed", batch.id, "cand-firstmark")).rejects.toThrow(/cannot review/i);
  });
});

describe("REVIEW-1A Part 24/52: a balance change from review resolution never fabricates a PaymentEvent", () => {
  it("update-existing resolution creates a BalanceSnapshot but zero PaymentEvents, even though the balance decreased", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 10000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate({ currentBalance: 9500 })] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id });
    await service.commitImportBatch("personal-seed", batch.id);
    expect(repository.listPaymentEvents("personal-seed", existing.id)).toHaveLength(0);
  });
});

describe("REVIEW-1A Part 25/53: PlanVersion immutability during review resolution", () => {
  it("resolving a review with an active plan never mutates the existing PlanVersion", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 10000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const versionBefore = repository.getPlanVersion("personal-seed", "personal-plan", "personal-version-1");
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate({ currentBalance: 9500 })] });
    await service.resolveAsExistingDebt("personal-seed", batch.id, "cand-firstmark", { targetDebtId: existing.id });
    await service.commitImportBatch("personal-seed", batch.id);
    expect(repository.getPlanVersion("personal-seed", "personal-plan", "personal-version-1")).toEqual(versionBefore);
  });
});

describe("REVIEW-1A Part 20/54: business scope never silently enters Household payoff", () => {
  it("resolveBusinessScope(exclude) is terminal, dismissed, and creates zero Debts", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("household-seed").length;
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "excel", sourceFilename: "amex-business.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "amex-biz", accountReferenceSafe: "last4:7777", ownerType: "unassigned", ownerId: "" })],
    });
    await service.resolveBusinessScope("household-seed", batch.id, "amex-biz", { decision: "exclude" });
    const reloaded = repository.getImportBatch("household-seed", batch.id);
    expect(getReviewItemStatus(reloaded.candidates[0])).toBe(REVIEW_STATUS.dismissed);
    const committed = await service.commitImportBatch("household-seed", batch.id);
    expect(committed.createdDebts).toHaveLength(0);
    expect(repository.listDebts("household-seed")).toHaveLength(beforeCount);
  });
});

describe("REVIEW-1A Part 18/55: formula/projected balance requires explicit confirmation before it becomes truth", () => {
  it("an unconfirmed formula-derived balance stays unresolved (balanceStatus) until resolveBalance explicitly confirms it", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "formula.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "formula-1", accountReferenceSafe: "last4:6666", balanceStatus: "unresolved", currentBalance: 0 })],
    });
    expect(repository.getImportBatch("personal-seed", batch.id).candidates[0].balanceStatus).toBe("unresolved");
    await service.resolveBalance("personal-seed", batch.id, "formula-1", { currentBalance: 2476.25 });
    const afterConfirm = repository.getImportBatch("personal-seed", batch.id);
    expect(afterConfirm.candidates[0].balanceStatus).toBe("confirmed");
    expect(afterConfirm.candidates[0].currentBalance).toBe(2476.25);
  });
});

describe("REVIEW-1A Part 16/56: missing information never becomes a fake confirmed $0", () => {
  it("committing a candidate whose balance was never confirmed carries balanceStatus unresolved onto the created Debt, never a silent $0 payoff", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "missing-balance.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "missing-bal", accountReferenceSafe: "last4:5555", balanceStatus: "unresolved", currentBalance: 0 })],
    });
    await service.resolveAsNewDebt("personal-seed", batch.id, "missing-bal");
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts[0].balanceStatus).toBe("unresolved");
    expect(createdDebts[0].currentBalance).toBe(0);
  });
});

describe("REVIEW-1A Part 21: debt-vs-bill classification", () => {
  it("resolveDebtClassification('bill') is terminal and creates zero Debts", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "car-payment.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "car-payment", accountName: "Car Payment", accountReferenceSafe: "" })],
    });
    await service.resolveDebtClassification("personal-seed", batch.id, "car-payment", { classification: "bill" });
    const committed = await service.commitImportBatch("personal-seed", batch.id);
    expect(committed.createdDebts).toHaveLength(0);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount);
    expect(getReviewItemStatus(repository.getImportBatch("personal-seed", batch.id).candidates[0])).toBe(REVIEW_STATUS.dismissed);
  });
});

describe("REVIEW-1A Part 22: duplicate dismissal", () => {
  it("dismissDuplicate is terminal, zero-mutation, and idempotent", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "dup.pdf", candidates: [firstmarkCandidate()] });
    await service.dismissDuplicate("personal-seed", batch.id, "cand-firstmark");
    await service.dismissDuplicate("personal-seed", batch.id, "cand-firstmark");
    const reloaded = repository.getImportBatch("personal-seed", batch.id);
    expect(reloaded.candidates[0].reviewResolution.type).toBe("dismissed_duplicate");
    expect(getReviewItemStatus(reloaded.candidates[0])).toBe(REVIEW_STATUS.dismissed);
  });
});

describe("REVIEW-1A Part 23: historical statement resolution", () => {
  it("addHistoricalSnapshot records the statement's own date and never changes the debt's current balance", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true, balanceAsOf: "2026-08-01",
    });
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "pdf", sourceFilename: "old-statement.pdf",
      candidates: [firstmarkCandidate({ candidateId: "historical-1", currentBalance: 12500, statementDate: "2026-06-01" })],
    });
    await service.addHistoricalSnapshot("personal-seed", batch.id, "historical-1", { targetDebtId: existing.id, statementDate: "2026-06-01" });
    const live = repository.listDebts("personal-seed").find((d) => d.id === existing.id);
    expect(live.currentBalance).toBe(12000); // unchanged - the older statement never becomes "current"
    const snapshots = repository.listBalanceSnapshots("personal-seed", existing.id);
    expect(snapshots.some((s) => s.observedAt === "2026-06-01" && s.balance === 12500)).toBe(true);
  });

  it("rejects a statement that is not actually older than the debt's latest known balance", async () => {
    const { service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true, balanceAsOf: "2026-08-01",
    });
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "pdf", sourceFilename: "not-old.pdf",
      candidates: [firstmarkCandidate({ candidateId: "not-old-1", currentBalance: 11000, statementDate: "2026-08-05" })],
    });
    await expect(
      service.addHistoricalSnapshot("personal-seed", batch.id, "not-old-1", { targetDebtId: existing.id, statementDate: "2026-08-05" })
    ).rejects.toThrow(/not older/i);
  });
});

describe("REVIEW-1A Part 19: owner resolution stays restricted to verified member / joint / unassigned", () => {
  it("resolveOwner accepts a real verified household member", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "pdf", sourceFilename: "x.pdf",
      candidates: [firstmarkCandidate({ candidateId: "owner-1", ownerType: "unassigned", ownerId: "" })],
    });
    await service.resolveOwner("household-seed", batch.id, "owner-1", { ownerType: "member", ownerId: "seed-admin" });
    const reloaded = repository.getImportBatch("household-seed", batch.id);
    expect(reloaded.candidates[0].ownerType).toBe("member");
    expect(reloaded.candidates[0].ownerId).toBe("seed-admin");
  });

  it("rejects an unverified/arbitrary member id - parser text can never become authoritative ownership", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [firstmarkCandidate({ candidateId: "owner-2" })] });
    await expect(
      service.resolveOwner("household-seed", batch.id, "owner-2", { ownerType: "member", ownerId: "for-undeliverable-mail-only" })
    ).rejects.toThrow(/verified/i);
  });
});

describe("REVIEW-1B Part 19: due-day resolution never fabricates a full date", () => {
  it("resolveDueDate stores a plain day-of-month, and it survives onto a newly created Debt without a fabricated month/year", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "pdf", sourceFilename: "x.pdf",
      candidates: [firstmarkCandidate({ candidateId: "due-day-1", accountReferenceSafe: "last4:4444", dueDate: "" })],
    });
    await service.resolveDueDate("personal-seed", batch.id, "due-day-1", { dueDay: 21 });
    const reloaded = repository.getImportBatch("personal-seed", batch.id);
    expect(reloaded.candidates[0].dueDay).toBe(21);
    expect(reloaded.candidates[0].dueDate).toBe(""); // never backfilled with a fabricated date

    await service.resolveAsNewDebt("personal-seed", batch.id, "due-day-1");
    const { createdDebts } = await service.commitImportBatch("personal-seed", batch.id);
    expect(createdDebts[0].dueDay).toBe(21);
  });
});
