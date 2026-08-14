import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, formatShortDate } from "./formatting.js";

describe("formatMoney", () => {
  it("formats a positive amount as USD currency", () => {
    expect(formatMoney(34233.67)).toBe("$34,233.67");
  });
  it("treats a missing/null value as $0.00, never blank", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });
});

describe("formatPercent", () => {
  it("formats a decimal APR as a percentage", () => {
    expect(formatPercent(0.2699)).toBe("26.99% APR");
  });
  it("never silently shows 0% for an unknown APR", () => {
    expect(formatPercent(null)).toBe("Unknown APR");
  });
});

describe("formatShortDate", () => {
  it("formats a full ISO date as 'Mon D'", () => {
    expect(formatShortDate("2026-08-21")).toBe("Aug 21");
  });
  it("formats a month-key as 'Mon YYYY'", () => {
    expect(formatShortDate("2046-07")).toBe("Jul 2046");
  });
  it("returns an empty string for a missing value, never inventing a date", () => {
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate("")).toBe("");
  });
});
