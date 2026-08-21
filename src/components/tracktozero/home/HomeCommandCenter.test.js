import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeCommandCenter from "./HomeCommandCenter.jsx";

const render = (element) => renderToStaticMarkup(element);

const debt = (overrides = {}) => ({
  id: "d1",
  workspaceId: "w1",
  name: "Chase Freedom",
  currentBalance: 1000,
  balanceStatus: "confirmed",
  aprStatus: "known",
  apr: 0.2099,
  minimumRequiredPayment: 80,
  includedInCorePayoffPlan: true,
  ownerLabel: "Kristina",
  dueDay: 21,
  ...overrides,
});

const startingItem = (debtId, balance) => ({ debtId, balance, includedInCorePayoffPlan: true, debtType: "credit_card" });

const activePlanSnapshot = (overrides = {}) => ({
  asOf: "2026-08-15T00:00:00.000Z",
  workspace: { id: "w1", type: "personal" },
  debts: [debt()],
  includedDebts: [debt()],
  latestSnapshotsByDebt: { d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" } },
  balanceHistoryByDebt: {
    d1: [
      { balance: 1000, observedAt: "2026-07-01T00:00:00.000Z" },
      { balance: 700, observedAt: "2026-07-20T00:00:00.000Z" },
      { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" },
    ],
  },
  activeContext: {
    version: {
      id: "v1",
      startingDebtSnapshot: [startingItem("d1", 1000)],
      strategy: "avalanche",
      extraMonthlyPayment: 100,
      asOf: "2026-07-01T00:00:00.000Z",
    },
  },
  expectedCheckpoints: [
    { period: "2026-08", expectedTotalBalance: 500 },
    { period: "2026-09", expectedTotalBalance: 250 },
    { period: "2026-10", expectedTotalBalance: 0 },
  ],
  portfolioSummary: { totalWorkspaceDebt: 500, includedDebt: 500, excludedDebt: 0 },
  warnings: [],
  status: { code: "on_track", label: "On track", message: "Your actual progress matches the plan." },
  targetDebt: debt(),
  payoffQueue: [debt()],
  projectedZeroDate: "2026-10",
  ...overrides,
});

const noop = () => {};
const baseProps = {
  onGoToPlan: noop,
  onGoToReview: noop,
  onUploadBudget: noop,
  onAddDebt: noop,
  onRecordPayment: noop,
  onViewDetails: noop,
  onSeeOptions: noop,
  onViewMyPlan: noop,
  onCompareStrategies: noop,
  onTryWhatIf: noop,
  onGoToDebts: noop,
};

describe("UX-2.1 Home redesign", () => {
  it("HOME-UI-01: shows the redesigned 4-row layout: next move, active plan, confirmed progress, and your debts", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Your next move");
    expect(html).toContain("Confirmed progress");
    expect(html).toContain("Your plan");
    expect(html).toContain("Your debts");
  });

  it("keeps Next Move truthful and aligned with the active plan target", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).not.toMatch(/Recommended payment/i);
    expect(html).toContain("Chase Freedom");
  });

  it("renders confirmed progress visuals from starting debt vs confirmed remaining debt", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Confirmed reduction");
    expect(html).toContain("$500.00");
    expect(html).toContain("50%");
  });

  it("shows projected $0 with an active plan and does not fake that projection without one", () => {
    const activeHtml = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(activeHtml).toContain("Projected $0");
    expect(activeHtml).toContain("Oct 2026");

    const noPlanHtml = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: {
        workspace: { id: "w1", type: "personal" },
        debts: [debt(), debt({ id: "d2", name: "SoFi", currentBalance: 2500 })],
        includedDebts: [debt(), debt({ id: "d2", name: "SoFi", currentBalance: 2500 })],
        balanceHistoryByDebt: {
          d1: [{ balance: 1000, observedAt: "2026-07-01T00:00:00.000Z" }, { balance: 900, observedAt: "2026-08-01T00:00:00.000Z" }],
          d2: [{ balance: 2500, observedAt: "2026-07-01T00:00:00.000Z" }, { balance: 2400, observedAt: "2026-08-01T00:00:00.000Z" }],
        },
        activeContext: { version: null },
        portfolioSummary: { totalWorkspaceDebt: 3300, includedDebt: 3300, excludedDebt: 0 },
      },
      reviewSnapshot: { openCount: 0, blockingCount: 0 },
    }));
    expect(noPlanHtml).toContain("You have $3,300.00 in confirmed debt.");
    expect(noPlanHtml).toContain("2 active debts");
    expect(noPlanHtml).toContain("Your debt trend");
  });

  it("routes blocking-review into a distinct trust state instead of the normal command center", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 2, actionableCount: 2, blockingCount: 1 },
    }));
    expect(html).toMatch(/can.*fully trust this plan yet/i);
    expect(html).not.toContain("Debt freedom");
    expect(html).not.toContain("Payoff progress");
  });

  it("treats the no-plan state as compare-strategies, not a fake target", () => {
    const snapshot = {
      workspace: { id: "w1", type: "personal" },
      debts: [debt()],
      includedDebts: [debt()],
      activeContext: { version: null },
      portfolioSummary: { totalWorkspaceDebt: 1000, includedDebt: 1000 },
    };
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Your next move");
    expect(html).toContain("Compare Snowball vs Avalanche");
    expect(html).not.toContain("Current target");
  });

  it("treats the no-debt state as focused onboarding, not an empty dashboard", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: { workspace: { type: "personal" }, debts: [], includedDebts: [] }, reviewSnapshot: null }));
    expect(html).toContain("Start your path to $0");
    expect(html).toContain("Add your debts");
  });

  it("celebrates paid-off included debt even if an excluded mortgage still has a balance", () => {
    const mortgage = debt({ id: "m1", name: "Mortgage", currentBalance: 250000, includedInCorePayoffPlan: false });
    const paidCard = debt({ id: "d1", currentBalance: 0 });
    const snapshot = activePlanSnapshot({
      debts: [paidCard, mortgage],
      includedDebts: [paidCard],
      latestSnapshotsByDebt: { d1: { balance: 0, observedAt: "2026-08-01T00:00:00.000Z" } },
      balanceHistoryByDebt: { d1: [{ balance: 200, observedAt: "2026-07-01T00:00:00.000Z" }, { balance: 0, observedAt: "2026-08-01T00:00:00.000Z" }] },
      portfolioSummary: { totalWorkspaceDebt: 250000, includedDebt: 0, excludedDebt: 250000 },
    });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("$0 remaining");
    expect(html).toContain("included debts are paid off");
  });

  it("honestly shows 0% / no confirmed progress when the latest confirmed balance is missing", () => {
    const snapshot = activePlanSnapshot({ latestSnapshotsByDebt: {} });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("0%");
    expect(html).toMatch(/starting point is set/i);
  });

  it("renders household owner breakdown without double-counting joint debt", () => {
    const snapshot = activePlanSnapshot({
      workspace: { id: "household-1", type: "household" },
      portfolioSummary: {
        totalWorkspaceDebt: 23000,
        includedDebt: 23000,
        memberDebt: [
          { uid: "k", displayName: "Kristina", total: 10000, debtCount: 2 },
          { uid: "b", displayName: "Babajide", total: 8000, debtCount: 1 },
        ],
        jointDebt: 5000,
        unassignedDebt: 0,
      },
    });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Debt by owner");
    expect(html).toContain("Kristina");
    expect(html).toContain("Babajide");
    expect(html).toContain("Joint");
    expect(html).toContain("counted once");
  });

  it("shows a purposeful all-unassigned household snapshot instead of a meaningless single bar", () => {
    const snapshot = {
      workspace: { id: "household-1", type: "household" },
      debts: [debt({ id: "d1", ownerLabel: "Unassigned" })],
      includedDebts: [debt({ id: "d1", ownerLabel: "Unassigned" })],
      activeContext: { version: null },
      portfolioSummary: {
        totalWorkspaceDebt: 1000,
        includedDebt: 1000,
        excludedDebt: 0,
        memberDebt: [],
        jointDebt: 0,
        unassignedDebt: 1000,
      },
      balanceHistoryByDebt: {
        d1: [{ balance: 1000, observedAt: "2026-08-01T00:00:00.000Z" }],
      },
    };
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("is currently unassigned");
    expect(html).toContain("Assign debt ownership");
    expect(html).toContain("Review ownership");
  });

  it("keeps PaymentEvent separate from confirmed debt until a balance snapshot arrives", () => {
    const paymentRecorded = activePlanSnapshot({
      paymentEventsByDebt: {
        d1: [{ amount: 180, paidAt: "2026-08-10T00:00:00.000Z" }],
      },
      latestSnapshotsByDebt: { d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" } },
      portfolioSummary: { totalWorkspaceDebt: 500, includedDebt: 500, excludedDebt: 0 },
    });
    const recordedHtml = render(h(HomeCommandCenter, { ...baseProps, snapshot: paymentRecorded, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(recordedHtml).toContain("Record payment");
    expect(recordedHtml).toContain("$500.00");

    const balanceUpdated = activePlanSnapshot({
      paymentEventsByDebt: {
        d1: [{ amount: 180, paidAt: "2026-08-10T00:00:00.000Z" }],
      },
      latestSnapshotsByDebt: { d1: { balance: 400, observedAt: "2026-08-20T00:00:00.000Z" } },
      balanceHistoryByDebt: {
        d1: [
          { balance: 1000, observedAt: "2026-07-01T00:00:00.000Z" },
          { balance: 700, observedAt: "2026-07-20T00:00:00.000Z" },
          { balance: 400, observedAt: "2026-08-20T00:00:00.000Z" },
        ],
      },
      portfolioSummary: { totalWorkspaceDebt: 400, includedDebt: 400, excludedDebt: 0 },
    });
    const updatedHtml = render(h(HomeCommandCenter, { ...baseProps, snapshot: balanceUpdated, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(updatedHtml).toContain("$400.00");
    expect(updatedHtml).toContain("$600.00");
  });

  it("keeps critical plans from looking green or healthy", () => {
    const snapshot = activePlanSnapshot({
      warnings: [{ code: "negative_amortization", message: "Your current payment may not reduce one balance." }],
      status: { code: "critical", label: "Plan needs attention", message: "Interest is growing faster than the current payment." },
    });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Plan needs attention");
    expect(html).toContain("Your current payment may not reduce one balance.");
    expect(html).not.toContain("On track");
  });

  it("GATE-10B.1C: keeps Try What If reachable from the active plan card (consolidated off Home's own What If card)", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 0, blockingCount: 0 },
      onPreviewScenario: noop,
    }));
    expect(html).toContain("Try What If");
  });
});

describe("UX-8.1: Home money typography handles the full realistic range without throwing", () => {
  // Each case drives progress.openingBalance/latestBalance/eliminated and the
  // primary "debt remaining" figure through a real, differently-scaled debt -
  // proves the tabular-nums/body-font/clamp() treatment (HomeCommandCenter's
  // responsiveMetricValueStyle/responsiveHeroValueStyle/moneySmStyle) renders
  // every amount from $0 up through seven figures without an exception, and
  // that formatMoney's exact output text is present (never truncated/NaN).
  const amounts = [0, 999.99, 17434.45, 999999.99, 1234567.89];

  for (const opening of amounts) {
    it(`renders cleanly with a starting balance of ${opening}`, () => {
      const latest = opening > 0 ? Math.round(opening * 0.6 * 100) / 100 : 0;
      const snapshot = activePlanSnapshot({
        debts: [debt({ currentBalance: opening })],
        includedDebts: [debt({ currentBalance: opening })],
        latestSnapshotsByDebt: { d1: { balance: latest, observedAt: "2026-08-01T00:00:00.000Z" } },
        activeContext: {
          version: {
            id: "v1",
            startingDebtSnapshot: [startingItem("d1", opening)],
            strategy: "avalanche",
            extraMonthlyPayment: 100,
            asOf: "2026-07-01T00:00:00.000Z",
          },
        },
        portfolioSummary: { totalWorkspaceDebt: opening, includedDebt: opening, excludedDebt: 0 },
      });
      const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
      const expectedOpening = opening.toLocaleString("en-US", { style: "currency", currency: "USD" });
      const expectedLatest = latest.toLocaleString("en-US", { style: "currency", currency: "USD" });
      expect(html).toContain(expectedOpening);
      expect(html).toContain(expectedLatest);
      // Never falls back to a raw/NaN/undefined render for any of these amounts.
      expect(html).not.toMatch(/NaN|undefined|\[object/);
    });
  }
});
