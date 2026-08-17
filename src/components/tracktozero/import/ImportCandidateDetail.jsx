import React from "react";
import Card from "../ui/Card.jsx";
import Field from "../ui/Field.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import DateInput from "../ui/DateInput.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import OwnerField from "../debts/OwnerField.jsx";
import ReconciliationSection from "./ReconciliationSection.jsx";
import AprCandidatesField from "./AprCandidatesField.jsx";
import EvidenceTrust from "./EvidenceTrust.jsx";
import LenderIdentity from "../debts/LenderIdentity.jsx";
import { DEBT_TYPE_OPTIONS } from "../debts/debtCategoryConfig.js";
import { isDebtIncludedByDefault } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

const DECISION_LABELS = { pending_review: "Needs your review", confirmed: "Will be added", excluded: "Excluded", needs_information: "Needs information" };

// UX-6.1: the detail pane of the master-detail Import Review - same fields,
// same onUpdate/onDecide/onResolveMatch/onResolveNew contracts as the
// monolith's ImportReviewCandidate, shown one candidate at a time (selected
// from ImportCandidateList) instead of always-expanded in a stacked wall.
// Current-vs-previous balance and minimum-vs-amount-paid stay visually
// distinguished (separate fields, never merged into one ambiguous label).
export default function ImportCandidateDetail({ candidate, canManage, busy, onUpdate, onDecide, onResolveMatch, onResolveNew, workspace, members, people, onCreatePerson }) {
  const reconciliation = candidate.evidence?.reconciliation;
  const hasUnresolvedMatch = !!(reconciliation?.matches?.length) && !reconciliation?.resolution;
  const resolvedAsUpdate = reconciliation?.resolution?.decision === "updateExisting";
  const decisionLabel = resolvedAsUpdate ? "Will update existing debt" : (DECISION_LABELS[candidate.decision] || candidate.decision);
  const palette = ttzPalette;
  const provenance = candidate.evidence?.provenance || {};
  const amountPaid = candidate.evidence?.amountPaid;
  // UX-8.3: "Source creditor" is the raw parser-evidence text (never edited
  // here, never hidden); "Recognized as" is derived from the CURRENT
  // editable accountName so it stays correct if the reviewer corrects a
  // misread name before confirming. Recognition is never silent - an
  // unmatched creditor says so explicitly instead of implying confidence
  // that doesn't exist.
  const sourceCreditorText = candidate.creditorName && candidate.creditorName !== candidate.accountName ? candidate.creditorName : "";
  const recognitionSource = candidate.accountName || candidate.creditorName || "";
  const recognizedIdentity = recognitionSource ? getLenderIdentity(recognitionSource) : null;

  return (
    <Card variant={candidate.decision === "confirmed" ? "highlight" : candidate.decision === "excluded" ? "critical" : "default"}>
      {recognizedIdentity ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: palette.surf2 }}>
          {sourceCreditorText ? (
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Source creditor: {sourceCreditorText}</div>
          ) : null}
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Recognized as</div>
          <LenderIdentity creditorName={recognitionSource} debtType={candidate.debtType} size="md" />
          {!recognizedIdentity.matched ? (
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Not confidently identified - shown as entered.</div>
          ) : null}
        </div>
      ) : null}
      <ReconciliationSection candidate={candidate} canManage={canManage} busy={busy} onResolveMatch={onResolveMatch} onResolveNew={onResolveNew} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Creditor / debt name">
          <Input disabled={!canManage} value={candidate.accountName} onChange={(event) => onUpdate({ accountName: event.target.value })} />
        </Field>
        <Field label="Debt type">
          <Select
            disabled={!canManage}
            value={candidate.debtType}
            onChange={(event) => onUpdate({ debtType: event.target.value, includedInCorePayoffPlan: isDebtIncludedByDefault(event.target.value) })}
          >
            {DEBT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <div>
          <Field label="Current balance">
            <MoneyInput disabled={!canManage} value={candidate.currentBalance} onChange={(event) => onUpdate({ currentBalance: Number(event.target.value) })} />
          </Field>
          <EvidenceTrust provenance={provenance.balance} />
          {candidate.evidence?.previousBalance != null ? (
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 2 }}>Previous balance: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(candidate.evidence.previousBalance)}</div>
          ) : null}
        </div>
        <Field label="Balance as-of date">
          <DateInput disabled={!canManage} value={candidate.statementDate || ""} onChange={(event) => onUpdate({ statementDate: event.target.value })} />
        </Field>
        <Field label="APR status">
          <Select
            disabled={!canManage}
            value={candidate.aprStatus}
            onChange={(event) => onUpdate({ aprStatus: event.target.value, apr: event.target.value === "unknown" ? null : event.target.value === "no_interest" ? 0 : candidate.apr })}
          >
            <option value="unknown">Unknown</option>
            <option value="known">Known</option>
            <option value="no_interest">No interest</option>
            <option value="promotional">Promotional</option>
          </Select>
        </Field>
        {candidate.aprStatus !== "unknown" && candidate.aprStatus !== "no_interest" && (
          <Field label="APR (%)">
            <Input type="number" min="0" step="0.01" disabled={!canManage} value={candidate.apr == null ? "" : Number(candidate.apr * 100).toFixed(2)} onChange={(event) => onUpdate({ apr: Number(event.target.value) / 100 })} />
          </Field>
        )}
        <AprCandidatesField candidate={candidate} canManage={canManage} onUpdate={onUpdate} />
        <div>
          <Field label="Minimum due">
            <MoneyInput disabled={!canManage} value={candidate.minimumPayment ?? ""} onChange={(event) => onUpdate({ minimumPayment: event.target.value === "" ? null : Number(event.target.value) })} />
          </Field>
          <EvidenceTrust provenance={provenance.minimumPayment} />
          {amountPaid != null ? (
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 2 }}>Amount paid last cycle: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountPaid)}</div>
          ) : null}
        </div>
        <Field label="Due date">
          <DateInput disabled={!canManage} value={candidate.dueDate || ""} onChange={(event) => onUpdate({ dueDate: event.target.value })} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <OwnerField
            workspace={workspace}
            members={members}
            people={people}
            ownerType={candidate.ownerType}
            ownerId={candidate.ownerId}
            disabled={!canManage}
            onChange={(next) => onUpdate(next)}
            onCreatePerson={onCreatePerson}
          />
        </div>
      </div>

      {workspace?.type === "household" && !!candidate.ownerSuggestion && (
        <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 10 }}>
          The statement suggested &quot;{candidate.ownerSuggestion}&quot; as the account holder. This is a hint only - choose the real owner above before confirming.
        </p>
      )}

      <div style={{ margin: "12px 0" }}>
        <Checkbox
          label="Include in core payoff plan"
          disabled={!canManage}
          checked={!!candidate.includedInCorePayoffPlan}
          onChange={(event) => onUpdate({ includedInCorePayoffPlan: event.target.checked })}
        />
      </div>

      {!!candidate.warnings?.length && (
        <ul style={{ ...TYPE_SCALE.supporting, color: palette.wa, margin: "0 0 12px", paddingLeft: 20 }}>
          {candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone="neutral">{decisionLabel}</Badge>
        <Button
          type="button"
          variant="primary"
          disabled={!canManage || busy || hasUnresolvedMatch}
          title={hasUnresolvedMatch ? "Resolve the possible match above first" : undefined}
          onClick={() => onDecide("confirmed")}
        >
          Confirm
        </Button>
        <Button type="button" disabled={!canManage || busy} onClick={() => onDecide("excluded")}>Exclude</Button>
        <Button type="button" disabled={!canManage || busy} onClick={() => onDecide("needs_information")}>Needs information</Button>
      </div>
    </Card>
  );
}
