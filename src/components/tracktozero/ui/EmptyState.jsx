import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Button from "./Button.jsx";

// Consistent "nothing here yet" presentation (e.g. no debts added, no active
// plan) - replaces ad-hoc blank sections per screen (UX-1 Part 16).
export default function EmptyState({ title, description, actionLabel, onAction, style }) {
  const palette = ttzPalette;
  return (
    <div
      style={{
        textAlign: "center",
        padding: "var(--ttz-space-8, 48px) var(--ttz-space-5, 24px)",
        border: `1px dashed ${palette.border2}`,
        borderRadius: "var(--ttz-radius-lg, 16px)",
        background: palette.surf2,
        ...style,
      }}
    >
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, marginBottom: 6 }}>{title}</div>
      {description ? (
        <div style={{ ...TYPE_SCALE.body, color: palette.tx2, maxWidth: 420, margin: "0 auto" }}>{description}</div>
      ) : null}
      {actionLabel && onAction ? (
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
