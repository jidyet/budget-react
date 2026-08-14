import React from "react";
import Badge from "./Badge.jsx";
import { STATUS_TONE } from "../theme.js";

// Renders a plan-health/status object produced by UX-0's derivePlanHealth /
// classifyPlanStatus (services/tracktozero/projectionStatusService.js).
// This component NEVER re-derives the status or its color from raw
// warnings/balances itself - it only maps the already-authoritative
// `status.code` to a visual tone via the ONE shared STATUS_TONE table in
// theme.js. That is what makes it structurally impossible for a critical
// plan to render green: there is only one lookup table, and "critical" is
// not in it as anything but "danger".
export default function StatusBadge({ status }) {
  const tone = STATUS_TONE[status?.code] || "neutral";
  return (
    <Badge tone={tone} aria-label={`Plan status: ${status?.label || "Unknown"}`}>
      {status?.label || "Unknown"}
    </Badge>
  );
}
