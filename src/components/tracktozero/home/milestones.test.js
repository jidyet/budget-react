import { describe, expect, it } from "vitest";
import { deriveMilestones } from "./milestones.js";

const paidOff = (id, name, paidOffAt) => ({ debt: { id, name }, paidOffAt });

describe("deriveMilestones", () => {
  it("achieves nothing when progress is not confirmed", () => {
    const milestones = deriveMilestones({ progress: { confirmed: false, eliminated: 0, percent: 0 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones).toEqual([]);
  });

  it("does not fire the first-reduction milestone when eliminated is exactly 0 (no real change yet)", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 0, percent: 0 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones.find((m) => m.id === "reduction-first")).toBeUndefined();
  });

  it("fires first-confirmed-reduction as soon as any real amount is eliminated", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 50, percent: 2 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones.map((m) => m.id)).toContain("reduction-first");
  });

  it("does not fire the $1,000 milestone below the threshold", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 999.99, percent: 20 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones.map((m) => m.id)).not.toContain("eliminated-1000");
  });

  it("fires the $1,000 milestone at or above the threshold", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 1000, percent: 20 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones.map((m) => m.id)).toContain("eliminated-1000");
  });

  it("fires every percent threshold at or below the current confirmed percent, and none above it", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 5500, percent: 55 }, paidOffDebts: [], allDebtsArePaidOff: false });
    const ids = milestones.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["pct-10", "pct-25", "pct-50"]));
    expect(ids).not.toContain("pct-75");
    expect(ids).not.toContain("pct-90");
  });

  it("fires the first-debt-paid-off milestone, naming the earliest paid-off debt when several are paid off", () => {
    // derivePaidOffDebts sorts most-recent-first; the earliest paid-off debt
    // is therefore the LAST entry in the array.
    const milestones = deriveMilestones({
      progress: { confirmed: true, eliminated: 3000, percent: 30 },
      paidOffDebts: [paidOff("d2", "Recently Paid Card", "2026-08-01"), paidOff("d1", "First Ever Payoff", "2026-02-01")],
      allDebtsArePaidOff: false,
    });
    const milestone = milestones.find((m) => m.id === "payoff-first");
    expect(milestone.body).toContain("First Ever Payoff");
    expect(milestone.body).not.toContain("Recently Paid Card");
  });

  it("does not fire any payoff milestone when nothing is confirmed paid off", () => {
    const milestones = deriveMilestones({ progress: { confirmed: true, eliminated: 100, percent: 5 }, paidOffDebts: [], allDebtsArePaidOff: false });
    expect(milestones.map((m) => m.id)).not.toContain("payoff-first");
    expect(milestones.map((m) => m.id)).not.toContain("payoff-all");
  });

  it("fires all-included-debts-paid-off only when the flag is explicitly true", () => {
    const milestones = deriveMilestones({
      progress: { confirmed: true, eliminated: 5000, percent: 100 },
      paidOffDebts: [paidOff("d1", "Only Debt", "2026-08-01")],
      allDebtsArePaidOff: true,
    });
    expect(milestones.map((m) => m.id)).toContain("payoff-all");
  });

  it("is a pure function - identical input always yields an identical, non-duplicated result", () => {
    const context = { progress: { confirmed: true, eliminated: 2500, percent: 50 }, paidOffDebts: [paidOff("d1", "Card", "2026-08-01")], allDebtsArePaidOff: false };
    const first = deriveMilestones(context);
    const second = deriveMilestones(context);
    expect(second).toEqual(first);
    expect(new Set(first.map((m) => m.id)).size).toBe(first.length);
  });
});
