import React from "react";
import Tabs from "../ui/Tabs.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { getAssignableDebtOwners } from "../../../domain/tracktozero/ownership.js";

// UX-6.1: household-name-aware owner scope selector. The AGGREGATE option's
// label is the workspace's SAVED display name (snapshot.workspace.name),
// falling back to "Your household" - matching Settings' own established
// fallback (never the previous hardcoded "Everyone", which ignored the
// saved name entirely). This is UI-only scope state: selecting the
// aggregate/Joint/Unassigned tab never writes an ownerType of "household"
// (or anything else) into any data - only "all"/"joint"/"unassigned"/a real
// member-or-person id are ever passed to `onChange`.
//
// UX-6.2: verified members and financial profiles were previously one flat
// tab row with no distinction - a financial profile "looked like" a real
// member. Verified members render in the primary row (via the shared
// getAssignableDebtOwners derivation - never a pending invite); financial
// profiles, when any exist, render as a visually secondary second row with
// an explicit caption, not silently mixed in.
export default function ScopeSelector({ snapshot, ownerFilter, onChange, people = [] }) {
  if (snapshot.workspace?.type !== "household") return null;
  const householdName = snapshot.workspace?.name || "Your household";
  const { verifiedMembers, financialProfiles } = getAssignableDebtOwners({ members: snapshot.members, people });
  const palette = ttzPalette;
  const items = [
    { key: "all", label: householdName },
    ...verifiedMembers.map((member) => ({ key: member.uid, label: member.displayName || member.uid })),
    { key: "joint", label: "Joint" },
    { key: "unassigned", label: "Unassigned" },
  ];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Tabs label="Filter by owner" items={items} activeKey={ownerFilter} onChange={onChange} />
      {financialProfiles.length ? (
        <div>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginBottom: 4 }}>Financial profiles (not connected to an account)</div>
          <Tabs
            label="Filter by financial profile"
            items={financialProfiles.map((person) => ({ key: person.id, label: person.displayName }))}
            activeKey={ownerFilter}
            onChange={onChange}
          />
        </div>
      ) : null}
    </div>
  );
}
