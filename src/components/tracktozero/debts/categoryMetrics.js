import { DEBT_CATEGORY_GROUPS } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { resolveDebtBalance } from "./debtExplorerView.js";

// GATE-10B.1C: category-detail metric cards, tailored per debt-type group
// but built ONLY from fields that genuinely exist on the Debt entity today
// (balance, minimumRequiredPayment, apr/aprStatus, dueDay). There is no
// creditLimit (or any other type-specific) field persisted on Debt - it
// only ever exists transiently in the statement-import extraction pipeline
// - so a "credit utilization" or similar metric is never fabricated here.
// A metric with no real backing data is simply omitted from the returned
// list, never rendered as a misleading $0/0%.

const money = (value) => Math.max(0, Number(value || 0));

const summarize = (debts, latestSnapshotsByDebt) => {
  const leftToGo = debts.reduce((sum, debt) => sum + resolveDebtBalance(debt, latestSnapshotsByDebt), 0);
  const known = debts.filter((debt) => debt.minimumRequiredPayment != null);
  const monthlyMinDue = known.reduce((sum, debt) => sum + Number(debt.minimumRequiredPayment || 0), 0);
  const monthlyMinDueUnknownCount = debts.length - known.length;
  const knownAprs = debts.filter((debt) => debt.aprStatus && debt.aprStatus !== "unknown").map((debt) => Number(debt.apr || 0));
  const highestApr = knownAprs.length ? Math.max(...knownAprs) : null;
  const avgApr = knownAprs.length ? knownAprs.reduce((sum, apr) => sum + apr, 0) / knownAprs.length : null;
  return { leftToGo: money(leftToGo), activeCount: debts.length, monthlyMinDue: money(monthlyMinDue), monthlyMinDueUnknownCount, highestApr, avgApr };
};

// deriveCategoryMetrics(group, debts, { latestSnapshotsByDebt }) -> ordered
// list of { key, label, value, format: "money"|"percent"|"count", supporting }
// `debts` should already be the category-scoped, active (not-paid-off) set -
// the same baseline the page's own header total uses.
export const deriveCategoryMetrics = (group, debts = [], { latestSnapshotsByDebt = {} } = {}) => {
  const s = summarize(debts, latestSnapshotsByDebt);
  const cards = [
    { key: "leftToGo", label: "Left to go", value: s.leftToGo, format: "money" },
    { key: "active", label: "Active accounts", value: s.activeCount, format: "count" },
  ];

  if (group === DEBT_CATEGORY_GROUPS.creditCard || group === DEBT_CATEGORY_GROUPS.lineOfCredit) {
    cards.push({
      key: "monthlyMinDue",
      label: "Monthly min. due",
      value: s.monthlyMinDue,
      format: "money",
      supporting: s.monthlyMinDueUnknownCount > 0 ? `${s.monthlyMinDueUnknownCount} need${s.monthlyMinDueUnknownCount === 1 ? "s" : ""} review` : "All known",
    });
    if (s.highestApr != null) cards.push({ key: "highestApr", label: "Highest APR", value: s.highestApr, format: "percent" });
  } else if (group === DEBT_CATEGORY_GROUPS.studentLoan || group === DEBT_CATEGORY_GROUPS.autoLoan || group === DEBT_CATEGORY_GROUPS.personalLoan) {
    cards.push({
      key: "monthlyMinDue",
      label: "Monthly min. due",
      value: s.monthlyMinDue,
      format: "money",
      supporting: s.monthlyMinDueUnknownCount > 0 ? `${s.monthlyMinDueUnknownCount} need${s.monthlyMinDueUnknownCount === 1 ? "s" : ""} review` : "All known",
    });
    if (s.avgApr != null) cards.push({ key: "avgApr", label: "Average APR", value: s.avgApr, format: "percent" });
  } else if (group === DEBT_CATEGORY_GROUPS.mortgageOrHomeLoan) {
    cards.push({
      key: "requiredPayment",
      label: "Required payment",
      value: s.monthlyMinDue,
      format: "money",
      supporting: s.monthlyMinDueUnknownCount > 0 ? `${s.monthlyMinDueUnknownCount} need${s.monthlyMinDueUnknownCount === 1 ? "s" : ""} review` : "All known",
    });
    if (s.avgApr != null) cards.push({ key: "rate", label: "Rate", value: s.avgApr, format: "percent" });
  } else {
    cards.push({
      key: "monthlyMinDue",
      label: "Monthly min. due",
      value: s.monthlyMinDue,
      format: "money",
      supporting: s.monthlyMinDueUnknownCount > 0 ? `${s.monthlyMinDueUnknownCount} need${s.monthlyMinDueUnknownCount === 1 ? "s" : ""} review` : "All known",
    });
    if (s.highestApr != null) cards.push({ key: "highestApr", label: "Highest APR", value: s.highestApr, format: "percent" });
  }

  return cards;
};
