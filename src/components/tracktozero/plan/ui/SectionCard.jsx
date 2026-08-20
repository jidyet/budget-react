import React from "react";
import Card from "../../ui/Card.jsx";
import { ttzPalette, TYPE_SCALE } from "../../theme.js";

// GATE-10B.1E: the small numbered-circle + title header every reference
// page's major sections use. Purely presentational - wraps the existing
// Card primitive rather than replacing it, so theme/variant handling stays
// centralized in one place.
export default function SectionCard({ number, title, subtitle, actions, children, variant = "default", style, ...rest }) {
  const palette = ttzPalette;
  return (
    <Card variant={variant} style={style} {...rest}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {number != null ? (
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: palette.ac,
                color: "#ffffff",
                ...TYPE_SCALE.caption,
                fontWeight: 800,
              }}
            >
              {number}
            </span>
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{title}</div>
            {subtitle ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 2 }}>{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      <div style={{ marginTop: "var(--ttz-space-4, 16px)" }}>{children}</div>
    </Card>
  );
}
