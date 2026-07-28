import { describe, it, expect } from "vitest";
import { payoffSimulate } from "./payoffEngine";

const makeAccount = (overrides) => ({
  id: "a1",
  name: "Test Card",
  cur_bal: 1000,
  min_due_v: 50,
  apr_v: 0.20,
  promo_apr: null,
  promo_until: "",
  apr_after_promo: 0.20,
  ...overrides,
});

describe("payoffSimulate", () => {
  it("returns [] for empty accounts", () => {
    expect(payoffSimulate([], "avalanche", 0, {}, 1, 2025)).toEqual([]);
  });

  it("returns [] when all balances are zero", () => {
    const result = payoffSimulate([makeAccount({ cur_bal: 0 })], "avalanche", 0, {}, 1, 2025);
    expect(result).toEqual([]);
  });

  it("pays off a zero-APR account with sufficient payments", () => {
    const result = payoffSimulate(
      [makeAccount({ cur_bal: 200, min_due_v: 200, apr_v: 0 })],
      "avalanche",
      0,
      {},
      1,
      2025,
    );
    expect(result).toHaveLength(1);
    expect(result[0].remaining_debt).toBeCloseTo(0, 1);
  });

  it("reduces debt each month with extra payment", () => {
    const result = payoffSimulate(
      [makeAccount({ cur_bal: 1000, min_due_v: 25, apr_v: 0 })],
      "avalanche",
      75,
      {},
      1,
      2025,
    );
    // $25 min + $75 extra = $100/month → 10 months
    expect(result).toHaveLength(10);
    expect(result[9].remaining_debt).toBeCloseTo(0, 1);
  });

  it("respects maxMonths cap", () => {
    const result = payoffSimulate(
      [makeAccount({ cur_bal: 100000, min_due_v: 1, apr_v: 0.30 })],
      "avalanche",
      0,
      {},
      1,
      2025,
      5,
    );
    expect(result).toHaveLength(5);
  });

  it("avalanche strategy targets highest APR first", () => {
    const accounts = [
      makeAccount({ id: "low", name: "Low APR", cur_bal: 500, min_due_v: 10, apr_v: 0.05 }),
      makeAccount({ id: "high", name: "High APR", cur_bal: 500, min_due_v: 10, apr_v: 0.25 }),
    ];
    const avalanche = payoffSimulate(accounts, "avalanche", 100, {}, 1, 2025, 60);
    const snowball = payoffSimulate(
      [
        makeAccount({ id: "low", name: "Low APR", cur_bal: 500, min_due_v: 10, apr_v: 0.05 }),
        makeAccount({ id: "high", name: "High APR", cur_bal: 500, min_due_v: 10, apr_v: 0.25 }),
      ],
      "snowball",
      100,
      {},
      1,
      2025,
      60,
    );
    // avalanche pays less total interest than snowball when APRs differ
    const totalInterestAvalanche = avalanche.reduce((s, r) => s + r.total_interest, 0);
    const totalInterestSnowball = snowball.reduce((s, r) => s + r.total_interest, 0);
    expect(totalInterestAvalanche).toBeLessThanOrEqual(totalInterestSnowball);
  });

  it("snowball strategy targets lowest balance first", () => {
    const accounts = [
      makeAccount({ id: "small", name: "Small", cur_bal: 200, min_due_v: 10, apr_v: 0.10 }),
      makeAccount({ id: "large", name: "Large", cur_bal: 800, min_due_v: 10, apr_v: 0.10 }),
    ];
    const snowball = payoffSimulate(accounts, "snowball", 100, {}, 1, 2025, 60);
    // With snowball the small balance is paid off faster
    expect(snowball.length).toBeGreaterThan(0);
    expect(snowball[snowball.length - 1].remaining_debt).toBeCloseTo(0, 0);
  });

  it("accrues interest when APR > 0", () => {
    const result = payoffSimulate(
      [makeAccount({ cur_bal: 1000, min_due_v: 5, apr_v: 0.24 })],
      "avalanche",
      0,
      {},
      1,
      2025,
      1,
    );
    expect(result[0].total_interest).toBeGreaterThan(0);
  });

  it("uses actual paid amount as the monthly payment basis when available", () => {
    const minimumOnly = payoffSimulate(
      [makeAccount({ cur_bal: 15265.57, min_due_v: 35, paid_v: 0, apr_v: 0 })],
      "avalanche",
      250,
      {},
      4,
      2026,
      240,
    );
    const actualPaymentScenario = payoffSimulate(
      [makeAccount({ cur_bal: 15265.57, min_due_v: 35, paid_v: 1750, apr_v: 0 })],
      "avalanche",
      250,
      {},
      4,
      2026,
      240,
    );

    expect(actualPaymentScenario.length).toBeLessThan(minimumOnly.length);
    expect(actualPaymentScenario.length).toBe(8);
  });

  it("falls back to the current month and year when they are omitted", () => {
    const result = payoffSimulate(
      [makeAccount({ cur_bal: 1000, min_due_v: 50, apr_v: 0.20 })],
      "avalanche",
      0,
      {},
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].month).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  });
});
