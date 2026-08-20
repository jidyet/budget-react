import React from "react";
import { ttzPalette } from "../../theme.js";

// GATE-10B.1E: the one small colored-circle-plus-icon badge used across
// nearly every metric card, section header, and banner in the new reference
// designs. Colors resolved from ttzPalette INSIDE the render body (never a
// module-level constant) - the same theme-safety discipline TrendChart/
// AllocationDonut already follow, so a badge never bakes in a stale color
// across a later theme change.
const TONE_KEYS = ["ac", "go", "wa", "da", "info", "neutral"];

function resolveTone(palette, tone) {
  if (tone === "go") return { bg: palette.goD, fg: palette.go };
  if (tone === "wa") return { bg: palette.waD, fg: palette.wa };
  if (tone === "da") return { bg: palette.daD, fg: palette.da };
  if (tone === "info") return { bg: palette.infoD, fg: palette.info };
  if (tone === "neutral") return { bg: palette.surf2, fg: palette.tx2 };
  return { bg: palette.acS || palette.surf2, fg: palette.ac };
}

const SIZES = { sm: { badge: 28, icon: 14 }, md: { badge: 36, icon: 18 }, lg: { badge: 48, icon: 22 } };

export default function IconBadge({ icon: Icon, tone = "ac", size = "md", style }) {
  const palette = ttzPalette;
  const colors = resolveTone(palette, TONE_KEYS.includes(tone) ? tone : "ac");
  const dims = SIZES[size] || SIZES.md;
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dims.badge,
        height: dims.badge,
        borderRadius: "50%",
        background: colors.bg,
        color: colors.fg,
        ...style,
      }}
    >
      {Icon ? <Icon size={dims.icon} aria-hidden="true" /> : null}
    </span>
  );
}
