// BETA-3: the required-payment execution / due-date truth layer.
//
// The ONLY authoritative due-date primitive anywhere in TrackToZero is
// Debt.dueDay - a bare, nullable 1-31 recurring day-of-month integer (see
// models.js's createDebt). There is no stored calendar date, no timezone
// concept, and no existing "days until due" calculation anywhere upstream
// - this module is the first place that derives an actual calendar
// occurrence from it.
//
// Local-time throughout (getFullYear/getMonth/getDate), matching the exact
// convention activityFeed.js's localDayKey/localDayLabel already
// established for "Today"/"Yesterday" semantics - due-today/due-this-week
// must reflect the viewer's own clock, not a server/UTC day boundary. Every
// function takes an explicit `now` (or a caller-supplied `paymentEvents`
// list) rather than reading the system clock internally, so behavior is
// fully deterministic and testable (see Section 17 of the BETA-3 spec).
//
// FINANCIAL-TRUTH INVARIANT: a due date having passed is never, by itself,
// evidence of a missed/delinquent payment - the user may have paid the
// creditor directly, outside TrackToZero, without recording it here.
// PaymentEvent carries no due-cycle/period link at all (confirmed during
// the BETA-3 due-date audit: createPaymentEvent has no dueCycle,
// billingPeriod, or expectedAmount field), so this module can never PROVE
// a specific cycle was satisfied. It therefore never returns or implies
// "past due," "missed," or "delinquent" - only "due date passed - confirm
// payment," and only "upcoming" once a payment recorded in the same
// calendar month as the due date gives a conservative reason to move on
// (mirroring homeMonthlyStatus.js's own established convention: it already
// attributes a PaymentEvent to "this cycle" purely by calendar-month
// match, via toPeriodKey - reused here rather than inventing a second,
// competing cycle-attribution rule).

export const PAYMENT_TIMING_STATUS = Object.freeze({
  dueToday: "due_today",
  dueThisWeek: "due_this_week",
  upcoming: "upcoming",
  dueDatePassed: "due_date_passed",
  noDueDate: "no_due_date",
});

const daysInLocalMonth = (year, monthIndex0) => new Date(year, monthIndex0 + 1, 0).getDate();

// Month-end clamping policy (documented, tested - Section 18): a debt due
// on the 31st is treated as due on the last real day of a shorter month
// (e.g. the 28th/29th in February, the 30th in April). No prior TrackToZero
// behavior existed to preserve here - this module is the first thing that
// ever turns dueDay into a calendar date - so this is a fresh, deliberate
// choice, not a change to an established contract.
const clampedDueDateForMonth = (dueDay, year, monthIndex0) => {
  const clampedDay = Math.min(dueDay, daysInLocalMonth(year, monthIndex0));
  return new Date(year, monthIndex0, clampedDay);
};

const startOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addLocalMonths = (year, monthIndex0, delta) => {
  const total = monthIndex0 + delta;
  const nextYear = year + Math.floor(total / 12);
  const nextMonthIndex0 = ((total % 12) + 12) % 12;
  return { year: nextYear, monthIndex0: nextMonthIndex0 };
};

const daysBetween = (fromDay, toDay) => Math.round((toDay.getTime() - fromDay.getTime()) / 86400000);

const asDate = (value) => {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Conservative, documented satisfaction policy (Section 22/6/7): a debt's
// current due cycle is treated as "a payment already addressed it" only
// when a non-voided PaymentEvent's paidAt falls in the SAME calendar
// month as the cycle's due date, at or before `now`. This never asserts
// the minimum was actually met, never inspects the payment amount, and
// never retroactively reinterprets what a PaymentEvent means (still
// exactly "the user says a payment occurred," per the locked
// PaymentEvent contract) - it only decides whether TrackToZero keeps
// nudging for a confirmation on THIS debt's Home/Upcoming Payments
// surface, using the same calendar-month cycle-matching convention
// homeMonthlyStatus.js's deriveCurrentPlanPeriodStatus already
// established (toPeriodKey), not a second competing rule.
const hasQualifyingPaymentForCycle = (paymentEvents, cycleDueDate, now) => {
  const cycleYear = cycleDueDate.getFullYear();
  const cycleMonth = cycleDueDate.getMonth();
  return (paymentEvents || []).some((event) => {
    if (!event || event.voidedAt) return false;
    const paidAt = asDate(event.paidAt);
    if (!paidAt) return false;
    return paidAt.getFullYear() === cycleYear && paidAt.getMonth() === cycleMonth && paidAt.getTime() <= now.getTime();
  });
};

// The one function everything else in this module builds on. Given a Debt
// (only `dueDay` is read) and that debt's own PaymentEvents, returns:
//   { status, dueDate: Date|null, daysUntil: number|null }
// `daysUntil` is negative for due_date_passed (how many days ago), 0 for
// due_today, 1-7 for due_this_week, >7 for upcoming beyond this week.
export const derivePaymentTiming = (debt, { now, paymentEvents = [] } = {}) => {
  const referenceNow = now instanceof Date ? now : new Date(now ?? Date.now());
  const today = startOfLocalDay(referenceNow);
  const dueDay = debt?.dueDay;

  if (dueDay == null) {
    return { status: PAYMENT_TIMING_STATUS.noDueDate, dueDate: null, daysUntil: null };
  }

  const year = today.getFullYear();
  const monthIndex0 = today.getMonth();
  const currentCycleDueDate = clampedDueDateForMonth(dueDay, year, monthIndex0);

  if (today.getTime() > currentCycleDueDate.getTime()) {
    if (hasQualifyingPaymentForCycle(paymentEvents, currentCycleDueDate, referenceNow)) {
      const next = addLocalMonths(year, monthIndex0, 1);
      const nextDueDate = clampedDueDateForMonth(dueDay, next.year, next.monthIndex0);
      return { status: PAYMENT_TIMING_STATUS.upcoming, dueDate: nextDueDate, daysUntil: daysBetween(today, nextDueDate) };
    }
    return { status: PAYMENT_TIMING_STATUS.dueDatePassed, dueDate: currentCycleDueDate, daysUntil: daysBetween(today, currentCycleDueDate) };
  }

  const daysUntil = daysBetween(today, currentCycleDueDate);
  if (daysUntil === 0) return { status: PAYMENT_TIMING_STATUS.dueToday, dueDate: currentCycleDueDate, daysUntil };
  // "Due this week" = the next 7 calendar days including today (Section 19),
  // not a Monday-Sunday calendar week - users care about the upcoming
  // payment window, not where it falls on a calendar grid.
  if (daysUntil <= 7) return { status: PAYMENT_TIMING_STATUS.dueThisWeek, dueDate: currentCycleDueDate, daysUntil };
  return { status: PAYMENT_TIMING_STATUS.upcoming, dueDate: currentCycleDueDate, daysUntil };
};

// Human-facing label for a timing result. Deliberately never says "past
// due," "overdue," "missed," or "delinquent" - see the module-level
// invariant above. Matches this app's existing terse, restrained copy
// style (e.g. "Due day: 15" precedent in CategoryDetailPage.jsx) while
// being calendar-aware, which no existing V2 copy currently is.
export const paymentTimingLabel = ({ status, dueDate, daysUntil }) => {
  switch (status) {
    case PAYMENT_TIMING_STATUS.dueToday:
      return "Due today";
    case PAYMENT_TIMING_STATUS.dueThisWeek:
      return `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
    case PAYMENT_TIMING_STATUS.dueDatePassed:
      return "Due date passed — confirm";
    case PAYMENT_TIMING_STATUS.upcoming:
      return dueDate ? `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Upcoming";
    case PAYMENT_TIMING_STATUS.noDueDate:
    default:
      return "No due date";
  }
};

// Sort comparator for calendar-aware "soonest first" ordering - distinct
// from debtExplorerView.js's existing "due_date" sort, which is a naive
// raw dueDay integer comparison (already shipped/tested; not calendar-
// aware and deliberately left unchanged here, see debtExplorerView.js's
// own new "due_soonest" option). Ordering, earliest first:
//   due_date_passed (most overdue first) < due_today < due_this_week/
//   upcoming (soonest first) < no_due_date (always last).
const STATUS_RANK = Object.freeze({
  [PAYMENT_TIMING_STATUS.dueDatePassed]: 0,
  [PAYMENT_TIMING_STATUS.dueToday]: 1,
  [PAYMENT_TIMING_STATUS.dueThisWeek]: 2,
  [PAYMENT_TIMING_STATUS.upcoming]: 2,
  [PAYMENT_TIMING_STATUS.noDueDate]: 3,
});

export const comparePaymentTiming = (a, b) => {
  const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rankDiff !== 0) return rankDiff;
  if (a.status === PAYMENT_TIMING_STATUS.noDueDate) return 0;
  if (a.status === PAYMENT_TIMING_STATUS.dueDatePassed) {
    // Most-overdue (smallest/most-negative daysUntil) first.
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  }
  return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
};
