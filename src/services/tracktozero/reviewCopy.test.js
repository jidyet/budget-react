import { describe, expect, it } from "vitest";
import { REVIEW_TYPES } from "./reviewDomain.js";
import { getBlockingLine, getReviewCenterSummary, getReviewWhy } from "./reviewCopy.js";

const item = (types, candidateOverrides = {}) => ({
  types,
  candidate: { accountName: "Firstmark Services", ...candidateOverrides },
});

describe("REVIEW-1B voice contract: simple, friendly, no jargon", () => {
  it("never uses enterprise/developer jargon in any why-line", () => {
    const forbidden = /entity reconciliation|candidate resolution|workflow|financial mutation|classification anomaly|discrepancy/i;
    for (const types of [
      [REVIEW_TYPES.matchDecision], [REVIEW_TYPES.multipleMatches], [REVIEW_TYPES.duplicateImport],
      [REVIEW_TYPES.balanceConfirmation], [REVIEW_TYPES.aprConfirmation], [REVIEW_TYPES.minimumPaymentConfirmation],
      [REVIEW_TYPES.dueDateConfirmation], [REVIEW_TYPES.debtClassification], [REVIEW_TYPES.businessScope],
      [REVIEW_TYPES.ownerMatch], [REVIEW_TYPES.fieldConflict],
    ]) {
      expect(getReviewWhy(item(types))).not.toMatch(forbidden);
    }
  });

  it("distinguishes a formula-derived balance from a plain missing balance", () => {
    const formula = item([REVIEW_TYPES.balanceConfirmation], { evidence: { fieldEvidence: { balance: [{ truth: "formula_derived" }] } } });
    const missing = item([REVIEW_TYPES.balanceConfirmation], { evidence: {} });
    expect(getReviewWhy(formula)).toMatch(/formula/i);
    expect(getReviewWhy(missing)).not.toMatch(/formula/i);
  });

  it("names the unmatched owner suggestion when present, never invents one", () => {
    const withSuggestion = item([REVIEW_TYPES.ownerMatch], { ownerSuggestion: "Stallion" });
    expect(getReviewWhy(withSuggestion)).toContain("Stallion");
    const withoutSuggestion = item([REVIEW_TYPES.ownerMatch], { ownerSuggestion: "" });
    expect(getReviewWhy(withoutSuggestion)).not.toContain("undefined");
  });

  it("blocking vs non-blocking lines never claim every review blocks the plan", () => {
    expect(getBlockingLine(true)).toMatch(/trust your payoff plan/i);
    expect(getBlockingLine(false)).toMatch(/anytime/i);
  });

  it("summary is truthful: only mentions the blocking/non-blocking split when it applies", () => {
    expect(getReviewCenterSummary({ openCount: 0, blockingCount: 0 })).toBe("You're all caught up.");
    const mixed = getReviewCenterSummary({ openCount: 3, blockingCount: 2 });
    expect(mixed.join(" ")).toContain("3 import decisions still need your input");
    expect(mixed.join(" ")).toContain("2 affect your payoff plan");
    expect(mixed.join(" ")).toContain("1 are lower priority");
    const allBlocking = getReviewCenterSummary({ openCount: 2, blockingCount: 2 });
    expect(allBlocking.join(" ")).not.toContain("lower priority");
  });
});
