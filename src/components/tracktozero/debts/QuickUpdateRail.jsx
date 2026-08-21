import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

export default function QuickUpdateRail({ snapshot, service, refresh, runAction, writeState, canObserve, initialMode = null }) {
  const [mode, setMode] = useState(canObserve ? initialMode : null);
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
    <Card
      variant="elevated"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        alignItems: "center",
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        boxShadow: "var(--ttz-shadow-md)",
        padding: "18px 22px",
      }}
    >
      <div style={{ minWidth: 240, display: "grid", gap: 4 }}>
        <div style={{ ...TYPE_SCALE.overline, color: palette.ac }}>Quick update</div>
        <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginTop: 2 }}>Keep your debt view fresh</div>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
          Log payments, lock in fresh balances, and keep the whole page clean.
        </div>
        {!canObserve ? (
          <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, margin: 0 }}>Your role is read-only for payment and balance updates.</p>
        ) : null}
      </div>

      {canObserve ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          {mode !== "payment" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
