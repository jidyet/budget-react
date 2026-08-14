import React, { useState } from "react";
import PageHeader from "../layout/PageHeader.jsx";
import SectionHeader from "../layout/SectionHeader.jsx";
import FilterChip from "../ui/FilterChip.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import ReviewCard from "./ReviewCard.jsx";
import ReviewDetail from "./ReviewDetail.jsx";
import ResolvedHistory from "./ResolvedHistory.jsx";
import Button from "../ui/Button.jsx";
import { REVIEW_FILTERS, getReviewCenterSummary } from "../../../services/tracktozero/reviewCopy.js";
import { sortOpenReviewItems } from "../../../services/tracktozero/reviewDomain.js";

// The dedicated Needs Review destination (REVIEW-1B Part 5). Reads counts
// and items only from REVIEW-1A's shared selectors (via reviewSnapshot,
// computed once in TrackToZeroV2App.jsx) - never recomputes them here.
export default function ReviewCenter({ snapshot, service, workspaceId, reviewSnapshot, loadingReview, onRefreshReview }) {
  const [filter, setFilter] = useState("all");
  const [activeItemId, setActiveItemId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [toast, setToast] = useState("");

  const openItems = sortOpenReviewItems(reviewSnapshot?.openItems || []);
  const resolvedItems = reviewSnapshot?.resolvedItems || [];
  const openCount = reviewSnapshot?.openCount ?? openItems.length;
  const blockingCount = reviewSnapshot?.blockingCount ?? 0;
  const activeItem = openItems.find((item) => item.id === activeItemId) || null;
  const isHousehold = snapshot.workspace.type === "household";

  const visibleFilters = REVIEW_FILTERS.filter(
    (entry) => entry.key === "all" || openItems.some((item) => entry.types.some((type) => item.types.includes(type)))
  );
  const filteredItems = filter === "all"
    ? openItems
    : openItems.filter((item) => REVIEW_FILTERS.find((entry) => entry.key === filter)?.types.some((type) => item.types.includes(type)));

  const summary = getReviewCenterSummary({ openCount, blockingCount });

  const handleResolved = async (message) => {
    setActiveItemId(null);
    setToast(message);
    await onRefreshReview();
  };

  return (
    <>
      <PageHeader
        title="Needs Review"
        description="TrackToZero found a few things it doesn't want to guess about."
      />
      {toast ? (
        <InfoCallout style={{ marginBottom: 16 }} title={toast} />
      ) : null}

      {loadingReview ? (
        <LoadingState label="Loading reviews" />
      ) : (
        <>
          <SectionHeader title={Array.isArray(summary) ? summary[0] : summary} description={Array.isArray(summary) ? summary.slice(1).join(" · ") : undefined} />

          {openItems.length ? (
            <>
              <div role="group" aria-label="Filter reviews" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {visibleFilters.map((entry) => (
                  <FilterChip key={entry.key} active={filter === entry.key} onClick={() => setFilter(entry.key)}>
                    {entry.label}
                  </FilterChip>
                ))}
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {filteredItems.map((item) => (
                  <ReviewCard key={item.id} item={item} isHousehold={isHousehold} onOpen={(next) => setActiveItemId(next.id)} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="You're all caught up." description="Nothing needs a second look right now." />
          )}

          <div style={{ marginTop: 32 }}>
            <SectionHeader
              eyebrow="History"
              title="Resolved"
              actions={<Button size="sm" variant="ghost" onClick={() => setShowResolved((value) => !value)}>{showResolved ? "Hide" : "Show"}</Button>}
            />
            {showResolved ? <ResolvedHistory items={resolvedItems} /> : null}
          </div>
        </>
      )}

      <ReviewDetail
        item={activeItem}
        open={!!activeItem}
        onClose={() => setActiveItemId(null)}
        workspaceId={workspaceId}
        workspace={snapshot.workspace}
        members={snapshot.members}
        debts={snapshot.debts}
        latestSnapshotsByDebt={snapshot.latestSnapshotsByDebt}
        service={service}
        onResolved={handleResolved}
      />
    </>
  );
}
