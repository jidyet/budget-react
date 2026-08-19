import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UpcomingPaymentsCard from "./UpcomingPaymentsCard.jsx";
import { PAYMENT_TIMING_STATUS } from "../../../domain/tracktozero/paymentTiming.js";

const render = (element) => renderToStaticMarkup(element);

const entry = (overrides = {}) => ({
  debt: { id: "d1", name: "Capital One Card", debtType: "credit_card", ...overrides.debt },
  timing: { status: PAYMENT_TIMING_STATUS.dueDatePassed },
  label: "Due date passed - confirm",
  minimumRequiredPayment: 85,
  ...overrides,
});

const homeContext = (entries) => ({
  isHousehold: false,
  upcomingPayments: {
    entries,
    count: entries.length,
    knownAmountCount: entries.filter((e) => e.minimumRequiredPayment != null).length,
    unknownAmountCount: entries.filter((e) => e.minimumRequiredPayment == null).length,
    totalKnownAmount: entries.reduce((sum, e) => sum + (e.minimumRequiredPayment || 0), 0),
  },
});

const paymentActions = { service: {}, workspaceId: "w1", refresh: async () => {}, runAction: async (name, cb) => cb(), canObserve: true };

describe("HOME-PAY: UpcomingPaymentsCard mark-as-paid gating (GATE-10B.1C)", () => {
  it("HOME-PAY-01: shows 'Mark as paid' (not 'Record payment') when the minimum is known and the actor can observe", () => {
    const html = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry()]), ...paymentActions }));
    expect(html).toContain("Mark as paid");
    expect(html).not.toContain("Record payment");
  });

  it("HOME-PAY-02: falls back to 'Record payment' when the minimum required payment is unknown - never pre-fills a fabricated amount", () => {
    const html = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry({ minimumRequiredPayment: null })]), ...paymentActions }));
    expect(html).toContain("Record payment");
    expect(html).not.toContain("Mark as paid");
  });

  it("HOME-PAY-03: Viewer safety - 'Mark as paid' never renders when canObserve is false, falls back to 'Record payment'", () => {
    const html = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry()]), ...paymentActions, canObserve: false }));
    expect(html).not.toContain("Mark as paid");
    expect(html).toContain("Record payment");
  });

  it("HOME-PAY-04: 'Mark as paid' never renders when the service/workspaceId/runAction wiring is missing (defensive - no partial action)", () => {
    const html = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry()]) }));
    expect(html).not.toContain("Mark as paid");
    expect(html).toContain("Record payment");
  });

  it("HOME-PAY-05: shows exactly the disclosed minimum amount next to the row, never a $0 placeholder for an unknown minimum", () => {
    const known = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry({ minimumRequiredPayment: 85 })]), ...paymentActions }));
    expect(known).toContain("$85.00 required");
    const unknown = render(h(UpcomingPaymentsCard, { homeContext: homeContext([entry({ minimumRequiredPayment: null })]), ...paymentActions }));
    expect(unknown).toContain("Required amount needs review");
    expect(unknown).not.toMatch(/\$0\.00 required/);
  });

  it("HOME-PAY-06: renders nothing when there is no upcomingPayments context (defensive)", () => {
    const html = render(h(UpcomingPaymentsCard, { homeContext: {}, ...paymentActions }));
    expect(html).toBe("");
  });
});
