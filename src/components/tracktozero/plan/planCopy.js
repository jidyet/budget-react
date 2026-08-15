/**
 * planCopy.js
 *
 * UX-4: TrackToZero voice and language mapping for the Plan Hub.
 * Centralized so every tab (My Plan / Compare / What If / Finish By /
 * Saved Scenarios) speaks with one honest voice - especially around the
 * distinctions this feature must never blur: previewing vs applying,
 * a Scenario vs the real Plan, an unknown APR vs a confirmed 0%.
 */

export const tabLabels = () => ({
  myPlan: "My Plan",
  compare: "Snowball vs Avalanche",
  whatIf: "What If?",
  finishBy: "Finish By",
  scenarios: "Saved Scenarios",
});

export const previewOnlyNotice = () => "This is a preview. Nothing changes until you apply it.";

export const zeroWritePreviewNote = () => "Previewing never changes your real plan, debts, or payment history.";

export const unknownAprCalloutTitle = () => "Some interest rates are unknown";
export const unknownAprCalloutBody = (count) =>
  count === 1
    ? "One debt has an unknown APR, so its place in this order is a lower-confidence estimate, not a promise."
    : `${count} debts have an unknown APR, so their place in this order is a lower-confidence estimate, not a promise.`;

export const strategyLabel = (strategy) => (strategy === "snowball" ? "Snowball" : strategy === "avalanche" ? "Avalanche" : strategy === "custom" ? "Custom order" : "—");
export const strategyExplainer = (strategy) => (strategy === "snowball"
  ? "Smallest balance first - fast wins to build momentum."
  : "Highest interest rate first - saves the most money over time.");

export const compareIntro = () => "See how Snowball and Avalanche would each play out from here, side by side. Nothing is applied until you choose one.";
export const compareMonthsSaved = (months) => (months > 0 ? `${months} month${months === 1 ? "" : "s"} faster` : months < 0 ? `${Math.abs(months)} month${Math.abs(months) === 1 ? "" : "s"} slower` : "Same payoff time");
export const compareInterestDelta = (amount) => (amount > 0 ? "less interest" : amount < 0 ? "more interest" : "same interest");

export const oneTimeIntro = () => "See what a one-time payment toward a debt would do to your payoff timeline - purely hypothetical until you actually make and record the payment.";
export const oneTimeNeverAPayment = () => "A hypothetical payment previewed here is never recorded as a real payment. To make it real, record it from that debt's payment history.";

export const customTargetIntro = () => "Preview what happens if you send your extra payment to a specific debt instead of your plan's usual order.";
export const customTargetNeverAStrategy = () => "This preview order is never Snowball or Avalanche, and applying it directly isn't available - save it to compare later, or switch your plan's strategy from My Plan.";

export const finishByIntro = () => "Pick a target debt-free date and see what monthly payment it would take to get there.";
export const finishByFeasible = (extra, date) => `Reaching $0 by then would take about ${extra}/mo extra, projected for ${date}.`;
export const finishByAlreadyOnPace = () => "Your current plan already reaches this goal or sooner.";
export const finishByInfeasible = () => "That date isn't projected to be achievable with a reasonable payment increase. Here's the earliest realistic date at a more moderate pace.";

export const scenariosIntro = () => "Scenarios you've saved to compare later. Saving never changes your real plan - only applying one does, and that always asks first.";
export const scenarioStaleWarning = () => "Your plan has changed since this was saved, so these numbers may no longer reflect where you actually stand. Re-preview before applying.";
export const scenarioApplyUnavailable = () => "This kind of scenario is preview-only and can't be applied directly from here.";
export const scenarioEmptyState = () => "No saved scenarios yet. Preview something in What If or Finish By, then save it to come back to later.";

export const applyConfirmTitle = () => "Apply this to your real plan?";
export const applyConfirmBody = () => "This creates a new plan version. Your current plan is kept in your plan history, never overwritten.";
export const activateConfirmTitle = () => "Activate this plan?";

export const planHistoryEmpty = () => "No plan history yet - build your first plan to start one.";
export const planHistoryCurrentBadge = () => "Current";
export const planHistoryBecause = (because) => ({
  activation: "Activated",
  reforecast: "Reforecast",
  strategy_change: "Strategy changed",
}[because] || "Updated");
