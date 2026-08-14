import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function SectionHeader({ eyebrow, title, description, actions }) {
  const palette = ttzPalette;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: "var(--ttz-space-4, 16px)" }}>
      <div>
        {eyebrow ? <p style={{ ...TYPE_SCALE.overline, color: palette.muted, margin: "0 0 6px" }}>{eyebrow}</p> : null}
        <h2 style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>{title}</h2>
        {description ? <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: "6px 0 0" }}>{description}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}
