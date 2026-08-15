// REVIEW-1A: the durable Needs Review domain.
//
// This is a LOGICAL domain layered on top of DATA-1B's existing persisted
// structures (ImportBatch/ImportCandidate), not a new Firestore collection.
// DATA-1A's workbookDebtDiscovery and DATA-1B's debtReconciliation both
// already converge all of their uncertainty onto ImportCandidate.evidence -
// this file is the ONE place that evidence is read back out as a durable,
// typed "ReviewItem" with a status/blocking contract, so a future Review
// Center UI (and Home/counts) has exactly one source of truth instead of
// re-deriving it per screen.
//
// An open ReviewItem is EVIDENCE, not authoritative financial truth. Every
// function in this file is pure and read-only - it never mutates a Debt,
// BalanceSnapshot, PaymentEvent, or PlanVersion. Mutating financial state in
// response to a resolved review is v2AsyncApplicationService.js's job.

import { MATCH_CLASSIFICATIONS } from "./debtReconciliation.js";

export const REVIEW_TYPES = Object.freeze({
  matchDecision: "MATCH_DECISION",
  multipleMatches: "MULTIPLE_MATCHES",
  missingInformation: "MISSING_INFORMATION",
  fieldConflict: "FIELD_CONFLICT",
  ownerMatch: "OWNER_MATCH",
  businessScope: "BUSINESS_SCOPE",
  debtClassification: "DEBT_CLASSIFICATION",
  duplicateImport: "DUPLICATE_IMPORT",
  historicalStatement: "HISTORICAL_STATEMENT",
  balanceConfirmation: "BALANCE_CONFIRMATION",
  aprConfirmation: "APR_CONFIRMATION",
  minimumPaymentConfirmation: "MINIMUM_PAYMENT_CONFIRMATION",
  dueDateConfirmation: "DUE_DATE_CONFIRMATION",
});

// What the user actually decided, kept distinct from `status` (Part 32 -
// "Resolved vs dismissed... do not overload one boolean"). `decision`/type
// values are never mapped 1:1 - e.g. both dismissedDuplicate and
// classifiedAsBill are terminal with zero mutation, but mean different
// things and must stay individually explainable in history.
export const REVIEW_RESOLUTION_TYPES = Object.freeze({
  updatedExistingDebt: "updated_existing_debt",
  createdNewDebt: "created_new_debt",
  dismissedDuplicate: "dismissed_duplicate",
  excludedBusinessScope: "excluded_business_scope",
  includedBusinessScope: "included_business_scope",
  classifiedAsBill: "classified_as_bill",
  classifiedAsDebt: "classified_as_debt",
  confirmedField: "confirmed_field",
  addedHistoricalSnapshot: "added_historical_snapshot",
  deferred: "deferred",
});

export const REVIEW_STATUS = Object.freeze({
  open: "open",
  resolved: "resolved",
  dismissed: "dismissed",
});

const truthy = (value) => value !== null && value !== undefined && value !== "";

// Evaluates every review signal for a candidate in one place so
// classifyReviewTypes/isReviewBlocking can never drift apart (UX-0's own
// lesson applied to Review: one derivation, not one per caller).
//
// Blocking (Part 10 - "materially prevents trusting an authoritative payoff
// plan"): unresolved/formula/projected balance, an unresolved existing-debt
// match (possible/strong/multiple), an unresolved duplicate, ambiguous
// debt-vs-bill classification, unresolved business scope, and a MATERIAL
// APR conflict (more than one plausible APR value - not merely "unknown",
// which is a normal, already-supported state elsewhere in the product).
//
// Non-blocking (Part 10 - explicit examples): missing due date, missing
// minimum payment (DATA-1A already surfaces this as a warning, not a hard
// stop, and UX-0 debts routinely carry it), and an unconfirmed owner
// suggestion (unassigned is already a valid, non-blocking ownership state).
export const evaluateReviewSignals = (candidate = {}) => {
  const types = new Set();
  const reasons = [];
  let blocking = false;

  const reconciliation = candidate.evidence?.reconciliation || null;
  const classification = reconciliation?.classification;
  if (classification === MATCH_CLASSIFICATIONS.possibleMatch || classification === MATCH_CLASSIFICATIONS.strongMatch) {
    types.add(REVIEW_TYPES.matchDecision);
    reasons.push("This statement may match an existing debt.");
    blocking = true;
  }
  if (classification === MATCH_CLASSIFICATIONS.multipleMatches) {
    types.add(REVIEW_TYPES.multipleMatches);
    reasons.push("More than one existing debt could match this statement.");
    blocking = true;
  }
  if (classification === MATCH_CLASSIFICATIONS.duplicateImport) {
    types.add(REVIEW_TYPES.duplicateImport);
    reasons.push("This statement looks like it was already imported.");
    blocking = true;
  }

  if (candidate.balanceStatus === "unresolved") {
    types.add(REVIEW_TYPES.balanceConfirmation);
    reasons.push("Current balance is missing or unresolved.");
    blocking = true;
  }
  const balanceEvidence = candidate.evidence?.fieldEvidence?.balance || [];
  if (balanceEvidence.some((item) => item.truth === "formula_derived" || item.truth === "projected")) {
    types.add(REVIEW_TYPES.balanceConfirmation);
    reasons.push("Balance is formula-derived or projected, not an observed statement value.");
    blocking = true;
  }

  const aprEvidence = candidate.evidence?.fieldEvidence?.apr || [];
  const knownAprKeys = new Set(
    aprEvidence.filter((item) => item.aprStatus && item.aprStatus !== "unknown").map((item) => `${item.aprStatus}:${item.apr}`)
  );
  if (knownAprKeys.size > 1) {
    types.add(REVIEW_TYPES.aprConfirmation);
    reasons.push("Multiple plausible APR values were found.");
    blocking = true;
  } else if (candidate.aprStatus === "unknown") {
    types.add(REVIEW_TYPES.aprConfirmation);
  }

  if (!truthy(candidate.minimumPayment)) types.add(REVIEW_TYPES.minimumPaymentConfirmation);
  if (!truthy(candidate.dueDate)) types.add(REVIEW_TYPES.dueDateConfirmation);

  if (candidate.evidence?.scopeSuggestion === "business_candidate") {
    types.add(REVIEW_TYPES.businessScope);
    reasons.push("This looks like a business account inside a household workspace.");
    blocking = true;
  }

  const parserClassification = candidate.evidence?.classification;
  if (parserClassification === "uncertain" || parserClassification === "possible_debt") {
    types.add(REVIEW_TYPES.debtClassification);
    reasons.push("Not enough evidence to confirm this is a debt with a payoff balance.");
    blocking = true;
  }

  if (truthy(candidate.ownerSuggestion) && (!candidate.ownerType || candidate.ownerType === "unassigned")) {
    types.add(REVIEW_TYPES.ownerMatch);
  }

  const diff = reconciliation?.matches?.[0]?.diff || null;
  if (diff && Object.values(diff).some((field) => field.state === "conflicting")) {
    types.add(REVIEW_TYPES.fieldConflict);
    reasons.push("A field conflicts with the existing debt's current value.");
    blocking = true;
  }

  if (!types.size && Array.isArray(candidate.warnings) && candidate.warnings.length) {
    types.add(REVIEW_TYPES.missingInformation);
  }

  return { types: [...types], blocking, reasons };
};

export const classifyReviewTypes = (candidate = {}) => evaluateReviewSignals(candidate).types;
export const isReviewBlocking = (candidate = {}) => evaluateReviewSignals(candidate).blocking;

// A resolution that requires an atomic financial mutation (update_existing,
// new_debt) is only RESOLVED once that mutation has actually succeeded -
// candidate.committedOutcome is the durable marker v2AsyncApplicationService
// sets after a successful commit (see commitImportBatch). Everything else
// (dismiss, classify-as-bill, business-scope exclude, defer) needs no
// further mutation and is final the moment the decision is recorded.
const MUTATION_RESOLUTION_TYPES = new Set([
  REVIEW_RESOLUTION_TYPES.updatedExistingDebt,
  REVIEW_RESOLUTION_TYPES.createdNewDebt,
]);
const DISMISSING_RESOLUTION_TYPES = new Set([
  REVIEW_RESOLUTION_TYPES.dismissedDuplicate,
  REVIEW_RESOLUTION_TYPES.excludedBusinessScope,
  REVIEW_RESOLUTION_TYPES.classifiedAsBill,
]);

export const getReviewItemStatus = (candidate = {}) => {
  // UX-5: a candidate confirmed through the plain quick-confirm path (Import's
  // own bulk Confirm, not a reconciliation resolveAsExistingDebt/resolveAsNewDebt
  // decision) never gets a `reviewResolution` stamped - only `committedOutcome`,
  // once commitImportBatch actually creates/updates the Debt. Without this,
  // such a candidate would stay OPEN forever even after becoming a real,
  // authoritative Debt (Part 25/86 - Review must reconcile with Debts/Home,
  // not lag behind them). committedOutcome is only ever set after a genuine
  // successful mutation, so this can never mark a failed/pending item resolved.
  if (candidate.committedOutcome) return REVIEW_STATUS.resolved;
  // Same gap as above: a plain Exclude via Import's quick-confirm path never
  // gets a reviewResolution stamped either. Excluding is a deliberate final
  // decision (never becomes a Debt) - it must read as DISMISSED, not linger
  // as an open, actionable review item forever.
  if (candidate.decision === "excluded") return REVIEW_STATUS.dismissed;
  const resolution = candidate.reviewResolution || null;
  if (!resolution || resolution.type === REVIEW_RESOLUTION_TYPES.deferred) return REVIEW_STATUS.open;
  if (DISMISSING_RESOLUTION_TYPES.has(resolution.type)) return REVIEW_STATUS.dismissed;
  if (MUTATION_RESOLUTION_TYPES.has(resolution.type)) {
    return candidate.committedOutcome ? REVIEW_STATUS.resolved : REVIEW_STATUS.open;
  }
  // confirmed_field / classified_as_debt / added_historical_snapshot etc.
  // narrow a specific review type but do not close the whole item unless
  // nothing blocking remains.
  const { blocking } = evaluateReviewSignals(candidate);
  return blocking ? REVIEW_STATUS.open : REVIEW_STATUS.resolved;
};

export const toReviewItem = ({ batch, candidate }) => {
  const { types, blocking, reasons } = evaluateReviewSignals(candidate);
  const resolution = candidate.reviewResolution || null;
  return Object.freeze({
    id: `${batch.id}:${candidate.candidateId}`,
    workspaceId: batch.workspaceId,
    importBatchId: batch.id,
    importCandidateId: candidate.candidateId,
    sourceType: batch.sourceType,
    sourceReference: batch.sourceFilename || "",
    types,
    blocking,
    reasons,
    status: getReviewItemStatus(candidate),
    possibleDebtIds: (candidate.evidence?.reconciliation?.matches || []).map((match) => match.debtId),
    targetDebtId: candidate.targetDebtId || "",
    candidateEvidence: candidate.evidence || {},
    createdAt: batch.createdAt,
    updatedAt: candidate.updatedAt || batch.updatedAt || batch.createdAt,
    resolvedAt: candidate.committedOutcome?.at || resolution?.decidedAt || "",
    resolvedBy: resolution?.decidedBy || "",
    resolution,
    resolutionMetadata: candidate.committedOutcome || null,
    candidate,
  });
};

export const flattenReviewItems = (batches = []) =>
  batches.flatMap((batch) => (batch.candidates || []).map((candidate) => toReviewItem({ batch, candidate })));

// ── Shared selectors (Part 9) - the ONE place open/blocking/count logic
// lives. Home, a future Review Center, and Import must all call these
// instead of recomputing counts independently.
export const getOpenReviewItems = (batches = []) => flattenReviewItems(batches).filter((item) => item.status === REVIEW_STATUS.open);
export const getResolvedReviewItems = (batches = []) => flattenReviewItems(batches).filter((item) => item.status !== REVIEW_STATUS.open);
export const getOpenReviewCount = (batches = []) => getOpenReviewItems(batches).length;
export const getBlockingReviewCount = (batches = []) => getOpenReviewItems(batches).filter((item) => item.blocking).length;
export const getReviewCountsByType = (batches = []) => {
  const counts = {};
  for (const item of getOpenReviewItems(batches)) {
    for (const type of item.types) counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
};
export const sortOpenReviewItems = (items = []) =>
  [...items].sort((a, b) => (Number(b.blocking) - Number(a.blocking)) || (Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0)));

// ── Deferred / "later" grouping (REVIEW-1C Part 11) ─────────────────────
// A deferred review is still OPEN, unresolved evidence - deferring never
// changes financial-authority status. This is purely a presentation-layer
// distinction so the UI can tell "needs attention now" from "user chose
// later" without inventing a new status value. deferReview always routes
// through resolveImportCandidateMatch with decision "unsure", which always
// stamps reviewResolution.type = "deferred" regardless of the item's
// original review type - so this check works uniformly for every type.
export const isDeferred = (item) => item.resolution?.type === REVIEW_RESOLUTION_TYPES.deferred;

// Items that still need the user's attention now (open, never deferred, or
// deferred-then-reopened is not a concept - deferring is the terminal
// "later" choice until the user explicitly returns to finish it).
export const getNeedsAttentionItems = (batches = []) => getOpenReviewItems(batches).filter((item) => !isDeferred(item));

// Items the user explicitly chose to save for later - still open, still
// unresolved, but intentionally out of the "needs attention now" list so
// the product doesn't nag about a decision the user already made to defer.
export const getLaterItems = (batches = []) => getOpenReviewItems(batches).filter((item) => isDeferred(item));

// The nav badge / "needs a quick check" headline count (Part 32) - deferred
// items don't make the badge count grow forever just because the user
// chose "later" on them. Blocking-trust presentation on Home is a SEPARATE
// concern (getBlockingReviewCount already includes deferred-blocking items
// on purpose, since deferring a blocking review must never look trusted).
export const getActionableOpenCount = (batches = []) => getNeedsAttentionItems(batches).length;

// How many of the currently blocking reviews were explicitly deferred -
// lets Home use softer "saved for later" copy for those without changing
// the underlying blocking-count truth (Part 12).
export const getDeferredBlockingCount = (batches = []) => getOpenReviewItems(batches).filter((item) => item.blocking && isDeferred(item)).length;

// ── Stale-review protection (Part 28) ───────────────────────────────────
// A lightweight fingerprint of the target debt's observed state, captured
// at the moment a match/resolution decision is made. Captured once, up
// front, so later comparisons are cheap and exact - no re-derivation.
export const debtStateFingerprint = (debt = {}) => ({
  currentBalance: Number(debt.currentBalance ?? 0),
  updatedAt: debt.updatedAt || debt.createdAt || "",
});

// True when the debt has legitimately changed since the fingerprint was
// captured - the ONLY signal stale-review protection needs. Comparing
// currentBalance (not just updatedAt) means even a system clock quirk can't
// mask a real value change, and vice versa.
export const isDebtStale = (fingerprint, liveDebt) => {
  if (!fingerprint) return false;
  const live = debtStateFingerprint(liveDebt);
  return live.currentBalance !== fingerprint.currentBalance || live.updatedAt !== fingerprint.updatedAt;
};
