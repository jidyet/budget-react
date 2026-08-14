import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function FilterChip({ active = false, children, style, ...rest }) {
  const palette = ttzPalette;
  return (
    <button
      type="button"
      aria-pressed={active}
      style={{
        ...TYPE_SCALE.supporting,
        borderRadius: 999,
        border: `1px solid ${active ? palette.ac : palette.border2}`,
        background: active ? palette.acS : palette.surf,
        color: active ? palette.ac : palette.tx2,
        minHeight: 32,
        padding: "0 12px",
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
