import { REVIEW_TYPES } from "../../../services/tracktozero/reviewDomain.js";

// REVIEW-1C: pure, UI-independent staged-answer categorization, split out of
// ReviewCenter.jsx so it can be unit tested directly (and so the component
// file only exports the component, per Fast Refresh's export-shape rule).

const TERMINAL_ACTIONS = new Set(["resolveAsNewDebt", "resolveAsExistingDebt", "dismissDuplicate"]);

// Only these outcomes are guaranteed, by reviewDomain.js's own
// MUTATION_RESOLUTION_TYPES/DISMISSING_RESOLUTION_TYPES sets, to actually
// close a review item. A staged "include business scope" or "classify as
// debt" answer alone does NOT terminate the review (a separate new/existing
// decision is still required afterward) - so those are deliberately never
// counted as "ready" here, matching reviewDomain.js's own contract instead
// of inventing a more optimistic one for this summary.
const isExcludingEntry = (entry) =>
  (entry.action === "resolveBusinessScope" && entry.args?.decision === "exclude") ||
  (entry.action === "resolveDebtClassification" && entry.args?.classification === "bill");

export const getTerminalEntry = (forItem = {}) => {
  for (const entry of Object.values(forItem)) {
    if (TERMINAL_ACTIONS.has(entry.action) || isExcludingEntry(entry)) return entry;
  }
  return null;
};

// Truthful pre-save categorization (Part 15) - built entirely from what's
// actually staged right now. Never folds a skipped/unresolved balance into
// the confirmed total, and separately tallies what will STILL be missing
// after this save so the user isn't surprised afterward.
export const buildPreSaveSummary = (items, staged) => {
  let newDebtCount = 0;
  let updateCount = 0;
  let excludedCount = 0;
  let duplicateCount = 0;
  let confirmedBalanceTotal = 0;
  let stillNeedsDecision = 0;
  const missingApr = new Set();
  const missingMinimum = new Set();
  const missingDueDate = new Set();
  const missingOwner = new Set();

  for (const item of items) {
    const forItem = staged[item.id] || {};
    const terminal = getTerminalEntry(forItem);
    if (terminal?.action === "resolveAsNewDebt" || terminal?.action === "resolveAsExistingDebt") {
      if (terminal.action === "resolveAsNewDebt") newDebtCount += 1;
      else updateCount += 1;
      const balanceEntry = forItem.balance;
      if (balanceEntry) confirmedBalanceTotal += Number(balanceEntry.args.currentBalance) || 0;
      else if (item.candidate.balanceStatus !== "unresolved") confirmedBalanceTotal += Number(item.candidate.currentBalance) || 0;
    } else if (terminal?.action === "dismissDuplicate") {
      duplicateCount += 1;
    } else if (terminal) {
      excludedCount += 1;
    } else {
      stillNeedsDecision += 1;
    }
    if (!terminal) {
      if (item.types.includes(REVIEW_TYPES.aprConfirmation) && !forItem.apr) missingApr.add(item.id);
      if (item.types.includes(REVIEW_TYPES.minimumPaymentConfirmation) && !forItem.minimum) missingMinimum.add(item.id);
      if (item.types.includes(REVIEW_TYPES.dueDateConfirmation) && !forItem.dueDay) missingDueDate.add(item.id);
      if (item.types.includes(REVIEW_TYPES.ownerMatch) && !forItem.owner) missingOwner.add(item.id);
    }
  }

  return {
    newDebtCount,
    updateCount,
    excludedCount,
    duplicateCount,
    confirmedBalanceTotal,
    stillNeedsDecision,
    missingAprCount: missingApr.size,
    missingMinimumCount: missingMinimum.size,
    missingDueDateCount: missingDueDate.size,
    missingOwnerCount: missingOwner.size,
  };
};
