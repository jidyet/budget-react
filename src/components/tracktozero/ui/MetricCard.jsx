import React from "react";
import Card from "./Card.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// The one "big number" card (UX-1 Part 6/12) - e.g. "What do I owe?",
// "Months to $0". Callers pass an already-formatted value string (see
// formatting.js) - this component never formats or computes financial
// numbers itself, only lays them out.
export default function MetricCard({ label, value, supporting, variant = "default", tone, style, ...rest }) {
  const palette = ttzPalette;
  return (
    <Card variant={variant} style={style} {...rest}>
      <div style={{ ...TYPE_SCALE.overline, color: palette.tx2, marginBottom: 8 }}>{label}</div>
      <div style={{ ...TYPE_SCALE.metric, color: tone || palette.tx, minWidth: 0 }}>{value}</div>
      {supporting ? (
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 6 }}>{supporting}</div>
      ) : null}
    </Card>
  );
}
