import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

// UX-6.1: replaces the "Record observed reality" section - that exact
// engineering phrase is gone from the product entirely. This is ongoing
// account MAINTENANCE (ADD DEBT is account creation and stays a separate,
// page-level action - see AddDebtModal.jsx). Progressive disclosure: no
// field is visible until the user picks an action, matching the "Made a
// payment? / Got your latest balance?" pattern.
//
// PAYMENT/BALANCE SEMANTICS ARE LOCKED - unchanged from the prior UI:
// - Record payment -> service.recordPayment -> a PaymentEvent. It means
//   "the user says a payment occurred." It does NOT move the confirmed
//   balance.
// - Update balance -> service.recordBalanceSnapshot -> a BalanceSnapshot.
//   This IS the confirmed observed debt amount as of a date, and is what
//   moves confirmed progress.
// Only the entry point changed (hidden behind an action instead of always
// rendered); the underlying service calls and their meaning did not.
export default function QuickUpdateRail({ snapshot, service, refresh, runAction, writeState, canObserve }) {
  const [mode, setMode] = useState(null); // null | "payment" | "balance"
  const [payment, setPayment] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [balance, setBalance] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const palette = ttzPalette;

  const submitPayment = (event) => {
    event.preventDefault();
    runAction("record payment", async () => {
      await service.recordPayment(snapshot.workspace.id, payment.debtId, { amount: Number(payment.amount) });
      setPayment({ ...payment, amount: "" });
      setMode(null);
      await refresh();
    });
  };

  const submitBalance = (event) => {
    event.preventDefault();
    runAction("confirm balance", async () => {
      await service.recordBalanceSnapshot(snapshot.workspace.id, balance.debtId, { balance: Number(balance.amount) });
      setBalance({ ...balance, amount: "" });
      setMode(null);
      await refresh();
    });
  };

  return (
    <Card variant="elevated" style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ ...TYPE_SCALE.overline, color: palette.tx2 }}>Quick update</div>
        <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginTop: 4 }}>Keep your debts current</div>
      </div>

      {!canObserve ? (
        <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>Your role is read-only for payment/balance updates.</p>
      ) : null}

      {mode !== "payment" ? (
        <div>
          <p style={{ ...TYPE_SCALE.body, color: palette.tx, margin: "0 0 8px" }}>Made a payment?</p>
          <Button type="button" disabled={!canObserve} onClick={() => setMode("payment")}>Record payment</Button>
        </div>
      ) : (
        <form onSubmit={submitPayment} style={{ display: "grid", gap: 10 }}>
          <Field label="Record payment">
            <Select value={payment.debtId} onChange={(event) => setPayment({ ...payment, debtId: event.target.value })}>
              {snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount">
            <MoneyInput value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress}>
              {writeState.action === "record payment" ? "Recording..." : "Save payment"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {mode !== "balance" ? (
        <div>
          <p style={{ ...TYPE_SCALE.body, color: palette.tx, margin: "0 0 8px" }}>Got your latest balance?</p>
          <Button type="button" disabled={!canObserve} onClick={() => setMode("balance")}>Update balance</Button>
        </div>
      ) : (
        <form onSubmit={submitBalance} style={{ display: "grid", gap: 10 }}>
          <Field label="Update confirmed balance">
            <Select value={balance.debtId} onChange={(event) => setBalance({ ...balance, debtId: event.target.value })}>
              {snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Current balance">
            <MoneyInput value={balance.amount} onChange={(event) => setBalance({ ...balance, amount: event.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress}>
              {writeState.action === "confirm balance" ? "Saving..." : "Save balance"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
