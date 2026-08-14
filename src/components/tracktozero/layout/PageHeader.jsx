import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// Consistent page title + optional description/actions slot (UX-1 Part 21).
// Available for future per-page redesigns (UX-2+); not required to be
// wired into Home/Debts/Plan/Settings content in this phase, which keeps
// their existing information architecture untouched.
export default function PageHeader({ title, description, actions }) {
  const palette = ttzPalette;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: "var(--ttz-space-5, 24px)" }}>
      <div>
        <h1 style={{ ...TYPE_SCALE.pageTitle, color: palette.tx, margin: 0 }}>{title}</h1>
        {description ? <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: "6px 0 0" }}>{description}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div> : null}
    </div>
  );
}
