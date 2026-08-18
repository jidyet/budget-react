import React from "react";
import Badge from "../ui/Badge.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { groupCandidatesForReview, groupCandidatesByCategory } from "./importReviewGroups.js";
import { categoryConfigForGroup } from "../debts/debtCategoryConfig.js";

const STATUS_ICON = { confirmed: "✓", excluded: "×", needs_information: "?", pending_review: "⚠" };

function CandidateRow({ candidate, active, onSelect }) {
  const palette = ttzPalette;
  return (
    <button
      type="button"
      onClick={() => onSelect(candidate.candidateId)}
      aria-current={active}
      className="ttz-focus-ring"
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 10px",
        borderRadius: "var(--ttz-radius-sm, 8px)",
        cursor: "pointer",
        background: active ? (palette.acS || palette.surf2) : "transparent",
      }}
    >
      <span aria-hidden="true" style={{ ...TYPE_SCALE.supporting, color: candidate.decision === "confirmed" ? palette.go : candidate.decision === "excluded" ? palette.da : palette.wa, width: 14, flexShrink: 0 }}>
        {STATUS_ICON[candidate.decision] || "?"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {candidate.accountName || "Unnamed"}
        </div>
        {/* BETA-3.1 bug fix (found via the live real-workbook Gate-10 truth
            test): currentBalance is a placeholder 0 - never a real
            observed amount - whenever balanceStatus isn't "confirmed"
            (see candidateFromGroup in workbookDebtDiscovery.js). This row
            used to render that placeholder through money() unconditionally,
            showing "$0.00" for an account whose true balance is entirely
            unknown - visually implying a confirmed zero exactly where none
            exists. */}
        <div style={{ ...TYPE_SCALE.caption, color: candidate.balanceStatus === "confirmed" ? palette.tx2 : palette.wa }}>
          {candidate.balanceStatus === "confirmed" ? money(candidate.currentBalance) : "Balance unknown"}
        </div>
      </span>
    </button>
  );
}

// UX-6.1: master list pane - candidates grouped by the SAME 5-bucket triage
// (needs-your-help buckets first, per task requirement) as before, with the
// "confident"/"decided" buckets further sub-grouped by debt category
// (task requirement: same visual category language as the Debt Portfolio)
// so a large import is scannable by meaning instead of one flat scroll.
export default function ImportCandidateList({ candidates, selectedCandidateId, onSelect }) {
  const palette = ttzPalette;
  const groups = groupCandidatesForReview(candidates);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {groups.map((group) => {
        const subGroupByCategory = group.key === "confident" || group.key === "decided";
        const byCategory = subGroupByCategory ? groupCandidatesByCategory(group.items) : null;
        return (
          <div key={group.key}>
            <div style={{ ...TYPE_SCALE.overline, color: palette.tx2, marginBottom: 4 }}>{group.title} ({group.items.length})</div>
            {byCategory ? (
              [...byCategory.entries()].map(([categoryGroup, items]) => {
                const config = categoryConfigForGroup(categoryGroup);
                return (
                  <div key={categoryGroup} style={{ marginBottom: 8 }}>
                    {byCategory.size > 1 ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: "4px 0" }}>{config?.label || "Other"} ({items.length})</div> : null}
                    {items.map((candidate) => (
                      <CandidateRow key={candidate.candidateId} candidate={candidate} active={candidate.candidateId === selectedCandidateId} onSelect={onSelect} />
                    ))}
                  </div>
                );
              })
            ) : (
              group.items.map((candidate) => (
                <CandidateRow key={candidate.candidateId} candidate={candidate} active={candidate.candidateId === selectedCandidateId} onSelect={onSelect} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
