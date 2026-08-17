import { describe, expect, it } from "vitest";
import { deriveDebtPortfolioView, deriveCategoryBreakdown, filterDebtsByOwnerScope } from "./debtPortfolioView.js";
import { DEBT_CATEGORY_GROUPS } from "../../domain/tracktozero/financialItemTaxonomy.js";

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

describe("filterDebtsByOwnerScope (UX-6.1)", () => {
  const debts = [
    { id: "d1", ownerType: "member", ownerId: "a" },
    { id: "d2", ownerType: "member", ownerId: "b" },
    { id: "d3", ownerType: "joint", ownerId: "" },
    { id: "d4", ownerType: "unassigned", ownerId: "" },
  ];

  it("returns everything for the aggregate scope ('all')", () => {
    expect(filterDebtsByOwnerScope(debts, "all")).toHaveLength(4);
  });

  it("scopes to a specific member/person id", () => {
    expect(filterDebtsByOwnerScope(debts, "a").map((d) => d.id)).toEqual(["d1"]);
  });

  it("scopes to joint and unassigned via effectiveOwnerType, never an ownerId match", () => {
    expect(filterDebtsByOwnerScope(debts, "joint").map((d) => d.id)).toEqual(["d3"]);
    expect(filterDebtsByOwnerScope(debts, "unassigned").map((d) => d.id)).toEqual(["d4"]);
  });
});

describe("deriveCategoryBreakdown (UX-6.1)", () => {
  const snapshot = {
    workspace: { type: "household" },
    debts: [
      { id: "d1", name: "Capital One", status: "active", debtType: "credit_card", currentBalance: 1000, minimumRequiredPayment: 50, aprStatus: "known", apr: 0.2, includedInCorePayoffPlan: true, ownerType: "member", ownerId: "a" },
      { id: "d2", name: "Chase", status: "active", debtType: "credit_card", currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "unknown", balanceStatus: "unresolved", includedInCorePayoffPlan: true, ownerType: "member", ownerId: "a" },
      { id: "d3", name: "Aidvantage", status: "active", debtType: "student_loan", currentBalance: 2000, minimumRequiredPayment: 100, aprStatus: "known", apr: 0.05, includedInCorePayoffPlan: true, ownerType: "joint", ownerId: "" },
      { id: "d4", name: "Mystery debt", status: "active", debtType: "some_future_type_not_yet_mapped", currentBalance: 300, minimumRequiredPayment: 10, aprStatus: "known", apr: 0.1, includedInCorePayoffPlan: true, ownerType: "unassigned", ownerId: "" },
    ],
    portfolioSummary: {
      totalWorkspaceDebt: 3800,
      includedDebt: 3800,
      excludedDebt: 0,
      needsReviewCount: 1,
      needsReviewDebtIds: ["d2"],
      memberDebt: [{ uid: "a", displayName: "Alice", total: 1000, debtCount: 1 }],
      jointDebt: 2000,
      unassignedDebt: 300,
    },
    latestSnapshotsByDebt: {},
  };
  const portfolio = deriveDebtPortfolioView(snapshot);

  it("groups debts by DEBT_CATEGORY_GROUPS, counting/summing exactly the union of active+review+paidOff (no debt counted twice)", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "all" });
    const creditCard = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.creditCard);
    const studentLoan = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.studentLoan);
    expect(creditCard).toMatchObject({ count: 2, balance: 1500 });
    expect(studentLoan).toMatchObject({ count: 1, balance: 2000 });
    const totalCount = breakdown.reduce((sum, entry) => sum + entry.count, 0);
    expect(totalCount).toBe(snapshot.debts.length);
  });

  it("falls unmapped debtType values through to otherDebt rather than dropping them", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "all" });
    const other = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.otherDebt);
    expect(other).toMatchObject({ count: 1, balance: 300 });
  });

  it("marks the needs-review debt's category with a non-zero reviewCount, without inflating its count", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "all" });
    const creditCard = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.creditCard);
    expect(creditCard.reviewCount).toBe(1);
    expect(creditCard.count).toBe(2);
  });

  it("recalculates category counts/balances when scoped to a specific owner", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "a" });
    const creditCard = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.creditCard);
    const studentLoan = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.studentLoan);
    expect(creditCard).toMatchObject({ count: 2, balance: 1500 });
    expect(studentLoan).toBeUndefined();
  });

  it("counts a joint debt once when scoped to 'joint', not duplicated under any member", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "joint" });
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({ group: DEBT_CATEGORY_GROUPS.studentLoan, count: 1, balance: 2000 });
  });

  it("prefers latestSnapshotsByDebt's balance over currentBalance when present, matching the debt-card display convention", () => {
    const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter: "all", latestSnapshotsByDebt: { d1: { balance: 750 } } });
    const creditCard = breakdown.find((entry) => entry.group === DEBT_CATEGORY_GROUPS.creditCard);
    expect(creditCard.balance).toBe(750 + 500);
  });
});
