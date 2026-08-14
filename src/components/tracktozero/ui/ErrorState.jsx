import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Button from "./Button.jsx";

// Calm, actionable presentation for repository/config/load failures (UX-1
// Part 17) - never surfaces a raw internal error code as the primary
// message. Callers may pass the raw error via `detail` for secondary,
// de-emphasized display (e.g. for support/debugging), not as the headline.
export default function ErrorState({ title = "Something went wrong", description, detail, actionLabel, onAction, style }) {
  const palette = ttzPalette;
  return (
    <div
      role="alert"
      style={{
        textAlign: "center",
        padding: "var(--ttz-space-8, 48px) var(--ttz-space-5, 24px)",
        border: `1px solid ${palette.daD}`,
        borderRadius: "var(--ttz-radius-lg, 16px)",
        background: palette.surf,
        ...style,
      }}
    >
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, marginBottom: 6 }}>{title}</div>
      {description ? (
        <div style={{ ...TYPE_SCALE.body, color: palette.tx2, maxWidth: 420, margin: "0 auto" }}>{description}</div>
      ) : null}
      {detail ? (
        <div style={{ ...TYPE_SCALE.caption, color: palette.muted, marginTop: 10 }}>{detail}</div>
      ) : null}
      {actionLabel && onAction ? (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
