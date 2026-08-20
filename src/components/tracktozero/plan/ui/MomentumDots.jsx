import React from "react";
import { ttzPalette } from "../../theme.js";

// GATE-10B.1E: Snowball's per-row "momentum" progress indicator - a purely
// presentational read of (index, total), never new data. Dots up to and
// including the row's own position are filled; the rest stay outlined.
export default function MomentumDots({ index, total, size = 8 }) {
  const palette = ttzPalette;
  if (!total || total <= 1) return null;
  return (
    <div role="img" aria-label={`Payoff position ${index + 1} of ${total}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: total }, (_, dotIndex) => (
        <span
          key={dotIndex}
          aria-hidden="true"
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: dotIndex <= index ? palette.ac : "transparent",
            border: `1.5px solid ${dotIndex <= index ? palette.ac : palette.border2}`,
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}
