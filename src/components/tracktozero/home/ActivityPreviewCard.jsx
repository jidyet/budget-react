import React, { useMemo } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { deriveActivityFeed } from "./activityFeed.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";

const PREVIEW_COUNT = 5;

// Home's compact activity strip (UX-7): at most 5 items, always with a
// "View all activity" link to the full paginated Activity tab - never a
// scrollable/unbounded list crammed into Home itself.
export default function ActivityPreviewCard({ activityPage, onViewAllActivity }) {
  const entries = useMemo(() => {
    if (!activityPage?.records) return [];
    return deriveActivityFeed(activityPage.records, { members: activityPage.members, people: activityPage.people }).slice(0, PREVIEW_COUNT);
  }, [activityPage]);

  if (!entries.length) return null;

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Recent activity</div>
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {entry.debtName ? <LenderIdentity creditorName={entry.debtName} size="sm" showName={false} /> : null}
              <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{entry.title}</span>
                  <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>{entry.dateLabel}</span>
                </div>
                {entry.detail ? <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{entry.detail}</div> : null}
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" onClick={onViewAllActivity}>View all activity</Button>
      </div>
    </Card>
  );
}
