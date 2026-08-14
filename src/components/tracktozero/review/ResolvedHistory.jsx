import React from "react";
import Card from "../ui/Card.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatShortDate } from "../formatting.js";
import { RESOLUTION_HISTORY_LABEL } from "../../../services/tracktozero/reviewCopy.js";

// Compact resolved-review history (Part 30) - not a full Activity timeline.
export default function ResolvedHistory({ items = [] }) {
  const palette = ttzPalette;
  if (!items.length) {
    return <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>Nothing resolved yet.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <Card key={item.id} variant="default" padding="12px 16px">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700 }}>{item.candidate.accountName || "Debt statement"}</div>
              <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
                {RESOLUTION_HISTORY_LABEL[item.resolution?.type] || (item.status === "dismissed" ? "Dismissed" : "Resolved")}
              </div>
            </div>
            <div style={{ ...TYPE_SCALE.caption, color: palette.muted }}>{formatShortDate(item.resolvedAt)}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
