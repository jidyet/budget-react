import React from "react";
import { formatMoney as money } from "../formatting.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Button from "../ui/Button.jsx";

// GATE-10B.1C: deliberately distinct from the heavy Record Payment flow
// (ReviewEditDebtDrawer) - there is no free-text amount input here. The
// amount shown is always the debt's own minimumRequiredPayment, and the
// "Mark paid" click IS the explicit confirmation the financial-truth
// contract requires before service.recordPayment is called with that exact,
// pre-disclosed amount (never invented, never silently assumed).
export default function MarkAsPaidConfirm({ amount, lenderName, onConfirm, onCancel, onRecordDetails, busy }) {
  return (
    <div
      role="group"
      aria-label={`Confirm marking ${lenderName} as paid`}
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        borderRadius: 12,
        background: ttzPalette.surf,
        border: `1px solid ${ttzPalette.border2}`,
        width: "100%",
      }}
    >
      <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
        Mark {lenderName} payment as paid? Minimum due: <strong>{money(amount)}</strong>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>{busy ? "Marking paid…" : "Mark paid"}</Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="ghost" size="sm" onClick={onRecordDetails} disabled={busy}>Record details instead</Button>
      </div>
    </div>
  );
}
