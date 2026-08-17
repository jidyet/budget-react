import React, { useMemo, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FilterChip from "../ui/FilterChip.jsx";
import Select from "../ui/Select.jsx";
import Field from "../ui/Field.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import DebtBadges from "./DebtBadges.jsx";
import ScopeSelector from "./ScopeSelector.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { debtCategoryGroupFor } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { filterDebtsByOwnerScope } from "../debtPortfolioView.js";
import { categoryConfigForSlug } from "./debtCategoryConfig.js";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "paid_off", label: "Paid off" },
];

const SORTS = [
  ["payoff_order", "Current payoff order"],
  ["due_date", "Due date"],
  ["apr_desc", "Highest APR"],
  ["balance_asc", "Lowest balance"],
  ["balance_desc", "Highest balance"],
  ["creditor", "Creditor A-Z"],
];

const resolveBalance = (debt, latestSnapshotsByDebt) => Number(latestSnapshotsByDebt?.[debt.id]?.balance ?? debt.currentBalance ?? 0) || 0;

// UX-6.1: single-category (or, for categorySlug "all", the full portfolio)
// drill-down - owner/status/plan/data-quality filters are independent,
// composable controls (cheap array .filter() chains), not an exhaustive
// combination matrix. Owner scope is the SAME ScopeSelector/state as the
// portfolio grid, so switching categories never forces the user to
// re-pick their owner filter (context persists).
export default function CategoryDetailPage({ snapshot, portfolio, categorySlug, ownerFilter, onOwnerFilterChange, onBack, people = [], onReviewDebt }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [sort, setSort] = useState("payoff_order");

  const entry = categorySlug === "all" ? null : categoryConfigForSlug(categorySlug);
  const isHousehold = snapshot.workspace?.type === "household";
  const latestSnapshotsByDebt = useMemo(() => snapshot.latestSnapshotsByDebt || {}, [snapshot.latestSnapshotsByDebt]);

  const allActive = useMemo(
    () => [...portfolio.activeDebts, ...portfolio.reviewDebts, ...portfolio.paidOffDebts],
    [portfolio]
  );
  const reviewIds = useMemo(() => new Set(portfolio.reviewDebts.map((d) => d.id)), [portfolio]);
  const paidOffIds = useMemo(() => new Set(portfolio.paidOffDebts.map((d) => d.id)), [portfolio]);
  const payoffOrderIndex = useMemo(() => {
    const map = new Map();
    (snapshot.payoffQueue || []).forEach((debt, index) => map.set(debt.id, index));
    return map;
  }, [snapshot.payoffQueue]);

  const debts = useMemo(() => {
    let list = filterDebtsByOwnerScope(allActive, ownerFilter);
    if (entry) list = list.filter((debt) => debtCategoryGroupFor(debt.debtType) === entry.group);
    if (statusFilter === "needs_attention") list = list.filter((debt) => reviewIds.has(debt.id));
    if (statusFilter === "paid_off") list = list.filter((debt) => paidOffIds.has(debt.id));
    if (planFilter === "included") list = list.filter((debt) => debt.includedInCorePayoffPlan !== false);
    if (planFilter === "not_included") list = list.filter((debt) => debt.includedInCorePayoffPlan === false);
    if (planFilter === "current_target") list = list.filter((debt) => debt.id === snapshot.targetDebt?.id);
    if (qualityFilter === "missing_apr") list = list.filter((debt) => debt.aprStatus === "unknown");
    if (qualityFilter === "missing_minimum") list = list.filter((debt) => debt.minimumRequiredPayment == null || Number(debt.minimumRequiredPayment) <= 0);
    if (qualityFilter === "needs_review") list = list.filter((debt) => reviewIds.has(debt.id));

    const sorted = [...list];
    if (sort === "payoff_order") {
      sorted.sort((a, b) => (payoffOrderIndex.has(a.id) ? payoffOrderIndex.get(a.id) : Infinity) - (payoffOrderIndex.has(b.id) ? payoffOrderIndex.get(b.id) : Infinity));
    } else if (sort === "due_date") {
      sorted.sort((a, b) => (a.dueDay ?? Infinity) - (b.dueDay ?? Infinity));
    } else if (sort === "apr_desc") {
      sorted.sort((a, b) => (b.aprStatus === "unknown" ? -1 : Number(b.apr || 0)) - (a.aprStatus === "unknown" ? -1 : Number(a.apr || 0)));
    } else if (sort === "balance_asc") {
      sorted.sort((a, b) => resolveBalance(a, latestSnapshotsByDebt) - resolveBalance(b, latestSnapshotsByDebt));
    } else if (sort === "balance_desc") {
      sorted.sort((a, b) => resolveBalance(b, latestSnapshotsByDebt) - resolveBalance(a, latestSnapshotsByDebt));
    } else if (sort === "creditor") {
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    return sorted;
  }, [allActive, ownerFilter, entry, statusFilter, planFilter, qualityFilter, sort, reviewIds, paidOffIds, payoffOrderIndex, latestSnapshotsByDebt, snapshot.targetDebt]);

  const totalBalance = debts.reduce((sum, debt) => sum + resolveBalance(debt, latestSnapshotsByDebt), 0);
  const palette = ttzPalette;

  return (
    <div style={{ display: "grid", gap: "var(--ttz-space-5, 24px)" }}>
      <div>
        <Button variant="ghost" onClick={onBack}>← All debts</Button>
        <div style={{ marginTop: 8 }}>
          <div style={{ ...TYPE_SCALE.pageTitle, color: palette.tx }}>{entry ? entry.label : "All debts"}</div>
          <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 4 }}>
            {money(totalBalance)} · {debts.length} account{debts.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <ScopeSelector snapshot={snapshot} ownerFilter={ownerFilter} onChange={onOwnerFilterChange} people={people} />

      <Card variant="default" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
        <div>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginBottom: 6 }}>Status</div>
          <div style={{ display: "flex", gap: 6 }}>
            {STATUS_FILTERS.map((option) => (
              <FilterChip key={option.key} active={statusFilter === option.key} onClick={() => setStatusFilter(option.key)}>{option.label}</FilterChip>
            ))}
          </div>
        </div>
        <Field label="Plan">
          <Select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="included">Included in plan</option>
            <option value="not_included">Not included</option>
            <option value="current_target">Current target</option>
          </Select>
        </Field>
        <Field label="Data quality">
          <Select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="missing_apr">Missing APR</option>
            <option value="missing_minimum">Missing minimum</option>
            <option value="needs_review">Needs review</option>
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </Card>

      {debts.length === 0 ? (
        <EmptyState title="No debts match these filters" description="Try clearing a filter or choosing a different owner scope." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
          {debts.map((debt) => (
            <Card key={debt.id} variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{debt.name}</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx, margin: "6px 0" }}>
                {money(resolveBalance(debt, latestSnapshotsByDebt))} · {debt.aprStatus === "unknown" ? "APR unknown" : percent(debt.apr)}
              </div>
              <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
                Required payment: {money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}
              </div>
              <DebtBadges debt={debt} isTarget={snapshot.targetDebt?.id === debt.id} isHousehold={isHousehold} />
              <Button type="button" size="sm" variant="ghost" style={{ marginTop: 4 }} onClick={() => onReviewDebt?.(debt)}>Review & edit</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
