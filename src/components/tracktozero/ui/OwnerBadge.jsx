import React from "react";
import Badge from "./Badge.jsx";

const OWNER_TONE = {
  member: "success",
  joint: "info",
  household: "info",
  unassigned: "warning",
};

export default function OwnerBadge({ ownerType = "unassigned", children }) {
  return <Badge tone={OWNER_TONE[ownerType] || "neutral"}>{children || "Unassigned"}</Badge>;
}
