import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PayoffOrderTable, { PayoffOrderMobileList } from "./PayoffOrderTable.jsx";

const render = (element) => renderToStaticMarkup(element);

const debt = (overrides = {}) => ({
  id: "d1", name: "Chase Credit Card", currentBalance: 4100, apr: 0.2799, aprStatus: "known",
  ownerId: "u1", ownerLabel: "Kristina", ...overrides,
});

describe("GATE-10B.1E: PayoffOrderTable", () => {
  it("keeps desktop payoff columns readable instead of compressing them", () => {
    const html = render(h(PayoffOrderTable, { debts: [debt()], isHousehold: true, showMomentum: true }));
    expect(html).toContain("ttz-payoff-order-table-wrap");
    expect(html).toContain("<colgroup>");
  });

  it("shows an honest empty message when there are no debts", () => {
    const html = render(h(PayoffOrderTable, { debts: [] }));
    expect(html).toContain("No debts included");
  });

  it("renders one row per debt with balance and APR", () => {
    const html = render(h(PayoffOrderTable, { debts: [debt(), debt({ id: "d2", name: "Old Store Card", currentBalance: 930, apr: null, aprStatus: "unknown" })] }));
    expect(html).toContain("4,100.00");
    expect(html).toContain("930.00");
    expect(html).toContain("Unknown APR");
  });

  it("shows real per-debt payoff timing only when perDebt data is supplied, never fabricating one", () => {
    const withoutTiming = render(h(PayoffOrderTable, { debts: [debt()] }));
    expect(withoutTiming).toMatch(/>-</);

    const withTiming = render(h(PayoffOrderTable, { debts: [debt()], perDebt: { d1: { payoffMonth: "Mar 2028" } } }));
    expect(withTiming).toContain("Mar 2028");
  });

  it("omits the owner column when not a household workspace", () => {
    const html = render(h(PayoffOrderTable, { debts: [debt()], isHousehold: false }));
    expect(html).not.toContain("Owner");
  });

  it("shows the owner column and badge for a household workspace", () => {
    const html = render(h(PayoffOrderTable, { debts: [debt()], isHousehold: true }));
    expect(html).toContain("Owner");
  });

  it("omits the momentum column by default, shows it only when showMomentum is true", () => {
    const withoutMomentum = render(h(PayoffOrderTable, { debts: [debt(), debt({ id: "d2", name: "Old Store Card" })] }));
    expect(withoutMomentum).not.toContain("Momentum");

    const withMomentum = render(h(PayoffOrderTable, { debts: [debt(), debt({ id: "d2", name: "Old Store Card" })], showMomentum: true }));
    expect(withMomentum).toContain("Momentum");
    expect(withMomentum).toContain('aria-label="Payoff position 1 of 2"');
  });

  it("renders a phone-friendly payoff list rather than a compressed financial table", () => {
    const html = render(h(PayoffOrderMobileList, {
      debts: [debt(), debt({ id: "d2", name: "Old Store Card", currentBalance: 930 })],
      isHousehold: true,
      highlightFirst: true,
      perDebt: { d1: { payoffMonth: "Mar 2028" } },
      showPayoffTiming: true,
      showMomentum: true,
    }));
    expect(html).not.toContain("<table");
    expect(html).toContain('aria-label="Payoff order"');
    expect(html).toContain("Balance");
    expect(html).toContain("Payoff");
    expect(html).toContain("Momentum");
    expect(html).toContain("Mar 2028");
  });
});
