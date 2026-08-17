import React, { useEffect, useMemo, useState } from "react";
import useReducedMotion from "../../../hooks/useReducedMotion.js";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette, TYPE_SCALE, toneColors } from "../theme.js";

const STORAGE_PREFIX = "ttz:milestones:";

// Client-side, best-effort dedupe only (no persisted "seen" record exists
// anywhere else in this app). Milestone ACHIEVEMENT itself is always
// recomputed fresh from confirmed data (see milestones.js) - this storage
// only decides whether the celebration banner has already been shown once,
// so if it's ever cleared the worst case is one redundant banner, never a
// fabricated milestone.
const readSeenIds = (workspaceId) => {
  if (typeof window === "undefined" || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const writeSeenIds = (workspaceId, ids) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify([...ids]));
  } catch {
    // best-effort only
  }
};

// A single, restrained banner - never one celebration per milestone, never
// confetti. Shows the newest-tier milestone with a quiet "+N more" note if
// several were crossed since the last visit (e.g. after a big backlog of
// balance updates).
export default function MilestoneBanner({ workspaceId, milestones = [] }) {
  const [dismissed, setDismissed] = useState(false);
  const reducedMotion = useReducedMotion();
  const seenIds = useMemo(() => readSeenIds(workspaceId), [workspaceId]);
  const newlyAchieved = useMemo(
    () => milestones.filter((milestone) => !seenIds.has(milestone.id)),
    [milestones, seenIds]
  );

  useEffect(() => {
    if (!newlyAchieved.length) return;
    writeSeenIds(workspaceId, new Set([...seenIds, ...newlyAchieved.map((milestone) => milestone.id)]));
  }, [workspaceId, newlyAchieved, seenIds]);

  if (dismissed || !newlyAchieved.length) return null;
  const [headline, ...rest] = newlyAchieved;
  const tone = toneColors(ttzPalette).success;

  return (
    <Card
      variant="default"
      style={{
        padding: 18,
        borderLeft: `4px solid ${tone.fg}`,
        transition: reducedMotion ? "none" : "transform 0.15s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ ...TYPE_SCALE.overline, color: tone.fg }}>Milestone</div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{headline.title}</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{headline.body}</div>
          {rest.length ? (
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>+{rest.length} more milestone{rest.length === 1 ? "" : "s"} reached</div>
          ) : null}
        </div>
        <Button variant="secondary" onClick={() => setDismissed(true)}>Dismiss</Button>
      </div>
    </Card>
  );
}
