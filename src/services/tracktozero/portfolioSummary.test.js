import { describe, expect, it } from "vitest";
import { deriveDebtPortfolioSummary } from "./portfolioSummary.js";

const debt = (overrides = {}) => ({
  id: "d1",
  status: "active",
  currentBalance: 1000,
  balanceStatus: "confirmed",
  includedInCorePayoffPlan: true,
  ownerType: "unassigned",
  ownerId: "",
  ownerLabel: "",
  ...overrides,
});

const debtBalance = (d) => Number(d.currentBalance || 0);

describe("deriveDebtPortfolioSummary", () => {
  it("Personal workspaces skip the member/person/joint breakdown entirely", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "personal" },
      members: [{ uid: "solo", displayName: "Solo" }],
      debts: [debt({ ownerType: "member", ownerId: "solo" })],
      debtBalance,
    });
    expect(summary.memberDebt).toEqual([]);
    expect(summary.totalWorkspaceDebt).toBe(1000);
  });

  it("Household: a real member's debts total correctly", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "household" },
      members: [{ uid: "m1", displayName: "Kristina Davis" }],
      people: [],
      debts: [debt({ id: "d1", ownerType: "member", ownerId: "m1", currentBalance: 500 }), debt({ id: "d2", ownerType: "member", ownerId: "m1", currentBalance: 300 })],
      debtBalance,
    });
    expect(summary.memberDebt).toEqual([{ uid: "m1", displayName: "Kristina Davis", total: 800, debtCount: 2 }]);
  });

  // DATA-HH1
  it("Household: a DATA-HH1 person's debts appear in the same breakdown as real members, using the person's display name", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "household" },
      members: [{ uid: "m1", displayName: "Kristina Davis" }],
      people: [{ id: "p1", displayName: "Babajide Yusuf" }],
      debts: [
        debt({ id: "d1", ownerType: "member", ownerId: "m1", currentBalance: 500 }),
        debt({ id: "d2", ownerType: "person", ownerId: "p1", currentBalance: 700 }),
      ],
      debtBalance,
    });
    expect(summary.memberDebt).toHaveLength(2);
    const babajideRow = summary.memberDebt.find((row) => row.uid === "p1");
    expect(babajideRow).toEqual({ uid: "p1", displayName: "Babajide Yusuf", total: 700, debtCount: 1 });
  });

  it("Joint debt counts exactly once, never per member/person", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "household" },
      members: [{ uid: "m1", displayName: "Kristina Davis" }],
      people: [{ id: "p1", displayName: "Babajide Yusuf" }],
      debts: [debt({ id: "d1", ownerType: "joint", currentBalance: 1200 })],
      debtBalance,
    });
    expect(summary.jointDebt).toBe(1200);
    expect(summary.totalWorkspaceDebt).toBe(1200);
    expect(summary.memberDebt).toEqual([]);
  });

  it("Unassigned debt is tracked separately, never silently attributed to anyone", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "household" },
      members: [],
      people: [],
      debts: [debt({ id: "d1", ownerType: "unassigned", currentBalance: 400 })],
      debtBalance,
    });
    expect(summary.unassignedDebt).toBe(400);
    expect(summary.memberDebt).toEqual([]);
  });

  it("a person-owned debt with a missing/removed person record still counts via its frozen ownerLabel, never dropped", () => {
    const summary = deriveDebtPortfolioSummary({
      workspace: { type: "household" },
      members: [],
      people: [], // person no longer present in the live list
      debts: [debt({ id: "d1", ownerType: "person", ownerId: "p-gone", ownerLabel: "Old Person", currentBalance: 250 })],
      debtBalance,
    });
    const row = summary.memberDebt.find((r) => r.uid === "p-gone");
    expect(row).toEqual({ uid: "p-gone", displayName: "Old Person", total: 250, debtCount: 1 });
  });
});
