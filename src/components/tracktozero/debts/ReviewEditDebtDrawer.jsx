import React, { useState } from "react";
import Drawer from "../ui/Drawer.jsx";
import Field from "../ui/Field.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import DateInput from "../ui/DateInput.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Button from "../ui/Button.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import OwnerField from "./OwnerField.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { describeDebtReviewReasons, disambiguationSuffixForDebt, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { describeCycleProgress, resolveCurrentBillingCycle, resolveWorkingBalance, sumActualPaymentsInCycle } from "../../../domain/tracktozero/paymentCycle.js";

const REQUIRED_PAYMENT_SOURCE_LABEL = {
  statement_confirmed: "Lender-confirmed",
  user_confirmed: "You entered this",
  issuer_rule_estimate: "Estimated",
  imported_requires_review: "Imported, needs review",
  unknown: "Unknown",
};

// GATE-10B.1C: the payment section's label/value rows (Current balance,
// Current minimum due, Estimated next minimum, and the live new-balance
// preview) - previously these were run-together prose sentences, harder to
// scan than a real field-by-field breakdown.
function PaymentFieldRow({ label, value, palette, emphasis = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>{label}</span>
      <span style={{ ...TYPE_SCALE.body, fontWeight: emphasis ? 800 : 700, color: palette.tx }}>{value}</span>
    </div>
  );
}

const draftFromDebt = (debt) => {
  const rule = debt?.minimumPaymentRule || null;
  return {
    name: debt?.name || "",
    debtType: debt?.debtType || "other",
    aprStatus: debt?.aprStatus || "unknown",
    apr: debt?.aprStatus && debt.aprStatus !== "unknown" && debt.aprStatus !== "no_interest" ? String(Number(debt.apr || 0) * 100) : "",
    minimumRequiredPayment: debt?.minimumRequiredPayment != null ? String(debt.minimumRequiredPayment) : "",
    dueDay: debt?.dueDay || "",
    ownerType: debt?.ownerType || "unassigned",
    ownerId: debt?.ownerId || "",
    includedInCorePayoffPlan: debt?.includedInCorePayoffPlan !== false,
    // GATE-10B.1A: "" means "Other / I don't know" (no rule) - the only
    // state that clears minimumPaymentRule on save.
    ruleType: rule?.ruleType || "",
    rulePercentage: rule?.percentageComponent != null ? String(rule.percentageComponent * 100) : "",
    ruleFixedFloor: rule?.fixedFloor != null ? String(rule.fixedFloor) : "",
    ruleInterestComponent: !!rule?.interestComponent,
    ruleFeeComponent: !!rule?.feeComponent,
    ruleFeeAmount: rule?.feeAmount != null ? String(rule.feeAmount) : "",
  };
};

// GATE-10B.1A: true only when the chosen ruleType has everything
// createMinimumPaymentRuleProfile would require - lets the Save button stay
// disabled on an incomplete rule instead of the user discovering a rejected
// save only after submitting.
const isRuleDraftComplete = (draft) => {
  if (draft.ruleType === "") return true; // "Other / I don't know" - always valid, clears the rule
  if (draft.ruleType === "fixed_amount") return draft.ruleFixedFloor !== "";
  if (draft.ruleType === "percentage_of_balance" || draft.ruleType === "percentage_plus_interest_fees") return draft.rulePercentage !== "";
  return false;
};

const ruleInputFromDraft = (draft) => {
  if (draft.ruleType === "") return null;
  return {
    ruleType: draft.ruleType,
    percentageComponent: draft.rulePercentage === "" ? null : Number(draft.rulePercentage),
    fixedFloor: draft.ruleFixedFloor === "" ? null : Number(draft.ruleFixedFloor),
    interestComponent: draft.ruleType === "percentage_plus_interest_fees" && draft.ruleInterestComponent,
    feeComponent: draft.ruleType === "percentage_plus_interest_fees" && draft.ruleFeeComponent,
    feeAmount: draft.ruleFeeAmount === "" ? null : Number(draft.ruleFeeAmount),
  };
};

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
  // GATE-10B.1C: new UI field, passed through to recordPayment's
  // already-existing `paidAt` parameter (no service-layer change - it has
  // accepted `paidAt` since GATE-10B.1, just had no UI control until now).
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmPaidOff, setConfirmPaidOff] = useState(false);
  // GATE-10B.1C: a local, client-computed summary shown after a successful
  // save - captured from the exact same preview figures already shown to
  // the user before they submitted, so it never implies lender confirmation
  // of a number the user hasn't already seen.
  const [lastPaymentSummary, setLastPaymentSummary] = useState(null);
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
      // GATE-10B.1A: a separate service call (setMinimumPaymentRule), same
      // manageDebts trust tier as updateDebt - only actually called when
      // the rule draft differs from what's already saved, so re-saving
      // details unrelated to the rule doesn't churn an unnecessary write.
      const nextRule = ruleInputFromDraft(draft);
      const currentRule = debt.minimumPaymentRule || null;
      if (JSON.stringify(nextRule) !== JSON.stringify(currentRule ? {
        ruleType: currentRule.ruleType,
        percentageComponent: currentRule.percentageComponent,
        fixedFloor: currentRule.fixedFloor,
        interestComponent: currentRule.interestComponent,
        feeComponent: currentRule.feeComponent,
        feeAmount: currentRule.feeAmount,
      } : null)) {
        await service.setMinimumPaymentRule(snapshot.workspace.id, debt.id, nextRule);
      }
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

  const workingBalancePreview = paymentAmount !== "" ? Math.max(0, working.amount - Number(paymentAmount || 0)) : null;

  const savePayment = (event) => {
    event.preventDefault();
    const amount = Number(paymentAmount);
    const summary = { amount, newBalance: workingBalancePreview, nextMinimum: debt.estimatedNextMinimumPayment };
    runAction("record payment", async () => {
      await service.recordPayment(snapshot.workspace.id, debt.id, {
        amount,
        paidAt: paymentDate ? new Date(paymentDate).toISOString() : undefined,
      });
      setPaymentAmount("");
      setLastPaymentSummary(summary);
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
            <Field label="Minimum payment rule (optional - improves next-cycle estimates)">
              <Select value={draft.ruleType} onChange={(event) => setDraft({ ...draft, ruleType: event.target.value })}>
                <option value="">Other / I don&apos;t know</option>
                <option value="fixed_amount">Lender statement gives me a fixed minimum each cycle</option>
                <option value="percentage_of_balance">Percentage of balance</option>
                <option value="percentage_plus_interest_fees">Percentage of balance + interest/fees</option>
              </Select>
            </Field>
            {draft.ruleType === "fixed_amount" ? (
              <Field label="Fixed minimum amount">
                <MoneyInput min="0" value={draft.ruleFixedFloor} onChange={(event) => setDraft({ ...draft, ruleFixedFloor: event.target.value })} />
              </Field>
            ) : null}
            {draft.ruleType === "percentage_of_balance" || draft.ruleType === "percentage_plus_interest_fees" ? (
              <>
                <Field label="Percentage of balance (%)">
                  <Input type="number" min="0" step="0.01" value={draft.rulePercentage} onChange={(event) => setDraft({ ...draft, rulePercentage: event.target.value })} />
                </Field>
                <Field label="Fixed floor (optional - e.g. 'the greater of X% or $Y')">
                  <MoneyInput min="0" value={draft.ruleFixedFloor} onChange={(event) => setDraft({ ...draft, ruleFixedFloor: event.target.value })} />
                </Field>
              </>
            ) : null}
            {draft.ruleType === "percentage_plus_interest_fees" ? (
              <>
                <Checkbox
                  label="Include estimated monthly interest (based on this debt's APR)"
                  checked={draft.ruleInterestComponent}
                  onChange={(event) => setDraft({ ...draft, ruleInterestComponent: event.target.checked })}
                />
                <Checkbox
                  label="Include a typical fee amount"
                  checked={draft.ruleFeeComponent}
                  onChange={(event) => setDraft({ ...draft, ruleFeeComponent: event.target.checked })}
                />
                {draft.ruleFeeComponent ? (
                  <Field label="Typical fee amount">
                    <MoneyInput min="0" value={draft.ruleFeeAmount} onChange={(event) => setDraft({ ...draft, ruleFeeAmount: event.target.value })} />
                  </Field>
                ) : null}
              </>
            ) : null}
            {draft.ruleType !== "" ? (
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>
                Only choose this if you&apos;ve actually confirmed it - from your statement, cardholder agreement, or issuer. TrackToZero applies this formula to your balance to estimate next cycle&apos;s minimum; it never invents one on its own.
              </p>
            ) : null}
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
              <Button type="submit" variant="primary" disabled={!canManage || writeState.inProgress || !isRuleDraftComplete(draft)}>
                {writeState.action === "edit debt details" ? "Saving..." : "Save details"}
              </Button>
              {debt.status !== "archived" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!canManage || writeState.inProgress}
                  onClick={() => runAction("archive debt", async () => {
                    await service.archiveDebt(snapshot.workspace.id, debt.id);
                    await refresh();
                    onClose();
                  })}
                >
                  Remove from active debts
                </Button>
              ) : null}
            </div>
            {!canManage && <p style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Your role is read-only for debt details.</p>}
            {canManage && !isRuleDraftComplete(draft) ? (
              <p style={{ ...TYPE_SCALE.caption, color: palette.tx2, margin: 0 }}>Finish or clear the minimum payment rule above before saving.</p>
            ) : null}
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
          <form onSubmit={savePayment} style={{ display: "grid", gap: 14 }}>
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
              {presentedOwnerLabel(debt)}{debt.dueDay ? ` · Due day ${debt.dueDay}` : ""}
            </div>

            <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: "var(--ttz-radius-md, 12px)", background: palette.surf2, border: `1px solid ${palette.border}` }}>
              <PaymentFieldRow
                label="Current balance"
                value={working.amount != null ? `${money(working.amount)}${working.isEstimated ? " (estimated)" : ""}` : "Unknown"}
                palette={palette}
              />
              <PaymentFieldRow
                label="Current minimum due"
                value={debt.minimumRequiredPayment != null ? `${money(debt.minimumRequiredPayment)} (${REQUIRED_PAYMENT_SOURCE_LABEL[debt.requiredPaymentSource] || "Unknown"})` : "Not set"}
                palette={palette}
              />
              {/* GATE-10B.1A: a separate, clearly-labeled figure from "Current
                  minimum due" above - never "Next minimum due" unless
                  lender-confirmed (it never is, here). */}
              <PaymentFieldRow
                label="Estimated next minimum"
                value={debt.estimatedNextMinimumPayment != null ? `~${money(debt.estimatedNextMinimumPayment)}` : "Unknown"}
                palette={palette}
              />
              <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
                {recordedThisCycle.hasCycle ? `${money(recordedThisCycle.total)} recorded this cycle.` : `${money(recordedThisCycle.total)} recorded (no due day set, so cycle boundaries are unknown).`}
                {" "}Recording a payment does not change the confirmed balance - use Update balance for that.
              </div>
            </div>

            <Field label="Actual payment (optional)">
              <MoneyInput min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </Field>
            <Field label="Payment date">
              <DateInput value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </Field>

            {paymentAmount !== "" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <PaymentFieldRow label="Estimated balance after payment" value={money(workingBalancePreview)} palette={palette} emphasis />
                {(() => {
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
                })()}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress || paymentAmount === ""}>
                {writeState.action === "record payment" ? "Recording..." : "Save payment"}
              </Button>
            </div>

            {lastPaymentSummary ? (
              <InfoCallout>
                Recorded {money(lastPaymentSummary.amount)}. Estimated balance is now {money(lastPaymentSummary.newBalance)}
                {lastPaymentSummary.nextMinimum != null ? ` · estimated next minimum ~${money(lastPaymentSummary.nextMinimum)}` : ""}.
                This reflects your entry, not a lender confirmation.
              </InfoCallout>
            ) : null}
          </form>
        ) : null}
      </div>
    </Drawer>
  );
}
