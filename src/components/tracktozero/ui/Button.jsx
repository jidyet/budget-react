import React, { forwardRef } from "react";
import { ttzPalette } from "../theme.js";
import useReducedMotion from "../../../hooks/useReducedMotion.js";

// ONE button system for the whole product - consistent height/radius/focus/
// disabled/loading behavior instead of every screen styling its own <button>
// (the exact anti-pattern UX-1 Part 9 calls out). Visual only: callers still
// own onClick/type/disabled/etc.
const VARIANT_STYLES = (palette) => ({
  primary: {
    background: `linear-gradient(135deg, ${palette.wa} 0%, #ff8a1a 100%)`,
    color: "#ffffff",
    border: `1px solid ${palette.wa}`,
  },
  success: {
    background: `linear-gradient(135deg, ${palette.go} 0%, #2f8c39 100%)`,
    color: "#ffffff",
    border: `1px solid ${palette.go}`,
  },
  secondary: {
    background: palette.isDark ? "rgba(13,23,38,0.88)" : "rgba(255,255,255,0.88)",
    color: palette.tx,
    border: `1px solid ${palette.border2}`,
  },
  ghost: {
    background: "transparent",
    color: palette.tx2,
    border: "1px solid transparent",
  },
  danger: {
    background: palette.da,
    color: "#ffffff",
    border: `1px solid ${palette.da}`,
  },
});

const SIZE_STYLES = {
  md: { height: 40, padding: "0 16px", fontSize: 14 },
  sm: { height: 32, padding: "0 12px", fontSize: 13 },
};

const Button = forwardRef(function Button(
  { variant = "secondary", size = "md", loading = false, disabled = false, iconOnly = false, style, className, children, ...rest },
  ref
) {
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  const variantStyle = VARIANT_STYLES(palette)[variant] || VARIANT_STYLES(palette).secondary;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={["ttz-focus-ring", className].filter(Boolean).join(" ")}
      style={{
        ...variantStyle,
        ...sizeStyle,
        width: iconOnly ? sizeStyle.height : undefined,
        padding: iconOnly ? 0 : sizeStyle.padding,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: "var(--ttz-radius-md, 12px)",
        fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
        fontWeight: 700,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.55 : 1,
        boxShadow: variant === "primary" ? "var(--ttz-shadow-sm)" : "none",
        transition: reducedMotion ? "none" : "background-color 120ms ease, border-color 120ms ease, opacity 120ms ease, transform 120ms ease, box-shadow 120ms ease",
        outlineOffset: 2,
        ...style,
      }}
      {...rest}
    >
      {loading ? "..." : children}
    </button>
  );
});

export default Button;
