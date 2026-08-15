import React, { useState } from "react";
import PageHeader from "../layout/PageHeader.jsx";
import SectionHeader from "../layout/SectionHeader.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import ConfirmationDialog from "../ui/ConfirmationDialog.jsx";
import ReviewSessionCard from "./ReviewSessionCard.jsx";
import ReviewDetail from "./ReviewDetail.jsx";
import ResolvedHistory from "./ResolvedHistory.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import {
  FRIENDLY_SAVE_FAILURE,
  getReviewCenterSummary,
  laterItemBlockingNote,
  laterSectionHint,
  laterSectionTitle,
  reviewProgressLabel,
  saveResultSummary,
  saveWhatIKnowLabel,
  skipAllConfirmBody,
  skipAllConfirmTitle,
  skipAllForNowLabel,
  skipAllResultSummary,
} from "../../../services/tracktozero/reviewCopy.js";
import { isDeferred, sortOpenReviewItems } from "../../../services/tracktozero/reviewDomain.js";

// REVIEW-1C: a session-oriented Needs Review experience. The default view
// shows every actionable open item inline with its own staged form
// sections (Part 2) instead of requiring a modal per item. Nothing here
// computes match scores, writes Firestore, or decides idempotency/staleness
// itself (Part 40/42) - staged answers are just plain local state until
// "Save what I know" calls service.saveReviewSession, which is the one
// place that walks REVIEW-1A's already-safe, already-atomic resolution
// primitives one item at a time.
export default function ReviewCenter({ snapshot, service, workspaceId, reviewSnapshot, loadingReview, onRefreshReview }) {
  const palette = ttzPalette;
  const [staged, setStaged] = useState({}); // { [itemId]: { [subtype]: {action,args,label} } }
  const [itemResults, setItemResults] = useState({}); // { [itemId]: {message, tone} }
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");
  const [confirmSkipAll, setConfirmSkipAll] = useState(false);
  const [finishItemId, setFinishItemId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const openItems = sortOpenReviewItems(reviewSnapshot?.openItems || []);
  const resolvedItems = reviewSnapshot?.resolvedItems || [];
  const needsAttentionItems = openItems.filter((item) => !isDeferred(item));
  const laterItems = openItems.filter(isDeferred);
  const openCount = reviewSnapshot?.openCount ?? openItems.length;
  const blockingCount = reviewSnapshot?.blockingCount ?? 0;
  const isHousehold = snapshot.workspace.type === "household";
  const finishItem = laterItems.find((item) => item.id === finishItemId) || null;

  const answeredCount = needsAttentionItems.filter((item) => Object.keys(staged[item.id] || {}).length > 0).length;

  const handleStage = (item, subtype, entry) => {
    setStaged((state) => {
      const forItem = { ...(state[item.id] || {}) };
      if (entry === null) delete forItem[subtype];
      else forItem[subtype] = entry;
      const next = { ...state, [item.id]: forItem };
      if (!Object.keys(forItem).length) delete next[item.id];
      return next;
    });
  };

  const handleLeaveForLater = async (item) => {
    setSaving(true);
    try {
      await service.deferReview(workspaceId, item.importBatchId, item.importCandidateId);
      setStaged((state) => { const next = { ...state }; delete next[item.id]; return next; });
      setItemResults((state) => { const next = { ...state }; delete next[item.id]; return next; });
      await onRefreshReview();
    } catch {
      // Never surface a raw internal error as primary copy (Part 37) - the
      // item just stays where it is, still open, still safe to retry.
      setItemResults((state) => ({ ...state, [item.id]: { message: FRIENDLY_SAVE_FAILURE, tone: "warning" } }));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatIKnow = async () => {
    const flat = [];
    for (const item of needsAttentionItems) {
      const forItem = staged[item.id];
      if (!forItem) continue;
      for (const entry of Object.values(forItem)) {
        flat.push({ itemId: item.id, importBatchId: item.importBatchId, importCandidateId: item.importCandidateId, action: entry.action, args: entry.args });
      }
    }
    if (!flat.length) return;
    setSaving(true);
    try {
      const result = await service.saveReviewSession(workspaceId, flat);
      const nextResults = {};
      for (const entry of result.resolved) nextResults[entry.itemId] = { message: "Saved.", tone: "success" };
      for (const entry of result.stale) nextResults[entry.itemId] = { message: entry.message, tone: "danger" };
      for (const entry of result.failed) nextResults[entry.itemId] = { message: entry.message, tone: "warning" };
      setItemResults(nextResults);
      setStaged((state) => {
        const next = { ...state };
        for (const entry of result.resolved) delete next[entry.itemId];
        return next;
      });
      const distinctResolvedItems = new Set(result.resolved.map((entry) => entry.itemId)).size;
      const stillOpenCount = Math.max(0, needsAttentionItems.length - distinctResolvedItems);
      setSummary(saveResultSummary({ resolvedCount: distinctResolvedItems, staleCount: result.stale.length, failedCount: result.failed.length, stillOpenCount }));
      await onRefreshReview();
    } finally {
      setSaving(false);
    }
  };

  const handleSkipAll = async () => {
    setConfirmSkipAll(false);
    setSaving(true);
    try {
      const result = await service.skipAllOpenReviews(workspaceId);
      setStaged({});
      setItemResults({});
      setSummary(skipAllResultSummary(result.deferredCount));
      await onRefreshReview();
    } finally {
      setSaving(false);
    }
  };

  const overallSummary = getReviewCenterSummary({ openCount, blockingCount });

  return (
    <>
      <PageHeader title="Needs Review" description="TrackToZero found a few things it doesn't want to guess about." />
      {summary ? <InfoCallout style={{ marginBottom: 16 }} title={summary} /> : null}

      {loadingReview ? (
        <LoadingState label="Loading reviews" />
      ) : (
        <>
          <SectionHeader title={Array.isArray(overallSummary) ? overallSummary[0] : overallSummary} description={Array.isArray(overallSummary) ? overallSummary.slice(1).join(" · ") : undefined} />

          {needsAttentionItems.length ? (
            <>
              <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginBottom: 16 }} aria-live="polite">
                {reviewProgressLabel(answeredCount, needsAttentionItems.length)}
              </p>
              <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
                {needsAttentionItems.map((item) => (
                  <ReviewSessionCard
                    key={item.id}
                    item={item}
                    isHousehold={isHousehold}
                    members={snapshot.members}
                    debts={snapshot.debts}
                    latestSnapshotsByDebt={snapshot.latestSnapshotsByDebt}
                    stagedForItem={staged[item.id] || {}}
                    onStage={(subtype, entry) => handleStage(item, subtype, entry)}
                    onLeaveForLater={() => handleLeaveForLater(item)}
                    busy={saving}
                    resultMessage={itemResults[item.id]?.message}
                    resultTone={itemResults[item.id]?.tone}
                  />
                ))}
              </div>

              {/* Sticky primary action bar (Part 29/35) - stays reachable
                  while scrolling through several staged items, without
                  overlapping the sticky TopBar (that one pins to `top`,
                  this one pins to `bottom`). */}
              <div
                style={{
                  position: "sticky",
                  bottom: 0,
                  background: palette.surf,
                  borderTop: `1px solid ${palette.border}`,
                  padding: "12px 16px",
                  marginLeft: -16,
                  marginRight: -16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  zIndex: 20,
                }}
              >
                <span style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>{reviewProgressLabel(answeredCount, needsAttentionItems.length)}</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="ghost" disabled={saving} onClick={() => setConfirmSkipAll(true)}>{skipAllForNowLabel()}</Button>
                  <Button variant="primary" disabled={saving || !answeredCount} onClick={handleSaveWhatIKnow}>
                    {saving ? "Saving..." : saveWhatIKnowLabel()}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="You're all caught up." description="Nothing needs a second look right now." />
          )}

          {laterItems.length ? (
            <div style={{ marginTop: 32 }}>
              <SectionHeader eyebrow={laterSectionTitle()} title={`${laterItems.length} saved for later`} description={laterSectionHint()} />
              <div style={{ display: "grid", gap: 12 }}>
                {laterItems.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--ttz-radius-md, 12px)", border: `1px solid ${palette.border}`, background: palette.surf }}>
                    <div>
                      <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700 }}>{item.candidate.accountName || "Debt statement"}</div>
                      {item.blocking ? <div style={{ ...TYPE_SCALE.caption, color: palette.wa }}>{laterItemBlockingNote()}</div> : null}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setFinishItemId(item.id)}>Finish this</Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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

      <ConfirmationDialog
        open={confirmSkipAll}
        title={skipAllConfirmTitle()}
        confirmLabel={skipAllForNowLabel()}
        cancelLabel="Cancel"
        onConfirm={handleSkipAll}
        onCancel={() => setConfirmSkipAll(false)}
      >
        {skipAllConfirmBody()}
      </ConfirmationDialog>

      <ReviewDetail
        item={finishItem}
        open={!!finishItem}
        onClose={() => setFinishItemId(null)}
        workspaceId={workspaceId}
        workspace={snapshot.workspace}
        members={snapshot.members}
        service={service}
        onResolved={async () => {
          setFinishItemId(null);
          await onRefreshReview();
        }}
      />
    </>
  );
}
