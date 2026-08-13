import { describe, expect, it } from "vitest";
import {
  buildProjectionWithWarnings,
  classifyPlanStatus,
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
