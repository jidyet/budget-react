import React from "react";
import { toneColors } from "../theme.js";

// The one badge/pill primitive - every status/owner/state label in the
// product should render through this instead of a screen hand-rolling its
// own "random green/yellow pill" (UX-1 Part 10). Tone is the only visual
// input; callers decide WHAT tone applies (see StatusBadge for how UX-0's
// truthful status codes map to a tone - that mapping lives in theme.js, not
// here, so it can never be duplicated/re-derived per badge).
export default function Badge({ tone = "neutral", wrap = false, children, style, ...rest }) {
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
        color: colors.fg,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        // Most status pills are intentionally one line. A review status can
        // be longer than a narrow portrait card permits, so callers may opt
        // into contained wrapping rather than letting text escape the pill.
        whiteSpace: wrap ? "normal" : "nowrap",
        overflowWrap: wrap ? "anywhere" : undefined,
        maxWidth: "100%",
        lineHeight: wrap ? 1.25 : 1,
        textAlign: wrap ? "center" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
