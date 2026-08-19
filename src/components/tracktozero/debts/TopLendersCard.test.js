import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TopLendersCard from "./TopLendersCard.jsx";

const render = (element) => renderToStaticMarkup(element);

const debt = (id, name, balance) => ({ id, name, currentBalance: balance, debtType: "credit_card" });

describe("DEBTS-UI: TopLendersCard (GATE-10B.1C)", () => {
  it("DEBTS-UI-06: renders nothing when there are no recognized lenders", () => {
    const html = render(h(TopLendersCard, { debts: [debt("d1", "Some Unmatched Lender LLC", 100)] }));
    expect(html).toBe("");
  });

  it("DEBTS-UI-07: sorts groups by total balance descending, largest lender first", () => {
    const html = render(h(TopLendersCard, {
      debts: [
        debt("d1", "Capital One Card", 500),
        debt("d2", "SoFi Personal Loan", 7800),
        debt("d3", "Chase Freedom", 1200),
      ],
    }));
    const sofiIndex = html.indexOf("SoFi");
    const chaseIndex = html.indexOf("Chase");
    const capitalOneIndex = html.indexOf("Capital One");
    expect(sofiIndex).toBeGreaterThan(-1);
    expect(sofiIndex).toBeLessThan(chaseIndex);
    expect(chaseIndex).toBeLessThan(capitalOneIndex);
  });

  it("DEBTS-UI-08: shows only the top 5 lenders with a 'View all N accounts' control when more than 5 exist", () => {
    // Distinct debt names alone would collapse under one lender if they
    // shared a recognized lender (groupDebtsByLender groups by lenderId, not
    // by name) - 6 genuinely distinct recognized lenders instead give 6
    // separate groups.
    const distinctLenderNames = ["Capital One", "SoFi", "Chase", "Discover", "American Express", "Citi"];
    const manyLenderDebts = distinctLenderNames.map((name, i) => debt(`d${i}`, name, 100 * (i + 1)));
    const html = render(h(TopLendersCard, { debts: manyLenderDebts }));
    expect(html).toContain("View all 6 accounts");
  });

  it("DEBTS-UI-09: no 'View all' control when 5 or fewer recognized lenders exist", () => {
    const html = render(h(TopLendersCard, {
      debts: [debt("d1", "Capital One Card", 500), debt("d2", "SoFi Personal Loan", 300)],
    }));
    expect(html).not.toContain("View all");
  });
});
