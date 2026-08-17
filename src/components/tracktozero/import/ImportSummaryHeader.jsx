import React from "react";
import MetricCard from "../ui/MetricCard.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { needsHelpCandidates } from "./importReviewGroups.js";

// UX-6.1: intelligent import summary using REAL staging counts (never
// invented) - "N financial items analyzed -> M debts found, K not debts,
// J need your help." Non-debt items are never called "failed" - TrackToZero
// understood them, they're simply outside the debt product.
export default function ImportSummaryHeader({ candidates, nonDebtItems = [], sourceFilename }) {
  const palette = ttzPalette;
  const needsHelp = needsHelpCandidates(candidates);
  const excluded = candidates.filter((c) => c.decision === "excluded");
  const totalFoundBalance = candidates.filter((c) => c.decision !== "excluded").reduce((sum, c) => sum + Number(c.currentBalance || 0), 0);
  const totalItems = candidates.length + nonDebtItems.length;
  const unknownAprCount = candidates.filter((c) => c.decision === "confirmed" && c.aprStatus === "unknown").length;
  const missingMinimumCount = candidates.filter((c) => c.decision === "confirmed" && c.minimumPayment == null).length;

  return (
    <div>
      <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginBottom: 8 }}>
        {totalItems} financial item{totalItems === 1 ? "" : "s"} analyzed in {sourceFilename} → {candidates.length} debt{candidates.length === 1 ? "" : "s"} found
        {nonDebtItems.length ? `, ${nonDebtItems.length} not debt` : ""}
        {needsHelp.length ? `, ${needsHelp.length} need${needsHelp.length === 1 ? "s" : ""} your help` : ""}.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
        <MetricCard label="We found" value={`${candidates.length} possible debt${candidates.length === 1 ? "" : "s"}`} supporting={`${candidates.length - needsHelp.length} look ready and ${needsHelp.length} need a quick review.`} />
        <MetricCard label="Found in your file" value={money(totalFoundBalance)} supporting="Not saved yet - only official after you approve it." />
        <MetricCard label="What needs attention" value={String(needsHelp.length)} supporting={`${unknownAprCount} unknown APR · ${missingMinimumCount} missing minimum · ${excluded.length} excluded`} />
      </div>
    </div>
  );
}
