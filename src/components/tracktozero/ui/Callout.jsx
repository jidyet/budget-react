import React from "react";
import { ttzPalette, toneColors, TYPE_SCALE } from "../theme.js";

const ICONS = { warning: "!", danger: "!", info: "i", neutral: "i", success: "✓" };

// The one inline message primitive (UX-1 Part 15). Tone drives color AND an
// icon, so status is never conveyed by color alone (Part 32 accessibility
// requirement). Callers choose the tone; this component does not infer
// severity from message text.
export default function Callout({ tone = "info", title, children, style, ...rest }) {
  const colors = toneColors(ttzPalette)[tone] || toneColors(ttzPalette).info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "var(--ttz-space-4, 16px)",
        borderRadius: "var(--ttz-radius-md, 12px)",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: colors.fg,
          color: "#ffffff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {ICONS[tone] || ICONS.info}
      </span>
      <div>
        {title ? <div style={{ ...TYPE_SCALE.cardTitle, color: colors.fg, marginBottom: 2 }}>{title}</div> : null}
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{children}</div>
      </div>
    </div>
  );
}
