/**
 * homeLanguage.js
 *
 * TrackToZero voice and language mapping for Home.
 * Centralized so copy is consistent and reflects truth.
 */

// Plan health status → friendly TrackToZero headline
export const planHealthHeadline = (status) => {
  const map = {
    ahead: "You're ahead.",
    on_track: "You're on track.",
    slightly_behind: "Let's catch up.",
    needs_review: "This plan needs a quick check.",
    needs_balance_update: "We're still learning your pace.",
    insufficient_data: "We're still learning your pace.",
    critical: "This plan needs a tweak.",
  };
  return map[status?.code] || "Let's check your plan.";
};

// Plan health status → supporting explanatory paragraph
export const planHealthDetail = (status) => {
  
  const map = {
    ahead: "You're moving faster than the current plan expected.",
    on_track: "Your actual progress matches the plan. Great work staying committed.",
    slightly_behind: "Your latest confirmed balance is above the plan's estimate. Let's catch up.",
    needs_review: "You have review items that need attention before we can fully trust this plan.",
    needs_balance_update: "Update a balance after your next statement and TrackToZero can compare your real progress to the plan.",
    insufficient_data: "Update a balance after your next statement and TrackToZero can compare your real progress to the plan.",
    critical: "At this pace, interest is growing faster than the planned payment.",
  };
  
  return map[status?.code] || "Your plan is ready to guide you.";
};

// Plan health status → CTA text
export const planHealthCta = (status) => {
  const map = {
    ahead: null,
    on_track: null,
    slightly_behind: "See my options",
    needs_review: "Review them",
    needs_balance_update: "Update balance",
    insufficient_data: null,
    critical: "See my options",
  };
  return map[status?.code];
};

// Household total summary copy
export const householdSummaryLabel = () => "OUR DEBT";

// Personal total summary copy
export const personalSummaryLabel = () => "YOUR DEBT";

// Zero Day label and supporting text
export const zeroDayLabel = () => "ZERO DAY";
export const zeroDaySupporting = () => "Projected debt-free date";

// Progress/momentum copy
export const momentumLabel = () => "YOUR MOMENTUM";
export const leftToGoLabel = () => "LEFT TO GO";
export const clearedLabel = (percent) => `${Math.round(percent)}% cleared`;

// When Zero Day is not reachable
export const unreachableZeroDayLabel = () => "Zero Day";
export const unreachableZeroDayValue = () => "Not reachable yet";

// No debt activation copy
export const noDebtHeadline = () => "LET'S GET YOUR DEBT IN HERE.";
export const noDebtSupporting = () => "Start with what you already have.";
export const noDebtCtaPrimary = () => "Upload my budget";
export const noDebtCtaSecondary = () => "Add a debt";
export const noDebtHint = () =>
  "TrackToZero can scan the budget spreadsheet you already use and pull out debt for you.";

// Debt but no plan copy
export const noActivePlanHeadline = () => "YOUR DEBT IS IN. NOW LET'S BUILD THE WAY OUT.";
export const noActivePlanSupporting = () => "You can always come back to update numbers. We'll guide you through building a payoff plan.";
export const noActivePlanCta = () => "Build my payoff plan";

// Your Next Move / primary action
export const nextMoveEyebrow = () => "YOUR NEXT MOVE";
export const nextMoveCtaLabel = (action) => {
  const map = {
    "record-payment": "Record payment",
    "view-details": "View details",
  };
  return map[action] || "Take action";
};

// Truthful fallback when no authoritative payment recommendation exists -
// the payoff engine doesn't expose a single "pay this now" figure, so
// Home never invents one from minimum + extra in isolation.
export const focusHeadline = (targetDebtName) => `Focus on ${targetDebtName} next.`;

// Strategy explanation
export const strategyExplanation = (strategy, targetDebtName) => {
  const map = {
    avalanche: `Highest APR first. ${targetDebtName} has the highest interest rate.`,
    snowball: `Smallest balance first. ${targetDebtName} is the smallest balance.`,
  };
  return map[strategy] || "";
};

// Up Next / current target preview
export const upNextLabel = () => "UP NEXT";

// Household member breakdown
export const householdMemberLabel = (memberName) => memberName;
export const householdJointLabel = () => "Joint";
export const householdUnassignedLabel = () => "Unassigned";

// Quick Check / Review integration
export const quickCheckLabel = () => "QUICK CHECK";
export const quickCheckHeadline = (openCount, blockingCount) => {
  if (blockingCount > 0) {
    return `${blockingCount} thing${blockingCount === 1 ? "" : "s"} need${blockingCount === 1 ? "s" : ""} a quick check before we fully trust your plan.`;
  }
  return `${openCount} thing${openCount === 1 ? "" : "s"} can use a quick check.`;
};
export const quickCheckCta = () => "Review them";

// REVIEW-1C Part 12: when every currently blocking review was explicitly
// saved for later (not merely never looked at), Home can say so honestly -
// the plan is still untrusted, but the copy doesn't pretend the user never
// engaged with it.
export const quickCheckDeferredBlockingLine = (deferredBlockingCount) =>
  `${deferredBlockingCount} item${deferredBlockingCount === 1 ? "" : "s"} ${deferredBlockingCount === 1 ? "was" : "were"} saved for later and still affect${deferredBlockingCount === 1 ? "s" : ""} your payoff plan.`;

// Blocking-review Home trust state - a genuinely distinct treatment, not
// the normal active-plan command center wearing a warning color.
export const blockingReviewTrustNote = () =>
  "We can't fully trust your plan's momentum until these are resolved.";
export const provisionalLabel = (label) => `${label} (provisional)`;
export const provisionalDebtNote = () => "This may change once open reviews are resolved.";

// Data freshness
export const dataFreshnessLabel = (daysOld) => {
  if (daysOld >= 45) return "Last updated 45+ days ago";
  if (daysOld >= 30) return `Last updated ${daysOld} days ago`;
  return `Last updated recently`;
};

// Scenario / What If
export const whatIfLabel = () => "WHAT IF?";
export const whatIfPrompt = (extraAmount) =>
  `See what +$${Math.round(extraAmount)}/mo could change.`;
export const whatIfCta = () => "Try it";
export const whatIfOutcome = (monthsSaved, interestSaved) => {
  const parts = [];
  if (monthsSaved > 0) parts.push(`Could move Zero Day: ${monthsSaved} month${monthsSaved === 1 ? "" : "s"} sooner`);
  if (interestSaved > 0) parts.push(`Interest saved: ${interestSaved}`);
  return parts.join(" • ");
};

// All paid off state
export const allPaidOffHeadline = () => "YOU HIT $0.";
export const allPaidOffSupporting = () => "No included debt left to pay off.";

// Empty plan warning copy
export const criticalPlanWarningHeadline = () => "THIS PLAN NEEDS A TWEAK";
export const criticalPlanWarningDetail = () =>
  "Your planned payment isn't reducing the balance after interest.";

// Paid off debt signal
export const paidOffDebtLabel = () => "DONE";
export const paidOffDebtDate = (observedAt) =>
  `Paid off ${new Date(observedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

// Starting debt display
export const startingDebtLabel = () => "Started at";
export const nowLabel = () => "Now";
export const knockedOutLabel = () => "Knocked out";
