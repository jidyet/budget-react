import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../layout/PageHeader.jsx";
import SectionHeader from "../layout/SectionHeader.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import ConfirmationDialog from "../ui/ConfirmationDialog.jsx";
import Drawer from "../ui/Drawer.jsx";
import ReviewSessionCard from "./ReviewSessionCard.jsx";
import ReviewQueueList from "./ReviewQueueList.jsx";
import ResolvedHistory from "./ResolvedHistory.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import Card from "../ui/Card.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { useIsTablet } from "../useViewport.js";
import { formatMoney } from "../formatting.js";
import {
  FRIENDLY_SAVE_FAILURE,
  REVIEW_TAB_LABEL,
  confirmSaveLabel,
  confirmedBalanceLine,
  duplicatesLine,
  excludedLine,
  getReviewCenterSummary,
  itemCountLabel,
  itemPositionLabel,
  jumpToItemLabel,
  laterItemBlockingNote,
  missingFieldLine,
  newDebtsLine,
  nextItemLabel,
  preSaveSummaryIntro,
  preSaveSummaryTitle,
  previousItemLabel,
  readyStatLabel,
  saveResultSummary,
  saveWhatIKnowLabel,
  skipAllConfirmBody,
  skipAllConfirmTitle,
  skipAllForNowLabel,
  skipAllResultSummary,
  skippedStatLabel,
  stillNeedsDecisionLine,
  stillNeedsDecisionStatLabel,
  updatedDebtsLine,
} from "../../../services/tracktozero/reviewCopy.js";
import { isDeferred, sortOpenReviewItems } from "../../../services/tracktozero/reviewDomain.js";
import { buildPreSaveSummary, getTerminalEntry } from "./reviewSessionSummary.js";

// REVIEW-1C: an item-by-item review session. Every item still renders its
// staged (non-authoritative) form via ReviewSessionCard (Part 5/40) - what
// changed is navigation: the user works through one item at a time
// (Previous/Next/jump), not a long scroll of every card at once, and staged
// answers survive moving back and forth (Part 5 - "go back to Item A and
// change it again"). Nothing here writes Firestore directly; the only
// authoritative action is the single explicit "Save reviewed changes",
// gated behind a pre-save summary so the user knows exactly what will (and
// will not) be committed before it happens (Part 15).

function JumpList({ items, onJump }) {
  const palette = ttzPalette;
  if (!items.length) return <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Nothing here.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onJump(item.id)}
          style={{
            textAlign: "left",
            padding: "10px 14px",
            borderRadius: "var(--ttz-radius-md, 12px)",
            border: `1px solid ${palette.border}`,
            background: palette.surf,
            cursor: "pointer",
            ...TYPE_SCALE.body,
            color: palette.tx,
          }}
        >
          {item.candidate.accountName || item.candidate.creditorName || "Debt statement"}
        </button>
      ))}
    </div>
  );
}

export default function ReviewCenter({ snapshot, service, workspaceId, reviewSnapshot, loadingReview, onRefreshReview }) {
  const palette = ttzPalette;
  const [staged, setStaged] = useState({}); // { [itemId]: { [subtype]: {action,args,label} } }
  const [itemResults, setItemResults] = useState({}); // { [itemId]: {message, tone} }
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");
  const [confirmSkipAll, setConfirmSkipAll] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [showResolved, setShowResolved] = useState(true);
  const [tab, setTab] = useState("needsReview");
  const [cursorId, setCursorId] = useState(null);
  // UX-8: below the tablet breakpoint, the queue-list pane doesn't render
  // inline (no room) - previously that meant it was ENTIRELY gone, leaving
  // only the Jump-to-item <Select>/Previous/Next as the sole way to move
  // through the queue on a phone. This drawer reuses the exact same
  // ReviewQueueList component (no second queue-rendering implementation)
  // so mobile users can still browse/scan the queue, not just step through
  // it one item at a time.
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  // DATA-HH1: people created mid-session via "+ Add as a new household
  // person" (see handleCreatePerson below) - merged with snapshot.people so
  // a newly-created person is immediately selectable without waiting on a
  // full workspace snapshot reload.
  const [newlyCreatedPeople, setNewlyCreatedPeople] = useState([]);
  const isHousehold = snapshot.workspace.type === "household";
  const isTablet = useIsTablet();
  const people = [...(snapshot.people || []), ...newlyCreatedPeople.filter((person) => !(snapshot.people || []).some((existing) => existing.id === person.id))];

  const openItems = sortOpenReviewItems(reviewSnapshot?.openItems || []);
  const resolvedItems = reviewSnapshot?.resolvedItems || [];
  const staleBatches = reviewSnapshot?.staleBatches || [];
  const needsAttentionItems = openItems.filter((item) => !isDeferred(item));
  const laterItems = openItems.filter(isDeferred);
  const openCount = reviewSnapshot?.openCount ?? openItems.length;
  const blockingCount = reviewSnapshot?.blockingCount ?? 0;

  const readyCount = needsAttentionItems.filter((item) => !!getTerminalEntry(staged[item.id])).length;
  const stillNeedsDecisionCount = needsAttentionItems.length - readyCount;
  const hasAnyWork = needsAttentionItems.length + laterItems.length > 0;

  // REVIEW-1C Part 19: warn before an accidental refresh/close throws away
  // an in-progress review session - staged answers are plain local state
  // until an explicit Save, so losing the tab loses the work.
  useEffect(() => {
    if (!Object.keys(staged).length) return undefined;
    const handler = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [staged]);

  const queue = tab === "needsReview" ? needsAttentionItems : tab === "skipped" ? laterItems : [];
  const queueIds = queue.map((item) => item.id).join(",");
  const currentIndex = Math.max(0, queue.findIndex((item) => item.id === cursorId));
  const currentItem = queue[currentIndex] || null;

  useEffect(() => {
    if (queue.length && !queue.some((item) => item.id === cursorId)) setCursorId(queue[0].id);
    else if (!queue.length) setCursorId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, queueIds]);

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

  // DATA-HH1: creating a household person never touches Debt/BalanceSnapshot/
  // PaymentEvent/PlanVersion (Part 4) - it's safe to run immediately rather
  // than staging it, exactly like the already-immediate "Leave for later"
  // (Part 3/42 only gates AUTHORITATIVE financial mutation behind Save).
  const handleCreatePerson = async (displayName) => {
    const person = await service.createImportedPerson(workspaceId, { displayName });
    setNewlyCreatedPeople((state) => (state.some((existing) => existing.id === person.id) ? state : [...state, person]));
    return person;
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

  const flattenStagedForItem = (item) => {
    const forItem = staged[item.id];
    if (!forItem) return [];
    return Object.values(forItem).map((entry) => ({ itemId: item.id, importBatchId: item.importBatchId, importCandidateId: item.importCandidateId, action: entry.action, args: entry.args }));
  };

  // Shared between the batch "Save what I know" and the per-item "Save this
  // debt" (Part 5x) so both apply an identical, single definition of what a
  // saveReviewSession result means for local state - never two independently
  // maintained copies of this logic that could quietly drift apart.
  const applySaveResult = (result) => {
    const nextResults = {};
    for (const entry of result.resolved) nextResults[entry.itemId] = { message: "Saved.", tone: "success" };
    for (const entry of result.stale) nextResults[entry.itemId] = { message: entry.message, tone: "danger" };
    for (const entry of result.failed) nextResults[entry.itemId] = { message: entry.message, tone: "warning" };
    setItemResults((state) => ({ ...state, ...nextResults }));
    setStaged((state) => {
      const next = { ...state };
      for (const entry of result.resolved) delete next[entry.itemId];
      return next;
    });
  };

  const runSaveReviewedChanges = async () => {
    const flat = needsAttentionItems.flatMap(flattenStagedForItem);
    setConfirmSave(false);
    if (!flat.length) return;
    setSaving(true);
    try {
      const result = await service.saveReviewSession(workspaceId, flat);
      applySaveResult(result);
      const distinctResolvedItems = new Set(result.resolved.map((entry) => entry.itemId)).size;
      const stillOpenCount = Math.max(0, needsAttentionItems.length - distinctResolvedItems);
      setSummary(saveResultSummary({ resolvedCount: distinctResolvedItems, staleCount: result.stale.length, failedCount: result.failed.length, stillOpenCount }));
      await onRefreshReview();
    } finally {
      setSaving(false);
    }
  };

  // Save just THIS item's staged answers immediately (Part 5x) - the user
  // doesn't have to decide every other open item first. Reuses the exact
  // same saveReviewSession primitive the batch save calls, just scoped to
  // one item's entries, so a single candidate can be saved the moment its
  // own information is complete.
  const handleSaveItem = async (item) => {
    const flat = flattenStagedForItem(item);
    if (!flat.length) return;
    setSaving(true);
    try {
      const result = await service.saveReviewSession(workspaceId, flat);
      applySaveResult(result);
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

  const handleDismissStale = async (batchId) => {
    setSaving(true);
    try {
      await service.dismissStaleImportBatch?.(workspaceId, batchId);
      setSummary("Old review data removed. Re-import that file to review it with the latest classifier.");
      await onRefreshReview();
    } finally {
      setSaving(false);
    }
  };

  const preSaveSummary = useMemo(() => buildPreSaveSummary(needsAttentionItems, staged), [needsAttentionItems, staged]);
  const overallSummary = getReviewCenterSummary({ openCount, blockingCount });
  const goPrev = () => { if (currentIndex > 0) setCursorId(queue[currentIndex - 1].id); };
  const goNext = () => { if (currentIndex < queue.length - 1) setCursorId(queue[currentIndex + 1].id); };

  const summaryLines = [
    newDebtsLine(preSaveSummary.newDebtCount),
    updatedDebtsLine(preSaveSummary.updateCount),
    (preSaveSummary.newDebtCount + preSaveSummary.updateCount) ? confirmedBalanceLine(formatMoney(preSaveSummary.confirmedBalanceTotal)) : "",
    duplicatesLine(preSaveSummary.duplicateCount),
    excludedLine(preSaveSummary.excludedCount),
    stillNeedsDecisionLine(preSaveSummary.stillNeedsDecision),
    missingFieldLine("APR", preSaveSummary.missingAprCount),
    missingFieldLine("Minimum payment", preSaveSummary.missingMinimumCount),
    missingFieldLine("Due date", preSaveSummary.missingDueDateCount),
    missingFieldLine("Owner", preSaveSummary.missingOwnerCount),
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Needs Review" description="TrackToZero found a few things it refuses to fake. Clean these up once, and your plan stays honest." />
      {summary ? <InfoCallout style={{ marginBottom: 16 }} title={summary} /> : null}

      {loadingReview ? (
        <LoadingState label="Loading reviews" />
      ) : (
        <>
          <Card
            variant="default"
            style={{
              marginBottom: 16,
              background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
              border: `1px solid ${palette.border2 || palette.border}`,
              boxShadow: "var(--ttz-shadow-sm)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>Open queue</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx, marginTop: 8 }}>{openCount}</div>
                <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>items still in play</div>
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>Blocking</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: blockingCount ? palette.wa : palette.tx, marginTop: 8 }}>{blockingCount}</div>
                <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>decisions affecting the plan</div>
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>Ready to save</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: readyCount ? palette.go : palette.tx, marginTop: 8 }}>{readyCount}</div>
                <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>items already sorted</div>
              </div>
            </div>
          </Card>

          {staleBatches.length ? (
            <WarningCallout
              style={{ marginBottom: 16 }}
              title={`${staleBatches.length} older import${staleBatches.length === 1 ? "" : "s"} need${staleBatches.length === 1 ? "s" : ""} a fresh review.`}
            >
              <div style={{ display: "grid", gap: 12 }}>
                <div>These spreadsheet imports were created before TrackToZero&apos;s latest review model. Their old candidate counts are excluded from today&apos;s review totals.</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {staleBatches.map((batch) => (
                    <Card key={batch.id} variant="default" style={{ padding: 16 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700 }}>
                          {batch.sourceFilename || "Older import batch"}
                        </div>
                        <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
                          {batch.candidateCount} old candidate{batch.candidateCount === 1 ? "" : "s"} · parser {batch.parserVersion || "unknown"}
                        </div>
                        <div style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>
                          Re-import this source to review it with the latest classification rules.
                        </div>
                        <div>
                          <Button variant="secondary" disabled={saving} onClick={() => handleDismissStale(batch.id)}>
                            Dismiss old import
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </WarningCallout>
          ) : null}

          <SectionHeader title={Array.isArray(overallSummary) ? overallSummary[0] : overallSummary} description={Array.isArray(overallSummary) ? overallSummary.slice(1).join(" · ") : undefined} />

          <div role="tablist" aria-label="Review filter" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, padding: 6, borderRadius: 18, border: `1px solid ${palette.border}`, background: palette.surf2 }}>
            {["needsReview", "skipped", "resolved", "all"].map((key) => {
              const count = key === "needsReview" ? needsAttentionItems.length : key === "skipped" ? laterItems.length : key === "resolved" ? resolvedItems.length : openItems.length + resolvedItems.length;
              return (
                <Button key={key} role="tab" aria-selected={tab === key} size="sm" variant={tab === key ? "primary" : "secondary"} onClick={() => setTab(key)}>
                  {REVIEW_TAB_LABEL[key]} ({count})
                </Button>
              );
            })}
          </div>

          {tab === "needsReview" || tab === "skipped" ? (
            queue.length ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }} role="status" aria-live="polite">
                    {itemPositionLabel(currentIndex + 1, queue.length)}
                  </span>
                  <div style={isTablet
                    ? { display: "grid", gridTemplateColumns: "1fr", gap: 8, width: "100%" }
                    : { display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    {isTablet ? (
                      <Button size="sm" variant="secondary" onClick={() => setQueueDrawerOpen(true)}>
                        Queue ({queue.length})
                      </Button>
                    ) : null}
                    <Field label={jumpToItemLabel()} style={isTablet ? { width: "100%" } : undefined}>
                      <Select style={isTablet ? { width: "100%", minWidth: 0 } : undefined} value={currentItem?.id || ""} onChange={(event) => setCursorId(event.target.value)} aria-label={jumpToItemLabel()}>
                        {queue.map((item, index) => (
                          <option key={item.id} value={item.id}>
                            {index + 1}. {item.candidate.accountName || item.candidate.creditorName || "Debt statement"}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button size="sm" variant="secondary" disabled={currentIndex <= 0} onClick={goPrev}>{previousItemLabel()}</Button>
                    <Button size="sm" variant="secondary" disabled={currentIndex >= queue.length - 1} onClick={goNext}>{nextItemLabel()}</Button>
                  </div>
                </div>

                {tab === "skipped" && currentItem?.blocking ? (
                  <WarningCallout style={{ marginBottom: 12 }} title={laterItemBlockingNote()} />
                ) : null}

                {isTablet ? (
                  <Drawer open={queueDrawerOpen} title={`Review queue (${queue.length})`} onClose={() => setQueueDrawerOpen(false)} side="left">
                    <ReviewQueueList
                      items={queue}
                      currentItemId={currentItem?.id}
                      onSelect={(id) => { setCursorId(id); setQueueDrawerOpen(false); }}
                    />
                  </Drawer>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "minmax(220px, 280px) 1fr", gap: 16, alignItems: "start" }}>
                  {!isTablet ? (
                    <Card variant="default" style={{ maxHeight: 640, overflowY: "auto" }}>
                      <ReviewQueueList items={queue} currentItemId={currentItem?.id} onSelect={setCursorId} />
                    </Card>
                  ) : null}
                  {currentItem ? (
                    <ReviewSessionCard
                      key={currentItem.id}
                      item={currentItem}
                      isHousehold={isHousehold}
                      members={snapshot.members}
                      people={people}
                      debts={snapshot.debts}
                      latestSnapshotsByDebt={snapshot.latestSnapshotsByDebt}
                      stagedForItem={staged[currentItem.id] || {}}
                      onStage={(subtype, entry) => handleStage(currentItem, subtype, entry)}
                      onLeaveForLater={() => handleLeaveForLater(currentItem)}
                      onSaveItem={() => handleSaveItem(currentItem)}
                      onCreatePerson={handleCreatePerson}
                      busy={saving}
                      resultMessage={itemResults[currentItem.id]?.message}
                      resultTone={itemResults[currentItem.id]?.tone}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                title={tab === "needsReview" ? "You're all caught up." : "Nothing saved for later."}
                description={tab === "needsReview" ? "Nothing needs a second look right now." : "Items you skip will show up here."}
              />
            )
          ) : null}

          {tab === "resolved" ? <ResolvedHistory items={resolvedItems} /> : null}

          {tab === "all" ? (
            <div style={{ display: "grid", gap: 24 }}>
              <div>
                <SectionHeader eyebrow={REVIEW_TAB_LABEL.needsReview} title={itemCountLabel(needsAttentionItems.length)} description="These are the live items still shaping your debt picture." />
                <JumpList items={needsAttentionItems} onJump={(id) => { setTab("needsReview"); setCursorId(id); }} />
              </div>
              <div>
                <SectionHeader eyebrow={REVIEW_TAB_LABEL.skipped} title={itemCountLabel(laterItems.length)} description="Stuff you parked for later so you could keep moving." />
                <JumpList items={laterItems} onJump={(id) => { setTab("skipped"); setCursorId(id); }} />
              </div>
              <div>
                <SectionHeader
                  eyebrow={REVIEW_TAB_LABEL.resolved}
                  title={itemCountLabel(resolvedItems.length)}
                  description="Already handled and saved. No mystery leftovers."
                  actions={<Button size="sm" variant="ghost" onClick={() => setShowResolved((value) => !value)}>{showResolved ? "Hide" : "Show"}</Button>}
                />
                {showResolved ? <ResolvedHistory items={resolvedItems} /> : null}
              </div>
            </div>
          ) : null}

          {hasAnyWork ? (
            <div
              style={{
                position: "sticky",
                bottom: 0,
                background: palette.surf,
                borderTop: `1px solid ${palette.border}`,
                padding: "12px 16px",
                marginTop: 24,
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
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Badge tone="success">{readyStatLabel(readyCount)}</Badge>
                <Badge tone="neutral">{skippedStatLabel(laterItems.length)}</Badge>
                <Badge tone={stillNeedsDecisionCount ? "warning" : "neutral"}>{stillNeedsDecisionStatLabel(stillNeedsDecisionCount)}</Badge>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="ghost" disabled={saving} onClick={() => setConfirmSkipAll(true)}>{skipAllForNowLabel()}</Button>
                <Button variant="primary" disabled={saving || !readyCount} onClick={() => setConfirmSave(true)}>
                  {saving ? "Saving..." : saveWhatIKnowLabel()}
                </Button>
              </div>
            </div>
          ) : null}
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

      <ConfirmationDialog
        open={confirmSave}
        title={preSaveSummaryTitle()}
        confirmLabel={confirmSaveLabel()}
        cancelLabel="Cancel"
        onConfirm={runSaveReviewedChanges}
        onCancel={() => setConfirmSave(false)}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700, margin: 0 }}>{preSaveSummaryIntro(readyCount)}</p>
          {summaryLines.map((line) => (
            <p key={line} style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: 0 }}>{line}</p>
          ))}
        </div>
      </ConfirmationDialog>
    </>
  );
}
