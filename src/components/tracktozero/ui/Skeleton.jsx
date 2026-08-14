import React from "react";
import { ttzPalette } from "../theme.js";

export default function Skeleton({ width = "100%", height = 16, label = "Loading", style }) {
  const palette = ttzPalette;
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "block",
        width,
        height,
        borderRadius: "var(--ttz-radius-sm, 8px)",
        background: `linear-gradient(90deg, ${palette.surf2}, ${palette.surf3}, ${palette.surf2})`,
        ...style,
      }}
    />
  );
}
