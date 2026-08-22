import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ReviewCard from "./ReviewCard.jsx";
import ReviewCenter from "./ReviewCenter.jsx";
import ReviewDetail from "./ReviewDetail.jsx";
import ReviewSessionCard from "./ReviewSessionCard.jsx";
import { buildPreSaveSummary } from "./reviewSessionSummary.js";
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
    expect(html).toContain("2 import decisions still need your input");
    expect(html).toContain("affects your payoff plan");
    expect(html).toContain("Open review");
  });

  it("omits the blocking line when nothing is blocking", () => {
    const html = render(h(HomeQuickCheck, { openCount: 2, blockingCount: 0, onGoToReview: () => {} }));
    expect(html).not.toContain("affect your payoff plan");
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
    expect(html).toContain("1 import decision still needs your input");
    expect(html).toContain("Firstmark Services");
    expect(html).toContain("Item 1 of 1");
    expect(html).toContain("Unified verification");
    expect(html).toContain("$33,810.12");
    expect(html).toContain("0 ready");
    expect(html).toContain("1 still needs a decision");
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

describe("REVIEW-1C: ReviewCenter wizard navigation", () => {
  const snapshot = {
    workspace: { type: "personal" },
    members: [],
    debts: [{ id: "debt-1", name: "Firstmark Services", currentBalance: 34233.67 }],
    latestSnapshotsByDebt: {},
  };

  it("shows Item 1 of N with Previous disabled and Next enabled when more than one item is open", () => {
    const itemA = item({ candidateId: "cand-a" });
    const itemB = item({ candidateId: "cand-b", accountName: "Capital One" }, { id: "batch-2" });
    const html = render(h(ReviewCenter, {
      snapshot, service: {}, workspaceId: "personal-seed",
      reviewSnapshot: { openItems: [itemA, itemB], resolvedItems: [], openCount: 2, blockingCount: 2 },
      loadingReview: false, onRefreshReview: async () => {},
    }));
    expect(html).toContain("Item 1 of 2");
    expect(html).toMatch(/Previous<\/button>/);
    expect(html).toContain("Capital One");
    // Previous is disabled on the first item; Next is not.
    const previousButton = html.match(/<button[^>]*>Previous<\/button>/)[0];
    const nextButton = html.match(/<button[^>]*>Next<\/button>/)[0];
    expect(previousButton).toContain('disabled=""');
    expect(nextButton).not.toContain('disabled=""');
  });

  it("shows all four filter tabs with truthful counts", () => {
    const openItem = item();
    const html = render(h(ReviewCenter, {
      snapshot, service: {}, workspaceId: "personal-seed",
      reviewSnapshot: { openItems: [openItem], resolvedItems: [], openCount: 1, blockingCount: 1 },
      loadingReview: false, onRefreshReview: async () => {},
    }));
    expect(html).toContain("Needs review (1)");
    expect(html).toContain("Skipped for later (0)");
    expect(html).toContain("Resolved (0)");
    expect(html).toContain("All (1)");
  });
});

describe("REVIEW-1C: buildPreSaveSummary - truthful pre-save categorization", () => {
  const existingDebtItem = () => item({ candidateId: "existing-1" });
  const newDebtItem = () =>
    toReviewItem({
      batch: batch({ id: "batch-new" }),
      candidate: matchCandidate({ candidateId: "new-1", evidence: {} }),
    });

  it("counts a staged existing-debt update as ready, and adds its confirmed balance to the total", () => {
    const target = existingDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { match: { action: "resolveAsExistingDebt", args: { targetDebtId: "debt-1" } } },
    });
    expect(summary.updateCount).toBe(1);
    expect(summary.newDebtCount).toBe(0);
    expect(summary.confirmedBalanceTotal).toBe(target.candidate.currentBalance);
    expect(summary.stillNeedsDecision).toBe(0);
  });

  it("a staged new-debt decision counts as ready and uses the item's known balance", () => {
    const target = newDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { match: { action: "resolveAsNewDebt", args: {} } },
    });
    expect(summary.newDebtCount).toBe(1);
    expect(summary.confirmedBalanceTotal).toBe(target.candidate.currentBalance);
  });

  it("a staged balance answer overrides the candidate's raw balance in the confirmed total", () => {
    const target = newDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: {
        match: { action: "resolveAsNewDebt", args: {} },
        balance: { action: "resolveBalance", args: { currentBalance: 500 } },
      },
    });
    expect(summary.confirmedBalanceTotal).toBe(500);
  });

  it("an unresolved balance is never folded into the confirmed total", () => {
    const target = toReviewItem({
      batch: batch({ id: "batch-unresolved" }),
      candidate: matchCandidate({ candidateId: "missing-bal", evidence: {}, currentBalance: 0, balanceStatus: "unresolved" }),
    });
    const summary = buildPreSaveSummary([target], {
      [target.id]: { match: { action: "resolveAsNewDebt", args: {} } },
    });
    expect(summary.newDebtCount).toBe(1);
    expect(summary.confirmedBalanceTotal).toBe(0);
  });

  it("dismissDuplicate counts as a resolved duplicate, not an update or new debt", () => {
    const target = existingDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { duplicate: { action: "dismissDuplicate", args: {} } },
    });
    expect(summary.duplicateCount).toBe(1);
    expect(summary.updateCount).toBe(0);
    expect(summary.confirmedBalanceTotal).toBe(0);
  });

  it("excluding via business scope counts as excluded, not ready-to-update", () => {
    const target = existingDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { scope: { action: "resolveBusinessScope", args: { decision: "exclude" } } },
    });
    expect(summary.excludedCount).toBe(1);
    expect(summary.stillNeedsDecision).toBe(0);
  });

  it("including via business scope alone is NOT terminal - the item still needs a separate new/existing decision", () => {
    const target = existingDebtItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { scope: { action: "resolveBusinessScope", args: { decision: "include" } } },
    });
    expect(summary.excludedCount).toBe(0);
    expect(summary.updateCount).toBe(0);
    expect(summary.stillNeedsDecision).toBe(1);
  });

  it("an item with no staged answer at all is 'still needs a decision', never silently ready", () => {
    const target = existingDebtItem();
    const summary = buildPreSaveSummary([target], {});
    expect(summary.stillNeedsDecision).toBe(1);
    expect(summary.updateCount).toBe(0);
    expect(summary.newDebtCount).toBe(0);
  });

  it("tallies remaining-missing APR/minimum/due date/owner only for items that stay open after this save", () => {
    const missingApr = toReviewItem({
      batch: batch({ id: "batch-apr" }),
      candidate: matchCandidate({ candidateId: "apr-1", evidence: {}, aprStatus: "unknown" }),
    });
    const summary = buildPreSaveSummary([missingApr], {});
    expect(summary.missingAprCount).toBe(1);

    // Once staged (even without a terminal decision), it no longer counts
    // as "still missing" for this save's summary purposes.
    const staged = { [missingApr.id]: { apr: { action: "resolveApr", args: { apr: 0.05 } } } };
    const summaryAfterStaging = buildPreSaveSummary([missingApr], staged);
    expect(summaryAfterStaging.missingAprCount).toBe(0);
  });
});

describe("Fix: a no-match candidate always has a way to reach a terminal decision", () => {
  // Before this fix, a candidate the reconciliation engine found NO existing-
  // debt match for (evidence.reconciliation absent, or classification
  // "no_match") never rendered MatchSubSection or DuplicateSubSection - both
  // are gated on hasMatch/hasDuplicate, which stay false here. That left such
  // a candidate with no staged action getTerminalEntry recognizes as
  // terminal, so it could never leave the review queue no matter how
  // completely its other fields (balance/due day/owner) were filled in.
  const noMatchCandidate = (overrides = {}) => ({
    candidateId: "no-match-1",
    accountName: "USBANK Credit Card",
    currentBalance: 0,
    balanceStatus: "unresolved",
    aprStatus: "known",
    apr: 0.05,
    minimumPayment: null,
    dueDate: "",
    ownerSuggestion: "Kristina",
    ownerType: "unassigned",
    ownerId: "",
    evidence: {},
    ...overrides,
  });
  const noMatchItem = (candidateOverrides = {}) =>
    toReviewItem({ batch: batch({ id: "no-match-batch" }), candidate: noMatchCandidate(candidateOverrides) });

  it("renders 'Add this as a new debt?' instead of a match/duplicate section when there's no existing-debt match at all", () => {
    const html = render(h(ReviewSessionCard, {
      item: noMatchItem(), isHousehold: true, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Add this as a new debt?");
    expect(html).toContain("Add as a new debt");
    expect(html).not.toContain("Possible match");
    expect(html).not.toContain("Already added?");
  });

  it("does not render the new-debt prompt when a real match was found (existing hasMatch path still wins)", () => {
    const matched = toReviewItem({
      batch: batch({ id: "matched-batch" }),
      candidate: matchCandidate({ candidateId: "matched-1" }),
    });
    const html = render(h(ReviewSessionCard, {
      item: matched, isHousehold: false, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Possible match");
    expect(html).not.toContain("Add this as a new debt?");
  });

  it("does not render the new-debt prompt for a duplicate candidate (existing hasDuplicate path still wins)", () => {
    const duplicate = toReviewItem({
      batch: batch({ id: "dup-batch" }),
      candidate: matchCandidate({ candidateId: "dup-1", evidence: { reconciliation: { classification: "duplicate_import", matches: [] } } }),
    });
    const html = render(h(ReviewSessionCard, {
      item: duplicate, isHousehold: false, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Already added?");
    expect(html).not.toContain("Add this as a new debt?");
  });

  it("a staged resolveAsNewDebt from the new-debt prompt counts as a ready, terminal decision (same contract as MatchSubSection's 'new debt' path)", () => {
    const target = noMatchItem();
    const summary = buildPreSaveSummary([target], {
      [target.id]: { newDebt: { action: "resolveAsNewDebt", args: {} } },
    });
    expect(summary.newDebtCount).toBe(1);
    expect(summary.stillNeedsDecision).toBe(0);
  });
});

describe("Fix: per-item 'Save this debt' action", () => {
  it("keeps the review title, status, and actions in wrapping containers so a phone never overlaps them", () => {
    const html = render(h(ReviewSessionCard, {
      item: item(), isHousehold: false, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      stagedForItem: {}, onStage: () => {}, onLeaveForLater: () => {}, onSaveItem: () => {},
    }));
    expect(html).toContain("flex-wrap:wrap");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("ttz-review-session-heading");
    expect(html).toContain("Affects your plan");
    expect(html).toContain("Leave for later");
    expect(html).toContain("Save this debt");
  });

  it("is present but disabled when nothing has been staged for this item yet", () => {
    const html = render(h(ReviewSessionCard, {
      item: item(), isHousehold: false, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      stagedForItem: {}, onStage: () => {}, onLeaveForLater: () => {}, onSaveItem: () => {},
    }));
    expect(html).toContain("Save this debt");
    const saveButton = html.match(/<button[^>]*>Save this debt<\/button>/)[0];
    expect(saveButton).toContain('disabled=""');
  });

  it("becomes enabled once something is staged for this item", () => {
    const target = item();
    const html = render(h(ReviewSessionCard, {
      item: target, isHousehold: false, members: [], people: [], debts: [], latestSnapshotsByDebt: {},
      stagedForItem: { match: { action: "resolveAsNewDebt", args: {}, label: "Track as a new debt" } },
      onStage: () => {}, onLeaveForLater: () => {}, onSaveItem: () => {},
    }));
    const saveButton = html.match(/<button[^>]*>Save this debt<\/button>/)[0];
    expect(saveButton).not.toContain('disabled=""');
  });

  it("the wizard's per-item card offers Save this debt alongside the batch Save what I know action", () => {
    const snapshot = {
      workspace: { type: "personal" },
      members: [],
      debts: [{ id: "debt-1", name: "Firstmark Services", currentBalance: 34233.67 }],
      latestSnapshotsByDebt: {},
    };
    const openItem = item();
    const html = render(h(ReviewCenter, {
      snapshot, service: {}, workspaceId: "personal-seed",
      reviewSnapshot: { openItems: [openItem], resolvedItems: [], openCount: 1, blockingCount: 1 },
      loadingReview: false, onRefreshReview: async () => {},
    }));
    expect(html).toContain("Save this debt");
    expect(html).toContain("Save what I know");
  });
});

describe("DATA-HH1: OwnerSubSection (ReviewSessionCard)", () => {
  const ownerCandidate = (overrides = {}) => ({
    candidateId: "owner-cand-1",
    accountName: "Discover Card",
    currentBalance: 1200,
    statementDate: "2026-08-10",
    aprStatus: "known",
    apr: 0.05,
    minimumPayment: 40,
    dueDate: "2026-08-05",
    ownerType: "unassigned",
    ownerId: "",
    evidence: {},
    ...overrides,
  });
  const ownerItem = (candidateOverrides = {}) =>
    toReviewItem({ batch: batch({ id: "owner-batch" }), candidate: ownerCandidate(candidateOverrides) });

  const members = [{ uid: "m1", displayName: "Kristina Davis", status: "active" }];
  const people = [{ id: "p1", displayName: "Babajide Yusuf", status: "active", aliases: [] }];

  it("offers real members AND existing household people as owner choices", () => {
    const html = render(h(ReviewSessionCard, {
      item: ownerItem({ ownerSuggestion: "Someone Else Entirely" }), isHousehold: true, members, people, debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Kristina Davis");
    expect(html).toContain("Babajide Yusuf");
    expect(html).toContain("Joint / Household");
    expect(html).toContain("Unassigned");
  });

  it("shows an exact-match suggestion for a name that matches an existing household person", () => {
    const html = render(h(ReviewSessionCard, {
      item: ownerItem({ ownerSuggestion: "Babajide Yusuf" }), isHousehold: true, members, people, debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Suggested owner: Babajide Yusuf");
  });

  it("shows a possible-match suggestion (initial + surname) as a confirmation prompt, never auto-selected", () => {
    const html = render(h(ReviewSessionCard, {
      item: ownerItem({ ownerSuggestion: "B. Yusuf" }), isHousehold: true, members, people, debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(html).toContain("Possible match");
    expect(html).toContain("Use Babajide Yusuf");
  });

  it("offers to add a genuinely unmatched name as a new household person, and never without an onCreatePerson handler", () => {
    const html = render(h(ReviewSessionCard, {
      item: ownerItem({ ownerSuggestion: "Jordan Taylor" }), isHousehold: true, members, people, debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {}, onCreatePerson: async () => people[0],
    }));
    expect(html).toContain("couldn&#x27;t match");
    expect(html).toContain("Add &quot;Jordan Taylor&quot; as a new household person");

    const withoutHandler = render(h(ReviewSessionCard, {
      item: ownerItem({ ownerSuggestion: "Jordan Taylor" }), isHousehold: true, members, people, debts: [], latestSnapshotsByDebt: {},
      onStage: () => {}, onLeaveForLater: () => {},
    }));
    expect(withoutHandler).not.toContain("new household person");
  });
});
