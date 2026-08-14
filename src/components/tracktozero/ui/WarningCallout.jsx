import React from "react";
import Callout from "./Callout.jsx";

// Needs-review / ambiguous / stale-data messaging (UX-1 Part 15, 32). Never
// used for a critical/failing plan state - that is DangerCallout's job.
export default function WarningCallout(props) {
  return <Callout tone="warning" {...props} />;
}
