import { describe, expect, it } from "vitest";
import { comparePaymentTiming, derivePaymentTiming, PAYMENT_TIMING_STATUS, paymentTimingLabel } from "./paymentTiming.js";

// All "now" values use the local Date constructor (year, monthIndex0, day)
// deliberately, matching activityFeed.test.js's existing convention for
// local-time logic - both the reference clock and any fixture dates shift
// together under a different test-runner timezone, so comparisons stay
// deterministic regardless of machine timezone.
const localNow = (year, monthIndex0, day, hour = 12) => new Date(year, monthIndex0, day, hour, 0, 0);
const paymentAt = (year, monthIndex0, day) => ({ amount: 50, paidAt: new Date(year, monthIndex0, day, 9, 0, 0).toISOString() });

describe("derivePaymentTiming", () => {
  it("PAY-06: no due date on the debt returns no_due_date, never a fabricated date", () => {
    const result = derivePaymentTiming({ dueDay: null }, { now: localNow(2026, 7, 17) });
    expect(result).toEqual({ status: PAYMENT_TIMING_STATUS.noDueDate, dueDate: null, daysUntil: null });
  });

  it("PAY-02: due today", () => {
    const result = derivePaymentTiming({ dueDay: 17 }, { now: localNow(2026, 7, 17) });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueToday);
    expect(result.daysUntil).toBe(0);
  });

  it("due tomorrow is within the 7-day window", () => {
    const result = derivePaymentTiming({ dueDay: 18 }, { now: localNow(2026, 7, 17) });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueThisWeek);
    expect(result.daysUntil).toBe(1);
  });

  it("PAY-03: exactly 7 days away is still due_this_week (inclusive boundary)", () => {
    const result = derivePaymentTiming({ dueDay: 24 }, { now: localNow(2026, 7, 17) });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueThisWeek);
    expect(result.daysUntil).toBe(7);
  });

  it("PAY-04: 8 days away is upcoming, not due_this_week", () => {
    const result = derivePaymentTiming({ dueDay: 25 }, { now: localNow(2026, 7, 17) });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.upcoming);
    expect(result.daysUntil).toBe(8);
  });

  it("PAY-05: due date passed with no recorded payment stays due_date_passed, never 'past due'", () => {
    const result = derivePaymentTiming({ dueDay: 15 }, { now: localNow(2026, 7, 17), paymentEvents: [] });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueDatePassed);
    expect(result.daysUntil).toBe(-2);
    expect(result.dueDate.getDate()).toBe(15);
  });

  it("a payment recorded in the SAME calendar month as the passed due date rolls the debt to next month's occurrence, conservatively", () => {
    const result = derivePaymentTiming(
      { dueDay: 15 },
      { now: localNow(2026, 7, 17), paymentEvents: [paymentAt(2026, 7, 16)] }
    );
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.upcoming);
    expect(result.dueDate.getMonth()).toBe(8); // September (0-indexed)
    expect(result.dueDate.getDate()).toBe(15);
  });

  it("a payment recorded in a DIFFERENT month does not count for this cycle - still due_date_passed", () => {
    const result = derivePaymentTiming(
      { dueDay: 15 },
      { now: localNow(2026, 7, 17), paymentEvents: [paymentAt(2026, 6, 15)] }
    );
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueDatePassed);
  });

  it("a VOIDED payment this month does not count toward satisfying the cycle", () => {
    const voided = { ...paymentAt(2026, 7, 16), voidedAt: new Date(2026, 7, 17).toISOString() };
    const result = derivePaymentTiming({ dueDay: 15 }, { now: localNow(2026, 7, 17), paymentEvents: [voided] });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueDatePassed);
  });

  it("a payment dated AFTER `now` (future-dated) does not count yet", () => {
    const result = derivePaymentTiming(
      { dueDay: 15 },
      { now: localNow(2026, 7, 17), paymentEvents: [paymentAt(2026, 7, 20)] }
    );
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueDatePassed);
  });

  it("PAY-14: month-end clamp - due day 31 in April (30 days) clamps to April 30", () => {
    const result = derivePaymentTiming({ dueDay: 31 }, { now: localNow(2026, 3, 1) }); // April 1
    expect(result.dueDate.getMonth()).toBe(3);
    expect(result.dueDate.getDate()).toBe(30);
  });

  it("PAY-15: leap year - due day 29 in February of a leap year (2028) stays the 29th", () => {
    const result = derivePaymentTiming({ dueDay: 29 }, { now: localNow(2028, 1, 1) }); // Feb 1, 2028 is a leap year
    expect(result.dueDate.getMonth()).toBe(1);
    expect(result.dueDate.getDate()).toBe(29);
  });

  it("due day 29 in February of a NON-leap year (2026) clamps to the 28th", () => {
    const result = derivePaymentTiming({ dueDay: 29 }, { now: localNow(2026, 1, 1) }); // Feb 1, 2026 is not a leap year
    expect(result.dueDate.getMonth()).toBe(1);
    expect(result.dueDate.getDate()).toBe(28);
  });

  it("due day 30 in February clamps the same way", () => {
    const result = derivePaymentTiming({ dueDay: 30 }, { now: localNow(2026, 1, 1) });
    expect(result.dueDate.getMonth()).toBe(1);
    expect(result.dueDate.getDate()).toBe(28);
  });

  it("Dec -> Jan rollover: a passed December due date with a qualifying payment rolls into January of the NEXT year", () => {
    const result = derivePaymentTiming(
      { dueDay: 5 },
      { now: localNow(2026, 11, 10), paymentEvents: [paymentAt(2026, 11, 6)] } // Dec 10, paid Dec 6
    );
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.upcoming);
    expect(result.dueDate.getFullYear()).toBe(2027);
    expect(result.dueDate.getMonth()).toBe(0);
    expect(result.dueDate.getDate()).toBe(5);
  });

  it("a late-in-the-month 'now' with an early dueDay correctly computes as upcoming next month even without a payment (not passed, since it hasn't cycled)", () => {
    // dueDay 3, now is the 25th -> this month's the 3rd already passed;
    // with no payment recorded this should be due_date_passed (not silently
    // treated as "next month" just because most of the month has elapsed).
    const result = derivePaymentTiming({ dueDay: 3 }, { now: localNow(2026, 7, 25) });
    expect(result.status).toBe(PAYMENT_TIMING_STATUS.dueDatePassed);
  });
});

describe("paymentTimingLabel", () => {
  it("never uses unsupported delinquency language for any status", () => {
    const forbidden = /past.?due|overdue|delinquent|missed/i;
    const cases = [
      derivePaymentTiming({ dueDay: 15 }, { now: localNow(2026, 7, 17) }),
      derivePaymentTiming({ dueDay: 17 }, { now: localNow(2026, 7, 17) }),
      derivePaymentTiming({ dueDay: 20 }, { now: localNow(2026, 7, 17) }),
      derivePaymentTiming({ dueDay: 30 }, { now: localNow(2026, 7, 17) }),
      derivePaymentTiming({ dueDay: null }, { now: localNow(2026, 7, 17) }),
    ];
    for (const result of cases) {
      expect(paymentTimingLabel(result)).not.toMatch(forbidden);
    }
  });

  it("PAY-05 label is a neutral confirmation prompt, not a delinquency claim", () => {
    const result = derivePaymentTiming({ dueDay: 15 }, { now: localNow(2026, 7, 17) });
    expect(paymentTimingLabel(result)).toBe("Due date passed — confirm");
  });
});

describe("comparePaymentTiming", () => {
  it("PAY-16: sorts due_date_passed first, then due_today, then soonest-upcoming, unknown last", () => {
    const now = localNow(2026, 7, 17);
    const items = [
      { key: "no-due", timing: derivePaymentTiming({ dueDay: null }, { now }) },
      { key: "upcoming-far", timing: derivePaymentTiming({ dueDay: 30 }, { now }) },
      { key: "today", timing: derivePaymentTiming({ dueDay: 17 }, { now }) },
      { key: "passed", timing: derivePaymentTiming({ dueDay: 15 }, { now }) },
      { key: "this-week", timing: derivePaymentTiming({ dueDay: 20 }, { now }) },
    ];
    const sorted = [...items].sort((a, b) => comparePaymentTiming(a.timing, b.timing));
    expect(sorted.map((i) => i.key)).toEqual(["passed", "today", "this-week", "upcoming-far", "no-due"]);
  });

  it("multiple due_date_passed debts sort most-overdue first", () => {
    const now = localNow(2026, 7, 17);
    const items = [
      { key: "passed-2-days", timing: derivePaymentTiming({ dueDay: 15 }, { now }) },
      { key: "passed-10-days", timing: derivePaymentTiming({ dueDay: 7 }, { now }) },
    ];
    const sorted = [...items].sort((a, b) => comparePaymentTiming(a.timing, b.timing));
    expect(sorted.map((i) => i.key)).toEqual(["passed-10-days", "passed-2-days"]);
  });

  it("null/unknown due dates always sort last regardless of comparison direction", () => {
    const now = localNow(2026, 7, 17);
    const noDue = derivePaymentTiming({ dueDay: null }, { now });
    const today = derivePaymentTiming({ dueDay: 17 }, { now });
    expect(comparePaymentTiming(noDue, today)).toBeGreaterThan(0);
    expect(comparePaymentTiming(today, noDue)).toBeLessThan(0);
  });
});
