// GATE-10B.1: TrackToZero's future-minimum-payment estimate architecture.
// GATE-10B.1A: made genuinely operational - estimateNextMinimum now computes
// a real value when (and ONLY when) a Debt has an explicitly-confirmed
// minimumPaymentRule (see models.js's createMinimumPaymentRuleProfile).
// TrackToZero itself never invents, guesses, or ships a built-in formula -
// there is no lookup table of lender/product formulas anywhere in this file.
// Every number a rule produces traces back to values a human explicitly
// entered and confirmed for that specific account (ruleSource:
// USER_CONFIRMED_RULE today - see MINIMUM_PAYMENT_RULE_SOURCES in
// constants.js for the reserved-but-unused future provenance states).
//
// APR ALONE IS NEVER SUFFICIENT: a debt with a known APR and NO confirmed
// rule still resolves to "unknown" (see MIN-RULE-02 in this module's test
// file) - APR only ever contributes to a computation when the CONFIRMED
// rule explicitly says its formula includes interest (ruleType
// "percentage_plus_interest_fees" with interestComponent:true), and even
// then only as one input alongside an explicit percentage/floor the human
// provided - APR can never drive an estimate by itself.
import { estimateMonthlyInterest } from "./interestEstimate.js";

const round2 = (value) => Math.round(value * 100) / 100;

// Pure computation from an already-validated rule profile. Returns null
// (never a fabricated number) whenever a required input for the chosen
// ruleType is missing - e.g. the rule explicitly includes an interest
// component but this debt's APR isn't known.
export function computeFromRule(rule, { workingBalanceAmount, apr, aprStatus } = {}) {
  if (!rule || rule.ruleSource === "NO_RULE_AVAILABLE") return null;
  if (workingBalanceAmount == null) return null;
  const balance = Number(workingBalanceAmount) || 0;

  if (rule.ruleType === "fixed_amount") {
    return rule.fixedFloor == null ? null : round2(Number(rule.fixedFloor));
  }

  if (rule.ruleType === "percentage_of_balance" || rule.ruleType === "percentage_plus_interest_fees") {
    if (rule.percentageComponent == null) return null;
    const percentageAmount = Number(rule.percentageComponent) * balance;
    const floorAmount = rule.fixedFloor != null ? Number(rule.fixedFloor) : 0;
    let total = Math.max(percentageAmount, floorAmount);

    if (rule.ruleType === "percentage_plus_interest_fees") {
      if (rule.interestComponent) {
        // The rule EXPLICITLY says its lender's minimum formula includes
        // interest - a required input, not an optional nicety. A truly
        // unknown APR (apr === null) means the confirmed formula can't
        // actually be evaluated, so the whole estimate must stay Unknown
        // rather than silently omitting or zeroing the interest term.
        // "no_interest" is a real, CONFIRMED 0% rate (not missing data) and
        // is allowed through with apr=0. "promotional" is deliberately
        // excluded even though it carries a numeric apr - a temporary
        // introductory rate is not a trustworthy basis for a FUTURE
        // estimate once it expires.
        if (apr == null || aprStatus === "promotional") return null;
        total += estimateMonthlyInterest({ balance, apr });
      }
      if (rule.feeComponent) {
        total += Number(rule.feeAmount || 0);
      }
    }
    return round2(total);
  }

  return null;
}

export function estimateNextMinimum({ debt, workingBalanceAmount } = {}) {
  const rule = debt?.minimumPaymentRule;
  if (!rule) return { amount: null, source: "unknown" };
  const amount = computeFromRule(rule, { workingBalanceAmount, apr: debt.apr, aprStatus: debt.aprStatus });
  if (amount == null) return { amount: null, source: "unknown" };
  return { amount, source: "issuer_rule_estimate" };
}

const changed = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

// Trigger predicate for automatic recalculation - recompute whenever a
// relevant input has actually changed (working balance, latest confirmed
// balance, APR/aprStatus, debt type, or the rule profile itself), never on
// every unrelated write. Comparison is by value, not reference, so callers
// can pass fresh plain objects each time without false positives.
export function shouldRecalculateEstimate(prevInputs = {}, nextInputs = {}) {
  return changed(prevInputs.workingBalanceAmount, nextInputs.workingBalanceAmount)
    || changed(prevInputs.lastConfirmedAmount, nextInputs.lastConfirmedAmount)
    || changed(prevInputs.apr, nextInputs.apr)
    || changed(prevInputs.aprStatus, nextInputs.aprStatus)
    || changed(prevInputs.debtType, nextInputs.debtType)
    || changed(prevInputs.minimumPaymentRule, nextInputs.minimumPaymentRule);
}
