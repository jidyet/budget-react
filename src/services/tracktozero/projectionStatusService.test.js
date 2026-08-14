import { describe, expect, it } from "vitest";
import {
  buildProjectionWithWarnings,
  classifyPlanStatus,
  derivePlanHealth,
  evaluateProjectionWarnings,
  getEligiblePlanDebts,
  TRACKTOZERO_STATUS_THRESHOLDS,
} from "./projectionStatusService";

const asOf = "2026-08-13T12:00:00.000Z";
const debt = (overrides = {}) => ({
  id: "d1",
  workspaceId: "w1",
  name: "Card",
  status: "active",
  debtType: "credit_card",
  currentBalance: 1000,
  startingBalance: 1000,
  aprStatus: "known",
  apr: 0.2,
  minimumRequiredPayment: 100,
  includedInCorePayoffPlan: true,
  createdAt: asOf,
  createdBy: "u1",
  ...overrides,
});
const version = {
  id: "v1",
  planId: "p1",
  workspaceId: "w1",
  versionNumber: 1,
  strategy: "avalanche",
  asOf,
  startingDebtSnapshot: [{ debtId: "d1", includedInCorePayoffPlan: true }],
  extraMonthlyPayment: 0,
  createdAt: asOf,
  createdBy: "u1",
  createdBecause: "activation",
};
const checkpoint = (expectedTotalBalance) => ({
  id: "c1",
  workspaceId: "w1",
  planId: "p1",
  planVersionId: "v1",
  period: "2026-08",
  expectedTotalBalance,
});
const snapshot = (balance, observedAt = asOf) => ({ debtId: "d1", balance, observedAt });

describe("TrackToZero v2 projection trust layer", () => {
  it("adds warning metadata without changing the Phase 1 projection result shape", () => {
    const inputDebt = debt({ aprStatus: "unknown", apr: null });
    const before = structuredClone(inputDebt);
    const result = buildProjectionWithWarnings({
      debts: [inputDebt],
      planVersion: version,
      startMonth: 8,
      startYear: 2026,
    });

    expect(inputDebt).toEqual(before);
    expect(Array.isArray(result.projection)).toBe(true);
    expect(result.projection[0]).not.toHaveProperty("warnings");
    expect(result.warnings.map((warning) => warning.code)).toContain("unknown_apr");
  });

  it("detects missing minimums and projection caps in wrapper warnings", () => {
    const result = buildProjectionWithWarnings({
      debts: [debt({ minimumRequiredPayment: 0, apr: 0.6 })],
      planVersion: version,
      startMonth: 8,
      startYear: 2026,
      maxMonths: 2,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      "missing_minimum_payment",
      "projection_capped",
    ]));
  });
});

describe("TrackToZero v2 directional status", () => {
  it("classifies ahead, on-track, behind, and review with centralized thresholds", () => {
    expect(TRACKTOZERO_STATUS_THRESHOLDS.staleBalanceDays).toBeGreaterThan(0);
    const common = { debts: [debt()], planVersion: version, expectedCheckpoints: [checkpoint(1000)], asOf };

    expect(classifyPlanStatus({ ...common, latestSnapshotsByDebt: { d1: snapshot(900) } }).code).toBe("ahead");
    expect(classifyPlanStatus({ ...common, latestSnapshotsByDebt: { d1: snapshot(990) } }).code).toBe("on_track");
    expect(classifyPlanStatus({ ...common, latestSnapshotsByDebt: { d1: snapshot(1060) } }).code).toBe("slightly_behind");
    expect(classifyPlanStatus({ ...common, latestSnapshotsByDebt: { d1: snapshot(1200) } }).code).toBe("needs_review");
  });

  it("does not call missing or stale balance information on track", () => {
    const common = { debts: [debt()], planVersion: version, expectedCheckpoints: [checkpoint(1000)], asOf };
    expect(classifyPlanStatus({ ...common, latestSnapshotsByDebt: {} }).code).toBe("needs_balance_update");
    expect(classifyPlanStatus({
      ...common,
      latestSnapshotsByDebt: { d1: snapshot(1000, "2026-01-01T00:00:00.000Z") },
    }).code).toBe("needs_balance_update");
  });
});

describe("UX-0: needs-review debts do not silently drive the active plan", () => {
  it("REPRODUCTION: a contaminated minimum payment (APR became minimum payment) is excluded from the simulation and flagged explicitly", () => {
    const contaminated = debt({ id: "d2", name: "Firstmark", currentBalance: 34233.67, aprStatus: "known", apr: 0.0674, minimumRequiredPayment: 6.74 });
    const clean = debt({ id: "d1", currentBalance: 1000, minimumRequiredPayment: 100 });
    const versionWithBoth = { ...version, startingDebtSnapshot: [{ debtId: "d1", includedInCorePayoffPlan: true }, { debtId: "d2", includedInCorePayoffPlan: true }] };

    const eligible = getEligiblePlanDebts([clean, contaminated], versionWithBoth);
    expect(eligible.map((d) => d.id)).toEqual(["d1"]);

    const result = buildProjectionWithWarnings({ debts: [clean, contaminated], planVersion: versionWithBoth, startMonth: 8, startYear: 2026 });
    expect(result.warnings.some((w) => w.code === "needs_review_excluded" && w.debtId === "d2")).toBe(true);
    // The contaminated debt's real $34,233.67 balance must never enter the
    // simulation's starting total via the excluded debt.
    expect(result.projection[0]?.remaining_debt).toBeLessThan(2000);
  });

  it("REPRODUCTION: an unresolved (failed-import) balance is excluded from the simulation the same way", () => {
    const unresolved = debt({ id: "d2", name: "Chase", currentBalance: 0, balanceStatus: "unresolved", minimumRequiredPayment: 0 });
    const clean = debt({ id: "d1", currentBalance: 1000, minimumRequiredPayment: 100 });
    const versionWithBoth = { ...version, startingDebtSnapshot: [{ debtId: "d1", includedInCorePayoffPlan: true }, { debtId: "d2", includedInCorePayoffPlan: true }] };

    const eligible = getEligiblePlanDebts([clean, unresolved], versionWithBoth);
    expect(eligible.map((d) => d.id)).toEqual(["d1"]);

    const result = buildProjectionWithWarnings({ debts: [clean, unresolved], planVersion: versionWithBoth, startMonth: 8, startYear: 2026 });
    expect(result.warnings.some((w) => w.code === "needs_review_excluded" && w.debtId === "d2")).toBe(true);
  });

  it("a genuinely confirmed $0 (paid off) debt is not flagged needs-review and is simply excluded by having nothing left to pay", () => {
    const paidOff = debt({ id: "d2", currentBalance: 0, balanceStatus: "confirmed", minimumRequiredPayment: 0 });
    expect(getEligiblePlanDebts([paidOff], { ...version, startingDebtSnapshot: [{ debtId: "d2", includedInCorePayoffPlan: true }] }).map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("UX-0: fresh plan / insufficient observed history (Part 11)", () => {
  it("REPRODUCTION: a plan whose only recorded snapshot is the opening one returns insufficient_data, never ahead/on_track/behind", () => {
    const freshDebt = debt({ openingBalanceSnapshotId: "opening-d1" });
    const openingSnapshot = { debtId: "d1", id: "opening-d1", balance: 1000, observedAt: asOf };
    const result = classifyPlanStatus({
      debts: [freshDebt],
      planVersion: version,
      expectedCheckpoints: [checkpoint(1000)],
      latestSnapshotsByDebt: { d1: openingSnapshot },
      asOf,
    });
    expect(result.code).toBe("insufficient_data");
  });

  it("once a REAL balance confirmation is recorded (a different snapshot than the opening one), status is derived normally", () => {
    const freshDebt = debt({ openingBalanceSnapshotId: "opening-d1" });
    const realSnapshot = { debtId: "d1", id: "confirm-1", balance: 900, observedAt: asOf };
    const result = classifyPlanStatus({
      debts: [freshDebt],
      planVersion: version,
      expectedCheckpoints: [checkpoint(1000)],
      latestSnapshotsByDebt: { d1: realSnapshot },
      asOf,
    });
    expect(result.code).toBe("ahead");
  });
});

describe("UX-0: derivePlanHealth - THE single shared Home/Plan status derivation (Part 9-10)", () => {
  it("REPRODUCTION: a critical projection warning (balance grows instead of shrinking) overrides an otherwise-positive balance-delta status", () => {
    const common = { debts: [debt()], planVersion: version, expectedCheckpoints: [checkpoint(1000)], asOf };
    const positiveBase = classifyPlanStatus({ ...common, latestSnapshotsByDebt: { d1: { debtId: "d1", id: "confirm-1", balance: 900, observedAt: asOf } } });
    expect(positiveBase.code).toBe("ahead"); // sanity: the raw balance-delta status alone WOULD look positive

    const health = derivePlanHealth({
      ...common,
      latestSnapshotsByDebt: { d1: { debtId: "d1", id: "confirm-1", balance: 900, observedAt: asOf } },
      projectionWarnings: [{ code: "negative_amortization", debtId: "", severity: "critical", message: "The projected balance grows instead of shrinking." }],
    });
    expect(health.code).toBe("critical");
    expect(health.code).not.toBe("ahead");
  });

  it("with no critical warnings, derivePlanHealth matches classifyPlanStatus exactly", () => {
    const common = { debts: [debt()], planVersion: version, expectedCheckpoints: [checkpoint(1000)], latestSnapshotsByDebt: { d1: { debtId: "d1", id: "confirm-1", balance: 900, observedAt: asOf } }, asOf };
    const base = classifyPlanStatus(common);
    const health = derivePlanHealth({ ...common, projectionWarnings: [{ code: "unknown_apr", debtId: "d1", severity: "warning", message: "x" }] });
    expect(health.code).toBe(base.code);
  });

  it("a critical warning never overrides an informational state (insufficient_data, needs_balance_update) - there is nothing positive to contradict", () => {
    const health = derivePlanHealth({
      debts: [debt()],
      planVersion: version,
      expectedCheckpoints: [checkpoint(1000)],
      latestSnapshotsByDebt: {},
      asOf,
      projectionWarnings: [{ code: "negative_amortization", debtId: "", severity: "critical", message: "x" }],
    });
    expect(health.code).toBe("needs_balance_update");
  });
});

describe("UX-0: a confirmed-paid-off debt does not generate a noisy unknown-APR warning", () => {
  it("skips the unknown_apr warning for a confirmed $0 debt, but still generates it for a real unknown-APR debt with a balance", () => {
    const paidOff = debt({ id: "d2", currentBalance: 0, balanceStatus: "confirmed", aprStatus: "unknown", apr: null, minimumRequiredPayment: 0 });
    const owed = debt({ id: "d1", aprStatus: "unknown", apr: null });
    const versionWithBoth = { ...version, startingDebtSnapshot: [{ debtId: "d1", includedInCorePayoffPlan: true }, { debtId: "d2", includedInCorePayoffPlan: true }] };
    const warnings = evaluateProjectionWarnings({ debts: [owed, paidOff], planVersion: versionWithBoth, projectionRows: [] });
    expect(warnings.some((w) => w.code === "unknown_apr" && w.debtId === "d2")).toBe(false);
    expect(warnings.some((w) => w.code === "unknown_apr" && w.debtId === "d1")).toBe(true);
  });
});
