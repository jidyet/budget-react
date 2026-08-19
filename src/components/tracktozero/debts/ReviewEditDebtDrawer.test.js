import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewEditDebtDrawer from "./ReviewEditDebtDrawer.jsx";

const render = (element) => renderToStaticMarkup(element);

const debt = (overrides = {}) => ({
  id: "d1",
  name: "Capital One Card",
  debtType: "credit_card",
  currentBalance: 2400,
  minimumRequiredPayment: 85,
  requiredPaymentSource: "statement_confirmed",
  aprStatus: "known",
  apr: 0.2499,
  estimatedNextMinimumPayment: 90,
  dueDay: 18,
  ownerLabel: "You",
  includedInCorePayoffPlan: true,
  ...overrides,
});

const snapshot = (overrides = {}) => ({
  workspace: { id: "w1", type: "personal" },
  debts: [debt()],
  latestSnapshotsByDebt: {},
  paymentEventsByDebt: {},
  people: [],
  ...overrides,
});

const baseProps = {
  open: true,
  onClose: () => {},
  service: {},
  refresh: async () => {},
  runAction: async (name, cb) => cb(),
  writeState: { inProgress: false, action: "" },
  canManage: true,
  canObserve: true,
  initialSection: "payment",
};

describe("DEBT-PAY: ReviewEditDebtDrawer payment section (GATE-10B.1C restructure)", () => {
  it("DEBT-PAY-13: shows clearly labeled Current balance / Current minimum due / Estimated next minimum rows", () => {
    const html = render(h(ReviewEditDebtDrawer, { ...baseProps, debt: debt(), snapshot: snapshot() }));
    expect(html).toContain("Current balance");
    expect(html).toContain("Current minimum due");
    expect(html).toContain("Estimated next minimum");
    expect(html).toContain("$85.00");
    expect(html).toContain("~$90.00");
  });

  it("DEBT-PAY-14: includes a Payment date input, defaulting to today - a genuinely new field wired to the existing paidAt param", () => {
    const html = render(h(ReviewEditDebtDrawer, { ...baseProps, debt: debt(), snapshot: snapshot() }));
    expect(html).toContain("Payment date");
    expect(html).toMatch(/type="date"/);
  });

  it("DEBT-PAY-15: labels the amount field 'Actual payment (optional)', distinct from the required minimum", () => {
    const html = render(h(ReviewEditDebtDrawer, { ...baseProps, debt: debt(), snapshot: snapshot() }));
    expect(html).toContain("Actual payment (optional)");
  });

  it("DEBT-PAY-16: shows 'not set'/'Unknown' rather than a fabricated $0 when the minimum or estimate is missing", () => {
    const html = render(h(ReviewEditDebtDrawer, {
      ...baseProps,
      debt: debt({ minimumRequiredPayment: null, estimatedNextMinimumPayment: null }),
      snapshot: snapshot({ debts: [debt({ minimumRequiredPayment: null, estimatedNextMinimumPayment: null })] }),
    }));
    expect(html).toContain("Not set");
    expect(html).toContain("Unknown");
    expect(html).not.toMatch(/Current minimum due[\s\S]{0,40}\$0\.00/);
  });

  it("DEBT-PAY-17: the owner/due-day header line renders a real resolved owner, never a raw junk label", () => {
    const html = render(h(ReviewEditDebtDrawer, { ...baseProps, debt: debt({ ownerLabel: "You" }), snapshot: snapshot() }));
    expect(html).toContain("You");
    expect(html).toContain("Due day 18");
  });

  it("DEBT-PAY-18: Save payment is disabled with no amount entered - never submits an implicit $0 payment", () => {
    const html = render(h(ReviewEditDebtDrawer, { ...baseProps, debt: debt(), snapshot: snapshot() }));
    const buttonMatch = html.match(/<button[^>]*>Save payment<\/button>/);
    expect(buttonMatch).toBeTruthy();
    expect(buttonMatch[0]).toContain("disabled");
  });
});
