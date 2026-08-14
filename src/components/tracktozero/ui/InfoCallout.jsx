import React from "react";
import Callout from "./Callout.jsx";

// Insufficient-data / neutral / pending messaging (UX-1 Part 15).
export default function InfoCallout(props) {
  return <Callout tone="info" {...props} />;
}
