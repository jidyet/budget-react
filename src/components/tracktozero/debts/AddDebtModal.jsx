import React, { useState } from "react";
import Modal from "../ui/Modal.jsx";
import Field from "../ui/Field.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import DateInput from "../ui/DateInput.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Button from "../ui/Button.jsx";
import OwnerField from "./OwnerField.jsx";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { isDebtIncludedByDefault } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

const todayInputValue = () => new Date().toISOString().slice(0, 10);
const dateInputToIso = (value) => (value ? `${value}T00:00:00.000Z` : "");

const newDebtDraft = (prefillName = "") => ({
  clientRequestId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: prefillName,
  debtType: "credit_card",
  currentBalance: "",
  balanceAsOf: todayInputValue(),
  aprStatus: "unknown",
  apr: "",
  minimumRequiredPayment: "",
  dueDate: "",
  ownerType: "unassigned",
  ownerId: "",
  includedInCorePayoffPlan: true,
});

// UX-6.1: ADD DEBT is account creation, structurally separate from Quick
// Update's ongoing payment/balance maintenance (task requirement) - a
// modal, triggered only from the Debts Command Center's page-level header
// action (or, for a misclassified non-debt import item, a prefilled
// deep-link - see NonDebtCallout.jsx). Same fields, same createNewDebt
// call, same mortgage-exclusion default as the prior inline form - this is
// a relocation/token rewrite, not a behavior change.
//
// The draft resets fresh each time the modal opens because the caller
// remounts this component via a `key` tied to (open, prefillName) - see
// DebtsCenter.jsx - rather than syncing state from props in an effect.
export default function AddDebtModal({ open, onClose, snapshot, service, refresh, runAction, writeState, canManage, prefillName = "" }) {
  const [newDebt, setNewDebt] = useState(() => newDebtDraft(prefillName));
  const [newlyCreatedPeople, setNewlyCreatedPeople] = useState([]);
  const people = [...(snapshot.people || []), ...newlyCreatedPeople.filter((person) => !(snapshot.people || []).some((existing) => existing.id === person.id))];
  const palette = ttzPalette;
  const isHousehold = snapshot.workspace?.type === "household";

  const handleCreatePerson = async (displayName) => {
    const person = await service.createImportedPerson(snapshot.workspace.id, { displayName });
    setNewlyCreatedPeople((state) => (state.some((existing) => existing.id === person.id) ? state : [...state, person]));
    return person;
  };

  const submit = (event) => {
    event.preventDefault();
    runAction("add debt", async () => {
      const dueDay = newDebt.dueDate ? new Date(`${newDebt.dueDate}T00:00:00.000Z`).getUTCDate() : null;
      await service.createNewDebt(snapshot.workspace.id, {
        clientRequestId: newDebt.clientRequestId,
        name: newDebt.name,
        debtType: newDebt.debtType,
        currentBalance: Number(newDebt.currentBalance),
        balanceAsOf: dateInputToIso(newDebt.balanceAsOf),
        minimumRequiredPayment: newDebt.minimumRequiredPayment === "" ? null : Number(newDebt.minimumRequiredPayment),
        aprStatus: newDebt.aprStatus,
        apr: newDebt.aprStatus === "unknown" ? null : newDebt.aprStatus === "no_interest" ? 0 : Number(newDebt.apr),
        dueDay,
        ownerType: newDebt.ownerType,
        ownerId: newDebt.ownerId,
        includedInCorePayoffPlan: !!newDebt.includedInCorePayoffPlan,
      });
      setNewDebt(newDebtDraft());
      onClose?.();
      await refresh();
    });
  };

  return (
    <Modal open={open} title="Add a debt" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            border: `1px solid ${palette.border2 || palette.border}`,
            borderRadius: "var(--ttz-radius-lg, 20px)",
            padding: 16,
            background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
            boxShadow: "var(--ttz-shadow-sm)",
          }}
        >
          <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>Fresh debt setup</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, marginTop: 8 }}>
            Add the debt clean so the rest of the app can actually cook.
          </div>
          <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: "8px 0 0" }}>
            We only need the basics to get you moving: name, balance, required payment, and the cleanest APR info you have right now.
          </p>
        </div>
        <Field label="Creditor / debt name">
          <Input placeholder="Debt name" value={newDebt.name} onChange={(event) => setNewDebt({ ...newDebt, name: event.target.value })} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Field label="Debt type">
            <Select
              value={newDebt.debtType}
              onChange={(event) => {
                const debtType = event.target.value;
                setNewDebt({ ...newDebt, debtType, includedInCorePayoffPlan: isDebtIncludedByDefault(debtType) ? newDebt.includedInCorePayoffPlan : false });
              }}
            >
              {DEBT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Current balance">
            <MoneyInput min="0" value={newDebt.currentBalance} onChange={(event) => setNewDebt({ ...newDebt, currentBalance: event.target.value })} />
          </Field>
          <Field label="Balance as-of date">
            <DateInput value={newDebt.balanceAsOf} onChange={(event) => setNewDebt({ ...newDebt, balanceAsOf: event.target.value })} />
          </Field>
          <Field label="Required payment">
            <MoneyInput value={newDebt.minimumRequiredPayment} onChange={(event) => setNewDebt({ ...newDebt, minimumRequiredPayment: event.target.value })} />
          </Field>
          <Field label="APR status">
            <Select value={newDebt.aprStatus} onChange={(event) => setNewDebt({ ...newDebt, aprStatus: event.target.value })}>
              <option value="unknown">Unknown</option>
              <option value="known">Known</option>
              <option value="no_interest">No interest</option>
              <option value="promotional">Promotional</option>
            </Select>
          </Field>
        </div>
        {newDebt.aprStatus !== "unknown" && newDebt.aprStatus !== "no_interest" && (
          <Field label="APR (%)">
            <Input type="number" min="0" step="0.01" value={newDebt.apr} onChange={(event) => setNewDebt({ ...newDebt, apr: event.target.value })} />
          </Field>
        )}
        <Field label="Due date">
          <DateInput value={newDebt.dueDate} onChange={(event) => setNewDebt({ ...newDebt, dueDate: event.target.value })} />
        </Field>
        <OwnerField
          workspace={snapshot.workspace}
          members={snapshot.members}
          people={people}
          ownerType={newDebt.ownerType}
          ownerId={newDebt.ownerId}
          onChange={(next) => setNewDebt({ ...newDebt, ...next })}
          onCreatePerson={canManage ? handleCreatePerson : undefined}
        />
        <Checkbox
          label="Include in my core payoff plan"
          checked={!!newDebt.includedInCorePayoffPlan}
          onChange={(event) => setNewDebt({ ...newDebt, includedInCorePayoffPlan: event.target.checked })}
        />
        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: "var(--ttz-radius-md, 16px)",
            padding: 14,
            background: palette.surf2,
          }}
        >
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
            {isHousehold
              ? "Household tip: pick the real owner so payments, activity, and review history stay crystal clear."
              : "Solo tip: if APR is fuzzy today, no stress — you can still add the debt now and clean it up later."}
          </div>
        </div>
        {newDebt.debtType === "mortgage" && !newDebt.includedInCorePayoffPlan && (
          <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>Mortgage is tracked, but excluded from the core debt-free date unless you include it.</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" disabled={!canManage || writeState.inProgress}>
            {writeState.action === "add debt" ? "Adding..." : "Add debt"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
        {!canManage && <p style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Your role is read-only for debt setup.</p>}
      </form>
    </Modal>
  );
}
