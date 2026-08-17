import React, { useMemo, useState } from "react";
import PageHeader from "../layout/PageHeader.jsx";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { deriveActivityFeed } from "../home/activityFeed.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";

const KIND_LABELS = {
  debt_created: "Debt added",
  balance_snapshot: "Balance confirmed",
  payment_event: "Payment recorded",
  plan_version: "Plan",
};

const PAGE_SIZE = 20;

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
        <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>{entry.dateLabel}</span>
      </div>
      {entry.detail ? <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{entry.detail}</div> : null}
      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>
        Recorded by {entry.actorName}
        {showOwner ? ` · Debt owner: ${entry.ownerName}` : ""}
      </div>
    </div>
  );
}

// The full Activity surface (UX-7's 6th nav destination). Deliberately
// paginated via bounded per-source queries (see v2AsyncApplicationService.js's
// getActivityFeed) rather than one unbounded read - "Load more" asks for a
// deeper, still-bounded page rather than ever scanning full history at once.
export default function ActivityCenter({ page, loading, onLoadMore }) {
  const [loadingMore, setLoadingMore] = useState(false);
  const entries = useMemo(() => {
    if (!page?.records) return [];
    return deriveActivityFeed(page.records, { members: page.members, people: page.people });
  }, [page]);

  const visibleCount = (page?.cursor || 0) + (page?.limit || PAGE_SIZE);
  const visibleEntries = entries.slice(0, visibleCount);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await onLoadMore?.(visibleCount, PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

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
        <Card variant="default" style={{ padding: 24 }}>
          <div>
            {visibleEntries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
          </div>
          {!page?.exhausted ? (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
