import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ReviewCard from "./ReviewCard.jsx";
import ReviewCenter from "./ReviewCenter.jsx";
import ReviewDetail from "./ReviewDetail.jsx";
import ResolvedHistory from "./ResolvedHistory.jsx";
import HomeQuickCheck from "./HomeQuickCheck.jsx";
import { toReviewItem } from "../../../services/tracktozero/reviewDomain.js";
import { FRIENDLY_STALE_MESSAGE } from "../../../services/tracktozero/reviewCopy.js";

const render = (element) => renderToStaticMarkup(element);

const batch = (overrides = {}) => ({
  id: "batch-1",
  workspaceId: "personal-seed",
  sourceType: "pdf",
  sourceFilename: "firstmark.pdf",
  createdAt: "2026-08-10T00:00:00.000Z",
  ...overrides,
});

const matchCandidate = (overrides = {}) => ({
  candidateId: "cand-1",
  accountName: "Firstmark Services",
  currentBalance: 33810.12,
  statementDate: "2026-08-10",
  aprStatus: "known",
  apr: 0.0725,
  minimumPayment: 190,
  dueDate: "2026-08-21",
  ownerSuggestion: "Jay",
  ownerType: "unassigned",
  ownerId: "",
  evidence: {
    reconciliation: {
      classification: "possible_match",
      matches: [
        {
          debtId: "debt-1",
          debtName: "Firstmark Services",
          reasons: ["Same creditor/name appears to match", "Same account ending"],
          diff: {
            balance: { existingValue: 34233.67, newValue: 33810.12, state: "changed" },
            apr: { existingValue: null, newValue: 0.0674, state: "new_information" },
            minimumPayment: { existingValue: 500, newValue: 425, state: "changed" },
            dueDay: { existingValue: null, newValue: 21, state: "new_information" },
          },
        },
      ],
    },
  },
  ...overrides,
});

const item = (candidateOverrides = {}, batchOverrides = {}) =>
  toReviewItem({ batch: batch(batchOverrides), candidate: matchCandidate(candidateOverrides) });

describe("REVIEW-1B: ReviewCard", () => {
  it("shows what/why, type label, and never exposes raw internal status/enum names", () => {
    const html = render(h(ReviewCard, { item: item(), isHousehold: false, onOpen: () => {} }));
    expect(html).toContain("Firstmark Services");
    expect(html).toContain("Possible match");
    expect(html).toContain("Review");
    expect(html).not.toMatch(/pending_review|possible_match|MATCH_DECISION/);
  });

  it("shows an owner badge only in household workspaces", () => {
    const html = render(h(ReviewCard, { item: item(), isHousehold: true, onOpen: () => {} }));
    expect(html).toContain("Jay");
  });
});

describe("REVIEW-1B: ResolvedHistory", () => {
  it("shows a friendly empty state when nothing is resolved", () => {
    expect(render(h(ResolvedHistory, { items: [] }))).toContain("Nothing resolved yet.");
  });

  it("shows a friendly label for a resolved item, never a raw resolution-type constant", () => {
    const resolved = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({
        reviewResolution: { type: "updated_existing_debt", decidedAt: "2026-08-14T00:00:00.000Z", decidedBy: "seed-owner" },
        committedOutcome: { type: "updated_existing_debt", debtId: "debt-1", at: "2026-08-14T00:00:00.000Z" },
      }),
    });
    const html = render(h(ResolvedHistory, { items: [resolved] }));
    expect(html).toContain("Updated existing debt");
    expect(html).not.toContain("updated_existing_debt");
  });
});

describe("REVIEW-1B: HomeQuickCheck", () => {
  it("renders nothing when there is nothing open (Part 32 - no clutter)", () => {
    expect(render(h(HomeQuickCheck, { openCount: 0, blockingCount: 0, onGoToReview: () => {} }))).toBe("");
  });

  it("shows the open count and, when relevant, the blocking line", () => {
    const html = render(h(HomeQuickCheck, { openCount: 2, blockingCount: 1, onGoToReview: () => {} }));
    expect(html).toContain("2 things need your attention");
    expect(html).toContain("fully trust your plan");
    expect(html).toContain("Review them");
  });

  it("omits the blocking line when nothing is blocking", () => {
    const html = render(h(HomeQuickCheck, { openCount: 2, blockingCount: 0, onGoToReview: () => {} }));
    expect(html).not.toContain("fully trust your plan");
  });
});

describe("REVIEW-1C: ReviewCenter (batch session)", () => {
  const snapshot = {
    workspace: { type: "personal" },
    members: [],
    debts: [{ id: "debt-1", name: "Firstmark Services", currentBalance: 34233.67 }],
    latestSnapshotsByDebt: {},
  };

  it("shows the caught-up empty state when there are no open reviews", () => {
    const html = render(h(ReviewCenter, {
      snapshot, service: {}, workspaceId: "personal-seed",
      reviewSnapshot: { openItems: [], resolvedItems: [], openCount: 0, blockingCount: 0 },
      loadingReview: false, onRefreshReview: async () => {},
    }));
    expect(html).toContain("Needs Review");
    expect(html).toContain("all caught up");
  });

  it("shows a truthful summary, the batch session card, and the save-what-I-know action bar when reviews are open", () => {
    const openItem = item();
    const html = render(h(ReviewCenter, {
      snapshot, service: {}, workspaceId: "personal-seed",
      reviewSnapshot: { openItems: [openItem], resolvedItems: [], openCount: 1, blockingCount: 1 },
      loadingReview: false, onRefreshReview: async () => {},
    }));
    expect(html).toContain("1 thing needs a quick check");
    expect(html).toContain("Firstmark Services");
    expect(html).toContain("0 of 1 answered");
    expect(html).toContain("Save what I know");
    expect(html).toContain("Skip all for now");
  });
});

describe("REVIEW-1B: ReviewDetail resolution surface", () => {
  const baseProps = {
    workspaceId: "personal-seed",
    workspace: { type: "household" },
    members: [{ uid: "m1", displayName: "Jay", status: "active" }],
    debts: [{ id: "debt-1", name: "Firstmark Services", currentBalance: 34233.67 }],
    latestSnapshotsByDebt: {},
    service: {},
    onResolved: () => {},
  };

  it("renders nothing when closed", () => {
    expect(render(h(ReviewDetail, { ...baseProps, item: item(), open: false, onClose: () => {} }))).toBe("");
  });

  it("possible match: shows the field-difference comparison and both resolution actions, offers Leave for later", () => {
    const html = render(h(ReviewDetail, { ...baseProps, item: item(), open: true, onClose: () => {} }));
    expect(html).toContain("Possible match");
    expect(html).toContain("Same creditor/name appears to match");
    expect(html).toContain("$34,233.67"); // existing balance
    expect(html).toContain("$33,810.12"); // new statement balance
    expect(html).toContain("Update this debt");
    expect(html).toContain("It&#x27;s a different debt");
    expect(html).toContain("Leave for later");
  });

  it("multiple matches: shows every candidate debt, none pre-selected/auto-resolved", () => {
    const multi = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({
        evidence: {
          reconciliation: {
            classification: "multiple_matches",
            matches: [
              { debtId: "debt-1", debtName: "Firstmark ••••1234", reasons: ["Creditor matches"], diff: {} },
              { debtId: "debt-2", debtName: "Firstmark ••••5678", reasons: ["Creditor matches"], diff: {} },
            ],
          },
        },
      }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: multi, open: true, onClose: () => {} }));
    expect(html).toContain("Which debt is this?");
    expect(html).toContain("Firstmark ••••1234");
    expect(html).toContain("Firstmark ••••5678");
    expect(html).toContain("It&#x27;s a new debt");
    expect(html).not.toContain("Update this debt"); // no target selected yet - never auto-resolved
  });

  it("missing/blank balance never defaults to 0 in the input", () => {
    const missing = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({ evidence: {}, currentBalance: 0, balanceStatus: "unresolved" }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: missing, open: true, onClose: () => {} }));
    expect(html).toContain("What&#x27;s the current balance?");
    expect(html).not.toMatch(/value="0"/);
  });

  it("formula-derived balance shows the projection warning and does not style it as confirmed truth", () => {
    const formula = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({
        evidence: { fieldEvidence: { balance: [{ value: 2476.25, truth: "formula_derived" }] } },
        currentBalance: 0,
        balanceStatus: "unresolved",
      }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: formula, open: true, onClose: () => {} }));
    expect(html).toContain("Is this your current balance?");
    expect(html).toContain("$2,476.25");
    expect(html).toMatch(/formula/i);
    expect(html).toContain("Enter my current balance");
  });

  it("multiple APR candidates require explicit selection, never silently confirmed", () => {
    const multiApr = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({
        aprStatus: "unknown",
        evidence: { fieldEvidence: { apr: [{ aprStatus: "known", apr: 0.0674 }, { aprStatus: "known", apr: 0.0725 }, { aprStatus: "known", apr: 0.081 }] } },
      }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: multiApr, open: true, onClose: () => {} }));
    expect(html).toContain("Which APR applies to this debt?");
    expect(html).toContain("6.74");
    expect(html).toContain("7.25");
    expect(html).toContain("8.10");
    expect(html).toContain("Most likely");
    expect(html).toContain("Enter another APR");
  });

  it("business scope: offers keep-out and include, favors safety visually", () => {
    const business = toReviewItem({ batch: batch(), candidate: matchCandidate({ evidence: { scopeSuggestion: "business_candidate" } }) });
    const html = render(h(ReviewDetail, { ...baseProps, item: business, open: true, onClose: () => {} }));
    expect(html).toContain("This looks like business debt");
    expect(html).toContain("Keep it out");
    expect(html).toContain("Include it");
  });

  it("debt vs bill: reinforces the payoff-to-zero framing", () => {
    const carPayment = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({ accountName: "Car Payment", evidence: { classification: "possible_debt" } }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: carPayment, open: true, onClose: () => {} }));
    expect(html).toContain("paying down to $0");
    expect(html).toContain("Yes, it&#x27;s debt");
    expect(html).toContain("No, it&#x27;s just a bill");
  });

  it("duplicate import: defaults to keeping the existing record, never silently creates another snapshot", () => {
    const duplicate = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({ evidence: { reconciliation: { classification: "duplicate_import", matches: [] } } }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: duplicate, open: true, onClose: () => {} }));
    expect(html).toContain("Already added?");
    expect(html).toContain("Keep the one already in TrackToZero");
    expect(html).toContain("Review anyway");
  });

  it("owner resolution offers only verified members, Joint, and Unassigned - never free text", () => {
    const unmatchedOwner = toReviewItem({
      batch: batch(),
      candidate: matchCandidate({ ownerSuggestion: "Stallion", ownerType: "unassigned", evidence: {} }),
    });
    const html = render(h(ReviewDetail, { ...baseProps, item: unmatchedOwner, open: true, onClose: () => {} }));
    expect(html).toContain("couldn&#x27;t match");
    expect(html).toContain("Stallion");
    expect(html).toContain("Jay"); // real verified member option
    expect(html).toContain("Joint / Household");
  });

  it("does not show the stale-conflict callout before any resolution attempt has been made", () => {
    const html = render(h(ReviewDetail, { ...baseProps, item: item(), open: true, onClose: () => {} }));
    expect(html).not.toContain(FRIENDLY_STALE_MESSAGE);
  });

  // This project's tests run without jsdom (see vitest.config.js), so a real
  // click-triggered stale response can't be simulated here - that path is
  // covered end-to-end at the service layer (v2AsyncApplicationService.review.test.js
  // Part 28/50) and against real Firestore (tests/firestore.v2.repository.test.js).
  // This is a lightweight regression guard against copy drift: the component
  // must reference the ONE shared FRIENDLY_STALE_MESSAGE constant, not a
  // hand-typed duplicate that could silently diverge from it.
  it("reads its stale-conflict copy from the shared reviewCopy.js constant, not a hardcoded duplicate", () => {
    const source = readFileSync(fileURLToPath(new URL("./ReviewDetail.jsx", import.meta.url)), "utf8");
    expect(source).toContain("FRIENDLY_STALE_MESSAGE");
    expect(source).not.toMatch(/["'`]This debt changed since/);
  });
});
