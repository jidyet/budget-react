import React from "react";
import { toneColors } from "../theme.js";

// The one badge/pill primitive - every status/owner/state label in the
// product should render through this instead of a screen hand-rolling its
// own "random green/yellow pill" (UX-1 Part 10). Tone is the only visual
// input; callers decide WHAT tone applies (see StatusBadge for how UX-0's
// truthful status codes map to a tone - that mapping lives in theme.js, not
// here, so it can never be duplicated/re-derived per badge).
export default function Badge({ tone = "neutral", children, style, ...rest }) {
  const colors = toneColors()[tone] || toneColors().neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 999,
        fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1,
        color: colors.fg,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
