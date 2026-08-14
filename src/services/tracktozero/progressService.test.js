import { describe, expect, it } from "vitest";
import { deriveConfirmedProgress, deriveWorkspaceConfirmedProgress } from "./progressService.js";

const debt = (overrides = {}) => ({
  id: "d1",
  startingBalance: 10000,
  currentBalance: 8000,
  balanceStatus: "confirmed",
  ...overrides,
});

describe("deriveConfirmedProgress", () => {
  it("computes eliminated amount from confirmed opening and latest balances", () => {
    const result = deriveConfirmedProgress(debt(), { balance: 8000 });
    expect(result).toEqual({ confirmed: true, openingBalance: 10000, latestConfirmedBalance: 8000, eliminated: 2000 });
  });

  it("falls back to debt.currentBalance when no snapshot object is passed", () => {
    const result = deriveConfirmedProgress(debt({ currentBalance: 7500 }), null);
    expect(result.latestConfirmedBalance).toBe(7500);
    expect(result.eliminated).toBe(2500);
  });

  it("REPRODUCTION: a missing/failed-import balance incorrectly represented as $0 must NOT produce a fake $10,000-eliminated claim", () => {
    const failedImportDebt = debt({ currentBalance: 0, balanceStatus: "unresolved" });
    const result = deriveConfirmedProgress(failedImportDebt, { balance: 0 });
    expect(result.confirmed).toBe(false);
    expect(result.eliminated).toBeNull();
  });

  it("a genuinely confirmed $0 (fully paid off) correctly reports the full opening balance as eliminated", () => {
    const paidOff = debt({ currentBalance: 0, balanceStatus: "confirmed" });
    const result = deriveConfirmedProgress(paidOff, { balance: 0 });
    expect(result.confirmed).toBe(true);
    expect(result.eliminated).toBe(10000);
  });

  it("never reports negative elimination if the balance somehow increased", () => {
    const result = deriveConfirmedProgress(debt({ startingBalance: 1000, currentBalance: 1200 }), { balance: 1200 });
    expect(result.eliminated).toBe(0);
  });
});

describe("deriveWorkspaceConfirmedProgress", () => {
  it("sums eliminated amounts only across confirmed debts, excluding unresolved ones from the total", () => {
    const debts = [
      debt({ id: "d1", startingBalance: 10000, currentBalance: 8000 }),
      debt({ id: "d2", startingBalance: 5000, currentBalance: 5000, balanceStatus: "unresolved" }),
    ];
    const result = deriveWorkspaceConfirmedProgress(debts, {});
    expect(result.eliminated).toBe(2000);
    expect(result.openingBalance).toBe(10000);
    expect(result.unresolvedDebtIds).toEqual(["d2"]);
  });

  it("REPRODUCTION: an unresolved debt's opening balance never leaks into the workspace total as fake progress", () => {
    const debts = [debt({ id: "d1", startingBalance: 10000, currentBalance: 0, balanceStatus: "unresolved" })];
    const result = deriveWorkspaceConfirmedProgress(debts, {});
    expect(result.eliminated).toBe(0);
    expect(result.openingBalance).toBe(0);
    expect(result.unresolvedDebtIds).toEqual(["d1"]);
  });
});
