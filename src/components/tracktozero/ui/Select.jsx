import React, { forwardRef } from "react";
import { ttzPalette } from "../theme.js";

// Styled <select> matching Input's visual contract (UX-1 Part 19).
const Select = forwardRef(function Select({ style, error, children, ...rest }, ref) {
  const palette = ttzPalette;
  return (
    <select
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
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Select;
