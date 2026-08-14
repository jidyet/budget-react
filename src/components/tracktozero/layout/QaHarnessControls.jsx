import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Select from "../ui/Select.jsx";
import Field from "../ui/Field.jsx";

// The old WorkspaceBar's workspace/role switcher, preserved exactly (same
// props, same behavior) for firebaseEmulator/inMemory QA modes - just moved
// out of the primary header into its own small, clearly-secondary panel
// instead of dominating the command-center chrome (UX-1 Part 24/28). Real
// signed-in users (production/localBeta) never see this - workspace
// switching is not yet safely supported for them, so no fake selector is
// shown in its place (UX-1 Part 25 instruction).
export default function QaHarnessControls({ workspaces, workspaceId, setWorkspaceId, members, actorId, setActorId, allowNonMemberPreview }) {
  const palette = ttzPalette;
  const previewMembers = allowNonMemberPreview
    ? [...members, { uid: "seed-outsider", role: "non-member", displayName: "Non-member" }]
    : members;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-end",
        padding: "8px 12px",
        borderRadius: "var(--ttz-radius-sm, 8px)",
        border: `1px dashed ${palette.border2}`,
        background: palette.surf2,
      }}
    >
      <span style={{ ...TYPE_SCALE.caption, color: palette.tx2, alignSelf: "center" }}>QA preview controls:</span>
      <Field label="Workspace">
        <Select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.type === "household" ? "Household" : "Personal"} · {workspace.id}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Role preview">
        <Select value={actorId} onChange={(event) => setActorId(event.target.value)}>
          {previewMembers.map((member) => (
            <option key={member.uid} value={member.uid}>
              {member.displayName || member.uid} · {member.role}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
