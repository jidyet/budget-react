import React, { forwardRef } from "react";
import { ttzPalette } from "../theme.js";

// Base text input styling shared by MoneyInput/DateInput/Select (UX-1 Part
// 19) - one visual contract for height/radius/border/focus instead of every
// form re-styling <input> independently.
const Input = forwardRef(function Input({ style, error, ...rest }, ref) {
  const palette = ttzPalette;
  return (
    <input
      ref={ref}
      style={{
        height: 40,
        padding: "0 12px",
        borderRadius: "var(--ttz-radius-sm, 8px)",
        border: `1px solid ${error ? palette.da : palette.border2}`,
        background: palette.surf,
        color: palette.tx,
        fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
        fontSize: 14,
        outlineOffset: 2,
        ...style,
      }}
      {...rest}
    />
  );
});

export default Input;
