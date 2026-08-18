import { describe, expect, it } from "vitest";
import {
  applyDebtExplorerFilters,
  groupDebtsByLender,
  groupDebtsByOwner,
  resolveDebtBalance,
  scopeToCategory,
  sortDebtExplorerDebts,
} from "./debtExplorerView.js";

const debt = (overrides = {}) => ({
  id: "d1",
  name: "Capital One Card",
  debtType: "credit_card",
  status: "active",
  currentBalance: 1000,
  minimumRequiredPayment: 50,
  aprStatus: "known",
  apr: 0.2,
  dueDay: 15,
  ownerType: "unassigned",
  ownerId: "",
  ownerLabel: "",
  includedInCorePayoffPlan: true,
  ...overrides,
});

describe("DEBT-EXPLORER: scopeToCategory", () => {
  it("scopes by owner and category, ignoring the explorer's own filters", () => {
    const debts = [
      debt({ id: "a", debtType: "credit_card", ownerType: "member", ownerId: "u1" }),
      debt({ id: "b", debtType: "student_loan", ownerType: "member", ownerId: "u1" }),
      debt({ id: "c", debtType: "credit_card", ownerType: "member", ownerId: "u2" }),
    ];
    const result = scopeToCategory(debts, { ownerFilter: "u1", categoryEntry: { group: "CREDIT_CARD" } });
    expect(result.map((d) => d.id)).toEqual(["a"]);
  });

  it("returns everything scoped to category when ownerFilter is 'all'", () => {
    const debts = [debt({ id: "a" }), debt({ id: "b", debtType: "student_loan" })];
    const result = scopeToCategory(debts, { categoryEntry: { group: "CREDIT_CARD" } });
    expect(result.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("DEBT-EXPLORER: applyDebtExplorerFilters", () => {
  const debts = [
    debt({ id: "review", currentBalance: 400 }),
    debt({ id: "paidoff", currentBalance: 900 }),
    debt({ id: "included", includedInCorePayoffPlan: true, currentBalance: 3000 }),
    debt({ id: "excluded", includedInCorePayoffPlan: false, currentBalance: 700 }),
    debt({ id: "unknownapr", aprStatus: "unknown", currentBalance: 6000 }),
    debt({ id: "chase", name: "Chase Freedom", currentBalance: 12000 }),
  ];
  const reviewIds = new Set(["review"]);
  const paidOffIds = new Set(["paidoff"]);

  it("filters by status = needs_attention", () => {
    const result = applyDebtExplorerFilters(debts, { statusFilter: "needs_attention", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["review"]);
  });

  it("filters by plan = not_included", () => {
    const result = applyDebtExplorerFilters(debts, { planFilter: "not_included", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["excluded"]);
  });

  it("filters by data quality = missing_apr", () => {
    const result = applyDebtExplorerFilters(debts, { qualityFilter: "missing_apr", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["unknownapr"]);
  });

  it("filters by lender", () => {
    const result = applyDebtExplorerFilters(debts, { lenderFilter: "chase", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["chase"]);
  });

  it("filters by balance range", () => {
    const result = applyDebtExplorerFilters(debts, { balanceFilter: "5000_10000", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["unknownapr"]);
  });

  it("never treats a debt with no resolvable balance as $0 when balance-filtering", () => {
    const noBalance = [debt({ id: "nobalance", currentBalance: null })];
    const result = applyDebtExplorerFilters(noBalance, { balanceFilter: "under_500" });
    expect(result).toEqual([]);
  });

  it("composes multiple filters together", () => {
    const result = applyDebtExplorerFilters(debts, { planFilter: "included", balanceFilter: "2000_5000", reviewIds, paidOffIds });
    expect(result.map((d) => d.id)).toEqual(["included"]);
  });
});

describe("DEBT-EXPLORER: sortDebtExplorerDebts", () => {
  it("apr_desc and apr_asc both use a -1 sentinel for unknown APR, never a 0% fallback", () => {
    const debts = [
      debt({ id: "known-low", aprStatus: "known", apr: 0.05 }),
      debt({ id: "unknown", aprStatus: "unknown", apr: null }),
      debt({ id: "known-high", aprStatus: "known", apr: 0.25 }),
      debt({ id: "known-zero", aprStatus: "no_interest", apr: 0 }),
    ];
    const desc = sortDebtExplorerDebts(debts, "apr_desc");
    expect(desc.map((d) => d.id)).toEqual(["known-high", "known-low", "known-zero", "unknown"]);
    const asc = sortDebtExplorerDebts(debts, "apr_asc");
    // Unknown APR (-1 sentinel) sorts BELOW a genuine 0% APR debt on ascending too.
    expect(asc.map((d) => d.id)).toEqual(["unknown", "known-zero", "known-low", "known-high"]);
  });

  it("sorts by required payment", () => {
    const debts = [
      debt({ id: "a", minimumRequiredPayment: 100 }),
      debt({ id: "b", minimumRequiredPayment: 25 }),
      debt({ id: "c", minimumRequiredPayment: 50 }),
    ];
    expect(sortDebtExplorerDebts(debts, "required_payment_desc").map((d) => d.id)).toEqual(["a", "c", "b"]);
    expect(sortDebtExplorerDebts(debts, "required_payment_asc").map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by due date, soonest first, undefined due day last", () => {
    const debts = [debt({ id: "a", dueDay: 20 }), debt({ id: "b", dueDay: null }), debt({ id: "c", dueDay: 5 })];
    expect(sortDebtExplorerDebts(debts, "due_date").map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by balance both directions", () => {
    const debts = [debt({ id: "a", currentBalance: 500 }), debt({ id: "b", currentBalance: 2000 }), debt({ id: "c", currentBalance: 100 })];
    expect(sortDebtExplorerDebts(debts, "balance_desc").map((d) => d.id)).toEqual(["b", "a", "c"]);
    expect(sortDebtExplorerDebts(debts, "balance_asc").map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by lender canonical name A-Z and Z-A", () => {
    const debts = [
      debt({ id: "boa", name: "BOFA" }),
      debt({ id: "cap1", name: "Capital One" }),
      debt({ id: "unknown", name: "Old Store Card" }),
    ];
    expect(sortDebtExplorerDebts(debts, "lender_asc").map((d) => d.id)).toEqual(["boa", "cap1", "unknown"]);
    expect(sortDebtExplorerDebts(debts, "lender_desc").map((d) => d.id)).toEqual(["unknown", "cap1", "boa"]);
  });

  it("sorts by current payoff order, unqueued debts last", () => {
    const debts = [debt({ id: "a" }), debt({ id: "b" }), debt({ id: "c" })];
    const payoffOrderIndex = new Map([["b", 0], ["a", 1]]);
    expect(sortDebtExplorerDebts(debts, "payoff_order", { payoffOrderIndex }).map((d) => d.id)).toEqual(["b", "a", "c"]);
  });
});

describe("DEBT-EXPLORER: groupDebtsByLender", () => {
  it("groups multiple accounts from the same recognized lender, with correct count and total", () => {
    const debts = [
      debt({ id: "c1", name: "Capital One Card", currentBalance: 231.84, ownerLabel: "Babajide" }),
      debt({ id: "c2", name: "Capital One Business", currentBalance: 2046.12, ownerLabel: "Kristina" }),
      debt({ id: "chase1", name: "Chase Freedom", currentBalance: 500 }),
    ];
    const groups = groupDebtsByLender(debts);
    const capitalOne = groups.find((g) => g.lenderId === "capital_one");
    expect(capitalOne.count).toBe(2);
    expect(capitalOne.total).toBeCloseTo(2277.96);
    expect(capitalOne.canonicalName).toBe("Capital One");
    expect(capitalOne.debts.map((d) => d.id)).toEqual(["c1", "c2"]);
  });

  it("never merges two different unmatched/unknown lenders into one bucket", () => {
    const debts = [
      debt({ id: "u1", name: "Old Store Card" }),
      debt({ id: "u2", name: "Family Credit Union Loan" }),
    ];
    const groups = groupDebtsByLender(debts);
    // Both unmatched debts land in a single passthrough "ungrouped" bucket
    // (rendered individually by the caller), never fused into one fake
    // shared-lender group with each other.
    const recognizedGroups = groups.filter((g) => g.lenderId);
    expect(recognizedGroups).toEqual([]);
    const ungrouped = groups.find((g) => g.ungrouped);
    expect(ungrouped.debts.map((d) => d.id).sort()).toEqual(["u1", "u2"]);
  });

  it("highestKnownApr is null when every debt in the group has unknown APR (never fabricated as 0%)", () => {
    const debts = [
      debt({ id: "c1", name: "Capital One Card", aprStatus: "unknown", apr: null }),
      debt({ id: "c2", name: "Capital One Business", aprStatus: "unknown", apr: null }),
    ];
    const group = groupDebtsByLender(debts).find((g) => g.lenderId === "capital_one");
    expect(group.highestKnownApr).toBe(null);
  });

  it("does not mutate or merge the underlying Debt objects - each retains its own id/balance", () => {
    const debts = [
      debt({ id: "c1", name: "Capital One Card", currentBalance: 100 }),
      debt({ id: "c2", name: "Capital One Business", currentBalance: 200 }),
    ];
    const group = groupDebtsByLender(debts).find((g) => g.lenderId === "capital_one");
    expect(group.debts[0].id).toBe("c1");
    expect(group.debts[0].currentBalance).toBe(100);
    expect(group.debts[1].id).toBe("c2");
    expect(group.debts[1].currentBalance).toBe(200);
  });
});

describe("DEBT-EXPLORER: groupDebtsByOwner", () => {
  it("groups by member, counts Joint once, and separates Unassigned", () => {
    const debts = [
      debt({ id: "a", ownerType: "member", ownerId: "u1", ownerLabel: "Kristina" }),
      debt({ id: "b", ownerType: "member", ownerId: "u1", ownerLabel: "Kristina" }),
      debt({ id: "c", ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household" }),
      debt({ id: "d", ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household" }),
      debt({ id: "e", ownerType: "unassigned", ownerId: "", ownerLabel: "" }),
    ];
    const groups = groupDebtsByOwner(debts);
    const kristina = groups.find((g) => g.ownerType === "member");
    const joint = groups.find((g) => g.ownerType === "joint");
    const unassigned = groups.find((g) => g.ownerType === "unassigned");
    expect(kristina.count).toBe(2);
    expect(joint.count).toBe(2);
    expect(joint.label).toBe("Joint / Household");
    expect(unassigned.count).toBe(1);
    expect(unassigned.label).toBe("Unassigned");
    // Every debt counted exactly once across all groups.
    const allGroupedIds = groups.flatMap((g) => g.debts.map((d) => d.id));
    expect(allGroupedIds.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("DEBT-EXPLORER: resolveDebtBalance", () => {
  it("prefers the latest snapshot balance over currentBalance when present", () => {
    const d = debt({ id: "a", currentBalance: 500 });
    expect(resolveDebtBalance(d, { a: { balance: 450 } })).toBe(450);
    expect(resolveDebtBalance(d, {})).toBe(500);
  });
});
