import React, { useState } from "react";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import Input from "../ui/Input.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { getAssignableDebtOwners } from "../../../domain/tracktozero/ownership.js";

// Token-based rewrite of the monolith's OwnerField (same contract, same
// behavior) - workspace-aware owner selector shared by manual debt entry
// and import review. Personal workspaces have nothing to choose - every
// debt always belongs to the signed-in member, so it's shown as a fixed,
// non-editable fact. Household workspaces require an explicit choice from
// the REAL verified member list, an existing DATA-HH1 household person,
// Joint/Household, or Unassigned - never free text, so a parser suggestion
// or typo can never become an owner. onCreatePerson (optional) lets the
// caller add a genuinely new household financial identity inline - it never
// creates an Auth account or a WorkspaceMembership, only a Workspace-scoped
// person another debt's owner can also reference.
//
// UX-6.2: verified members and financial profiles ("not connected to an
// account") were previously one flat, undifferentiated <option> list - a
// user could not tell a real authenticated member from an unconnected
// financial profile when picking an owner. Now grouped via the shared
// getAssignableDebtOwners derivation (never a pending invite - nothing here
// ever reads memberInvites) into two labeled <optgroup>s.
export default function OwnerField({ workspace, members = [], people = [], ownerType, ownerId, onChange, onCreatePerson, disabled }) {
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  if (workspace?.type !== "household") {
    return <Field label="Owner"><Badge tone="success">You</Badge></Field>;
  }
  const { verifiedMembers, financialProfiles } = getAssignableDebtOwners({ members, people });
  const value = ownerType === "member" && ownerId ? `member:${ownerId}`
    : ownerType === "person" && ownerId ? `person:${ownerId}`
    : (ownerType || "unassigned");

  const handleCreate = async () => {
    const name = newPersonName.trim();
    if (!name || !onCreatePerson) return;
    setCreating(true);
    setCreateError("");
    try {
      const person = await onCreatePerson(name);
      onChange({ ownerType: "person", ownerId: person.id });
      setAddingPerson(false);
      setNewPersonName("");
    } catch {
      setCreateError("Couldn't add that person. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Field label="Owner">
      <Select
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.startsWith("member:")) onChange({ ownerType: "member", ownerId: raw.slice(7) });
          else if (raw.startsWith("person:")) onChange({ ownerType: "person", ownerId: raw.slice(7) });
          else onChange({ ownerType: raw, ownerId: "" });
        }}
      >
        <option value="unassigned">Unassigned</option>
        <option value="joint">Joint / Household</option>
        {verifiedMembers.length ? (
          <optgroup label="Verified members">
            {verifiedMembers.map((member) => (
              <option key={member.uid} value={`member:${member.uid}`}>{member.displayName || member.uid}</option>
            ))}
          </optgroup>
        ) : null}
        {financialProfiles.length ? (
          <optgroup label="Financial profiles (not connected to an account)">
            {financialProfiles.map((person) => (
              <option key={person.id} value={`person:${person.id}`}>{person.displayName}</option>
            ))}
          </optgroup>
        ) : null}
      </Select>
      {onCreatePerson && !disabled ? (
        addingPerson ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
            <Input
              style={{ flex: 1 }}
              placeholder="Person's name"
              value={newPersonName}
              disabled={creating}
              onChange={(event) => setNewPersonName(event.target.value)}
            />
            <Button type="button" size="sm" disabled={creating || !newPersonName.trim()} onClick={handleCreate}>
              {creating ? "Adding..." : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={creating} onClick={() => { setAddingPerson(false); setNewPersonName(""); setCreateError(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" style={{ marginTop: 6 }} onClick={() => setAddingPerson(true)}>
            + Add a household person
          </Button>
        )
      ) : null}
      {createError ? <p role="alert" style={{ ...TYPE_SCALE.caption, color: ttzPalette.da, margin: "4px 0 0" }}>{createError}</p> : null}
    </Field>
  );
}
