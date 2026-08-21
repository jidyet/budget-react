import React from "react";
import Badge from "../ui/Badge.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

// REVIEW-2: a real, visible queue pane next to the current item - the prior
// UI only had a "Jump to item" <Select> dropdown, not the master-detail
// "QUEUE | CURRENT ITEM" layout this phase asks for. Reuses the same
// compact-row visual language as import/ImportCandidateList.jsx (this repo's
// established pattern for a scannable list of financial items) rather than
// inventing a new one. Purely a navigation aid - selecting a row calls the
// same setCursorId the existing Jump-to-item Select already uses; no staged-
// answer/save logic lives here.
function QueueRow({ item, active, onSelect }) {
  const palette = ttzPalette;
  const title = item.candidate.accountName || item.candidate.creditorName || "Debt statement";
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active}
      className="ttz-focus-ring"
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: "var(--ttz-radius-md, 16px)",
        cursor: "pointer",
        background: active ? `linear-gradient(180deg, ${palette.acS || palette.surf2} 0%, ${palette.surf} 100%)` : palette.surf,
        border: `1px solid ${active ? (palette.border2 || palette.ac) : palette.border}`,
        boxShadow: active ? "var(--ttz-shadow-sm)" : "none",
      }}
    >
      <span aria-hidden="true" style={{ ...TYPE_SCALE.supporting, color: item.blocking ? palette.wa : palette.tx2, width: 14, flexShrink: 0 }}>
        {item.blocking ? "⚠" : "•"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
      </span>
      {item.blocking ? <Badge tone="warning">{item.types.length}</Badge> : null}
    </button>
  );
}

export default function ReviewQueueList({ items, currentItemId, onSelect }) {
  if (!items.length) return null;
  return (
    <div role="list" aria-label="Review queue" style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <div role="listitem" key={item.id}>
          <QueueRow item={item} active={item.id === currentItemId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
