import { describe, expect, it } from "vitest";
import {
  describeCycleProgress,
  resolveCurrentBillingCycle,
  resolveWorkingBalance,
  sumActualPaymentsInCycle,
  WORKING_BALANCE_BASIS,
} from "./paymentCycle.js";

const debt = (overrides = {}) => ({
  id: "debt-1",
  currentBalance: 5000,
  balanceStatus: "confirmed",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const snapshot = (balance, observedAt) => ({ balance, observedAt });
const payment = (amount, paidAt, extra = {}) => ({ amount, paidAt, ...extra });

describe("resolveWorkingBalance", () => {
  it("BAL-01: falls back to $0 minus nothing when there is no snapshot and no payments yet", () => {
    const result = resolveWorkingBalance({ debt: debt(), latestSnapshot: null, paymentEvents: [] });
    expect(result).toEqual({ amount: 5000, isEstimated: false, basis: WORKING_BALANCE_BASIS.confirmedDebt, lastConfirmedAmount: 5000, lastConfirmedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("BAL-01: confirmed $5,000 + a $300 payment after the snapshot -> working ~$4,700, marked estimated", () => {
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(5000, "2026-08-01T00:00:00.000Z"),
      paymentEvents: [payment(300, "2026-08-05T00:00:00.000Z")],
    });
    expect(result.amount).toBe(4700);
    expect(result.isEstimated).toBe(true);
    expect(result.basis).toBe(WORKING_BALANCE_BASIS.confirmedSnapshot);
    expect(result.lastConfirmedAmount).toBe(5000);
  });

  it("BAL-02: a confirmed balance with no qualifying payments is NOT marked estimated", () => {
    const result = resolveWorkingBalance({ debt: debt(), latestSnapshot: snapshot(5000, "2026-08-01T00:00:00.000Z"), paymentEvents: [] });
    expect(result.isEstimated).toBe(false);
  });

  it("PAY-13/BAL-08: a payment larger than the working balance floors at $0, never negative", () => {
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(200, "2026-08-01T00:00:00.000Z"),
      paymentEvents: [payment(300, "2026-08-02T00:00:00.000Z")],
    });
    expect(result.amount).toBe(0);
  });

  it("BAL-04/BAL-05: payments before a newer confirmed snapshot are not subtracted again - only payments after the new boundary count", () => {
    const paymentEvents = [payment(300, "2026-08-05T00:00:00.000Z")]; // before the Aug 10 snapshot
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(4560, "2026-08-10T00:00:00.000Z"),
      paymentEvents,
    });
    expect(result.amount).toBe(4560); // not 4560-300
  });

  it("BAL-06: two payments recorded AFTER the newest snapshot each subtract exactly once", () => {
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(4560, "2026-08-10T00:00:00.000Z"),
      paymentEvents: [
        payment(300, "2026-08-05T00:00:00.000Z"), // before boundary - excluded
        payment(100, "2026-08-11T00:00:00.000Z"), // after boundary
        payment(60, "2026-08-15T00:00:00.000Z"), // after boundary
      ],
    });
    expect(result.amount).toBe(4400); // 4560 - 100 - 60
  });

  it("a payment recorded on the same instant as the snapshot's observedAt is not double counted (boundary is exclusive of the snapshot moment)", () => {
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(1000, "2026-08-10T00:00:00.000Z"),
      paymentEvents: [payment(50, "2026-08-10T00:00:00.000Z")],
    });
    expect(result.amount).toBe(1000);
  });

  it("a voided payment is excluded from the working-balance calculation", () => {
    const result = resolveWorkingBalance({
      debt: debt(),
      latestSnapshot: snapshot(1000, "2026-08-01T00:00:00.000Z"),
      paymentEvents: [payment(300, "2026-08-05T00:00:00.000Z", { voidedAt: "2026-08-06T00:00:00.000Z" })],
    });
    expect(result.amount).toBe(1000);
    expect(result.isEstimated).toBe(false);
  });

  it("an unresolved starting balance with no snapshot yet resolves to unknown, never $0", () => {
    const result = resolveWorkingBalance({ debt: debt({ balanceStatus: "unresolved", currentBalance: 0 }), latestSnapshot: null, paymentEvents: [] });
    expect(result.amount).toBeNull();
    expect(result.basis).toBe(WORKING_BALANCE_BASIS.unresolved);
  });

  it("no debt at all resolves to a safe zero/unresolved shape rather than throwing", () => {
    expect(resolveWorkingBalance({ debt: null }).basis).toBe(WORKING_BALANCE_BASIS.unresolved);
  });
});

describe("resolveCurrentBillingCycle", () => {
  it("returns null when dueDay is unknown", () => {
    expect(resolveCurrentBillingCycle(null)).toBeNull();
    expect(resolveCurrentBillingCycle(undefined)).toBeNull();
  });

  it("resolves a one-month cycle ending on the next occurrence of dueDay on/after the reference date", () => {
    const cycle = resolveCurrentBillingCycle(22, new Date("2026-08-10T00:00:00.000Z"));
    expect(cycle.cycleEnd).toBe(new Date("2026-08-22T00:00:00.000Z").toISOString());
    expect(cycle.cycleStart).toBe(new Date("2026-07-22T00:00:00.000Z").toISOString());
  });

  it("rolls into next month once the reference date is past this month's due day", () => {
    const cycle = resolveCurrentBillingCycle(5, new Date("2026-08-10T00:00:00.000Z"));
    expect(cycle.cycleEnd).toBe(new Date("2026-09-05T00:00:00.000Z").toISOString());
  });

  it("clamps a due day beyond a shorter month's length (e.g. 31 in February) instead of throwing", () => {
    const cycle = resolveCurrentBillingCycle(31, new Date("2026-02-10T00:00:00.000Z"));
    expect(new Date(cycle.cycleEnd).getUTCMonth()).toBe(1); // February, clamped to its last day
  });
});

describe("sumActualPaymentsInCycle", () => {
  it("PAY-04/PAY-13: sums multiple payments recorded within the cycle window", () => {
    const cycle = { cycleStart: "2026-07-22T00:00:00.000Z", cycleEnd: "2026-08-22T00:00:00.000Z" };
    const result = sumActualPaymentsInCycle({
      cycle,
      paymentEvents: [payment(40, "2026-08-01T00:00:00.000Z"), payment(60, "2026-08-15T00:00:00.000Z"), payment(999, "2026-09-01T00:00:00.000Z")],
    });
    expect(result.total).toBe(100);
    expect(result.hasCycle).toBe(true);
  });

  it("reports hasCycle:false and still sums everything when no cycle is known, rather than silently reporting $0", () => {
    const result = sumActualPaymentsInCycle({ cycle: null, paymentEvents: [payment(40, "2026-08-01T00:00:00.000Z")] });
    expect(result.hasCycle).toBe(false);
    expect(result.total).toBe(40);
  });

  it("excludes voided payments", () => {
    const cycle = { cycleStart: "2026-07-22T00:00:00.000Z", cycleEnd: "2026-08-22T00:00:00.000Z" };
    const result = sumActualPaymentsInCycle({ cycle, paymentEvents: [payment(40, "2026-08-01T00:00:00.000Z", { voidedAt: "2026-08-02T00:00:00.000Z" })] });
    expect(result.total).toBe(0);
  });
});

describe("describeCycleProgress", () => {
  it("PAY-01: required $59, actual $59 - fully satisfied, nothing above required", () => {
    expect(describeCycleProgress({ required: 59, recordedThisCycle: 59 })).toEqual({ required: 59, recorded: 59, remainingRequired: 0, aboveRequired: 0, isSatisfied: true });
  });

  it("PAY-02: required $59, actual $100 - satisfied, $41 above required", () => {
    expect(describeCycleProgress({ required: 59, recordedThisCycle: 100 })).toEqual({ required: 59, recorded: 100, remainingRequired: 0, aboveRequired: 41, isSatisfied: true });
  });

  it("PAY-03: required $100, actual $40 - not satisfied, $60 remaining", () => {
    expect(describeCycleProgress({ required: 100, recordedThisCycle: 40 })).toEqual({ required: 100, recorded: 40, remainingRequired: 60, aboveRequired: 0, isSatisfied: false });
  });

  it("PAY-06: missing required payment still resolves recorded/aboveRequired safely instead of throwing", () => {
    const result = describeCycleProgress({ required: null, recordedThisCycle: 100 });
    expect(result.required).toBeNull();
    expect(result.recorded).toBe(100);
    expect(result.remainingRequired).toBeNull();
    expect(result.isSatisfied).toBe(false);
  });

  it("PAY-13: an above-required payment never produces a negative remainingRequired", () => {
    const result = describeCycleProgress({ required: 100, recordedThisCycle: 250 });
    expect(result.remainingRequired).toBe(0);
    expect(result.aboveRequired).toBe(150);
  });
});
