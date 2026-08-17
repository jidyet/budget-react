import { describe, expect, it } from "vitest";
import { groupCandidatesForReview, needsHelpCandidates, groupCandidatesByCategory } from "./importReviewGroups.js";

const candidate = (overrides = {}) => ({
  candidateId: `c-${Math.random().toString(36).slice(2, 8)}`,
  decision: "pending_review",
  duplicateStatus: "new",
  warnings: [],
  debtType: "credit_card",
  currentBalance: 100,
  ...overrides,
});

describe("groupCandidatesForReview (UX-6.1)", () => {
  it("buckets by decision/duplicateStatus/warnings exactly like the prior inline triage logic", () => {
    const missing = candidate({ decision: "needs_information" });
    const ambiguous = candidate({ duplicateStatus: "possible" });
    const needsReview = candidate({ warnings: ["Multiple APR values found"] });
    const confident = candidate();
    const confirmed = candidate({ decision: "confirmed" });
    const excluded = candidate({ decision: "excluded" });

    const groups = groupCandidatesForReview([missing, ambiguous, needsReview, confident, confirmed, excluded]);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.items]));

    expect(byKey.missing).toEqual([missing]);
    expect(byKey.ambiguous).toEqual([ambiguous]);
    expect(byKey.needs_review).toEqual([needsReview]);
    expect(byKey.confident).toEqual([confident]);
    expect(byKey.decided).toEqual([confirmed, excluded]);
  });

  it("omits empty groups rather than rendering a title with zero items", () => {
    const groups = groupCandidatesForReview([candidate()]);
    expect(groups.map((g) => g.key)).toEqual(["confident"]);
  });
});

describe("needsHelpCandidates (UX-6.1)", () => {
  it("counts missing-information and warned/ambiguous pending candidates, never a clean confident one", () => {
    const missing = candidate({ decision: "needs_information" });
    const ambiguous = candidate({ duplicateStatus: "possible" });
    const warned = candidate({ warnings: ["Unknown APR"] });
    const confident = candidate();
    const confirmed = candidate({ decision: "confirmed" });

    const result = needsHelpCandidates([missing, ambiguous, warned, confident, confirmed]);
    expect(result).toEqual([missing, ambiguous, warned]);
  });
});

describe("groupCandidatesByCategory (UX-6.1)", () => {
  it("groups by the same DEBT_CATEGORY_GROUPS taxonomy the Debt Portfolio uses", () => {
    const creditCard = candidate({ debtType: "credit_card" });
    const studentLoan = candidate({ debtType: "student_loan" });
    const anotherCreditCard = candidate({ debtType: "credit_card" });

    const grouped = groupCandidatesByCategory([creditCard, studentLoan, anotherCreditCard]);
    expect(grouped.get("CREDIT_CARD")).toHaveLength(2);
    expect(grouped.get("STUDENT_LOAN")).toHaveLength(1);
  });

  it("falls an unmapped debtType through to OTHER_DEBT rather than dropping the candidate", () => {
    const mystery = candidate({ debtType: "some_future_type" });
    const grouped = groupCandidatesByCategory([mystery]);
    expect(grouped.get("OTHER_DEBT")).toEqual([mystery]);
  });
});
