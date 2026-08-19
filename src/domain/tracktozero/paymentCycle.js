// GATE-10B.1: TrackToZero previously had no concept of a "working" balance -
// display always fell back to the latest confirmed BalanceSnapshot (or
// debt.currentBalance if none), never netting out PaymentEvents recorded
// after that snapshot's observedAt. A user who recorded a real payment saw
// no immediate change anywhere in their debt picture. This module is the
// single, tested place that resolves a WORKING balance for DISPLAY purposes
// only - it never touches PlanVersion projection math (which continues to
// use PlanVersion.startingDebtSnapshot, frozen at activation/reforecast
// time - a deliberately different, already-correct contract; see
// payoffEngine.js/projectionStatusService.js, both untouched).
//
// PaymentEvent != BalanceSnapshot (locked contract, see QuickUpdateRail.jsx):
// recording a payment never creates or replaces a confirmed balance. The
// working balance stays an ESTIMATE until a newer BalanceSnapshot arrives.

const toAmount = (value) => (value == null ? null : Number(value) || 0);

export const WORKING_BALANCE_BASIS = Object.freeze({
  confirmedSnapshot: "confirmed_snapshot",
  confirmedDebt: "confirmed_debt",
  unresolved: "unresolved",
});

// Resolves the working (display) balance for a single debt from its latest
// confirmed BalanceSnapshot (or debt.currentBalance if no snapshot exists
// yet, ONLY when the debt's own balanceStatus is "confirmed" - an
// unresolved starting balance must never be treated as a base to subtract
// payments from) plus every PaymentEvent recorded strictly after that
// snapshot's observedAt (or after the debt's own createdAt, when there is
// no snapshot at all). Floors at 0 - a payment larger than the working
// balance never produces a negative number or silently marks the debt paid
// off (that requires an explicit confirmed $0 - see the paid-off flow in
// ReviewEditDebtDrawer.jsx).
export function resolveWorkingBalance({ debt, latestSnapshot = null, paymentEvents = [] }) {
  if (!debt) {
    return { amount: 0, isEstimated: false, basis: WORKING_BALANCE_BASIS.unresolved, lastConfirmedAmount: null, lastConfirmedAt: null };
  }

  const lastConfirmedAmount = latestSnapshot
    ? toAmount(latestSnapshot.balance)
    : (debt.balanceStatus === "confirmed" ? toAmount(debt.currentBalance) : null);
  const lastConfirmedAt = latestSnapshot
    ? latestSnapshot.observedAt
    : (debt.balanceStatus === "confirmed" ? debt.createdAt : null);

  if (lastConfirmedAmount == null) {
    return { amount: null, isEstimated: false, basis: WORKING_BALANCE_BASIS.unresolved, lastConfirmedAmount: null, lastConfirmedAt: null };
  }

  const boundary = lastConfirmedAt ? new Date(lastConfirmedAt).getTime() : -Infinity;
  const qualifyingPayments = (paymentEvents || []).filter((event) => !event.voidedAt && new Date(event.paidAt).getTime() > boundary);
  const paidSinceConfirmation = qualifyingPayments.reduce((sum, event) => sum + toAmount(event.amount), 0);

  return {
    amount: Math.max(0, lastConfirmedAmount - paidSinceConfirmation),
    isEstimated: qualifyingPayments.length > 0,
    basis: latestSnapshot ? WORKING_BALANCE_BASIS.confirmedSnapshot : WORKING_BALANCE_BASIS.confirmedDebt,
    lastConfirmedAmount,
    lastConfirmedAt,
  };
}

// Minimal billing-cycle derivation from the existing dueDay primitive only -
// no new persisted cycle field ("do not overbuild a full bill-management
// system"). A cycle is the (cycleStart, cycleEnd] window ending at the next
// occurrence of dueDay on/after referenceDate, one month wide. Returns null
// when dueDay is unknown - never guesses a cycle boundary.
export function resolveCurrentBillingCycle(dueDay, referenceDate = new Date()) {
  const day = Number(dueDay);
  if (!day || day < 1 || day > 31) return null;
  const ref = new Date(referenceDate);
  const clampDay = (year, month, candidateDay) => {
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Math.min(candidateDay, lastDayOfMonth);
  };
  const dueOn = (year, month) => new Date(Date.UTC(year, month, clampDay(year, month, day)));
  const thisMonthDue = dueOn(ref.getUTCFullYear(), ref.getUTCMonth());
  const cycleEnd = thisMonthDue.getTime() >= ref.getTime() ? thisMonthDue : dueOn(ref.getUTCFullYear(), ref.getUTCMonth() + 1);
  const cycleStart = dueOn(cycleEnd.getUTCFullYear(), cycleEnd.getUTCMonth() - 1);
  return { cycleStart: cycleStart.toISOString(), cycleEnd: cycleEnd.toISOString() };
}

// Sums actual PaymentEvents recorded within (cycleStart, cycleEnd] (or all
// PaymentEvents ever, when cycle is unknown - reported via hasCycle: false
// so callers never silently treat "no cycle info" as "$0 recorded").
export function sumActualPaymentsInCycle({ paymentEvents = [], cycle }) {
  const events = (paymentEvents || []).filter((event) => !event.voidedAt);
  if (!cycle) {
    return { total: events.reduce((sum, event) => sum + toAmount(event.amount), 0), hasCycle: false };
  }
  const start = new Date(cycle.cycleStart).getTime();
  const end = new Date(cycle.cycleEnd).getTime();
  const inCycle = events.filter((event) => {
    const at = new Date(event.paidAt).getTime();
    return at > start && at <= end;
  });
  return { total: inCycle.reduce((sum, event) => sum + toAmount(event.amount), 0), hasCycle: true };
}

// Presentation-safe cycle-progress math. Never returns language implying
// lender-confirmed "current" standing (e.g. never "Account current") - only
// a plain required-vs-recorded framing ("$X of $Y recorded this cycle").
export function describeCycleProgress({ required, recordedThisCycle }) {
  const requiredAmount = toAmount(required);
  const recorded = Math.max(0, toAmount(recordedThisCycle) || 0);
  if (requiredAmount == null) {
    return { required: null, recorded, remainingRequired: null, aboveRequired: 0, isSatisfied: false };
  }
  const remainingRequired = Math.max(0, requiredAmount - recorded);
  const aboveRequired = Math.max(0, recorded - requiredAmount);
  return { required: requiredAmount, recorded, remainingRequired, aboveRequired, isSatisfied: remainingRequired === 0 };
}
