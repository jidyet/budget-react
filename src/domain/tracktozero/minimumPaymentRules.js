// GATE-10B.1: TrackToZero's future-minimum-payment estimate architecture.
// Ships with ZERO built-in formulas - the hotfix brief this closes is
// explicit that inventing lender-specific or generalized guessed minimum-
// payment formulas (e.g. "1% of balance", "Chase = X%") is out of scope and
// actively harmful ("truth is preferable to fake precision"). This registry
// exists so a FUTURE genuinely vetted issuer/product rule has somewhere to
// plug in without a schema or caller change - not because a rule fires
// today. Every debt's estimatedNextMinimumPayment is "unknown" until a real
// rule is added here.
//
// APR ALONE IS NEVER SUFFICIENT: no rule registered here may be a function
// of APR alone - see the MIN-DYN-09/10 tests in this module's test file,
// which assert a known APR (including 0%) with no registered rule still
// resolves to "unknown", never a fabricated $0 or APR-derived number.
export const MINIMUM_PAYMENT_RULES = Object.freeze([]);

export function estimateNextMinimum({ debt, workingBalanceAmount } = {}) {
  const rule = MINIMUM_PAYMENT_RULES.find((candidate) => candidate.appliesTo?.(debt));
  if (!rule) return { amount: null, source: "unknown" };
  const computed = rule.compute({ debt, workingBalanceAmount });
  return { amount: computed == null ? null : Number(computed), source: "issuer_rule_estimate" };
}

const changed = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

// Trigger predicate for automatic recalculation - recompute whenever a
// relevant input has actually changed (working balance, latest confirmed
// balance, APR/aprStatus, debt type), never on every unrelated write.
// Comparison is by value, not reference, so callers can pass fresh plain
// objects each time without false positives.
export function shouldRecalculateEstimate(prevInputs = {}, nextInputs = {}) {
  return changed(prevInputs.workingBalanceAmount, nextInputs.workingBalanceAmount)
    || changed(prevInputs.lastConfirmedAmount, nextInputs.lastConfirmedAmount)
    || changed(prevInputs.apr, nextInputs.apr)
    || changed(prevInputs.aprStatus, nextInputs.aprStatus)
    || changed(prevInputs.debtType, nextInputs.debtType);
}
