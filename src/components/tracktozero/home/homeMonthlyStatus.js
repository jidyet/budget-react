const PERIOD_STATES = {
  no_plan: "no_plan",
  no_target: "no_target",
  no_payment_expected: "no_payment_expected",
  not_recorded: "not_recorded",
  partially_recorded: "partially_recorded",
  recorded: "recorded",
  more_than_planned: "more_than_planned",
};

const toAmount = (value) => Math.max(0, Number(value) || 0);
const toPeriodKey = (value) => {
  if (!value) return "";
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
};

// Bug fix: ExpectedCheckpoint.period is the payoff engine's own "Mon YYYY"
// month label (e.g. "Aug 2026"), never "YYYY-MM" - comparing it directly
// against toPeriodKey's output (used for PaymentEvent.paidAt/asOf, which
// really are ISO strings) never matched, so `checkpoint` was silently
// always null here and the checkpoint's own expected payment amount was
// never actually used (a quiet fallback to the plan's flat extra, not a
// crash, but not the intended behavior either).
const MONTH_ABBREVIATIONS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthLabelToPeriodKey = (value) => {
  const match = String(value || "").trim().match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  if (!match) return "";
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(match[1].toLowerCase());
  if (monthIndex < 0) return "";
  return `${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`;
};

const sumPaymentEvents = (events = []) => events.reduce((sum, event) => sum + toAmount(event.amount), 0);

const roughlyEqual = (a, b, epsilon = 0.01) => Math.abs(Number(a || 0) - Number(b || 0)) <= epsilon;

const periodRange = (periodKey) => {
  const [year, month] = String(periodKey || "").split("-").map(Number);
  if (!year || !month) return { start: "", end: "" };
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  return { start, end };
};

export { PERIOD_STATES };

export const deriveCurrentPlanPeriodStatus = (snapshot) => {
  const version = snapshot?.activeContext?.version;
  if (!version) {
    return {
      state: PERIOD_STATES.no_plan,
      period: toPeriodKey(snapshot?.asOf || ""),
      plannedAmount: 0,
      recordedAmount: 0,
      requiredPayment: 0,
      extraPayment: 0,
      paymentCount: 0,
      headline: "No payoff target yet.",
      supporting: "Once you choose a plan, we'll show what your plan expects this month, what you've recorded, and your next move.",
      ctaLabel: "Compare strategies",
      shouldRecordPayment: false,
      shouldUpdateBalance: false,
      balanceRefreshNeeded: false,
    };
  }

  const period = toPeriodKey(snapshot?.asOf || version.asOf || "");
  const checkpoint = (snapshot?.expectedCheckpoints || []).find((item) => monthLabelToPeriodKey(item.period) === period) || null;
  const targetDebt = snapshot?.targetDebt || null;
  const allEvents = targetDebt ? (snapshot?.paymentEventsByDebt?.[targetDebt.id] || []) : [];
  const eventsThisPeriod = allEvents.filter((event) => toPeriodKey(event.paidAt) === period);
  const recordedAmount = sumPaymentEvents(eventsThisPeriod);
  const requiredPayment = toAmount(targetDebt?.minimumRequiredPayment);
  const extraPayment = toAmount(checkpoint?.expectedPayment ?? version.extraMonthlyPayment);
  const plannedAmount = targetDebt ? requiredPayment + extraPayment : extraPayment;
  const latestPaymentAt = eventsThisPeriod.reduce((latest, event) => (
    !latest || new Date(event.paidAt).getTime() > new Date(latest).getTime() ? event.paidAt : latest
  ), "");
  const latestSnapshotAt = targetDebt ? String(snapshot?.latestSnapshotsByDebt?.[targetDebt.id]?.observedAt || "") : "";
  const balanceRefreshNeeded = !!latestPaymentAt && (latestSnapshotAt ? new Date(latestSnapshotAt).getTime() < new Date(latestPaymentAt).getTime() : true);

  if (!targetDebt) {
    return {
      state: PERIOD_STATES.no_target,
      period,
      periodRange: periodRange(period),
      targetDebt: null,
      plannedAmount,
      recordedAmount,
      requiredPayment,
      extraPayment,
      paymentCount: eventsThisPeriod.length,
      headline: "Your plan doesn't have a payoff target right now.",
      supporting: "Review your debts or plan so TrackToZero can point to your next move.",
      ctaLabel: "View debts",
      shouldRecordPayment: false,
      shouldUpdateBalance: false,
      balanceRefreshNeeded: false,
    };
  }

  const common = {
    period,
    periodRange: periodRange(period),
    targetDebt,
    plannedAmount,
    recordedAmount,
    requiredPayment,
    extraPayment,
    paymentCount: eventsThisPeriod.length,
    latestPaymentAt,
    latestSnapshotAt,
    balanceRefreshNeeded,
  };

  if (plannedAmount <= 0) {
    return {
      ...common,
      state: PERIOD_STATES.no_payment_expected,
      headline: "No payment is expected on this target right now.",
      supporting: "Keep your balances updated so TrackToZero can refresh your plan status.",
      ctaLabel: "Update balance",
      shouldRecordPayment: false,
      shouldUpdateBalance: true,
    };
  }

  if (recordedAmount <= 0) {
    return {
      ...common,
      state: PERIOD_STATES.not_recorded,
      headline: "Nothing recorded yet this month.",
      supporting: `Your plan is aiming ${targetDebt.name} first. Already paid it? Record the payment.`,
      ctaLabel: "Record payment",
      shouldRecordPayment: true,
      shouldUpdateBalance: false,
    };
  }

  if (recordedAmount < plannedAmount && !roughlyEqual(recordedAmount, plannedAmount)) {
    return {
      ...common,
      state: PERIOD_STATES.partially_recorded,
      headline: "You've recorded part of this month's payment.",
      supporting: "Keep going if there is more to record, then update the balance when your statement catches up.",
      ctaLabel: "Record payment",
      shouldRecordPayment: true,
      shouldUpdateBalance: balanceRefreshNeeded,
    };
  }

  if (recordedAmount > plannedAmount && !roughlyEqual(recordedAmount, plannedAmount)) {
    return {
      ...common,
      state: PERIOD_STATES.more_than_planned,
      headline: "You've recorded more than this month's planned amount.",
      supporting: "Nice push. Update the balance when it changes so your progress stays honest.",
      ctaLabel: balanceRefreshNeeded ? "Update balance" : "View debt",
      shouldRecordPayment: false,
      shouldUpdateBalance: balanceRefreshNeeded,
    };
  }

  return {
    ...common,
    state: PERIOD_STATES.recorded,
    headline: "Payment recorded ✓",
    supporting: balanceRefreshNeeded
      ? "When your new balance is available, update it to refresh your progress."
      : "Your payment is recorded for this month.",
    ctaLabel: balanceRefreshNeeded ? "Update balance" : "View debt",
    shouldRecordPayment: false,
    shouldUpdateBalance: balanceRefreshNeeded,
  };
};
