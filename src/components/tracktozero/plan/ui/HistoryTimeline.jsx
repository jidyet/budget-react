import React from "react";
import { ttzPalette, TYPE_SCALE } from "../../theme.js";
import IconBadge from "./IconBadge.jsx";

// GATE-10B.1E: horizontal, scrollable icon-node timeline replacing Saved's
// old plain-list PlanHistoryTimeline. entries are built by the caller from
// already-real, already-recorded data (listPlanHistory's PlanVersions,
// saved/archived scenario timestamps) - this component only lays them out,
// never invents a milestone that didn't really happen.
// entries: [{ id, icon, tone, date, title, description }]
export default function HistoryTimeline({ entries = [] }) {
  const palette = ttzPalette;
  if (!entries.length) return null;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
      {entries.map((entry, index) => (
        <React.Fragment key={entry.id}>
          <div style={{ display: "grid", gap: 6, minWidth: 160, maxWidth: 200, flexShrink: 0 }}>
            <IconBadge icon={entry.icon} tone={entry.tone || "neutral"} size="md" />
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{entry.date}</div>
            <div style={{ ...TYPE_SCALE.body, fontWeight: 700, color: palette.tx }}>{entry.title}</div>
            {entry.description ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{entry.description}</div> : null}
          </div>
          {index < entries.length - 1 ? (
            <div aria-hidden="true" style={{ flex: "0 0 32px", height: 2, background: palette.border, marginTop: 18 }} />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}
