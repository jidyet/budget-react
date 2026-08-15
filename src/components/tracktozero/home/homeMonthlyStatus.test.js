import { describe, expect, it } from "vitest";
import { deriveCurrentPlanPeriodStatus, PERIOD_STATES } from "./homeMonthlyStatus.js";

const snapshot = (overrides = {}) => ({
  asOf: "2026-08-15T00:00:00.000Z",
  targetDebt: {
    id: "d1",
    name: "Chase Freedom",
    minimumRequiredPayment: 80,
  },
  latestSnapshotsByDebt: {
    d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" },
  },
  paymentEventsByDebt: { d1: [] },
  expectedCheckpoints: [{ period: "Aug 2026", expectedPayment: 100, expectedTotalBalance: 500 }],
  activeContext: {
    version: {
      id: "v1",
      asOf: "2026-08-01T00:00:00.000Z",
      extraMonthlyPayment: 100,
    },
  },
  ...overrides,
});

describe("homeMonthlyStatus", () => {
  it("uses an intentional no-plan state", () => {
    const result = deriveCurrentPlanPeriodStatus({ asOf: "2026-08-15T00:00:00.000Z", activeContext: { version: null } });
    expect(result.state).toBe(PERIOD_STATES.no_plan);
    expect(result.headline).toBe("No payoff target yet.");
  });

  it("shows not-recorded when nothing has been logged this period", () => {
    const result = deriveCurrentPlanPeriodStatus(snapshot());
    expect(result.state).toBe(PERIOD_STATES.not_recorded);
    expect(result.recordedAmount).toBe(0);
    expect(result.plannedAmount).toBe(180);
  });

  it("REGRESSION: actually finds this period's checkpoint (period is the engine's real 'Mon YYYY' label, not 'YYYY-MM') and uses its expectedPayment over the plan's flat extra when they differ", () => {
    const result = deriveCurrentPlanPeriodStatus(snapshot({
      expectedCheckpoints: [{ period: "Aug 2026", expectedPayment: 250, expectedTotalBalance: 500 }],
      activeContext: { version: { id: "v1", asOf: "2026-08-01T00:00:00.000Z", extraMonthlyPayment: 100 } },
    }));
    // requiredPayment (80) + checkpoint's own expectedPayment (250), not the
    // plan's flat extraMonthlyPayment (100) - proves the checkpoint for
    // this exact period was actually found, not silently missed.
    expect(result.plannedAmount).toBe(330);
  });

  it("shows payment recorded without lowering confirmed debt by itself", () => {
    const result = deriveCurrentPlanPeriodStatus(snapshot({
      paymentEventsByDebt: {
        d1: [{ amount: 180, paidAt: "2026-08-10T00:00:00.000Z" }],
      },
      latestSnapshotsByDebt: {
        d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" },
      },
    }));
    expect(result.state).toBe(PERIOD_STATES.recorded);
    expect(result.recordedAmount).toBe(180);
    expect(result.balanceRefreshNeeded).toBe(true);
  });

  it("ignores prior-period payments when computing this month's status", () => {
    const result = deriveCurrentPlanPeriodStatus(snapshot({
      paymentEventsByDebt: {
        d1: [{ amount: 180, paidAt: "2026-07-10T00:00:00.000Z" }],
      },
    }));
    expect(result.state).toBe(PERIOD_STATES.not_recorded);
    expect(result.recordedAmount).toBe(0);
  });

  it("accumulates multiple same-period events truthfully", () => {
    const result = deriveCurrentPlanPeriodStatus(snapshot({
      paymentEventsByDebt: {
        d1: [
          { amount: 80, paidAt: "2026-08-02T00:00:00.000Z" },
          { amount: 100, paidAt: "2026-08-12T00:00:00.000Z" },
        ],
      },
      latestSnapshotsByDebt: {
        d1: { balance: 470, observedAt: "2026-08-20T00:00:00.000Z" },
      },
    }));
    expect(result.state).toBe(PERIOD_STATES.recorded);
    expect(result.recordedAmount).toBe(180);
    expect(result.balanceRefreshNeeded).toBe(false);
  });
});
