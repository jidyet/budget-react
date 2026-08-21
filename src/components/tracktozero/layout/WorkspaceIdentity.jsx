import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function WorkspaceIdentity({ workspace }) {
  const palette = ttzPalette;
  const fallbackLabel = workspace?.type === "household" ? "Household workspace" : "Personal workspace";
  const label = workspace?.name || fallbackLabel;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 14,
        border: `1px solid ${palette.border2 || palette.border}`,
        background: palette.bg === "#08111d" ? "rgba(13,23,38,0.92)" : "rgba(255,255,255,0.9)",
        boxShadow: "var(--ttz-shadow-sm)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Workspace</span>
        <span style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{label}</span>
      </div>
      <span aria-hidden="true" style={{ color: palette.tx2, fontSize: 12 }}>v</span>
    </div>
  );
}
