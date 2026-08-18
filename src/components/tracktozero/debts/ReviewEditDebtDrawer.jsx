import React, { useState } from "react";
import Drawer from "../ui/Drawer.jsx";
import Field from "../ui/Field.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Button from "../ui/Button.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import OwnerField from "./OwnerField.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { describeDebtReviewReasons, disambiguationSuffixForDebt } from "../../../domain/tracktozero/ownership.js";

const draftFromDebt = (debt) => ({
  name: debt?.name || "",
  debtType: debt?.debtType || "other",
  aprStatus: debt?.aprStatus || "unknown",
  apr: debt?.aprStatus && debt.aprStatus !== "unknown" && debt.aprStatus !== "no_interest" ? String(Number(debt.apr || 0) * 100) : "",
  minimumRequiredPayment: debt?.minimumRequiredPayment != null ? String(debt.minimumRequiredPayment) : "",
  dueDay: debt?.dueDay || "",
  ownerType: debt?.ownerType || "unassigned",
  ownerId: debt?.ownerId || "",
  includedInCorePayoffPlan: debt?.includedInCorePayoffPlan !== false,
});

// UX-8.2: the one place a confirmed Debt (healthy, needs-attention, manual,
// imported, Joint, unassigned - any state) gets reviewed and corrected.
// Deliberately three SEPARATE actions/service calls, never one generic
// "Save" - editing debt metadata, recording an observed balance, and
// recording a payment are three distinct financial actions with three
// distinct trust contracts (see updateDebt/recordBalanceSnapshot/
// recordPayment). The caller should remount this via a `key` tied to the
// open debt's id (mirrors AddDebtModal's own reset-on-open convention).
export default function ReviewEditDebtDrawer({ open, debt, onClose, snapshot, service, refresh, runAction, writeState, canManage, canObserve }) {
  const [section, setSection] = useState("details"); // "details" | "balance" | "payment"
  const [draft, setDraft] = useState(() => draftFromDebt(debt));
  const [balanceAmount, setBalanceAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const palette = ttzPalette;

  if (!debt) return null;
  const isHousehold = snapshot.workspace?.type === "household";
  const reasons = describeDebtReviewReasons(debt, isHousehold);
  const people = snapshot.people || [];

  const saveDetails = (event) => {
    event.preventDefault();
    runAction("edit debt details", async () => {
      await service.updateDebt(snapshot.workspace.id, debt.id, {
        name: draft.name,
        debtType: draft.debtType,
        aprStatus: draft.aprStatus,
        apr: draft.aprStatus === "unknown" ? null : draft.aprStatus === "no_interest" ? 0 : Number(draft.apr),
        minimumRequiredPayment: draft.minimumRequiredPayment === "" ? null : Number(draft.minimumRequiredPayment),
        dueDay: draft.dueDay === "" ? null : Number(draft.dueDay),
        ownerType: draft.ownerType,
        ownerId: draft.ownerId,
        includedInCorePayoffPlan: !!draft.includedInCorePayoffPlan,
      });
      await refresh();
    });
  };

  const saveBalance = (event) => {
    event.preventDefault();
    runAction("update current balance", async () => {
      await service.recordBalanceSnapshot(snapshot.workspace.id, debt.id, { balance: Number(balanceAmount) });
      setBalanceAmount("");
      await refresh();
    });
  };

  const savePayment = (event) => {
    event.preventDefault();
    runAction("record payment", async () => {
      await service.recordPayment(snapshot.workspace.id, debt.id, { amount: Number(paymentAmount) });
      setPaymentAmount("");
      await refresh();
    });
  };

  return (
    <Drawer open={open} title={`Review & edit: ${debt.name}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        <LenderIdentity
          creditorName={debt.name}
          debtType={debt.debtType}
          lastFour={debt.accountReferenceSafe}
          disambiguator={disambiguationSuffixForDebt(debt, snapshot.debts || [], { isHousehold })}
          showType
          size="lg"
        />
        {reasons.length ? (
          <WarningCallout title="Needs attention">
            <div style={{ display: "grid", gap: 4 }}>
              {reasons.map((reason) => (
                <div key={reason.code} style={{ ...TYPE_SCALE.body, color: palette.tx }}>
                  {reason.label}{reason.blocksPlan ? " (excludes this debt from your plan until fixed)" : ""}
                </div>
              ))}
            </div>
          </WarningCallout>
        ) : null}

        <div style={{ display: "flex", gap: 6 }}>
          <Button type="button" size="sm" variant={section === "details" ? "primary" : "ghost"} onClick={() => setSection("details")}>Edit details</Button>
          <Button type="button" size="sm" variant={section === "balance" ? "primary" : "ghost"} onClick={() => setSection("balance")} disabled={!canObserve}>Update balance</Button>
          <Button type="button" size="sm" variant={section === "payment" ? "primary" : "ghost"} onClick={() => setSection("payment")} disabled={!canObserve}>Record payment</Button>
        </div>

        {section === "details" ? (
          <form onSubmit={saveDetails} style={{ display: "grid", gap: 12 }}>
            <Field label="Creditor / debt name">
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Debt type">
              <Select value={draft.debtType} onChange={(event) => setDraft({ ...draft, debtType: event.target.value })}>
                {DEBT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Required payment">
              <MoneyInput value={draft.minimumRequiredPayment} onChange={(event) => setDraft({ ...draft, minimumRequiredPayment: event.target.value })} />
            </Field>
            <Field label="APR status">
              <Select value={draft.aprStatus} onChange={(event) => setDraft({ ...draft, aprStatus: event.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="known">Known</option>
                <option value="no_interest">No interest</option>
                <option value="promotional">Promotional</option>
              </Select>
            </Field>
            {draft.aprStatus !== "unknown" && draft.aprStatus !== "no_interest" && (
              <Field label="APR (%)">
                <Input type="number" min="0" step="0.01" value={draft.apr} onChange={(event) => setDraft({ ...draft, apr: event.target.value })} />
              </Field>
            )}
            <Field label="Due day (1-31)">
              <Input type="number" min="1" max="31" value={draft.dueDay} onChange={(event) => setDraft({ ...draft, dueDay: event.target.value })} />
            </Field>
            <OwnerField
              workspace={snapshot.workspace}
              members={snapshot.members}
              people={people}
              ownerType={draft.ownerType}
              ownerId={draft.ownerId}
              onChange={(next) => setDraft({ ...draft, ...next })}
              disabled={!canManage}
            />
            {isHousehold && (draft.ownerType !== debt.ownerType || draft.ownerId !== debt.ownerId) ? (
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                This changes who this debt is grouped under in your Household. It does not change the balance or payment history.
              </p>
            ) : null}
            <Checkbox
              label="Include in my core payoff plan"
              checked={!!draft.includedInCorePayoffPlan}
              onChange={(event) => setDraft({ ...draft, includedInCorePayoffPlan: event.target.checked })}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" variant="primary" disabled={!canManage || writeState.inProgress}>
                {writeState.action === "edit debt details" ? "Saving..." : "Save details"}
              </Button>
            </div>
            {!canManage && <p style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Your role is read-only for debt details.</p>}
          </form>
        ) : null}

        {section === "balance" ? (
          <form onSubmit={saveBalance} style={{ display: "grid", gap: 12 }}>
            <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
              Current confirmed balance: {money(debt.currentBalance || 0)}. Saving here records a new observed balance - it never edits debt terms.
            </p>
            <Field label="Current balance">
              <MoneyInput min="0" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress}>
                {writeState.action === "update current balance" ? "Saving..." : "Save balance"}
              </Button>
            </div>
          </form>
        ) : null}

        {section === "payment" ? (
          <form onSubmit={savePayment} style={{ display: "grid", gap: 12 }}>
            <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
              Recording a payment does not change the confirmed balance shown above - use Update balance for that.
            </p>
            <Field label="Payment amount">
              <MoneyInput min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress}>
                {writeState.action === "record payment" ? "Recording..." : "Save payment"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Drawer>
  );
}
