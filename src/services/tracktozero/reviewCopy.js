// REVIEW-1B voice contract: simple, short, friendly, plain English. No
// enterprise/finance jargon, no developer terms, no forced slang. This file
// is the ONE place Review copy lives so tone stays consistent and easy to
// audit - components read from here instead of writing their own strings.
import { REVIEW_TYPES } from "./reviewDomain.js";

// Order matters - this is the priority REVIEW-1B's UI sorts/labels by
// (blocking financial truth first, then reconciliation, then details).
export const REVIEW_TYPE_ORDER = [
  REVIEW_TYPES.matchDecision,
  REVIEW_TYPES.multipleMatches,
  REVIEW_TYPES.duplicateImport,
  REVIEW_TYPES.balanceConfirmation,
  REVIEW_TYPES.aprConfirmation,
  REVIEW_TYPES.minimumPaymentConfirmation,
  REVIEW_TYPES.debtClassification,
  REVIEW_TYPES.fieldConflict,
  REVIEW_TYPES.businessScope,
  REVIEW_TYPES.ownerMatch,
  REVIEW_TYPES.dueDateConfirmation,
  REVIEW_TYPES.historicalStatement,
  REVIEW_TYPES.missingInformation,
];

export const REVIEW_TYPE_LABEL = Object.freeze({
  [REVIEW_TYPES.matchDecision]: "Possible match",
  [REVIEW_TYPES.multipleMatches]: "Multiple matches",
  [REVIEW_TYPES.duplicateImport]: "Duplicate",
  [REVIEW_TYPES.balanceConfirmation]: "Balance",
  [REVIEW_TYPES.aprConfirmation]: "APR",
  [REVIEW_TYPES.minimumPaymentConfirmation]: "Minimum payment",
  [REVIEW_TYPES.dueDateConfirmation]: "Due day",
  [REVIEW_TYPES.debtClassification]: "Debt or bill?",
  [REVIEW_TYPES.fieldConflict]: "Details don't match",
  [REVIEW_TYPES.businessScope]: "Business debt",
  [REVIEW_TYPES.ownerMatch]: "Owner",
  [REVIEW_TYPES.historicalStatement]: "Older statement",
  [REVIEW_TYPES.missingInformation]: "Missing info",
});

// Compact filter groups (Part 7) - a handful of useful buckets, not one
// filter per raw type.
export const REVIEW_FILTERS = Object.freeze([
  { key: "all", label: "All", types: null },
  { key: "matches", label: "Matches", types: [REVIEW_TYPES.matchDecision, REVIEW_TYPES.multipleMatches, REVIEW_TYPES.duplicateImport] },
  { key: "details", label: "Debt details", types: [REVIEW_TYPES.balanceConfirmation, REVIEW_TYPES.aprConfirmation, REVIEW_TYPES.minimumPaymentConfirmation, REVIEW_TYPES.dueDateConfirmation, REVIEW_TYPES.fieldConflict] },
  { key: "ownership", label: "Ownership", types: [REVIEW_TYPES.ownerMatch] },
  { key: "scope", label: "Scope", types: [REVIEW_TYPES.businessScope, REVIEW_TYPES.debtClassification] },
]);

const isFormulaBalance = (candidate) =>
  (candidate?.evidence?.fieldEvidence?.balance || []).some((item) => item.truth === "formula_derived" || item.truth === "projected");

const primaryType = (item) => REVIEW_TYPE_ORDER.find((type) => item.types.includes(type)) || item.types[0];

// The single "why is TrackToZero asking" line for a review card (Part 8-9).
export function getReviewWhy(item) {
  const candidate = item.candidate;
  const type = primaryType(item);
  switch (type) {
    case REVIEW_TYPES.matchDecision:
      return "We found a statement that may belong to a debt you already track.";
    case REVIEW_TYPES.multipleMatches:
      return "We found more than one debt this statement could belong to.";
    case REVIEW_TYPES.duplicateImport:
      return "This looks like a statement you've already added.";
    case REVIEW_TYPES.balanceConfirmation:
      return isFormulaBalance(candidate)
        ? "This balance comes from a formula, not an actual statement - we want to double check."
        : "We're missing your current balance.";
    case REVIEW_TYPES.aprConfirmation:
      return "We found more than one possible APR for this debt.";
    case REVIEW_TYPES.minimumPaymentConfirmation:
      return "We couldn't confirm your minimum payment.";
    case REVIEW_TYPES.dueDateConfirmation:
      return "We're missing the payment due day.";
    case REVIEW_TYPES.debtClassification:
      return "We're not sure this is a debt you're paying down to $0.";
    case REVIEW_TYPES.businessScope:
      return "This looks like business debt.";
    case REVIEW_TYPES.ownerMatch:
      return truthySuggestion(candidate) ? `We couldn't match "${candidate.ownerSuggestion}" to someone in your household.` : "We're not sure who this belongs to.";
    case REVIEW_TYPES.fieldConflict:
      return "Some details here don't match what we already have.";
    default:
      return "We found something worth a quick check.";
  }
}

const truthySuggestion = (candidate) => !!(candidate?.ownerSuggestion && String(candidate.ownerSuggestion).trim());

export function getBlockingLine(blocking) {
  return blocking
    ? "Give this a quick check before we fully trust your payoff plan."
    : "You can fix this anytime.";
}

export const getReviewCenterSummary = ({ openCount, blockingCount }) => {
  if (!openCount) return "You're all caught up.";
  const nonBlocking = openCount - blockingCount;
  const parts = [`${openCount} thing${openCount === 1 ? "" : "s"} need${openCount === 1 ? "s" : ""} a quick check`];
  if (blockingCount > 0) parts.push(`${blockingCount} affect${blockingCount === 1 ? "s" : ""} your payoff plan`);
  if (nonBlocking > 0) parts.push(`${nonBlocking} can wait`);
  return parts;
};

export const REVIEW_SUCCESS_COPY = Object.freeze({
  updated_existing_debt: (name) => `Updated ${name}.`,
  created_new_debt: (name) => `Added ${name} as a new debt.`,
  dismissed_duplicate: () => "Marked this as a duplicate.",
  excluded_business_scope: () => "Got it. We'll keep this out of your household plan.",
  included_business_scope: () => "Got it. We'll include this in your household plan.",
  classified_as_bill: () => "Got it. We'll treat this as a bill, not a debt.",
  classified_as_debt: () => "Got it. We'll treat this as a debt.",
  added_historical_snapshot: () => "Added as an older balance.",
  deferred: () => "No problem. It'll stay here until you're ready.",
  confirmed_field: () => "Saved.",
});

export const FRIENDLY_SAVE_FAILURE = "We couldn't save that yet. Nothing changed. Try again.";
export const FRIENDLY_STALE_MESSAGE = "This debt changed since this review was created. Take one more look before we update it.";

// Compact resolved-history labels (Part 30) - not a full Activity timeline,
// just "what happened" in a few words.
export const RESOLUTION_HISTORY_LABEL = Object.freeze({
  updated_existing_debt: "Updated existing debt",
  created_new_debt: "Added as a new debt",
  dismissed_duplicate: "Marked as a duplicate",
  excluded_business_scope: "Kept out of household plan",
  included_business_scope: "Included in household plan",
  classified_as_bill: "Marked as a bill",
  classified_as_debt: "Marked as a debt",
  added_historical_snapshot: "Added as an older balance",
});
