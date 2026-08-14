import React from "react";
import Badge from "../ui/Badge.jsx";
import { getEnvironmentBadge } from "./environment.js";

// Renders (or renders nothing for production) via the single environment.js
// decision helper - never re-detects the environment itself.
export default function EnvironmentBadge({ repositoryMode, snapshotMode }) {
  const badge = getEnvironmentBadge(repositoryMode, snapshotMode);
  if (!badge) return null;
  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}
