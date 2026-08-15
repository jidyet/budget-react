import { describe, expect, it } from "vitest";
import { deriveDebtPortfolioView } from "./debtPortfolioView.js";

describe("deriveDebtPortfolioView", () => {
  it("separates active debt, review debt, and paid-off debt without inventing zero balances", () => {
    const snapshot = {
      workspace: { type: "personal" },
      debts: [
        { id: "d1", name: "Chase", status: "active", currentBalance: 1200, minimumRequiredPayment: 50, aprStatus: "known", apr: 0.19, includedInCorePayoffPlan: true },
        { id: "d2", name: "Needs review", status: "active", currentBalance: 0, minimumRequiredPayment: 0, aprStatus: "unknown", includedInCorePayoffPlan: true, ownerLabel: "undeliverable" },
        { id: "d3", name: "Paid off", status: "active", currentBalance: 0, minimumRequiredPayment: 0, aprStatus: "no_interest", includedInCorePayoffPlan: true },
      ],
      portfolioSummary: {
        totalWorkspaceDebt: 1200,
        includedDebt: 1200,
        excludedDebt: 0,
        needsReviewCount: 1,
        needsReviewDebtIds: ["d2"],
        memberDebt: [],
        jointDebt: 0,
        unassignedDebt: 0,
      },
      latestSnapshotsByDebt: {
        d1: { balance: 1200 },
        d2: { balance: 0 },
        d3: { balance: 0 },
      },
    };

    const view = deriveDebtPortfolioView(snapshot);

    expect(view.leftToGo).toBe(1200);
    expect(view.activeDebts).toHaveLength(1);
    expect(view.reviewDebts.map((d) => d.id)).toEqual(["d2"]);
    expect(view.paidOffDebts.map((d) => d.id)).toEqual(["d3"]);
    expect(view.summaryCards.some((card) => card.key === "leftToGo")).toBe(true);
  });

  it("counts joint debt once in household summaries while keeping member totals separate", () => {
    const snapshot = {
      workspace: { type: "household" },
      debts: [
        { id: "d1", name: "Alice card", status: "active", currentBalance: 1000, minimumRequiredPayment: 40, aprStatus: "known", apr: 0.18, includedInCorePayoffPlan: true, ownerType: "member", ownerId: "a" },
        { id: "d2", name: "Joint loan", status: "active", currentBalance: 500, minimumRequiredPayment: 35, aprStatus: "known", apr: 0.12, includedInCorePayoffPlan: true, ownerType: "joint" },
      ],
      members: [{ uid: "a", displayName: "Alice" }, { uid: "b", displayName: "Ben" }],
      portfolioSummary: {
        totalWorkspaceDebt: 1500,
        includedDebt: 1500,
        excludedDebt: 0,
        needsReviewCount: 0,
        needsReviewDebtIds: [],
        memberDebt: [{ uid: "a", displayName: "Alice", total: 1000, debtCount: 1 }],
        jointDebt: 500,
        unassignedDebt: 0,
      },
    };

    const view = deriveDebtPortfolioView(snapshot);

    expect(view.householdTotals.totalDebt).toBe(1500);
    expect(view.householdTotals.memberDebt).toBe(1000);
    expect(view.householdTotals.jointDebt).toBe(500);
    expect(view.householdTotals.unassignedDebt).toBe(0);
    expect(view.householdBreakdown).toHaveLength(2);
  });
});
