import React, { forwardRef } from "react";
import { ttzPalette, toneColors } from "../theme.js";

// ONE card surface for the whole product (UX-1 Part 12/17) - stops every
// screen from independently reinventing "white box, thin blue border" with
// identical visual weight regardless of importance. `variant` communicates
// hierarchy; content/information-architecture decisions still belong to the
// caller, never to this primitive.
const VARIANT_STYLES = (palette) => ({
  default: {
    background: palette.surf,
    border: `1px solid ${palette.border}`,
    boxShadow: "none",
  },
  elevated: {
    background: palette.surf,
    border: `1px solid ${palette.border}`,
    boxShadow: "var(--ttz-shadow-md, 0 8px 24px rgba(10,34,54,0.08))",
  },
  interactive: {
    background: palette.surf,
    border: `1px solid ${palette.border2}`,
    boxShadow: "var(--ttz-shadow-sm, 0 1px 2px rgba(10,34,54,0.06))",
    cursor: "pointer",
  },
  highlight: {
    background: palette.acS || palette.surf2,
    border: `1px solid ${palette.ac}`,
  },
  warning: {
    background: toneColors(palette).warning.bg,
    border: `1px solid ${toneColors(palette).warning.border}`,
  },
  critical: {
    background: toneColors(palette).danger.bg,
    border: `1px solid ${toneColors(palette).danger.border}`,
  },
});

const Card = forwardRef(function Card({ variant = "default", padding = "var(--ttz-space-5, 24px)", style, children, ...rest }, ref) {
  const palette = ttzPalette;
  const variantStyle = VARIANT_STYLES(palette)[variant] || VARIANT_STYLES(palette).default;
  return (
    <div
      ref={ref}
      style={{
        borderRadius: "var(--ttz-radius-lg, 16px)",
        padding,
        ...variantStyle,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
