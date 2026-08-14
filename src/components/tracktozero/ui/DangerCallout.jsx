import React from "react";
import Callout from "./Callout.jsx";

// Critical plan-health / infeasible-plan messaging (UX-1 Part 15). A plan
// with status.code === "critical" (see theme.js STATUS_TONE) renders here,
// never through WarningCallout or InfoCallout.
export default function DangerCallout(props) {
  return <Callout tone="danger" {...props} />;
}
