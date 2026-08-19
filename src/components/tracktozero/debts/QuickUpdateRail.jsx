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
//
// UX-8.4 follow-up: previously a tall, always-vertical card living in its
// own dedicated 320px sidebar column that ran the full height of the page -
// direct feedback was that this reserved a whole vertical strip of mostly
// empty space (the card itself is short) at the cost of the page's usable
// width. Now a single horizontal bar: title on the left, both prompts (and
// whichever form is active) flowing inline on the right, wrapping onto a
// new line only at narrow widths. The caller (DebtsCenter.jsx) renders this
// full-width above the main content instead of beside it.
// GATE-10B.1: `initialMode` lets a caller (the mobile QuickActionSheet's
// generic "Record payment"/"Update balance" actions, which have no specific
// debt to jump straight to) open this rail's form pre-expanded instead of
// requiring one more tap after navigating to Debts.
export default function QuickUpdateRail({ snapshot, service, refresh, runAction, writeState, canObserve, initialMode = null }) {
  const [mode, setMode] = useState(canObserve ? initialMode : null); // null | "payment" | "balance"
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
    <Card variant="elevated" style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
      <div style={{ minWidth: 180 }}>
        <div style={{ ...TYPE_SCALE.overline, color: palette.tx2 }}>Quick update</div>
        <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginTop: 2 }}>Keep your debts current</div>
        {!canObserve ? (
          <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, margin: "6px 0 0" }}>Your role is read-only for payment/balance updates.</p>
        ) : null}
      </div>

      {canObserve ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, flex: 1, alignItems: "flex-end", justifyContent: "flex-end" }}>
          {mode !== "payment" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...TYPE_SCALE.body, color: palette.tx }}>Made a payment?</span>
              <Button type="button" onClick={() => setMode("payment")}>Record payment</Button>
            </div>
          ) : (
            <form onSubmit={submitPayment} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
              <Field label="Record payment">
                <Select value={payment.debtId} onChange={(event) => setPayment({ ...payment, debtId: event.target.value })}>
                  {snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Amount">
                <MoneyInput value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" variant="primary" disabled={writeState.inProgress}>
                  {writeState.action === "record payment" ? "Recording..." : "Save payment"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
              </div>
            </form>
          )}

          {mode !== "balance" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...TYPE_SCALE.body, color: palette.tx }}>Got your latest balance?</span>
              <Button type="button" onClick={() => setMode("balance")}>Update balance</Button>
            </div>
          ) : (
            <form onSubmit={submitBalance} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
              <Field label="Update confirmed balance">
                <Select value={balance.debtId} onChange={(event) => setBalance({ ...balance, debtId: event.target.value })}>
                  {snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Current balance">
                <MoneyInput value={balance.amount} onChange={(event) => setBalance({ ...balance, amount: event.target.value })} />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" variant="primary" disabled={writeState.inProgress}>
                  {writeState.action === "confirm balance" ? "Saving..." : "Save balance"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </Card>
  );
}
