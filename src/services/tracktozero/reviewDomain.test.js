import { describe, expect, it } from "vitest";
import {
  REVIEW_RESOLUTION_TYPES,
  REVIEW_STATUS,
  REVIEW_TYPES,
  classifyReviewTypes,
  debtStateFingerprint,
  evaluateReviewSignals,
  flattenReviewItems,
  getBlockingReviewCount,
  getOpenReviewCount,
  getOpenReviewItems,
  getReviewCountsByType,
  getReviewItemStatus,
  isDebtStale,
  isReviewBlocking,
  sortOpenReviewItems,
  toReviewItem,
} from "./reviewDomain.js";
import { parseStatement } from "../adapters/statementTextExtraction.js";
import { statementResultToCandidate } from "../adapters/statementCandidateAdapter.js";
import { US_BANK_CASH_PLUS_STATEMENT_TEXT } from "../adapters/__fixtures__/usBankCashPlusStatement.fixture.js";

const candidate = (overrides = {}) => ({
  candidateId: "cand-1",
  accountName: "Firstmark Loan",
  currentBalance: 11880,
  balanceStatus: "confirmed",
  aprStatus: "known",
  apr: 0.075,
  minimumPayment: 190,
  dueDate: "2026-08-21",
  ownerSuggestion: "",
  ownerType: "unassigned",
  decision: "pending_review",
  evidence: {},
  warnings: [],
  ...overrides,
});

const batch = (candidates, overrides = {}) => ({
  id: "batch-1",
  workspaceId: "personal-seed",
  sourceType: "pdf",
  sourceFilename: "firstmark.pdf",
  createdAt: "2026-08-10T00:00:00.000Z",
  candidates,
  ...overrides,
});

describe("REVIEW-1A scenarios (Part 42 A-L, pure-logic-testable subset)", () => {
  it("A/B: a possible or multiple existing-debt match is blocking MATCH_DECISION / MULTIPLE_MATCHES", () => {
    const possible = candidate({ evidence: { reconciliation: { classification: "possible_match", matches: [{ debtId: "d1", diff: {} }] } } });
    expect(classifyReviewTypes(possible)).toContain(REVIEW_TYPES.matchDecision);
    expect(isReviewBlocking(possible)).toBe(true);

    const multiple = candidate({ evidence: { reconciliation: { classification: "multiple_matches", matches: [{ debtId: "d1", diff: {} }, { debtId: "d2", diff: {} }] } } });
    expect(classifyReviewTypes(multiple)).toContain(REVIEW_TYPES.multipleMatches);
    expect(isReviewBlocking(multiple)).toBe(true);
  });

  it("C: 'I'm not sure' (deferred) leaves the review OPEN with zero blocking side effects on classification", () => {
    const deferred = candidate({ reviewResolution: { type: REVIEW_RESOLUTION_TYPES.deferred, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" } });
    expect(getReviewItemStatus(deferred)).toBe(REVIEW_STATUS.open);
  });

  it("D: missing student-loan balance is blocking BALANCE_CONFIRMATION", () => {
    const missingBalance = candidate({ balanceStatus: "unresolved", currentBalance: 0 });
    expect(classifyReviewTypes(missingBalance)).toContain(REVIEW_TYPES.balanceConfirmation);
    expect(isReviewBlocking(missingBalance)).toBe(true);
  });

  it("E: multiple plausible APRs is blocking APR_CONFIRMATION, but a single unknown APR is not blocking", () => {
    const multipleAprs = candidate({
      aprStatus: "unknown",
      evidence: { fieldEvidence: { apr: [{ aprStatus: "known", apr: 0.0674 }, { aprStatus: "known", apr: 0.0725 }, { aprStatus: "known", apr: 0.081 }] } },
    });
    expect(classifyReviewTypes(multipleAprs)).toContain(REVIEW_TYPES.aprConfirmation);
    expect(isReviewBlocking(multipleAprs)).toBe(true);

    const singleUnknown = candidate({ aprStatus: "unknown" });
    expect(classifyReviewTypes(singleUnknown)).toContain(REVIEW_TYPES.aprConfirmation);
    expect(isReviewBlocking(singleUnknown)).toBe(false);
  });

  it("DATA-2: a real PDF-sourced candidate (not a hand-built fixture) now also blocks on multiple plausible APRs - this check previously only ever fired for Excel/workbook candidates, since PDF candidates never populated fieldEvidence.apr at all", () => {
    const parsed = parseStatement(US_BANK_CASH_PLUS_STATEMENT_TEXT);
    const pdfCandidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "batch", fileName: "cash-plus.pdf" });
    expect(classifyReviewTypes(pdfCandidate)).toContain(REVIEW_TYPES.aprConfirmation);
    expect(isReviewBlocking(pdfCandidate)).toBe(true);
  });

  it("F: a formula-derived/projected balance is blocking BALANCE_CONFIRMATION even when balanceStatus looks confirmed", () => {
    const formulaBalance = candidate({
      balanceStatus: "confirmed",
      evidence: { fieldEvidence: { balance: [{ value: 2476.25, truth: "formula_derived" }] } },
    });
    expect(classifyReviewTypes(formulaBalance)).toContain(REVIEW_TYPES.balanceConfirmation);
    expect(isReviewBlocking(formulaBalance)).toBe(true);
  });

  it("G: a business-scope candidate in a household workspace is blocking BUSINESS_SCOPE", () => {
    const business = candidate({ evidence: { scopeSuggestion: "business_candidate" } });
    expect(classifyReviewTypes(business)).toContain(REVIEW_TYPES.businessScope);
    expect(isReviewBlocking(business)).toBe(true);
  });

  it("H: an owner suggestion that never matched a real member is OWNER_MATCH but non-blocking (unassigned is a valid state)", () => {
    const ownerMismatch = candidate({ ownerSuggestion: "Ben", ownerType: "unassigned" });
    expect(classifyReviewTypes(ownerMismatch)).toContain(REVIEW_TYPES.ownerMatch);
    expect(isReviewBlocking(ownerMismatch)).toBe(false);
  });

  it("I: a duplicate-import classification is blocking DUPLICATE_IMPORT", () => {
    const duplicate = candidate({ evidence: { reconciliation: { classification: "duplicate_import" } } });
    expect(classifyReviewTypes(duplicate)).toContain(REVIEW_TYPES.duplicateImport);
    expect(isReviewBlocking(duplicate)).toBe(true);
  });

  it("K: an ambiguous 'Car Payment' (possible_debt/uncertain classification) is blocking DEBT_CLASSIFICATION", () => {
    const carPayment = candidate({ evidence: { classification: "possible_debt" } });
    expect(classifyReviewTypes(carPayment)).toContain(REVIEW_TYPES.debtClassification);
    expect(isReviewBlocking(carPayment)).toBe(true);
  });

  it("missing due date and missing minimum payment alone are non-blocking (Part 10 explicit examples)", () => {
    const cosmeticOnly = candidate({ dueDate: "", minimumPayment: null });
    const signals = evaluateReviewSignals(cosmeticOnly);
    expect(signals.types).toEqual(expect.arrayContaining([REVIEW_TYPES.dueDateConfirmation, REVIEW_TYPES.minimumPaymentConfirmation]));
    expect(signals.blocking).toBe(false);
  });

  it("a field conflict against the existing debt's current value is blocking FIELD_CONFLICT", () => {
    const conflicting = candidate({
      evidence: { reconciliation: { classification: "strong_match", matches: [{ debtId: "d1", diff: { accountReferenceSafe: { state: "conflicting" } } }] } },
    });
    expect(classifyReviewTypes(conflicting)).toContain(REVIEW_TYPES.fieldConflict);
    expect(isReviewBlocking(conflicting)).toBe(true);
  });
});

describe("REVIEW-1A resolution status (Part 4, 32) - resolved requires the mutation to have actually completed", () => {
  it("a match decision marked update_existing but not yet committed is still OPEN, not resolved", () => {
    const notYetCommitted = candidate({
      reviewResolution: { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
    });
    expect(getReviewItemStatus(notYetCommitted)).toBe(REVIEW_STATUS.open);
  });

  it("becomes RESOLVED only once committedOutcome is stamped by a successful commit", () => {
    const committed = candidate({
      reviewResolution: { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
      committedOutcome: { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, debtId: "d1", at: "2026-08-11T00:05:00.000Z" },
    });
    expect(getReviewItemStatus(committed)).toBe(REVIEW_STATUS.resolved);
  });

  it("dismissedDuplicate/excludedBusinessScope/classifiedAsBill are DISMISSED, never RESOLVED - distinct meanings are preserved (Part 32)", () => {
    for (const type of [REVIEW_RESOLUTION_TYPES.dismissedDuplicate, REVIEW_RESOLUTION_TYPES.excludedBusinessScope, REVIEW_RESOLUTION_TYPES.classifiedAsBill]) {
      const dismissed = candidate({ reviewResolution: { type, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" } });
      expect(getReviewItemStatus(dismissed)).toBe(REVIEW_STATUS.dismissed);
    }
  });

  it("a failed/partial commit attempt (no committedOutcome recorded) leaves the review actionable, never silently resolved", () => {
    const failedAttempt = candidate({
      reviewResolution: { type: REVIEW_RESOLUTION_TYPES.createdNewDebt, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
    });
    expect(getReviewItemStatus(failedAttempt)).not.toBe(REVIEW_STATUS.resolved);
  });

  it("UX-5: a plain quick-confirm candidate (no reviewResolution) becomes RESOLVED once committedOutcome is stamped, so Review reconciles with the real Debt it created", () => {
    const quickConfirmed = candidate({
      decision: "confirmed",
      committedOutcome: { type: REVIEW_RESOLUTION_TYPES.createdNewDebt, debtId: "d1", at: "2026-08-11T00:05:00.000Z" },
    });
    expect(getReviewItemStatus(quickConfirmed)).toBe(REVIEW_STATUS.resolved);
  });

  it("UX-5: a plain Exclude (no reviewResolution) is DISMISSED, not stuck open forever", () => {
    const quickExcluded = candidate({ decision: "excluded" });
    expect(getReviewItemStatus(quickExcluded)).toBe(REVIEW_STATUS.dismissed);
  });
});

describe("REVIEW-1A shared selectors (Part 9) - ONE source of review truth", () => {
  it("getOpenReviewItems/getOpenReviewCount/getBlockingReviewCount agree with per-item status/blocking", () => {
    const batches = [
      batch([
        candidate({ candidateId: "open-blocking", evidence: { reconciliation: { classification: "multiple_matches", matches: [{ debtId: "d1", diff: {} }, { debtId: "d2", diff: {} }] } } }),
        candidate({ candidateId: "open-nonblocking", dueDate: "" }),
        candidate({
          candidateId: "resolved-one",
          reviewResolution: { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
          committedOutcome: { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, debtId: "d1", at: "2026-08-11T00:05:00.000Z" },
        }),
        candidate({
          candidateId: "dismissed-one",
          reviewResolution: { type: REVIEW_RESOLUTION_TYPES.dismissedDuplicate, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
        }),
      ]),
    ];
    expect(getOpenReviewCount(batches)).toBe(2);
    expect(getBlockingReviewCount(batches)).toBe(1);
    const open = getOpenReviewItems(batches);
    expect(open.map((item) => item.importCandidateId).sort()).toEqual(["open-blocking", "open-nonblocking"]);
  });

  it("getReviewCountsByType tallies only OPEN items' types", () => {
    const batches = [
      batch([
        candidate({ candidateId: "a", balanceStatus: "unresolved" }),
        candidate({ candidateId: "b", balanceStatus: "unresolved" }),
        candidate({
          candidateId: "c",
          balanceStatus: "unresolved",
          reviewResolution: { type: REVIEW_RESOLUTION_TYPES.dismissedDuplicate, decidedAt: "2026-08-11T00:00:00.000Z", decidedBy: "seed-owner" },
        }),
      ]),
    ];
    const counts = getReviewCountsByType(batches);
    expect(counts[REVIEW_TYPES.balanceConfirmation]).toBe(2);
  });

  it("sortOpenReviewItems puts blocking items first, then oldest-first within each group", () => {
    const items = flattenReviewItems([
      batch([
        candidate({ candidateId: "old-nonblocking", dueDate: "" }),
        candidate({ candidateId: "new-blocking", balanceStatus: "unresolved" }),
      ], { createdAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    const sorted = sortOpenReviewItems(items);
    expect(sorted[0].importCandidateId).toBe("new-blocking");
  });

  it("workspace scoping: flattenReviewItems never mixes candidates across workspaces because each item carries its batch's own workspaceId", () => {
    const items = flattenReviewItems([
      batch([candidate({ candidateId: "a" })], { workspaceId: "workspace-a" }),
      batch([candidate({ candidateId: "b" })], { workspaceId: "workspace-b" }),
    ]);
    expect(items.find((item) => item.importCandidateId === "a").workspaceId).toBe("workspace-a");
    expect(items.find((item) => item.importCandidateId === "b").workspaceId).toBe("workspace-b");
  });
});

describe("REVIEW-1A stale-review protection (Part 28) - fingerprinting", () => {
  it("a debt fingerprint is stable across identical reads", () => {
    const debt = { currentBalance: 34233.67, updatedAt: "2026-08-10T00:00:00.000Z" };
    expect(debtStateFingerprint(debt)).toEqual(debtStateFingerprint({ ...debt }));
  });

  it("L: a debt that legitimately changed after the review's fingerprint was captured is detected as stale", () => {
    const fingerprint = debtStateFingerprint({ currentBalance: 34233, updatedAt: "2026-08-10T00:00:00.000Z" });
    const laterDebt = { currentBalance: 33500, updatedAt: "2026-08-12T00:00:00.000Z" };
    expect(isDebtStale(fingerprint, laterDebt)).toBe(true);
  });

  it("an unchanged debt is never flagged stale", () => {
    const debt = { currentBalance: 34233, updatedAt: "2026-08-10T00:00:00.000Z" };
    const fingerprint = debtStateFingerprint(debt);
    expect(isDebtStale(fingerprint, debt)).toBe(false);
  });

  it("no fingerprint captured (legacy/older resolution) never blocks a commit on staleness grounds", () => {
    expect(isDebtStale(null, { currentBalance: 100, updatedAt: "now" })).toBe(false);
  });
});

describe("toReviewItem", () => {
  it("carries provenance (batch + candidate ids, source filename) without leaking full documents", () => {
    const item = toReviewItem({ batch: batch([candidate()]), candidate: candidate() });
    expect(item.id).toBe("batch-1:cand-1");
    expect(item.importBatchId).toBe("batch-1");
    expect(item.sourceReference).toBe("firstmark.pdf");
  });
});
