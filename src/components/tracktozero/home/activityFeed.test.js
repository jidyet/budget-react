import { describe, expect, it } from "vitest";
import { deriveActivityFeed } from "./activityFeed.js";

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
});
