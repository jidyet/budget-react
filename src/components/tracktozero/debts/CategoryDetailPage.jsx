import React, { useMemo, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FilterChip from "../ui/FilterChip.jsx";
import Select from "../ui/Select.jsx";
import Field from "../ui/Field.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Badge from "../ui/Badge.jsx";
import DebtBadges from "./DebtBadges.jsx";
import ScopeSelector from "./ScopeSelector.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import FilterSheet from "../layout/FilterSheet.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { categoryConfigForSlug } from "./debtCategoryConfig.js";
import { disambiguationSuffixForDebt } from "../../../domain/tracktozero/ownership.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";
import { derivePaymentTiming, paymentTimingLabel, PAYMENT_TIMING_STATUS } from "../../../domain/tracktozero/paymentTiming.js";
import { useIsTablet } from "../useViewport.js";
import {
  applyDebtExplorerFilters,
  BALANCE_RANGE_OPTIONS,
  DEBT_EXPLORER_SORTS,
  DUE_TIMING_FILTER_OPTIONS,
  groupDebtsByLender,
  groupDebtsByOwner,
  resolveDebtBalance,
  scopeToCategory,
  sortDebtExplorerDebts,
} from "./debtExplorerView.js";

// BETA-3: same tone convention as Home's UpcomingPaymentsCard - never a
// tone that could read as an accusation ("past due" styling) for the
// deliberately neutral due_date_passed status.
const DUE_TIMING_TONE = {
  [PAYMENT_TIMING_STATUS.dueDatePassed]: "warning",
  [PAYMENT_TIMING_STATUS.dueToday]: "danger",
  [PAYMENT_TIMING_STATUS.dueThisWeek]: "info",
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "paid_off", label: "Paid off" },
];

const GROUP_BY_OPTIONS = [
  ["lender", "Lender"],
  ["owner", "Owner"],
  ["none", "None"],
];

const DEFAULT_FILTERS = { statusFilter: "all", planFilter: "all", qualityFilter: "all", lenderFilter: "all", balanceFilter: "all", dueTimingFilter: "all" };

// UX-8.4: a compact account row used INSIDE a lender group - the group
// header already shows the lender's name/logo prominently, so repeating a
// full LenderIdentity block per account here would be redundant clutter.
// Only the information that actually distinguishes this account from its
// lender-mates (owner/last-four via disambiguationSuffixForDebt, balance,
// APR, required payment, due day) plus the existing data-quality badges and
// edit action are shown.
// BETA-3: a compact, restrained due-timing badge - only rendered when the
// debt actually has a dueDay (derivePaymentTiming's no_due_date is never
// shown as a badge, matching the "due date isn't mandatory" precedent
// elsewhere in this file). Text comes straight from paymentTimingLabel, so
// it can never drift into "past due"/"overdue" language.
function DueTimingBadge({ debt, paymentEventsByDebt }) {
  if (debt.dueDay == null) return null;
  const timing = derivePaymentTiming(debt, { paymentEvents: paymentEventsByDebt?.[debt.id] || [] });
  return <Badge tone={DUE_TIMING_TONE[timing.status] || "neutral"}>{paymentTimingLabel(timing)}</Badge>;
}

function LenderGroupAccountRow({ debt, disambiguator, latestSnapshotsByDebt, paymentEventsByDebt, isTarget, isHousehold, onReviewDebt, onRecordPayment }) {
  const palette = ttzPalette;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${palette.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 600 }}>
          {debt.name}{disambiguator ? <span style={{ color: palette.tx2, fontWeight: 500 }}> ({disambiguator})</span> : null}
        </div>
        <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx, margin: "4px 0" }}>
          {money(resolveDebtBalance(debt, latestSnapshotsByDebt))} · {debt.aprStatus === "unknown" ? "APR unknown" : percent(debt.apr)}
        </div>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
          Required payment: {debt.minimumRequiredPayment == null ? "not set" : money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <DebtBadges debt={debt} isTarget={isTarget} isHousehold={isHousehold} />
          <DueTimingBadge debt={debt} paymentEventsByDebt={paymentEventsByDebt} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onRecordPayment ? <Button type="button" size="sm" variant="secondary" onClick={() => onRecordPayment(debt)}>Record payment</Button> : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => onReviewDebt?.(debt)}>Review &amp; edit</Button>
      </div>
    </div>
  );
}

function DebtCard({ debt, disambiguator, latestSnapshotsByDebt, paymentEventsByDebt, isTarget, isHousehold, onReviewDebt, onRecordPayment }) {
  const palette = ttzPalette;
  return (
    <Card variant="default">
      <LenderIdentity
        creditorName={debt.name}
        debtType={debt.debtType}
        lastFour={debt.accountReferenceSafe}
        disambiguator={disambiguator}
        showType
        size="lg"
        layout="column"
      />
      <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx, margin: "10px 0 6px" }}>
        {money(resolveDebtBalance(debt, latestSnapshotsByDebt))} · {debt.aprStatus === "unknown" ? "APR unknown" : percent(debt.apr)}
      </div>
      <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
        {/* UX-9 regression fix: a null minimumRequiredPayment (the correct
            "missing, never fabricated as $0" representation) was rendered
            through money() unconditionally here, silently showing "$0.00" -
            LenderGroupAccountRow right above already null-guards the exact
            same field ("not set"); this brings DebtCard (the ungrouped/
            "None" group-by view) in line with that same, already-established
            contract instead of duplicating a second, diverging pattern. */}
        Required payment: {debt.minimumRequiredPayment == null ? "not set" : money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <DebtBadges debt={debt} isTarget={isTarget} isHousehold={isHousehold} />
        <DueTimingBadge debt={debt} paymentEventsByDebt={paymentEventsByDebt} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {onRecordPayment ? <Button type="button" size="sm" variant="secondary" onClick={() => onRecordPayment(debt)}>Record payment</Button> : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => onReviewDebt?.(debt)}>Review &amp; edit</Button>
      </div>
    </Card>
  );
}

function FilterControls({
  statusFilter, setStatusFilter,
  planFilter, setPlanFilter,
  qualityFilter, setQualityFilter,
  lenderFilter, setLenderFilter,
  balanceFilter, setBalanceFilter,
  dueTimingFilter, setDueTimingFilter,
  groupBy, setGroupBy,
  sort, setSort,
  lenderOptions,
}) {
  return (
    <>
      <div>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginBottom: 6 }}>Status</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
      <Field label="Lender">
        <Select value={lenderFilter} onChange={(event) => setLenderFilter(event.target.value)}>
          <option value="all">All lenders</option>
          {lenderOptions.map(({ lenderId, canonicalName }) => <option key={lenderId} value={lenderId}>{canonicalName}</option>)}
        </Select>
      </Field>
      <Field label="Balance">
        <Select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
          {BALANCE_RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Due date">
        <Select value={dueTimingFilter} onChange={(event) => setDueTimingFilter(event.target.value)}>
          {DUE_TIMING_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Group by">
        <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
          {GROUP_BY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Sort">
        <Select value={sort} onChange={(event) => setSort(event.target.value)}>
          {DEBT_EXPLORER_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
    </>
  );
}

// UX-6.1/UX-8.4: single-category (or, for categorySlug "all", the full
// portfolio) drill-down, now a real Debt Explorer - category -> lender ->
// account hierarchy, with composable filters/sort/grouping on top. Owner
// scope is still the SAME ScopeSelector/state as the portfolio grid (that
// existing control already satisfies "Owner filter" - a second, redundant
// owner dropdown is deliberately not added here).
export default function CategoryDetailPage({ snapshot, portfolio, categorySlug, ownerFilter, onOwnerFilterChange, onBack, people = [], onReviewDebt, onRecordPayment }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [lenderFilter, setLenderFilter] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [dueTimingFilter, setDueTimingFilter] = useState("all");
  const [groupBy, setGroupBy] = useState("lender");
  const [sort, setSort] = useState("payoff_order");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isTablet = useIsTablet();

  const entry = categorySlug === "all" ? null : categoryConfigForSlug(categorySlug);
  const isHousehold = snapshot.workspace?.type === "household";
  const latestSnapshotsByDebt = useMemo(() => snapshot.latestSnapshotsByDebt || {}, [snapshot.latestSnapshotsByDebt]);
  const paymentEventsByDebt = useMemo(() => snapshot.paymentEventsByDebt || {}, [snapshot.paymentEventsByDebt]);

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

  // The category baseline - owner scope + category match only. This is
  // what the header total/count always reflects, regardless of the page's
  // OWN filters below, so the headline number never silently shifts when a
  // user toggles Status/Plan/Data quality/Lender/Balance.
  const categoryScoped = useMemo(
    () => scopeToCategory(allActive, { ownerFilter, categoryEntry: entry }),
    [allActive, ownerFilter, entry]
  );

  const lenderOptions = useMemo(() => {
    const byId = new Map();
    for (const debt of categoryScoped) {
      const identity = getLenderIdentity(debt.name);
      if (identity.matched && !byId.has(identity.lenderId)) byId.set(identity.lenderId, identity.canonicalName);
    }
    return [...byId.entries()].map(([lenderId, canonicalName]) => ({ lenderId, canonicalName })).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }, [categoryScoped]);

  const filtered = useMemo(() => applyDebtExplorerFilters(categoryScoped, {
    statusFilter, planFilter, qualityFilter, lenderFilter, balanceFilter, dueTimingFilter,
    reviewIds, paidOffIds, targetDebtId: snapshot.targetDebt?.id, latestSnapshotsByDebt, paymentEventsByDebt,
  }), [categoryScoped, statusFilter, planFilter, qualityFilter, lenderFilter, balanceFilter, dueTimingFilter, reviewIds, paidOffIds, snapshot.targetDebt, latestSnapshotsByDebt, paymentEventsByDebt]);

  const debts = useMemo(
    () => sortDebtExplorerDebts(filtered, sort, { payoffOrderIndex, latestSnapshotsByDebt, paymentEventsByDebt }),
    [filtered, sort, payoffOrderIndex, latestSnapshotsByDebt, paymentEventsByDebt]
  );

  const categoryTotal = useMemo(() => categoryScoped.reduce((sum, d) => sum + resolveDebtBalance(d, latestSnapshotsByDebt), 0), [categoryScoped, latestSnapshotsByDebt]);
  const filteredTotal = useMemo(() => debts.reduce((sum, d) => sum + resolveDebtBalance(d, latestSnapshotsByDebt), 0), [debts, latestSnapshotsByDebt]);
  const hasActiveFilters = statusFilter !== "all" || planFilter !== "all" || qualityFilter !== "all" || lenderFilter !== "all" || balanceFilter !== "all" || dueTimingFilter !== "all";
  const activeFilterCount = [statusFilter, planFilter, qualityFilter, lenderFilter, balanceFilter, dueTimingFilter].filter((v) => v !== "all").length;

  const clearFilters = () => {
    setStatusFilter(DEFAULT_FILTERS.statusFilter);
    setPlanFilter(DEFAULT_FILTERS.planFilter);
    setQualityFilter(DEFAULT_FILTERS.qualityFilter);
    setLenderFilter(DEFAULT_FILTERS.lenderFilter);
    setBalanceFilter(DEFAULT_FILTERS.balanceFilter);
    setDueTimingFilter(DEFAULT_FILTERS.dueTimingFilter);
  };

  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const palette = ttzPalette;
  const filterProps = {
    statusFilter, setStatusFilter, planFilter, setPlanFilter, qualityFilter, setQualityFilter,
    lenderFilter, setLenderFilter, balanceFilter, setBalanceFilter, dueTimingFilter, setDueTimingFilter,
    groupBy, setGroupBy, sort, setSort, lenderOptions,
  };

  const lenderGroups = groupBy === "lender" ? groupDebtsByLender(debts) : null;
  const ownerGroups = groupBy === "owner" ? groupDebtsByOwner(debts) : null;
  const visibleGroupKeys = groupBy === "lender"
    ? lenderGroups.filter((group) => !group.ungrouped).map((group) => group.lenderId)
    : groupBy === "owner"
      ? ownerGroups.map((group) => group.key)
      : [];
  const allGroupsCollapsed = visibleGroupKeys.length > 0 && visibleGroupKeys.every((key) => collapsedGroups.has(key));
  const expandAll = () => setCollapsedGroups(new Set());
  const collapseAll = () => setCollapsedGroups(new Set(visibleGroupKeys));

  return (
    <div style={{ display: "grid", gap: "var(--ttz-space-5, 24px)" }}>
      <div>
        <Button variant="ghost" onClick={onBack}>← All debts</Button>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 40, height: 4, borderRadius: 3, background: palette.ac, marginBottom: 10 }} />
          <div style={{ ...TYPE_SCALE.pageTitle, color: palette.tx }}>{entry ? entry.label : "All debts"}</div>
          <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 4 }}>
            {money(categoryTotal)} total · {categoryScoped.length} account{categoryScoped.length === 1 ? "" : "s"}
          </div>
          {hasActiveFilters ? (
            <div role="status" aria-live="polite" style={{ ...TYPE_SCALE.supporting, color: palette.ac, marginTop: 2 }}>
              Showing {debts.length} account{debts.length === 1 ? "" : "s"} · {money(filteredTotal)}
            </div>
          ) : null}
        </div>
      </div>

      <ScopeSelector snapshot={snapshot} ownerFilter={ownerFilter} onChange={onOwnerFilterChange} people={people} />

      {isTablet ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => setFilterSheetOpen(true)}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
          {hasActiveFilters ? <Button variant="ghost" onClick={clearFilters}>Clear filters</Button> : null}
          <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filters &amp; sort">
            <FilterControls {...filterProps} />
          </FilterSheet>
        </div>
      ) : (
        <Card variant="default" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <FilterControls {...filterProps} />
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} style={{ alignSelf: "center" }}>Clear filters</Button>
          ) : null}
        </Card>
      )}

      {debts.length === 0 ? (
        <EmptyState
          title="No debts match these filters"
          description="Try clearing a filter or choosing a different owner scope."
          actionLabel={hasActiveFilters ? "Clear filters" : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      ) : groupBy === "none" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
          {debts.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              disambiguator={disambiguationSuffixForDebt(debt, debts, { isHousehold })}
              latestSnapshotsByDebt={latestSnapshotsByDebt}
              paymentEventsByDebt={paymentEventsByDebt}
              isTarget={snapshot.targetDebt?.id === debt.id}
              isHousehold={isHousehold}
              onReviewDebt={onReviewDebt}
              onRecordPayment={onRecordPayment}
            />
          ))}
        </div>
      ) : groupBy === "lender" ? (
        <div style={{ display: "grid", gap: 16 }}>
          {visibleGroupKeys.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" size="sm" variant="ghost" onClick={allGroupsCollapsed ? expandAll : collapseAll}>
                {allGroupsCollapsed ? "Expand all" : "Collapse all"}
              </Button>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
          {lenderGroups.filter((group) => !group.ungrouped).map((group) => {
            const collapsed = collapsedGroups.has(group.lenderId);
            return (
              <Card key={group.lenderId} variant="default">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.lenderId)}
                  aria-expanded={!collapsed}
                  className="ttz-focus-ring"
                  style={{ all: "unset", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", width: "100%", cursor: "pointer", boxSizing: "border-box", gap: 10 }}
                >
                  <LenderIdentity creditorName={group.debts[0].name} size="lg" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ textAlign: "right", minWidth: 0 }}>
                      <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700, overflowWrap: "anywhere" }}>{money(group.total)}</div>
                      <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
                        {group.count} account{group.count === 1 ? "" : "s"}{group.highestKnownApr != null ? ` · Highest APR ${percent(group.highestKnownApr)}` : ""}
                      </div>
                    </div>
                    <Badge tone="neutral">{collapsed ? "Show" : "Hide"}</Badge>
                  </div>
                </button>
                {!collapsed ? (
                  <div style={{ marginTop: 4 }}>
                    {group.debts.map((debt) => (
                      <LenderGroupAccountRow
                        key={debt.id}
                        debt={debt}
                        disambiguator={disambiguationSuffixForDebt(debt, group.debts, { isHousehold })}
                        latestSnapshotsByDebt={latestSnapshotsByDebt}
              paymentEventsByDebt={paymentEventsByDebt}
                        isTarget={snapshot.targetDebt?.id === debt.id}
                        isHousehold={isHousehold}
                        onReviewDebt={onReviewDebt}
                        onRecordPayment={onRecordPayment}
                      />
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
          </div>
          {(() => {
            const ungrouped = lenderGroups.find((group) => group.ungrouped);
            if (!ungrouped) return null;
            return (
              <div style={{ display: "grid", gap: 16 }}>
                {lenderGroups.some((group) => !group.ungrouped) ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Other</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
                  {ungrouped.debts.map((debt) => (
                    <DebtCard
                      key={debt.id}
                      debt={debt}
                      disambiguator={disambiguationSuffixForDebt(debt, debts, { isHousehold })}
                      latestSnapshotsByDebt={latestSnapshotsByDebt}
              paymentEventsByDebt={paymentEventsByDebt}
                      isTarget={snapshot.targetDebt?.id === debt.id}
                      isHousehold={isHousehold}
                      onReviewDebt={onReviewDebt}
                      onRecordPayment={onRecordPayment}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {visibleGroupKeys.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" size="sm" variant="ghost" onClick={allGroupsCollapsed ? expandAll : collapseAll}>
                {allGroupsCollapsed ? "Expand all" : "Collapse all"}
              </Button>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
          {ownerGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <Card key={group.key} variant="default">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsed}
                  className="ttz-focus-ring"
                  style={{ all: "unset", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", width: "100%", cursor: "pointer", boxSizing: "border-box", gap: 10 }}
                >
                  <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, minWidth: 0 }}>{group.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ textAlign: "right", minWidth: 0 }}>
                      <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700, overflowWrap: "anywhere" }}>{money(group.total)}</div>
                      <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{group.count} account{group.count === 1 ? "" : "s"}</div>
                    </div>
                    <Badge tone="neutral">{collapsed ? "Show" : "Hide"}</Badge>
                  </div>
                </button>
                {!collapsed ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--ttz-space-4, 16px)", marginTop: 12 }}>
                    {group.debts.map((debt) => (
                      <DebtCard
                        key={debt.id}
                        debt={debt}
                        disambiguator={disambiguationSuffixForDebt(debt, group.debts, { isHousehold })}
                        latestSnapshotsByDebt={latestSnapshotsByDebt}
              paymentEventsByDebt={paymentEventsByDebt}
                        isTarget={snapshot.targetDebt?.id === debt.id}
                        isHousehold={isHousehold}
                        onReviewDebt={onReviewDebt}
                        onRecordPayment={onRecordPayment}
                      />
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
