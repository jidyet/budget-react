import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// Reads workspace.type from the same authoritative snapshot.workspace every
// other screen (Home, Debts, Plan, Settings) reads from - never a
// hardcoded/guessed label (UX-0 Part 2: header/Home/Debts/Plan/Settings must
// never disagree about workspace type). No workspace-name field exists yet
// in the domain model, so this shows "Personal workspace" / "Household
// workspace" rather than inventing a display name.
export default function WorkspaceIdentity({ workspace }) {
  const palette = ttzPalette;
  const label = workspace?.type === "household" ? "Household workspace" : "Personal workspace";
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Workspace</span>
      <span style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{label}</span>
    </div>
  );
}
