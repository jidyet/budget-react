import React, { forwardRef } from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// Styled checkbox with an attached label (UX-1 Part 19) - the native input
// stays in the DOM (not visually hidden) so keyboard/screen-reader behavior
// is unmodified; only spacing/typography around it is standardized.
const Checkbox = forwardRef(function Checkbox({ label, style, ...rest }, ref) {
  const palette = ttzPalette;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input ref={ref} type="checkbox" style={{ width: 16, height: 16, accentColor: palette.ac, ...style }} {...rest} />
      {label ? <span style={{ ...TYPE_SCALE.body, color: palette.tx }}>{label}</span> : null}
    </label>
  );
});

export default Checkbox;
