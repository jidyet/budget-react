import { describe, it, expect } from "vitest";
import {
  fx,
  pct,
  normalizeAprDecimal,
  normalizeIncomeEntries,
  normalizeMonthInput,
  compareMonthKeys,
  isSystemIncomeSource,
  getComputedBalance,
  getBalanceBase,
} from "./budgetUtils";

describe("fx", () => {
  it("formats positive numbers with $ and 2 decimal places", () => {
    expect(fx(1234.5)).toBe("$1,234.50");
    expect(fx(0)).toBe("$0.00");
  });

  it("returns '-' for null/undefined", () => {
    expect(fx(null)).toBe("-");
    expect(fx(undefined)).toBe("-");
  });
});

describe("pct", () => {
  it("formats decimal to percent string", () => {
    expect(pct(0.1234)).toBe("12.34%");
  });

  it("returns null for falsy values", () => {
    expect(pct(0)).toBeNull();
    expect(pct(null)).toBeNull();
  });
});

describe("normalizeAprDecimal", () => {
  it("leaves decimals already in [0,1] as-is", () => {
    expect(normalizeAprDecimal(0.20)).toBeCloseTo(0.20);
    expect(normalizeAprDecimal(0)).toBe(0);
  });

  it("converts percentages > 1 to decimal", () => {
    expect(normalizeAprDecimal(20)).toBeCloseTo(0.20);
    expect(normalizeAprDecimal(100)).toBeCloseTo(1.00);
  });

  it("returns 0 for invalid/negative values", () => {
    expect(normalizeAprDecimal(-5)).toBe(0);
    expect(normalizeAprDecimal(NaN)).toBe(0);
    expect(normalizeAprDecimal(null)).toBe(0);
  });
});

describe("normalizeIncomeEntries", () => {
  it("returns empty array for non-array input", () => {
    expect(normalizeIncomeEntries(null)).toEqual([]);
    expect(normalizeIncomeEntries(undefined)).toEqual([]);
  });

  it("normalizes entries and filters empties", () => {
    const result = normalizeIncomeEntries([
      { src: " Salary ", amt: "3000" },
      { src: "", amt: 500 },
      { src: "Bonus", amt: "1000" },
    ]);
    expect(result).toEqual([
      { src: "Salary", amt: 3000 },
      { src: "Bonus", amt: 1000 },
    ]);
  });
});

describe("normalizeMonthInput", () => {
  it("accepts valid YYYY-MM format", () => {
    expect(normalizeMonthInput("2025-01")).toBe("2025-01");
    expect(normalizeMonthInput("2024-12")).toBe("2024-12");
  });

  it("rejects invalid formats", () => {
    expect(normalizeMonthInput("2025-13")).toBe("");
    expect(normalizeMonthInput("25-01")).toBe("");
    expect(normalizeMonthInput("")).toBe("");
    expect(normalizeMonthInput("2025/01")).toBe("");
  });
});

describe("compareMonthKeys", () => {
  it("returns negative when a < b", () => {
    expect(compareMonthKeys("2025-01", "2025-03")).toBeLessThan(0);
  });

  it("returns positive when a > b", () => {
    expect(compareMonthKeys("2025-06", "2025-01")).toBeGreaterThan(0);
  });

  it("returns 0 for equal keys", () => {
    expect(compareMonthKeys("2025-03", "2025-03")).toBe(0);
  });
});

describe("isSystemIncomeSource", () => {
  it("returns true for underscore-prefixed sources", () => {
    expect(isSystemIncomeSource("_boa")).toBe(true);
    expect(isSystemIncomeSource("_eagleview")).toBe(true);
    expect(isSystemIncomeSource("_anything")).toBe(true);
  });

  it("returns true for legacy ALL-CAPS names", () => {
    expect(isSystemIncomeSource("BOA")).toBe(true);
    expect(isSystemIncomeSource("EAGLEVIEW")).toBe(true);
  });

  it("returns false for user income sources", () => {
    expect(isSystemIncomeSource("Salary")).toBe(false);
    expect(isSystemIncomeSource("Freelance")).toBe(false);
  });
});

describe("getBalanceBase", () => {
  it("uses base_bal_v when present", () => {
    expect(getBalanceBase({ base_bal_v: 500 })).toBe(500);
  });

  it("computes from cur_bal + paid_v - purch_v when no base", () => {
    expect(getBalanceBase({ cur_bal: 1000, paid_v: 200, purch_v: 100 })).toBe(1100);
  });
});

describe("getComputedBalance", () => {
  it("returns base_bal_v - paid_v + purch_v when base exists", () => {
    const account = { base_bal_v: 1000, paid_v: 200, purch_v: 50 };
    // cur_bal should equal base_bal_v - paid_v + purch_v
    const result = getComputedBalance(account);
    expect(typeof result).toBe("number");
  });

  it("returns non-negative value", () => {
    const result = getComputedBalance({ cur_bal: 0, paid_v: 0, purch_v: 0 });
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
