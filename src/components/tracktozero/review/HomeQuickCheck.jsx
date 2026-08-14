import React from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// Lightweight Home integration (REVIEW-1B Part 32) - reads the same
// REVIEW-1A shared counts the Review Center and nav badge use. Renders
// nothing when there is nothing open, so Home stays uncluttered.
export default function HomeQuickCheck({ openCount, blockingCount, onGoToReview }) {
  const palette = ttzPalette;
  if (!openCount) return null;
  return (
    <Card variant={blockingCount > 0 ? "warning" : "default"}>
      <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>Quick check</div>
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginTop: 4 }}>
        {openCount} thing{openCount === 1 ? "" : "s"} need{openCount === 1 ? "s" : ""} your attention.
      </div>
      {blockingCount > 0 ? (
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 6 }}>
          {blockingCount} need{blockingCount === 1 ? "s" : ""} a quick check before we fully trust your plan.
        </p>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Button variant="secondary" onClick={onGoToReview}>Review them</Button>
      </div>
    </Card>
  );
}
