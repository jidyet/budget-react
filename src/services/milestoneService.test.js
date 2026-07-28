import { describe, expect, it } from "vitest";
import { buildMilestones } from "./milestoneService";

describe("buildMilestones", () => {
  it("ignores monthly recurring bills when building debt milestones", () => {
    const milestones = buildMilestones({
      progress: {
        totalReduction: 120,
        totalReductionLabel: "$120.00",
        monthsSooner: 0,
        almostDoneDebt: null,
      },
      accounts: [
        {
          id: "subscription",
          category: "SUBSCRIPTIONS",
          name: "Amazon PRIME (Subscription)",
          paid_v: 16.23,
          min_due_v: 16.23,
          cur_bal: 0,
          starting_bal: 0,
          billType: "monthly",
        },
        {
          id: "card",
          category: "CREDIT CARDS",
          name: "CAPITAL ONE (Credit Card) (Babajide)",
          paid_v: 100,
          min_due_v: 50,
          cur_bal: 900,
          starting_bal: 1000,
          billType: "paydown",
        },
      ],
      getPrevRecord: (id) => (id === "card" ? { cur_bal: 1000 } : { cur_bal: 0 }),
    });

    expect(milestones.some((entry) => /Prime/i.test(entry.body || ""))).toBe(false);
    expect(milestones.some((entry) => /payments made this month/i.test(entry.body || ""))).toBe(false);
  });
});
