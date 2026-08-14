import React from "react";
import { ttzPalette, toneColors } from "../theme.js";

// Debt-payoff progress display (UX-1 Part 12). `value`/`max` describe
// already-computed progress (e.g. from progressService.deriveConfirmedProgress)
// - this component never computes payoff percentage itself. `tone` defaults
// to success since progress bars only render for confirmed, positive
// movement; pass an explicit tone to override.
export default function ProgressBar({ value = 0, max = 100, tone = "success", label, style }) {
  const palette = ttzPalette;
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = toneColors(palette)[tone] || toneColors(palette).success;
  return (
    <div style={style}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        style={{
          height: 8,
          borderRadius: 999,
          background: palette.surf2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: colors.fg,
            borderRadius: 999,
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}
