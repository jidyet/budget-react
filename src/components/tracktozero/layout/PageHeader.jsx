import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { useIsMobile } from "../useViewport.js";

// Consistent page title + optional description/actions slot (UX-1 Part 21).
// Available for future per-page redesigns (UX-2+); not required to be
// wired into Home/Debts/Plan/Settings content in this phase, which keeps
// their existing information architecture untouched.
//
// UX-6.1: stacks title above actions at mobile width - a title sharing one
// row with 2 page-level action buttons (e.g. Debts' "Import statement" / "+
// Add debt") had no room left and wrapped into an ugly multi-line title.
export default function PageHeader({ title, description, actions }) {
  const palette = ttzPalette;
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: 16, marginBottom: "var(--ttz-space-5, 24px)" }}>
      <div>
        <h1 style={{ ...TYPE_SCALE.pageTitle, color: palette.tx, margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 5, height: "0.85em", borderRadius: 3, background: palette.ac }} />
          {title}
        </h1>
        {description ? <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: "6px 0 0" }}>{description}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}
