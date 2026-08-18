import { describe, expect, it } from "vitest";
import {
  ACTIVITY_DATE_RANGE_OPTIONS,
  ACTIVITY_EVENT_TYPE_OPTIONS,
  deriveActivityFeed,
  formatLocalTimeLabel,
  groupActivityEntriesByLocalDay,
  matchesActor,
  matchesDateRange,
  matchesDebt,
  matchesEventType,
  matchesOwnerScope,
} from "./activityFeed.js";

const members = [{ uid: "u1", displayName: "Alex", status: "active" }];
const people = [{ id: "p1", displayName: "Sam (profile)", status: "active" }];

const debt = (overrides = {}) => ({
  id: "d1",
  name: "Visa Card",
  startingBalance: 5000,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "u1",
  openingBalanceSnapshotId: "opening-d1",
  ...overrides,
});

describe("deriveActivityFeed", () => {
  it("renders a debt-creation entry with a resolved actor name", () => {
    const feed = deriveActivityFeed({ debts: [debt()] }, { members, people });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ kind: "debt_created", title: "Visa Card added", actorName: "Alex" });
    expect(feed[0].detail).toContain("5,000");
  });

  it("excludes the opening balance snapshot as a duplicate of debt creation", () => {
    const feed = deriveActivityFeed({
      debts: [debt()],
      balanceSnapshots: [{ id: "opening-d1", debtId: "d1", balance: 5000, observedAt: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "u1" }],
    }, { members, people });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe("debt_created");
  });

  it("includes a later, non-opening balance snapshot as its own entry", () => {
    const feed = deriveActivityFeed({
      debts: [debt()],
      balanceSnapshots: [{ id: "snap-2", debtId: "d1", balance: 4200, observedAt: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1" }],
    }, { members, people });
    expect(feed.some((entry) => entry.kind === "balance_snapshot" && entry.title === "Visa Card balance confirmed")).toBe(true);
  });

  it("excludes a voided balance snapshot", () => {
    const feed = deriveActivityFeed({
      debts: [debt()],
      balanceSnapshots: [{ id: "snap-2", debtId: "d1", balance: 4200, observedAt: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1", voidedAt: "2026-02-02T00:00:00.000Z" }],
    }, { members, people });
    expect(feed.some((entry) => entry.kind === "balance_snapshot")).toBe(false);
  });

  it("never correlates a payment event with a balance snapshot - both appear as separate entries", () => {
    const feed = deriveActivityFeed({
      debts: [debt()],
      balanceSnapshots: [{ id: "snap-2", debtId: "d1", balance: 4200, observedAt: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1" }],
      paymentEvents: [{ id: "pay-1", debtId: "d1", amount: 800, paidAt: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1" }],
    }, { members, people });
    const kinds = feed.map((entry) => entry.kind).filter((kind) => kind !== "debt_created");
    expect(kinds.sort()).toEqual(["balance_snapshot", "payment_event"]);
  });

  it("excludes a voided payment event", () => {
    const feed = deriveActivityFeed({
      debts: [debt()],
      paymentEvents: [{ id: "pay-1", debtId: "d1", amount: 800, paidAt: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1", voidedAt: "2026-02-02T00:00:00.000Z" }],
    }, { members, people });
    expect(feed.some((entry) => entry.kind === "payment_event")).toBe(false);
  });

  it("labels a plan activation version", () => {
    const feed = deriveActivityFeed({
      planVersions: [{ id: "v1", planId: "plan-1", versionNumber: 1, createdBecause: "activation", createdAt: "2026-03-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-03-01", projectedZeroDate: "Jan 2029" }],
    }, { members, people });
    expect(feed[0]).toMatchObject({ kind: "plan_version", title: "Payoff plan activated" });
    expect(feed[0].detail).toContain("Jan 2029");
  });

  it("compares old vs new projected zero date on a reforecast when both versions have one persisted", () => {
    const feed = deriveActivityFeed({
      planVersions: [
        { id: "v1", planId: "plan-1", versionNumber: 1, createdBecause: "activation", createdAt: "2026-03-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-03-01", projectedZeroDate: "Jan 2029" },
        { id: "v2", planId: "plan-1", versionNumber: 2, createdBecause: "reforecast", createdAt: "2026-05-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-05-01", projectedZeroDate: "Sep 2028" },
      ],
    }, { members, people });
    const reforecastEntry = feed.find((entry) => entry.id === "plan-version:v2");
    expect(reforecastEntry.detail).toBe("Projected payoff moved from Jan 2029 to Sep 2028");
  });

  it("fails conservatively (no fabricated comparison) on a reforecast when the prior version predates persisted projectedZeroDate", () => {
    const feed = deriveActivityFeed({
      planVersions: [
        { id: "v1", planId: "plan-1", versionNumber: 1, createdBecause: "activation", createdAt: "2026-03-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-03-01", projectedZeroDate: "" },
        { id: "v2", planId: "plan-1", versionNumber: 2, createdBecause: "reforecast", createdAt: "2026-05-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-05-01", projectedZeroDate: "Sep 2028" },
      ],
    }, { members, people });
    const reforecastEntry = feed.find((entry) => entry.id === "plan-version:v2");
    expect(reforecastEntry.detail).toBe("Your plan has been updated.");
  });

  it("falls back to a neutral actor label for an unresolvable uid, and sorts all kinds by createdAt descending", () => {
    const feed = deriveActivityFeed({
      debts: [debt({ id: "d1", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "ghost-uid" })],
      paymentEvents: [{ id: "pay-1", debtId: "d1", amount: 800, paidAt: "2026-04-01", createdAt: "2026-04-01T00:00:00.000Z", createdBy: "u1" }],
      planVersions: [{ id: "v1", planId: "plan-1", versionNumber: 1, createdBecause: "activation", createdAt: "2026-02-01T00:00:00.000Z", createdBy: "u1", asOf: "2026-02-01", projectedZeroDate: "" }],
    }, { members, people });
    expect(feed.map((entry) => entry.id)).toEqual(["payment:pay-1", "plan-version:v1", "debt:d1"]);
    expect(feed.find((entry) => entry.id === "debt:d1").actorName).toBe("A workspace member");
  });

  it("exposes actorUid/ownerId/ownerType separately from the resolved display strings, for every entry kind", () => {
    const feed = deriveActivityFeed({
      debts: [debt({ id: "d1", createdBy: "u1", ownerId: "u1", ownerType: "member" })],
      paymentEvents: [{ id: "pay-1", debtId: "d1", amount: 500, paidAt: "2026-04-01", createdAt: "2026-04-01T00:00:00.000Z", createdBy: "u1" }],
    }, { members, people });
    const debtEntry = feed.find((entry) => entry.id === "debt:d1");
    expect(debtEntry.actorUid).toBe("u1");
    expect(debtEntry.ownerId).toBe("u1");
    expect(debtEntry.ownerType).toBe("member");
    const paymentEntry = feed.find((entry) => entry.id === "payment:pay-1");
    expect(paymentEntry.actorUid).toBe("u1");
    expect(paymentEntry.ownerId).toBe("u1");
  });
});

// UX-8.4: Activity Explorer support functions.
describe("ACTIVITY-EXPLORER: groupActivityEntriesByLocalDay", () => {
  it("groups events into Today/Yesterday/older, using LOCAL calendar days, not UTC", () => {
    const referenceNow = new Date(2026, 7, 17, 22, 0, 0); // local Aug 17, 10pm
    const entries = [
      { at: new Date(2026, 7, 17, 8, 0, 0).toISOString() }, // today, morning
      { at: new Date(2026, 7, 16, 20, 0, 0).toISOString() }, // yesterday
      { at: new Date(2026, 7, 12, 12, 0, 0).toISOString() }, // older, same year
      { at: new Date(2025, 7, 12, 12, 0, 0).toISOString() }, // older, different year
    ];
    const groups = groupActivityEntriesByLocalDay(entries, referenceNow);
    expect(groups.map((g) => g.dayLabel)).toEqual(["Today", "Yesterday", "Aug 12", "Aug 12, 2025"]);
  });

  it("does not split two events on the same LOCAL calendar day across a UTC-day boundary", () => {
    // Both timestamps constructed via the LOCAL Date constructor, so this
    // is deterministic regardless of the test runner's actual timezone -
    // these two really are the same local calendar day by construction.
    const referenceNow = new Date(2026, 7, 17, 23, 0, 0);
    const entries = [
      { id: "a", at: new Date(2026, 7, 17, 23, 45, 0).toISOString() },
      { id: "b", at: new Date(2026, 7, 17, 0, 15, 0).toISOString() },
    ];
    const groups = groupActivityEntriesByLocalDay(entries, referenceNow);
    expect(groups).toHaveLength(1);
    expect(groups[0].dayLabel).toBe("Today");
    expect(groups[0].entries).toHaveLength(2);
  });

  it("preserves the input order within and across day groups (caller controls newest/oldest)", () => {
    const referenceNow = new Date(2026, 7, 17, 12, 0, 0);
    const entries = [
      { id: "newest", at: new Date(2026, 7, 17, 10, 0, 0).toISOString() },
      { id: "older", at: new Date(2026, 7, 16, 10, 0, 0).toISOString() },
    ];
    const groups = groupActivityEntriesByLocalDay(entries, referenceNow);
    expect(groups[0].entries[0].id).toBe("newest");
    expect(groups[1].entries[0].id).toBe("older");
  });
});

describe("ACTIVITY-EXPLORER: formatLocalTimeLabel", () => {
  it("formats a local time-of-day label, never a raw timestamp", () => {
    const label = formatLocalTimeLabel(new Date(2026, 7, 17, 14, 41, 0).toISOString());
    expect(label).toBe("2:41 PM");
  });

  it("returns an empty string for a missing/invalid timestamp rather than throwing", () => {
    expect(formatLocalTimeLabel("")).toBe("");
    expect(formatLocalTimeLabel(null)).toBe("");
  });
});

describe("ACTIVITY-EXPLORER: filter predicates", () => {
  const entry = {
    kind: "payment_event",
    actorUid: "actor-1",
    ownerId: "owner-1",
    ownerType: "member",
    debtId: "debt-1",
    at: "2026-08-15T12:00:00.000Z",
  };

  it("matchesEventType only matches real, backed kinds - never fabricates a category", () => {
    expect(ACTIVITY_EVENT_TYPE_OPTIONS.map(([key]) => key)).toEqual(["all", "payment_event", "balance_snapshot", "debt_created", "plan_version"]);
    expect(matchesEventType(entry, "all")).toBe(true);
    expect(matchesEventType(entry, "payment_event")).toBe(true);
    expect(matchesEventType(entry, "balance_snapshot")).toBe(false);
  });

  it("matchesActor filters on the stable actorUid, not a display string", () => {
    expect(matchesActor(entry, "all")).toBe(true);
    expect(matchesActor(entry, "actor-1")).toBe(true);
    expect(matchesActor(entry, "someone-else")).toBe(false);
  });

  it("matchesOwnerScope filters independently of actor - actor and owner never collapse into one control", () => {
    expect(matchesOwnerScope(entry, "all")).toBe(true);
    expect(matchesOwnerScope(entry, "owner-1")).toBe(true);
    expect(matchesOwnerScope(entry, "actor-1")).toBe(false);
    expect(matchesOwnerScope({ ...entry, ownerType: "joint", ownerId: "" }, "joint")).toBe(true);
    expect(matchesOwnerScope({ ...entry, ownerType: "unassigned", ownerId: "" }, "unassigned")).toBe(true);
  });

  it("an actor-scoped filter and an owner-scoped filter produce independent results for the same entry (actor != owner proof)", () => {
    const actorIsOwner = matchesActor(entry, entry.ownerId); // actor filter checking the OWNER id
    const ownerIsActor = matchesOwnerScope(entry, entry.actorUid); // owner filter checking the ACTOR uid
    expect(actorIsOwner).toBe(false);
    expect(ownerIsActor).toBe(false);
    expect(matchesActor(entry, entry.actorUid)).toBe(true);
    expect(matchesOwnerScope(entry, entry.ownerId)).toBe(true);
  });

  it("matchesDebt filters by debt id", () => {
    expect(matchesDebt(entry, "all")).toBe(true);
    expect(matchesDebt(entry, "debt-1")).toBe(true);
    expect(matchesDebt(entry, "debt-2")).toBe(false);
  });

  it("matchesDateRange: 7d/30d/month buckets, never treating a future date as in-range", () => {
    expect(ACTIVITY_DATE_RANGE_OPTIONS.map(([key]) => key)).toEqual(["all", "7d", "30d", "month"]);
    const referenceNow = new Date(2026, 7, 17, 12, 0, 0);
    const withinWeek = { at: new Date(2026, 7, 12, 12, 0, 0).toISOString() };
    const withinMonth = { at: new Date(2026, 6, 25, 12, 0, 0).toISOString() };
    const tooOld = { at: new Date(2026, 5, 1, 12, 0, 0).toISOString() };
    const future = { at: new Date(2026, 7, 20, 12, 0, 0).toISOString() };
    expect(matchesDateRange(withinWeek, "7d", referenceNow)).toBe(true);
    expect(matchesDateRange(withinMonth, "7d", referenceNow)).toBe(false);
    expect(matchesDateRange(withinMonth, "30d", referenceNow)).toBe(true);
    expect(matchesDateRange(tooOld, "30d", referenceNow)).toBe(false);
    expect(matchesDateRange(future, "7d", referenceNow)).toBe(false);
    expect(matchesDateRange({ at: new Date(2026, 7, 1, 0, 0, 0).toISOString() }, "month", referenceNow)).toBe(true);
    expect(matchesDateRange(tooOld, "month", referenceNow)).toBe(false);
  });
});
