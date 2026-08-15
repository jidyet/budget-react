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
  ...overrides,
});

const startingItem = (debtId, balance) => ({ debtId, balance, includedInCorePayoffPlan: true, debtType: "credit_card" });

const activePlanSnapshot = (overrides = {}) => ({
  workspace: { type: "personal" },
  debts: [debt()],
  includedDebts: [debt()],
  latestSnapshotsByDebt: { d1: { balance: 500, observedAt: "2026-08-01T00:00:00.000Z" } },
  activeContext: { version: { startingDebtSnapshot: [startingItem("d1", 1000)], strategy: "avalanche", extraMonthlyPayment: 100 } },
  portfolioSummary: { totalWorkspaceDebt: 1000, includedDebt: 1000 },
  warnings: [],
  status: { code: "on_track" },
  targetDebt: debt(),
  payoffQueue: [debt()],
  projectedZeroDate: "2028-01",
  ...overrides,
});

const noop = () => {};
const baseProps = {
  onGoToPlan: noop, onGoToReview: noop, onUploadBudget: noop, onAddDebt: noop,
  onRecordPayment: noop, onViewDetails: noop, onSeeOptions: noop,
};

describe("UX-2 fix 1: no fabricated payment recommendation", () => {
  it("never renders 'Recommended payment' and instead states the truthful focus action", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).not.toMatch(/Recommended payment/i);
    expect(html).toContain("Focus on Chase Freedom next.");
  });
});

describe("UX-2 fix 3: blocking-review is a real, honest Home trust state", () => {
  it("does not render the normal command center (no Zero Day, no momentum claim, no payment recommendation) when a blocking review exists", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 1, blockingCount: 1 },
    }));
    expect(html).not.toMatch(/Recommended payment/i);
    expect(html).not.toMatch(/ZERO DAY/i);
    expect(html).not.toMatch(/YOUR MOMENTUM/i);
    expect(html).toContain("Review them");
    expect(html).toMatch(/fully trust your plan/i);
    expect(html).toMatch(/momentum until these are resolved/i);
  });

  it("labels any still-shown current-truth figures as provisional, not authoritative", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 1, blockingCount: 1 },
    }));
    expect(html).toContain("(provisional)");
  });

  it("a non-blocking open review does not suppress the normal command center", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 1, blockingCount: 0 },
    }));
    expect(html).toMatch(/ZERO DAY/i);
  });
});

describe("UX-2 fix 4: all-paid-off uses included/core payoff truth", () => {
  it("celebrates when included debts are confirmed zero, ignoring an excluded mortgage's real balance", () => {
    const mortgage = debt({ id: "m1", name: "Mortgage", currentBalance: 250000, includedInCorePayoffPlan: false });
    const paidCard = debt({ id: "d1", currentBalance: 0 });
    const snapshot = activePlanSnapshot({ debts: [paidCard, mortgage], includedDebts: [paidCard] });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("YOU HIT $0.");
  });
});

describe("UX-2 fix 2: progress is hidden/falls back honestly when confirmed truth is insufficient", () => {
  it("shows the honest fallback line, never a fabricated percent, when a starting debt has no latest snapshot", () => {
    const snapshot = activePlanSnapshot({ latestSnapshotsByDebt: {} });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Progress starts after your next confirmed balance update.");
    expect(html).not.toMatch(/You're moving/i);
  });

  it("shows real momentum copy once progress is genuinely confirmed and positive", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toMatch(/You.{0,6}re moving/i);
  });
});

describe("UX-2 fix 5: data freshness and read-only What If", () => {
  it("shows a freshness note only when the confirmed data is actually stale", () => {
    const staleSnapshot = activePlanSnapshot({ latestSnapshotsByDebt: { d1: { balance: 500, observedAt: "2020-01-01T00:00:00.000Z" } } });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: staleSnapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toMatch(/Last updated 45\+ days ago/i);
  });

  it("omits the freshness note when data is fresh", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).not.toMatch(/Last updated/i);
  });

  it("What If renders nothing at all when no preview capability is wired up (never fakes availability)", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: activePlanSnapshot(), reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).not.toMatch(/WHAT IF/i);
  });

  it("shows a plain prompt (no numbers) when a preview capability exists but no scenario has been requested yet", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 0, blockingCount: 0 },
      onPreviewScenario: noop,
    }));
    expect(html).toMatch(/WHAT IF/i);
    expect(html).toContain("Try it");
    expect(html).not.toMatch(/Could move Zero Day/i);
  });

  it("shows the real outcome (never fabricated) once scenario truth is actually available", () => {
    const html = render(h(HomeCommandCenter, {
      ...baseProps,
      snapshot: activePlanSnapshot(),
      reviewSnapshot: { openCount: 0, blockingCount: 0 },
      scenario: { monthsSaved: 4, interestSaved: 120.5 },
      onPreviewScenario: noop,
    }));
    expect(html).toMatch(/Could move Zero Day: 4 months sooner/i);
  });
});

describe("UX-2 preserved behavior", () => {
  it("no-debt activation state still renders", () => {
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot: { workspace: { type: "personal" }, debts: [], includedDebts: [] }, reviewSnapshot: null }));
    expect(html).toContain("LET&#x27;S GET YOUR DEBT IN HERE.");
  });

  it("debt/no-plan state still renders", () => {
    const snapshot = { workspace: { type: "personal" }, debts: [debt()], includedDebts: [debt()], activeContext: { version: null }, portfolioSummary: { totalWorkspaceDebt: 1000 } };
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("YOUR DEBT IS IN. NOW LET&#x27;S BUILD THE WAY OUT.");
  });

  it("household breakdown still renders for household workspaces", () => {
    const snapshot = activePlanSnapshot({
      workspace: { type: "household" },
      portfolioSummary: { totalWorkspaceDebt: 1000, includedDebt: 1000, memberDebt: [{ uid: "u1", displayName: "Jay", total: 600, debtCount: 1 }], jointDebt: 400, unassignedDebt: 0 },
    });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toContain("Jay");
    expect(html).toContain("Joint");
  });

  it("critical plan state still renders plan-health warning, not a green success state", () => {
    const snapshot = activePlanSnapshot({ status: { code: "critical" } });
    const html = render(h(HomeCommandCenter, { ...baseProps, snapshot, reviewSnapshot: { openCount: 0, blockingCount: 0 } }));
    expect(html).toMatch(/needs a tweak/i);
  });
});
