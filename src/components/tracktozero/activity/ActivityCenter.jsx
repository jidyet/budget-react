import React, { useMemo, useState } from "react";
import PageHeader from "../layout/PageHeader.jsx";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import FilterSheet from "../layout/FilterSheet.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import {
  ACTIVITY_DATE_RANGE_OPTIONS,
  ACTIVITY_EVENT_TYPE_OPTIONS,
  deriveActivityFeed,
  formatLocalTimeLabel,
  groupActivityEntriesByLocalDay,
  matchesActor,
  matchesDateRange,
  matchesDebt,
  matchesEventType,
  matchesOwnerScope,
} from "../home/activityFeed.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";
import { disambiguationSuffixForDebt, effectiveOwnerType, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";
import { useIsTablet } from "../useViewport.js";

const KIND_LABELS = {
  debt_created: "Debt added",
  balance_snapshot: "Balance confirmed",
  payment_event: "Payment recorded",
  plan_version: "Plan",
};

const PAGE_SIZE = 20;
const DEFAULT_FILTERS = { eventTypeFilter: "all", actorFilter: "all", ownerFilter: "all", debtFilter: "all", dateRangeFilter: "all" };

function ActivityRow({ entry }) {
  const showOwner = entry.ownerName && entry.ownerName !== entry.actorName;
  return (
    <div style={{ display: "grid", gap: 4, padding: "14px 0", borderBottom: `1px solid ${ttzPalette.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {entry.debtName ? <LenderIdentity creditorName={entry.debtName} size="sm" showName={false} /> : null}
          <Badge tone="neutral">{KIND_LABELS[entry.kind] || "Update"}</Badge>
          <span style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 600 }}>{entry.title}</span>
        </div>
        <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>{formatLocalTimeLabel(entry.at)}</span>
      </div>
      {entry.detail ? <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{entry.detail}</div> : null}
      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>
        Recorded by {entry.actorName}
        {showOwner ? ` · Debt owner: ${entry.ownerName}` : ""}
      </div>
    </div>
  );
}

function FilterControls({
  eventTypeFilter, setEventTypeFilter,
  actorFilter, setActorFilter,
  ownerFilter, setOwnerFilter,
  debtFilter, setDebtFilter,
  dateRangeFilter, setDateRangeFilter,
  sortOrder, setSortOrder,
  actorOptions, ownerOptions, debtOptions,
}) {
  return (
    <>
      <Field label="Event type">
        <Select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)}>
          {ACTIVITY_EVENT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      {actorOptions.length > 1 ? (
        <Field label="Actor">
          <Select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
            <option value="all">Anyone</option>
            {actorOptions.map(({ uid, label }) => <option key={uid} value={uid}>{label}</option>)}
          </Select>
        </Field>
      ) : null}
      {ownerOptions.length ? (
        <Field label="Debt owner">
          <Select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All debt owners</option>
            {ownerOptions.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
      ) : null}
      <Field label="Debt">
        <Select value={debtFilter} onChange={(event) => setDebtFilter(event.target.value)}>
          <option value="all">All debts</option>
          {debtOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Date range">
        <Select value={dateRangeFilter} onChange={(event) => setDateRangeFilter(event.target.value)}>
          {ACTIVITY_DATE_RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Sort">
        <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </Field>
    </>
  );
}

// The full Activity surface (UX-7's 6th nav destination), now a real
// Activity Explorer - day-grouped by default, with event-type/actor/owner/
// debt/date filtering and newest/oldest sort. Deliberately paginated via
// bounded per-source queries (see v2AsyncApplicationService.js's
// getActivityFeed) rather than one unbounded read - "Load more" asks for a
// deeper, still-bounded page rather than ever scanning full history at
// once, and is completely unaffected by the filters below: they operate
// only on whatever page is already loaded, exactly like before.
export default function ActivityCenter({ page, loading, onLoadMore, workspace }) {
  const isHousehold = workspace?.type === "household";
  const [loadingMore, setLoadingMore] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [debtFilter, setDebtFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isTablet = useIsTablet();

  const entries = useMemo(() => {
    if (!page?.records) return [];
    return deriveActivityFeed(page.records, { members: page.members, people: page.people });
  }, [page]);

  const visibleCount = (page?.cursor || 0) + (page?.limit || PAGE_SIZE);
  const visibleEntries = entries.slice(0, visibleCount);

  // Actor options: verified authenticated workspace members only - never a
  // pending invite, never a financial profile (which has no login and can
  // never actually be the uid that performed a write).
  const actorOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const member of page?.members || []) {
      if (member.status && member.status !== "active") continue;
      if (seen.has(member.uid)) continue;
      seen.add(member.uid);
      options.push({ uid: member.uid, label: member.displayName || member.uid });
    }
    return options;
  }, [page]);

  // Owner options: the same real ownership identity every other screen
  // uses (member/person/joint/unassigned) - built from the workspace's
  // actual debts, not guessed from whichever entries happen to be loaded.
  const ownerOptions = useMemo(() => {
    const byKey = new Map();
    for (const debt of page?.records?.debts || []) {
      const type = effectiveOwnerType(debt);
      const key = (type === "member" || type === "person") ? debt.ownerId : type;
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { key, label: presentedOwnerLabel(debt) });
    }
    return [...byKey.values()];
  }, [page]);

  const debtOptions = useMemo(() => {
    const debts = page?.records?.debts || [];
    return debts.map((debt) => {
      const identity = getLenderIdentity(debt.name);
      const disambiguator = disambiguationSuffixForDebt(debt, debts, { isHousehold });
      return { id: debt.id, label: `${identity.canonicalName}${disambiguator ? ` (${disambiguator})` : ""}` };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [page, isHousehold]);

  const hasActiveFilters = eventTypeFilter !== "all" || actorFilter !== "all" || ownerFilter !== "all" || debtFilter !== "all" || dateRangeFilter !== "all";
  const activeFilterCount = [eventTypeFilter, actorFilter, ownerFilter, debtFilter, dateRangeFilter].filter((v) => v !== "all").length;

  const filteredEntries = useMemo(() => visibleEntries.filter((entry) =>
    matchesEventType(entry, eventTypeFilter)
    && matchesActor(entry, actorFilter)
    && matchesOwnerScope(entry, ownerFilter)
    && matchesDebt(entry, debtFilter)
    && matchesDateRange(entry, dateRangeFilter)
  ), [visibleEntries, eventTypeFilter, actorFilter, ownerFilter, debtFilter, dateRangeFilter]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => sortOrder === "oldest" ? new Date(a.at).getTime() - new Date(b.at).getTime() : new Date(b.at).getTime() - new Date(a.at).getTime());
    return sorted;
  }, [filteredEntries, sortOrder]);

  const dayGroups = useMemo(() => groupActivityEntriesByLocalDay(sortedEntries), [sortedEntries]);

  const clearFilters = () => {
    setEventTypeFilter(DEFAULT_FILTERS.eventTypeFilter);
    setActorFilter(DEFAULT_FILTERS.actorFilter);
    setOwnerFilter(DEFAULT_FILTERS.ownerFilter);
    setDebtFilter(DEFAULT_FILTERS.debtFilter);
    setDateRangeFilter(DEFAULT_FILTERS.dateRangeFilter);
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await onLoadMore?.(visibleCount, PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  const filterProps = { eventTypeFilter, setEventTypeFilter, actorFilter, setActorFilter, ownerFilter, setOwnerFilter, debtFilter, setDebtFilter, dateRangeFilter, setDateRangeFilter, sortOrder, setSortOrder, actorOptions, ownerOptions, debtOptions };

  return (
    <main>
      <PageHeader title="Activity" description="A history of what actually happened - confirmed balances, recorded payments, and plan changes." />

      {loading ? <LoadingState label="Loading activity" /> : null}

      {!loading && !visibleEntries.length ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Once you add debts, confirm balances, record payments, or activate a plan, that history will show up here."
        />
      ) : null}

      {visibleEntries.length ? (
        <div style={{ display: "grid", gap: 16 }}>
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

          {hasActiveFilters ? (
            <div role="status" aria-live="polite" style={{ ...TYPE_SCALE.supporting, color: ttzPalette.ac }}>
              Showing {sortedEntries.length} of {visibleEntries.length} event{visibleEntries.length === 1 ? "" : "s"}
            </div>
          ) : null}

          {sortedEntries.length === 0 ? (
            <EmptyState title="No activity matches these filters" description="Try clearing a filter or choosing a different date range." actionLabel="Clear filters" onAction={clearFilters} />
          ) : (
            <Card variant="default" style={{ padding: 24 }}>
              {dayGroups.map((group) => (
                <div key={group.dayKey} style={{ marginBottom: 12 }}>
                  <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted, margin: "12px 0 4px" }}>
                    {group.dayLabel.toUpperCase()} · {group.entries.length} event{group.entries.length === 1 ? "" : "s"}
                  </div>
                  {group.entries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
                </div>
              ))}
              {!page?.exhausted ? (
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : null}
    </main>
  );
}
