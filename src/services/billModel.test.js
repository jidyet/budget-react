import { describe, expect, it } from "vitest";
import {
  getBillDisplayStatus,
  getBillDisplayName,
  isBillCoveredThisCycle,
  isBillOverdue,
  isBillPaidOff,
  isDebtBill,
  isMonthlyBill,
  normalizeBillType,
} from "./billModel";

describe("billModel classification", () => {
  it("keeps debt categories as paydown even when stale monthly flags exist", () => {
    const debt = {
      category: "CREDIT CARDS",
      name: "CAPITAL ONE (Credit Card) (Babajide)",
      startsOverMonthly: true,
      billType: "monthly",
    };
    expect(normalizeBillType(debt)).toBe("paydown");
    expect(isDebtBill(debt)).toBe(true);
    expect(isMonthlyBill(debt)).toBe(false);
  });

  it("treats recurring categories as monthly bills", () => {
    const recurring = {
      category: "SUBSCRIPTIONS",
      name: "Amazon PRIME (Subscription)",
    };
    expect(normalizeBillType(recurring)).toBe("monthly");
    expect(isMonthlyBill(recurring)).toBe(true);
    expect(isDebtBill(recurring)).toBe(false);
  });

  it("keeps no-interest plans debt-like", () => {
    const plan = {
      category: "PERSONAL LOANS",
      name: "AFFIRM (Samsung) (Babajide)",
      billType: "noInterest",
    };
    expect(normalizeBillType(plan)).toBe("noInterest");
    expect(isDebtBill(plan)).toBe(true);
  });
});

describe("getBillDisplayName", () => {
  it("shortens imported names without mutating stored labels", () => {
    expect(
      getBillDisplayName({
        name: "CAPITAL ONE (Credit Card) (Babajide)",
        bank: "Capital One",
        owner: "Babajide",
      })
    ).toBe("Capital One");
  });

  it("can include the owner when needed", () => {
    expect(
      getBillDisplayName(
        {
          name: "Amazon PRIME (Subscription)",
          bank: "Amazon",
          owner: "Babajide",
        },
        { includeOwner: true }
      )
    ).toBe("Prime · Babajide");
  });
});

describe("bill status semantics", () => {
  it("treats a debt with balance and current-cycle payment as paid this cycle, not paid off", () => {
    const debt = {
      billType: "paydown",
      category: "CREDIT CARDS",
      name: "Navy Federal",
      cur_bal: 3782.05,
      min_due_v: 93.2,
      paid_v: 93.2,
      is_paid: true,
      d_left: 4,
    };

    expect(isBillCoveredThisCycle(debt)).toBe(true);
    expect(isBillPaidOff(debt)).toBe(false);
    expect(getBillDisplayStatus(debt)).toMatchObject({ key: "paid_cycle", label: "Paid this cycle" });
  });

  it("treats past-due uncovered bills as overdue", () => {
    const debt = {
      billType: "paydown",
      category: "CREDIT CARDS",
      name: "Discover",
      cur_bal: 1200,
      min_due_v: 55,
      paid_v: 0,
      is_paid: false,
      d_left: -2,
    };

    expect(isBillOverdue(debt)).toBe(true);
    expect(getBillDisplayStatus(debt)).toMatchObject({ key: "overdue", label: "2d overdue" });
  });
});
