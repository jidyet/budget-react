import { describe, expect, it } from "vitest";
import { deriveCategoryMetrics } from "./categoryMetrics.js";
import { DEBT_CATEGORY_GROUPS } from "../../../domain/tracktozero/financialItemTaxonomy.js";

const debt = (overrides = {}) => ({
  id: "d1",
  currentBalance: 1000,
  minimumRequiredPayment: 50,
  aprStatus: "known",
  apr: 0.2,
  ...overrides,
});

describe("CATEGORY-01..12: deriveCategoryMetrics", () => {
  it("CATEGORY-01: always includes leftToGo and active-account-count cards", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.creditCard, [debt()]);
    expect(cards.find((c) => c.key === "leftToGo").value).toBe(1000);
    expect(cards.find((c) => c.key === "active").value).toBe(1);
  });

  it("CATEGORY-02: credit card category includes monthly min. due and highest APR", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.creditCard, [
      debt({ id: "a", minimumRequiredPayment: 50, apr: 0.2 }),
      debt({ id: "b", minimumRequiredPayment: 30, apr: 0.25 }),
    ]);
    expect(cards.find((c) => c.key === "monthlyMinDue").value).toBe(80);
    expect(cards.find((c) => c.key === "highestApr").value).toBe(0.25);
  });

  it("CATEGORY-03: never fabricates a metric with no real data - highest APR omitted when every debt's APR is unknown", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.creditCard, [
      debt({ aprStatus: "unknown", apr: null }),
    ]);
    expect(cards.find((c) => c.key === "highestApr")).toBeUndefined();
  });

  it("CATEGORY-04: unknown minimumRequiredPayment is excluded from the sum, never treated as $0", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.creditCard, [
      debt({ id: "a", minimumRequiredPayment: 50 }),
      debt({ id: "b", minimumRequiredPayment: null }),
    ]);
    const minDue = cards.find((c) => c.key === "monthlyMinDue");
    expect(minDue.value).toBe(50);
    expect(minDue.supporting).toMatch(/1 need/);
  });

  it("CATEGORY-05: student loan / auto loan / personal loan categories show average APR, not highest", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.studentLoan, [
      debt({ id: "a", apr: 0.05 }),
      debt({ id: "b", apr: 0.1 }),
    ]);
    expect(cards.find((c) => c.key === "avgApr").value).toBeCloseTo(0.075);
    expect(cards.find((c) => c.key === "highestApr")).toBeUndefined();
  });

  it("CATEGORY-06: mortgage category labels the min-due card as 'Required payment'/'Rate'", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.mortgageOrHomeLoan, [debt({ minimumRequiredPayment: 1840, apr: 0.06 })]);
    expect(cards.find((c) => c.key === "requiredPayment").label).toBe("Required payment");
    expect(cards.find((c) => c.key === "rate").label).toBe("Rate");
  });

  it("CATEGORY-07: an unrecognized/undefined group falls back to a generic metric set rather than throwing", () => {
    expect(() => deriveCategoryMetrics(undefined, [debt()])).not.toThrow();
    const cards = deriveCategoryMetrics(undefined, [debt()]);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("CATEGORY-08: an empty debts list still returns leftToGo=0/active=0, not an empty array", () => {
    const cards = deriveCategoryMetrics(DEBT_CATEGORY_GROUPS.creditCard, []);
    expect(cards.find((c) => c.key === "leftToGo").value).toBe(0);
    expect(cards.find((c) => c.key === "active").value).toBe(0);
  });
});
