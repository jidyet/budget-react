// UX-6.1: pure extraction of the pre-commit candidate triage logic that
// previously lived inline in TrackToZeroV2App.jsx's ImportPanel - visual
// triage so the human reviewer sees the riskiest candidates first: decided
// items are already sorted out; everything still pending_review is grouped
// by how much it actually needs attention rather than shown as one
// undifferentiated list. Byte-for-byte the same bucketing rules as before,
// just independently testable and shared between the summary header and the
// candidate list.
import { debtCategoryGroupFor } from "../../../domain/tracktozero/financialItemTaxonomy.js";

export const groupCandidatesForReview = (candidates = []) => {
  const pending = candidates.filter((c) => c.decision === "pending_review");
  const missingCandidates = candidates.filter((c) => c.decision === "needs_information");
  const ambiguousCandidates = pending.filter((c) => c.duplicateStatus !== "new");
  const needsReviewCandidates = pending.filter((c) => c.duplicateStatus === "new" && c.warnings?.length);
  const confidentCandidates = pending.filter((c) => c.duplicateStatus === "new" && !c.warnings?.length);
  const decided = candidates.filter((c) => c.decision === "confirmed" || c.decision === "excluded");
  return [
    { key: "missing", title: "Missing information", hint: "Nothing readable found - fill these in manually before confirming.", items: missingCandidates },
    { key: "ambiguous", title: "Ambiguous / possible duplicate", hint: "May already exist in your workspace - check before confirming.", items: ambiguousCandidates },
    { key: "needs_review", title: "Needs review", hint: "Parsed, but has warnings worth a second look.", items: needsReviewCandidates },
    { key: "confident", title: "Looks good", hint: "Parsed cleanly with no warnings.", items: confidentCandidates },
    { key: "decided", title: "Already decided", hint: "Confirmed or excluded - change your mind any time before adding.", items: decided },
  ].filter((group) => group.items.length);
};

// "Needs your help" = anything not yet decided that isn't a clean, warning-free
// confident candidate - matches the pre-existing "uncertainCount" definition
// (pending_review with warnings OR a non-"new" duplicateStatus).
export const needsHelpCandidates = (candidates = []) => candidates.filter((c) => (
  c.decision === "needs_information"
  || (c.decision === "pending_review" && (c.warnings?.length || c.duplicateStatus !== "new"))
));

// Groups a candidate list by debt-category (task requirement: same visual
// category language as the Debt Portfolio, for continuity between Import ->
// Review -> Portfolio). Sorted by CATEGORY_CONFIG's sortOrder by the caller,
// which already owns that config - this just buckets.
export const groupCandidatesByCategory = (candidates = []) => {
  const byGroup = new Map();
  for (const candidate of candidates) {
    const group = debtCategoryGroupFor(candidate.debtType);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(candidate);
  }
  return byGroup;
};
