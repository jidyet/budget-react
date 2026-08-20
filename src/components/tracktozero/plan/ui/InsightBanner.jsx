import React from "react";
import { ttzPalette, TYPE_SCALE } from "../../theme.js";
import IconBadge from "./IconBadge.jsx";

// GATE-10B.1E: the horizontal icon + headline + detail + inline metric-chip
// row pattern used across every reference design (Compare's recommendation,
// Snowball/Avalanche's active-strategy banner, My Plan's on-track summary,
// Finish By's target-flow banner). `chips` are already-computed values from
// the caller (planInsights.js/service preview results) - this component only
// lays them out, never computes a number itself.
//
// `tone` uses the SAME raw palette-token keys as IconBadge (ac/go/wa/da/
// info/neutral) rather than toneColors()'s differently-named success/
// warning/danger/info/neutral keys, so the two components can never
// silently drift on what a given tone resolves to.
function resolveBannerColors(palette, tone) {
  if (tone === "go") return { bg: palette.goD, border: palette.go, fg: palette.go };
  if (tone === "wa") return { bg: palette.waD, border: palette.wa, fg: palette.wa };
  if (tone === "da") return { bg: palette.daD, border: palette.da, fg: palette.da };
  if (tone === "info") return { bg: palette.infoD, border: palette.info, fg: palette.info };
  if (tone === "neutral") return { bg: palette.surf2, border: palette.border, fg: palette.tx2 };
  return { bg: palette.acS || palette.surf2, border: palette.ac, fg: palette.ac };
}

export default function InsightBanner({ icon, tone = "ac", headline, detail, chips = [], actions, style }) {
  const palette = ttzPalette;
  const colors = resolveBannerColors(palette, tone);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        padding: "16px 20px",
        borderRadius: "var(--ttz-radius-lg, 16px)",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        ...style,
      }}
    >
      {icon ? <IconBadge icon={icon} tone={tone} size="lg" /> : null}
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        {headline ? <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{headline}</div> : null}
        {detail ? <div style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 4 }}>{detail}</div> : null}
      </div>
      {chips.length ? (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {chips.map((chip) => (
            <div key={chip.label} style={{ minWidth: 0 }}>
              <div style={{ ...TYPE_SCALE.overline, color: palette.tx2 }}>{chip.label}</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: chip.tone ? resolveBannerColors(palette, chip.tone).fg : palette.tx, marginTop: 2 }}>{chip.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>{actions}</div> : null}
    </div>
  );
}
