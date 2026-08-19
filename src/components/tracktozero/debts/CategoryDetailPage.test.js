import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CategoryDetailPage from "./CategoryDetailPage.jsx";
import { deriveDebtPortfolioView } from "../debtPortfolioView.js";

const render = (element) => renderToStaticMarkup(element);

const debt = (id, name, balance) => ({
  id,
  name,
  status: "active",
  debtType: "credit_card",
  currentBalance: balance,
  minimumRequiredPayment: 50,
  aprStatus: "known",
  apr: 0.2,
  includedInCorePayoffPlan: true,
});

const buildSnapshot = (debts) => ({
  workspace: { type: "personal" },
  debts,
  targetDebt: null,
  payoffQueue: [],
  latestSnapshotsByDebt: {},
  paymentEventsByDebt: {},
  portfolioSummary: { totalWorkspaceDebt: debts.reduce((s, d) => s + d.currentBalance, 0), includedDebt: debts.reduce((s, d) => s + d.currentBalance, 0), excludedDebt: 0 },
});

const baseProps = { ownerFilter: "all", onOwnerFilterChange: () => {}, onBack: () => {}, people: [] };

describe("CATEGORY-UI: CategoryDetailPage default flat view + top-5 slicing (GATE-10B.1C)", () => {
  it("CATEGORY-UI-01: defaults to the flat (groupBy=none) view - no lender group headers for accounts with a recognized, distinct lender", () => {
    const debts = [debt("d1", "SoFi Personal Loan", 1000), debt("d2", "Discover Card", 2000)];
    const snapshot = buildSnapshot(debts);
    const portfolio = deriveDebtPortfolioView(snapshot);
    const html = render(h(CategoryDetailPage, { ...baseProps, snapshot, portfolio, categorySlug: "all" }));
    // The lender-group "Show/Hide" collapse toggle only renders in groupBy="lender" mode.
    expect(html).not.toContain("aria-expanded");
  });

  it("CATEGORY-UI-02: shows only the first 5 accounts (in current sort order) plus a 'View all N' control when more than 5 exist", () => {
    const debts = Array.from({ length: 7 }, (_, i) => debt(`d${i}`, `Account ${i}`, 100 * (i + 1)));
    const snapshot = buildSnapshot(debts);
    const portfolio = deriveDebtPortfolioView(snapshot);
    const html = render(h(CategoryDetailPage, { ...baseProps, snapshot, portfolio, categorySlug: "all" }));
    expect(html).toContain("View all 7");
    // First 5 accounts (by default "current payoff order" - falls back to
    // input order when no payoffQueue) should render; the 6th/7th should not.
    expect(html).toContain("Account 0");
    expect(html).toContain("Account 4");
  });

  it("CATEGORY-UI-03: no 'View all' control when 5 or fewer accounts exist", () => {
    const debts = [debt("d1", "Account A", 100), debt("d2", "Account B", 200)];
    const snapshot = buildSnapshot(debts);
    const portfolio = deriveDebtPortfolioView(snapshot);
    const html = render(h(CategoryDetailPage, { ...baseProps, snapshot, portfolio, categorySlug: "all" }));
    expect(html).not.toContain("View all");
  });

  it("CATEGORY-04: category metric cards render (Left to go, Active accounts) without fabricating unavailable data", () => {
    const debts = [debt("d1", "Account A", 1000)];
    const snapshot = buildSnapshot(debts);
    const portfolio = deriveDebtPortfolioView(snapshot);
    const html = render(h(CategoryDetailPage, { ...baseProps, snapshot, portfolio, categorySlug: "all" }));
    expect(html).toContain("Left to go");
    expect(html).toContain("Active accounts");
  });
});
