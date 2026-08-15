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

describe("REVIEW-1C: committing one candidate in a multi-candidate batch never locks the others out", () => {
  it("resolving candidate A does not flip the batch to 'committed' while B and C are still undecided - B stays resolvable and C stays deferrable", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "three.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "a" }),
        firstmarkCandidate({ candidateId: "b", accountReferenceSafe: "last4:9999" }),
        firstmarkCandidate({ candidateId: "c", accountReferenceSafe: "last4:8888" }),
      ],
    });

    await service.resolveAsNewDebt("personal-seed", batch.id, "a");
    await service.commitImportBatch("personal-seed", batch.id);

    const afterFirstCommit = repository.getImportBatch("personal-seed", batch.id);
    expect(afterFirstCommit.status).toBe("review_required"); // b and c are still pending - the batch must stay open

    // B, still pending, can still be resolved (this would previously throw
    // "This import is no longer open for review." once A got committed).
    await service.resolveAsNewDebt("personal-seed", batch.id, "b");
    await service.commitImportBatch("personal-seed", batch.id);

    // C, still pending, can still be deferred.
    await service.deferReview("personal-seed", batch.id, "c");

    const final = repository.getImportBatch("personal-seed", batch.id);
    expect(final.status).toBe("review_required"); // c is deferred, not terminal - stays open
    expect(getReviewItemStatus(final.candidates.find((cand) => cand.candidateId === "a"))).toBe(REVIEW_STATUS.resolved);
    expect(getReviewItemStatus(final.candidates.find((cand) => cand.candidateId === "b"))).toBe(REVIEW_STATUS.resolved);
    expect(getReviewItemStatus(final.candidates.find((cand) => cand.candidateId === "c"))).toBe(REVIEW_STATUS.open);

    // C must still be reachable later ("Finish this") - the batch being
    // permanently locked would make this throw.
    const existing = repository.listDebts("personal-seed").find((d) => d.accountReferenceSafe === "last4:1234");
    await expect(service.resolveAsExistingDebt("personal-seed", batch.id, "c", { targetDebtId: existing.id })).resolves.toBeDefined();
    await service.commitImportBatch("personal-seed", batch.id);
    const trulyFinal = repository.getImportBatch("personal-seed", batch.id);
    expect(trulyFinal.status).toBe("committed"); // now that every candidate is terminal, the batch can close
  });
});

describe("REVIEW-1C: saveReviewSession - all items answered", () => {
  it("resolves every staged item independently and reports resolvedCount for the whole batch", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "two.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "match-1" }),
        firstmarkCandidate({ candidateId: "missing-bal-1", accountReferenceSafe: "last4:9999", balanceStatus: "unresolved", currentBalance: 0 }),
      ],
    });

    // A field-only confirmation (resolveBalance) narrows a signal but never
    // closes the review by itself (Part 16-19) - the batch flow's "Update
    // this debt" action still has to make the actual new/existing decision,
    // exactly like the single-item drawer always required.
    const result = await service.saveReviewSession("personal-seed", [
      { importBatchId: batch.id, importCandidateId: "match-1", action: "resolveAsExistingDebt", args: { targetDebtId: existing.id } },
      { importBatchId: batch.id, importCandidateId: "missing-bal-1", action: "resolveBalance", args: { currentBalance: 4200 } },
      { importBatchId: batch.id, importCandidateId: "missing-bal-1", action: "resolveAsNewDebt", args: {} },
    ]);

    expect(result.resolvedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.staleCount).toBe(0);
    expect(result.snapshot.openCount).toBe(0);

    const createdDebt = repository.listDebts("personal-seed").find((d) => d.accountReferenceSafe === "last4:9999");
    expect(createdDebt.currentBalance).toBe(4200); // the staged balance answer actually carried through
    expect(createdDebt.balanceStatus).toBe("confirmed");
  });
});

describe("REVIEW-1C: saveReviewSession - partial answers leave the rest genuinely open", () => {
  it("an item never staged is untouched and remains open, while staged items resolve", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "two.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "match-1" }),
        firstmarkCandidate({ candidateId: "unanswered-1", accountReferenceSafe: "last4:8888", balanceStatus: "unresolved", currentBalance: 0 }),
      ],
    });

    const result = await service.saveReviewSession("personal-seed", [
      { importBatchId: batch.id, importCandidateId: "match-1", action: "resolveAsExistingDebt", args: { targetDebtId: existing.id } },
    ]);

    expect(result.resolvedCount).toBe(1);
    const snapshot = await service.getReviewSnapshot("personal-seed");
    expect(snapshot.openCount).toBe(1);
    const stillOpen = repository.getImportBatch("personal-seed", batch.id).candidates.find((c) => c.candidateId === "unanswered-1");
    expect(getReviewItemStatus(stillOpen)).toBe(REVIEW_STATUS.open);
    // A field that was never staged/answered must stay unresolved, never a
    // silently-inferred $0 - blank is not zero.
    expect(stillOpen.balanceStatus).toBe("unresolved");
    expect(stillOpen.currentBalance).toBe(0);
  });

  it("a bad/failing item never rolls back a valid item's already-successful save", async () => {
    const { repository, service } = makeService();
    const beforeCount = repository.listDebts("personal-seed").length;
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "two.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "good-1", accountReferenceSafe: "last4:9999" }),
        firstmarkCandidate({ candidateId: "bad-1", accountReferenceSafe: "last4:7777" }),
      ],
    });

    const result = await service.saveReviewSession("personal-seed", [
      { importBatchId: batch.id, importCandidateId: "good-1", action: "resolveAsNewDebt", args: {} },
      // Unknown action - simulates a malformed/failed staged entry.
      { importBatchId: batch.id, importCandidateId: "bad-1", action: "notARealAction", args: {} },
    ]);

    expect(result.resolvedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(repository.listDebts("personal-seed")).toHaveLength(beforeCount + 1);
    const badItem = repository.getImportBatch("personal-seed", batch.id).candidates.find((c) => c.candidateId === "bad-1");
    expect(getReviewItemStatus(badItem)).toBe(REVIEW_STATUS.open);
  });
});

describe("REVIEW-1C: saveReviewSession - stale item isolation during a multi-item save", () => {
  it("a debt that changed since the review was created stays open with the friendly stale message; the other item still saves", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 34233, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "two.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "stale-match" }),
        firstmarkCandidate({ candidateId: "clean-new", accountReferenceSafe: "last4:9999" }),
      ],
    });
    // "stale-match" was already decided (e.g. an earlier partial save) -
    // its stale-review fingerprint is captured here, before the debt changes.
    await service.resolveAsExistingDebt("personal-seed", batch.id, "stale-match", { targetDebtId: existing.id });

    // The target debt legitimately changes AFTER that fingerprint was
    // captured but BEFORE this batch save actually runs/commits.
    await service.recordBalanceSnapshot("personal-seed", existing.id, { balance: 33500, observedAt: laterAsOf(5) });
    repository.saveDebt({ ...repository.listDebts("personal-seed").find((d) => d.id === existing.id), currentBalance: 33500, updatedAt: laterAsOf(5) });

    // This save session only stages the OTHER item in the same batch -
    // "stale-match" isn't re-staged (its decision already exists), but
    // committing the batch (triggered by clean-new) attempts BOTH decided
    // candidates, so the now-stale one surfaces here without being re-staged.
    const result = await service.saveReviewSession("personal-seed", [
      { importBatchId: batch.id, importCandidateId: "clean-new", action: "resolveAsNewDebt", args: {} },
    ]);

    expect(result.resolvedCount).toBe(1);
    const snapshot = await service.getReviewSnapshot("personal-seed");
    const staleItem = snapshot.openItems.find((item) => item.importCandidateId === "stale-match");
    expect(staleItem).toBeDefined(); // still open - never silently dropped

    // The stale debt's newer truth (33500) is preserved, never silently
    // overwritten by the older import.
    const live = repository.listDebts("personal-seed").find((d) => d.id === existing.id);
    expect(live.currentBalance).toBe(33500);
  });
});

describe("REVIEW-1C: saveReviewSession - idempotent under double-click", () => {
  it("calling saveReviewSession twice with the same staged answers never creates duplicate BalanceSnapshots or Debts", async () => {
    const { repository, service } = makeService();
    const existing = await service.createNewDebt("personal-seed", {
      clientRequestId: "firstmark-1234", name: "Firstmark Student Loan", accountReferenceSafe: "last4:1234",
      debtType: "student_loan", currentBalance: 12000, minimumRequiredPayment: 180, aprStatus: "known", apr: 7.25, includedInCorePayoffPlan: true,
    });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "firstmark.pdf", candidates: [firstmarkCandidate()] });
    const staged = [{ importBatchId: batch.id, importCandidateId: "cand-firstmark", action: "resolveAsExistingDebt", args: { targetDebtId: existing.id } }];

    const first = await service.saveReviewSession("personal-seed", staged);
    expect(first.resolvedCount).toBe(1);
    const snapshotsAfterFirst = repository.listBalanceSnapshots("personal-seed", existing.id).length;

    // Simulates a double-click: the same staged answers submitted again
    // before the UI had a chance to remove the now-resolved item.
    const second = await service.saveReviewSession("personal-seed", staged);
    expect(second.resolvedCount + second.failedCount + second.staleCount).toBe(1);
    expect(repository.listBalanceSnapshots("personal-seed", existing.id)).toHaveLength(snapshotsAfterFirst);
  });
});

describe("REVIEW-1C: skipAllOpenReviews", () => {
  it("defers every currently open review with zero authoritative mutation", async () => {
    const { repository, service } = makeService();
    const debtsBefore = repository.listDebts("personal-seed");
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "many.xlsx",
      candidates: [
        firstmarkCandidate({ candidateId: "one" }),
        firstmarkCandidate({ candidateId: "two", accountReferenceSafe: "last4:9999" }),
        firstmarkCandidate({ candidateId: "three", accountReferenceSafe: "last4:8888" }),
      ],
    });

    const result = await service.skipAllOpenReviews("personal-seed");
    expect(result.deferredCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(repository.listDebts("personal-seed")).toEqual(debtsBefore);

    const reloaded = repository.getImportBatch("personal-seed", batch.id);
    for (const candidate of reloaded.candidates) {
      expect(candidate.reviewResolution.type).toBe(REVIEW_RESOLUTION_TYPES.deferred);
      expect(getReviewItemStatus(candidate)).toBe(REVIEW_STATUS.open); // deferred is still OPEN, never resolved
    }
  });

  it("is safe to call again on an already-deferred item - re-defers harmlessly, zero additional mutation", async () => {
    // A deferred review is still "open" (Part 11), so a second Skip All
    // sweep legitimately includes it again - that's fine, since deferReview
    // itself is zero-mutation and idempotent. What must never happen is a
    // second sweep creating any financial mutation or losing the item.
    const { repository, service } = makeService();
    await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [firstmarkCandidate()] });
    const debtsBefore = repository.listDebts("personal-seed");
    const first = await service.skipAllOpenReviews("personal-seed");
    expect(first.deferredCount).toBe(1);
    const second = await service.skipAllOpenReviews("personal-seed");
    expect(second.deferredCount).toBe(1);
    expect(second.failedCount).toBe(0);
    expect(repository.listDebts("personal-seed")).toEqual(debtsBefore);
    const snapshot = await service.getReviewSnapshot("personal-seed");
    expect(snapshot.openCount).toBe(1); // still there, still open, never lost
  });
});

describe("REVIEW-1C: a blocking review that gets skipped still keeps the plan untrusted", () => {
  it("deferring a blocking review does not remove it from blockingCount, and it is reported as deferred-blocking", async () => {
    const { service } = makeService();
    // An unresolved current balance is one of evaluateReviewSignals'
    // explicitly blocking conditions (reviewDomain.js) - a plain candidate
    // with no open signals at all is technically still "open" (any
    // undecided candidate is) but not "blocking".
    await service.createImportBatch("personal-seed", {
      sourceType: "pdf", sourceFilename: "x.pdf",
      candidates: [firstmarkCandidate({ balanceStatus: "unresolved", currentBalance: 0 })],
    });
    const before = await service.getReviewSnapshot("personal-seed");
    expect(before.blockingCount).toBeGreaterThan(0);

    await service.skipAllOpenReviews("personal-seed");

    const after = await service.getReviewSnapshot("personal-seed");
    expect(after.blockingCount).toBe(before.blockingCount); // still untrusted, not silently cleared
    expect(after.deferredBlockingCount).toBe(before.blockingCount); // but honestly reported as deferred, not "never looked at"
    expect(after.actionableCount).toBe(0); // nav badge / progress line no longer nags about it
  });
});

describe("REVIEW-1C: a non-blocking skipped review does not create fake urgency", () => {
  it("a deferred non-blocking item is excluded from actionableCount but still present in openCount", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("personal-seed", {
      sourceType: "excel", sourceFilename: "due-day.xlsx",
      candidates: [firstmarkCandidate({ candidateId: "due-day-1", accountReferenceSafe: "last4:4444", dueDate: "", evidence: undefined })],
    });
    await service.deferReview("personal-seed", batch.id, "due-day-1");
    const snapshot = await service.getReviewSnapshot("personal-seed");
    expect(snapshot.openCount).toBe(1);
    expect(snapshot.actionableCount).toBe(0);
  });
});

describe("REVIEW-1C: skipping an owner review preserves the raw source evidence", () => {
  it("deferring an ownerMatch review never erases the imported owner-name evidence and never auto-assigns Joint", async () => {
    const { repository, service } = makeService("seed-owner");
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "pdf", sourceFilename: "x.pdf",
      candidates: [firstmarkCandidate({ candidateId: "owner-defer-1", ownerType: "unassigned", ownerId: "", ownerSuggestion: "Kristina" })],
    });
    await service.deferReview("household-seed", batch.id, "owner-defer-1");
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates.find((c) => c.candidateId === "owner-defer-1");
    expect(reloaded.ownerSuggestion).toBe("Kristina"); // raw evidence preserved, never erased
    expect(reloaded.ownerType).toBe("unassigned"); // never silently defaulted to joint/member
    expect(reloaded.ownerId).toBe("");
  });
});

describe("REVIEW-1C: cross-workspace safety for the new batch orchestration methods", () => {
  it("an actor who is not a member of the target workspace cannot save its reviews - the bad item fails in isolation, no new permission is granted", async () => {
    const { repository } = makeService();
    const beforeCount = repository.listDebts("household-seed").length;
    const batch = repository.saveImportBatch({
      id: "outsider-batch", workspaceId: "household-seed", createdBy: "seed-owner", createdAt: V2_TEST_NOW,
      sourceType: "pdf", sourceFilename: "x.pdf", status: "review_required", candidates: [firstmarkCandidate()],
    });
    const outsiderService = createTrackToZeroV2AsyncAppService({ repository, actorId: "not-a-member", asOf: V2_TEST_NOW });
    // A total non-member fails closed entirely: the individual resolve call
    // fails permission-first (never mutating anything), and reading back the
    // shared ReviewSnapshot to report final truth (Part 33) also requires
    // membership, so the whole call fails rather than returning any data
    // about a workspace this actor cannot see into.
    await expect(
      outsiderService.saveReviewSession("household-seed", [
        { importBatchId: batch.id, importCandidateId: "cand-firstmark", action: "resolveAsNewDebt", args: {} },
      ])
    ).rejects.toThrow(/not a member/i);
    expect(repository.listDebts("household-seed")).toHaveLength(beforeCount);

    // skipAllOpenReviews reads the shared ReviewSnapshot first (Part 33) -
    // that membership check is not per-item, so it fails closed immediately.
    await expect(outsiderService.skipAllOpenReviews("household-seed")).rejects.toThrow(/not a member/i);
  });

  it("a viewer (read-only role) cannot save or skip reviews - both report the failure without granting the mutation", async () => {
    const { repository, service } = makeService("seed-owner");
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [firstmarkCandidate()] });
    const beforeCount = repository.listDebts("household-seed").length;
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });

    const saveResult = await viewerService.saveReviewSession("household-seed", [
      { importBatchId: batch.id, importCandidateId: "cand-firstmark", action: "resolveAsNewDebt", args: {} },
    ]);
    expect(saveResult.resolvedCount).toBe(0);
    expect(saveResult.failedCount).toBe(1);
    expect(repository.listDebts("household-seed")).toHaveLength(beforeCount);

    const skipResult = await viewerService.skipAllOpenReviews("household-seed");
    expect(skipResult.deferredCount).toBe(0);
    expect(skipResult.failedCount).toBe(1);
    const reloaded = repository.getImportBatch("household-seed", batch.id);
    expect(getReviewItemStatus(reloaded.candidates[0])).toBe(REVIEW_STATUS.open); // untouched, not silently deferred
  });
});
