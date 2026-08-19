import React, { useState } from "react";
import Drawer from "../ui/Drawer.jsx";
import Field from "../ui/Field.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Button from "../ui/Button.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import OwnerField from "./OwnerField.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { describeDebtReviewReasons, disambiguationSuffixForDebt } from "../../../domain/tracktozero/ownership.js";
import { describeCycleProgress, resolveCurrentBillingCycle, resolveWorkingBalance, sumActualPaymentsInCycle } from "../../../domain/tracktozero/paymentCycle.js";

const REQUIRED_PAYMENT_SOURCE_LABEL = {
  statement_confirmed: "Lender-confirmed",
  user_confirmed: "You entered this",
  issuer_rule_estimate: "Estimated",
  imported_requires_review: "Imported, needs review",
  unknown: "Unknown",
};

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
//
// GATE-10B.1: `initialSection` lets a caller open straight to "payment" or
// "balance" (e.g. a per-row "Record payment" button) instead of always
// landing on "details" and making the user find the right tab themselves -
// same lazy-useState-initializer pattern as `draft` below.
export default function ReviewEditDebtDrawer({ open, debt, onClose, snapshot, service, refresh, runAction, writeState, canManage, canObserve, initialSection = "details" }) {
  const [section, setSection] = useState(initialSection); // "details" | "balance" | "payment"
  const [draft, setDraft] = useState(() => draftFromDebt(debt));
  const [balanceAmount, setBalanceAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [confirmPaidOff, setConfirmPaidOff] = useState(false);
  const palette = ttzPalette;

  if (!debt) return null;
  const isHousehold = snapshot.workspace?.type === "household";
  const reasons = describeDebtReviewReasons(debt, isHousehold);
  const people = snapshot.people || [];

  // GATE-10B.1: same working-balance/cycle-progress primitives the payment
  // domain model is built on (paymentCycle.js) - this is display-only
  // context so the payment/balance forms below show what the user is
  // actually acting on (working balance, current-cycle required payment
  // and its source) instead of a bare input with no reference point.
  const latestSnapshot = snapshot.latestSnapshotsByDebt?.[debt.id] || null;
  const paymentEvents = snapshot.paymentEventsByDebt?.[debt.id] || [];
  const working = resolveWorkingBalance({ debt, latestSnapshot, paymentEvents });
  const billingCycle = resolveCurrentBillingCycle(debt.dueDay);
  const recordedThisCycle = sumActualPaymentsInCycle({ paymentEvents, cycle: billingCycle });
  const isZeroBalanceEntry = balanceAmount !== "" && Number(balanceAmount) === 0;

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
    // GATE-10B.1/Issue-20: a $0 entry goes through the explicit paid-off
    // confirmation path instead of an ordinary snapshot - recordBalance
    // Snapshot alone never moves debt.currentBalance, so a routine "Update
    // balance" of $0 would silently create a $0 BalanceSnapshot that never
    // actually surfaced the debt as Paid off anywhere.
    if (isZeroBalanceEntry) {
      runAction("confirm debt paid off", async () => {
        await service.confirmDebtPaidOff(snapshot.workspace.id, debt.id);
        setBalanceAmount("");
        setConfirmPaidOff(false);
        await refresh();
      });
      return;
    }
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
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                Latest confirmed balance: {working.lastConfirmedAmount != null ? money(working.lastConfirmedAmount) : "not set"}
                {working.lastConfirmedAt ? ` (as of ${new Date(working.lastConfirmedAt).toLocaleDateString()})` : ""}
              </p>
              {working.isEstimated ? (
                <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                  Estimated working balance: {money(working.amount)} - based on your last confirmed balance and payments you&apos;ve recorded since. Confirming a new balance here reconciles it.
                </p>
              ) : null}
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>Saving here records a new observed balance - it never edits debt terms.</p>
            </div>
            <Field label="Current balance">
              <MoneyInput min="0" value={balanceAmount} onChange={(event) => { setBalanceAmount(event.target.value); setConfirmPaidOff(false); }} />
            </Field>
            {isZeroBalanceEntry ? (
              <WarningCallout title="Confirm this debt is paid off">
                <div style={{ display: "grid", gap: 8 }}>
                  <p style={{ ...TYPE_SCALE.body, color: palette.tx, margin: 0 }}>
                    A $0 balance moves this debt to Paid off and stops directing payoff money toward it. This is based on your confirmation, not an automatic side effect of a payment.
                  </p>
                  {canManage ? (
                    <Checkbox
                      label="Yes, this debt is paid off"
                      checked={confirmPaidOff}
                      onChange={(event) => setConfirmPaidOff(event.target.checked)}
                    />
                  ) : (
                    <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>Your role can record balances but cannot mark a debt paid off - ask an admin or owner to confirm this.</p>
                  )}
                </div>
              </WarningCallout>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="submit"
                variant="primary"
                disabled={!canObserve || writeState.inProgress || (isZeroBalanceEntry && (!canManage || !confirmPaidOff))}
              >
                {writeState.action === "confirm debt paid off"
                  ? "Confirming..."
                  : writeState.action === "update current balance"
                  ? "Saving..."
                  : isZeroBalanceEntry
                  ? "Confirm paid off"
                  : "Save balance"}
              </Button>
            </div>
          </form>
        ) : null}

        {section === "payment" ? (
          <form onSubmit={savePayment} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                {debt.minimumRequiredPayment != null
                  ? `This cycle's required payment: ${money(debt.minimumRequiredPayment)} (${REQUIRED_PAYMENT_SOURCE_LABEL[debt.requiredPaymentSource] || "Unknown"})`
                  : "This cycle's required payment: not set"}
                {debt.dueDay ? ` · Due day ${debt.dueDay}` : ""}
              </p>
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                {recordedThisCycle.hasCycle ? `${money(recordedThisCycle.total)} recorded this cycle` : `${money(recordedThisCycle.total)} recorded (no due day set, so cycle boundaries are unknown)`}
                {working.amount != null ? ` · Working balance ${money(working.amount)}${working.isEstimated ? " (estimated)" : ""}` : ""}
              </p>
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                Recording a payment does not change the confirmed balance - use Update balance for that.
              </p>
            </div>
            <Field label="Payment amount">
              <MoneyInput min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </Field>
            {paymentAmount !== "" ? (() => {
              const preview = describeCycleProgress({ required: debt.minimumRequiredPayment, recordedThisCycle: recordedThisCycle.total + (Number(paymentAmount) || 0) });
              return (
                <InfoCallout>
                  {preview.required == null
                    ? `${money(preview.recorded)} recorded this cycle so far. This debt has no required payment set.`
                    : preview.isSatisfied
                    ? `Required payment recorded: ${money(preview.recorded)} of ${money(preview.required)}${preview.aboveRequired > 0 ? ` (${money(preview.aboveRequired)} above required)` : ""}.`
                    : `${money(preview.recorded)} of ${money(preview.required)} recorded this cycle · ${money(preview.remainingRequired)} still required.`}
                </InfoCallout>
              );
            })() : null}
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
