import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import useReducedMotion from "../../../hooks/useReducedMotion.js";

// Consistent loading presentation (UX-1 Part 18) - a labeled spinner instead
// of ad-hoc "Loading..." text or a blank page. Respects reduced-motion
// (Part 32): the spinner simply doesn't animate rather than substituting a
// different large-motion effect.
export default function LoadingState({ label = "Loading" }) {
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "var(--ttz-space-6, 32px)" }} role="status" aria-live="polite">
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: `2px solid ${palette.border2}`,
          borderTopColor: palette.ac,
          animation: reducedMotion ? "none" : "ttz-spin 800ms linear infinite",
        }}
      />
      <span style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>{label}</span>
      {!reducedMotion ? (
        <style>{"@keyframes ttz-spin { to { transform: rotate(360deg); } }"}</style>
      ) : null}
    </div>
  );
}
