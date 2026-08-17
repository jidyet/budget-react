import React from "react";
import Tabs from "../ui/Tabs.jsx";

// UX-6.1: household-name-aware owner scope selector. The AGGREGATE option's
// label is the workspace's SAVED display name (snapshot.workspace.name),
// falling back to "Your household" - matching Settings' own established
// fallback (never the previous hardcoded "Everyone", which ignored the
// saved name entirely). This is UI-only scope state: selecting the
// aggregate/Joint/Unassigned tab never writes an ownerType of "household"
// (or anything else) into any data - only "all"/"joint"/"unassigned"/a real
// member-or-person id are ever passed to `onChange`.
export default function ScopeSelector({ snapshot, ownerFilter, onChange, people = [] }) {
  if (snapshot.workspace?.type !== "household") return null;
  const householdName = snapshot.workspace?.name || "Your household";
  const items = [
    { key: "all", label: householdName },
    ...snapshot.members.filter((member) => member.status !== "removed").map((member) => ({ key: member.uid, label: member.displayName || member.uid })),
    ...people.filter((person) => person.status !== "merged").map((person) => ({ key: person.id, label: person.displayName })),
    { key: "joint", label: "Joint" },
    { key: "unassigned", label: "Unassigned" },
  ];
  return <Tabs label="Filter by owner" items={items} activeKey={ownerFilter} onChange={onChange} />;
}
