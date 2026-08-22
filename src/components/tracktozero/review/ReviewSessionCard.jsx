import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import Field from "../ui/Field.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatMoney, formatPercent } from "../formatting.js";
// BETA-3.1: a workbook due-date cell that holds a bare day-of-month
// integer (e.g. "15" meaning "due on the 15th") - rather than a full
// calendar date - is encoded upstream as "day:15" (see
// workbookDebtDiscovery.js), since there is no year/month to anchor a
// real date to. Displaying that raw encoding verbatim would read as a
// parser glitch; this renders it as the plain-language day-of-month
// phrasing a person actually typed the number to mean.
const formatDueDateDisplay = (value) => {
  const dayMatch = /^day:(\d{1,2})$/.exec(String(value || ""));
  return dayMatch ? `Day ${dayMatch[1]} of each month` : value;
};
import { REVIEW_TYPES } from "../../../services/tracktozero/reviewDomain.js";
import { matchImportedOwnerToIdentity } from "../../../domain/tracktozero/personIdentity.js";
import { getAssignableDebtOwners } from "../../../domain/tracktozero/ownership.js";
import {
  REVIEW_TYPE_LABEL,
  addAsNewDebtLabel,
  addOlderBalanceLabel,
  getReviewWhy,
  historicalStatementNote,
  historicalStatementQuestion,
  ignoreStatementLabel,
  leaveForLaterLabel,
  newDebtPromptBody,
  newDebtPromptTitle,
  saveThisDebtLabel,
} from "../../../services/tracktozero/reviewCopy.js";

// REVIEW-1C's staged, inline batch-session sections. These are DELIBERATELY
// dumb/controlled: typing or selecting a value only reports it up to the
// parent's staged-answer state via onStage(type, entry) - it NEVER calls a
// REVIEW-1A resolution service directly and never mutates anything itself
// (Part 3/42). The actual safe, atomic, idempotent resolution only happens
// when the parent later calls service.saveReviewSession with everything the
// user staged. onStage(type, null) clears that type's staged answer (e.g.
// the field was cleared back to blank) - blank never becomes a staged 0/
// false/"confirmed" answer (Part 16).

const isOlderStatement = (candidate, debts, latestSnapshotsByDebt, targetDebtId) => {
  if (!candidate.statementDate || !targetDebtId) return false;
  const latest = latestSnapshotsByDebt?.[targetDebtId];
  if (!latest?.observedAt) return false;
  return Date.parse(candidate.statementDate) < Date.parse(latest.observedAt);
};

function MatchSubSection({ item, staged, onStage, debts, latestSnapshotsByDebt }) {
  const palette = ttzPalette;
  const matches = item.candidateEvidence?.reconciliation?.matches || [];
  const [selectedDebtId, setSelectedDebtId] = useState(staged?.args?.targetDebtId || (matches.length === 1 ? matches[0].debtId : ""));
  const [acceptedFields, setAcceptedFields] = useState({});
  const [decision, setDecision] = useState(
    staged?.action === "resolveAsNewDebt" ? "new" : staged?.action === "resolveAsExistingDebt" ? "update" : null
  );
  const selectedMatch = matches.find((match) => match.debtId === selectedDebtId) || null;
  const historical = selectedMatch ? isOlderStatement(item.candidate, debts, latestSnapshotsByDebt, selectedMatch.debtId) : false;

  // Re-stages on every change (decision, selected match, or which diff
  // fields are checked) so the batch-saved metadataUpdates always reflect
  // exactly what's currently checked - never a stale snapshot from an
  // earlier click (Part 3: staged state, not immediate mutation).
  const stageDecision = (nextDecision, fields = acceptedFields) => {
    setDecision(nextDecision);
    if (nextDecision === "update" && selectedMatch) {
      const diff = selectedMatch.diff || {};
      const metadataUpdates = {};
      if (fields.apr && diff.apr?.newValue != null) { metadataUpdates.apr = diff.apr.newValue; metadataUpdates.aprStatus = "known"; }
      if (fields.minimumRequiredPayment && diff.minimumPayment?.newValue != null) metadataUpdates.minimumRequiredPayment = diff.minimumPayment.newValue;
      if (fields.dueDay && diff.dueDay?.newValue) metadataUpdates.dueDay = diff.dueDay.newValue;
      onStage("match", { action: "resolveAsExistingDebt", args: { targetDebtId: selectedMatch.debtId, metadataUpdates }, label: `Update ${selectedMatch.debtName}` });
    } else if (nextDecision === "new") {
      onStage("match", { action: "resolveAsNewDebt", args: {}, label: "Track as a new debt" });
    } else if (nextDecision === "historical" && selectedMatch) {
      onStage("match", { action: "addHistoricalSnapshot", args: { targetDebtId: selectedMatch.debtId, statementDate: item.candidate.statementDate }, label: "Add as an older balance" });
    } else if (nextDecision === "ignore") {
      onStage("match", { action: "dismissDuplicate", args: {}, label: "Ignore this statement" });
    }
  };

  const toggleField = (field) => {
    const nextFields = { ...acceptedFields, [field]: !acceptedFields[field] };
    setAcceptedFields(nextFields);
    if (decision === "update") stageDecision("update", nextFields);
  };

  if (historical) {
    return (
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 8 }}>{historicalStatementQuestion()}</div>
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 12 }}>{historicalStatementNote()}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" variant={decision === "historical" ? "primary" : "secondary"} onClick={() => stageDecision("historical")}>{addOlderBalanceLabel()}</Button>
          <Button size="sm" variant={decision === "ignore" ? "primary" : "ghost"} onClick={() => stageDecision("ignore")}>{ignoreStatementLabel()}</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>{matches.length > 1 ? "Which debt is this?" : "Possible match"}</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>{getReviewWhy(item)}</p>
      <div role={matches.length > 1 ? "radiogroup" : undefined} aria-label="Possible matching debts" style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        {matches.map((match) => (
          <Card
            key={match.debtId}
            variant={selectedDebtId === match.debtId ? "highlight" : "interactive"}
            role="radio"
            aria-checked={selectedDebtId === match.debtId}
            tabIndex={0}
            onClick={() => setSelectedDebtId(match.debtId)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDebtId(match.debtId); } }}
            style={{ cursor: "pointer" }}
          >
            <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700 }}>{match.debtName}</div>
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{formatMoney(match.diff?.balance?.existingValue)}</div>
          </Card>
        ))}
      </div>

      {selectedMatch ? (
        <div style={{ marginBottom: 10 }}>
          {selectedMatch.diff?.apr?.newValue != null && selectedMatch.diff.apr.state !== "same" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.caption, color: palette.tx2, marginBottom: 4 }}>
              <input type="checkbox" checked={!!acceptedFields.apr} onChange={() => toggleField("apr")} />
              Use new APR: {formatPercent(selectedMatch.diff.apr.newValue)}
            </label>
          ) : null}
          {selectedMatch.diff?.minimumPayment?.newValue != null && selectedMatch.diff.minimumPayment.state !== "same" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.caption, color: palette.tx2, marginBottom: 4 }}>
              <input type="checkbox" checked={!!acceptedFields.minimumRequiredPayment} onChange={() => toggleField("minimumRequiredPayment")} />
              Use new minimum: {formatMoney(selectedMatch.diff.minimumPayment.newValue)}
            </label>
          ) : null}
          {selectedMatch.diff?.dueDay?.newValue && selectedMatch.diff.dueDay.state !== "same" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.caption, color: palette.tx2 }}>
              <input type="checkbox" checked={!!acceptedFields.dueDay} onChange={() => toggleField("dueDay")} />
              Use new due day: {selectedMatch.diff.dueDay.newValue}
            </label>
          ) : null}
        </div>
      ) : null}

      {selectedMatch ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" variant={decision === "update" ? "primary" : "secondary"} onClick={() => stageDecision("update")}>Update this debt</Button>
          <Button size="sm" variant={decision === "new" ? "primary" : "ghost"} onClick={() => stageDecision("new")}>It&apos;s a different debt</Button>
        </div>
      ) : matches.length > 1 ? (
        <Button size="sm" variant={decision === "new" ? "primary" : "ghost"} onClick={() => stageDecision("new")}>It&apos;s a new debt</Button>
      ) : null}
    </Card>
  );
}

function DuplicateSubSection({ staged, onStage }) {
  const palette = ttzPalette;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>Already added?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>This looks like a statement you&apos;ve already added.</p>
      <Button size="sm" variant={staged?.action === "dismissDuplicate" ? "primary" : "secondary"} onClick={() => onStage("duplicate", { action: "dismissDuplicate", args: {}, label: "Keep the existing one" })}>
        Keep the one already in TrackToZero
      </Button>
    </Card>
  );
}

// Fix: a candidate the reconciliation engine found NO existing-debt match
// for at all (MATCH_CLASSIFICATIONS.noMatch) never got a MatchSubSection or
// DuplicateSubSection - both are gated on hasMatch/hasDuplicate, which stay
// false for a genuine no-match candidate. Without this, such a candidate had
// literally no staged action anywhere in this wizard that getTerminalEntry
// recognizes (resolveAsNewDebt/resolveAsExistingDebt/dismissDuplicate), so
// it could never leave the queue no matter how completely its other fields
// (balance/due day/owner/etc.) were filled in - filed missing info just sat
// there forever with nothing to actually resolve the item. Renders whenever
// neither of those two sections would - i.e. there's no conflicting
// existing debt to differentiate against, so a single clear "add it" is the
// whole decision.
function NewDebtSubSection({ staged, onStage }) {
  const palette = ttzPalette;
  const isStaged = staged?.action === "resolveAsNewDebt";
  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>{newDebtPromptTitle()}</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>{newDebtPromptBody()}</p>
      <Button size="sm" variant={isStaged ? "primary" : "secondary"} onClick={() => onStage("newDebt", { action: "resolveAsNewDebt", args: {}, label: addAsNewDebtLabel() })}>
        {addAsNewDebtLabel()}
      </Button>
    </Card>
  );
}

function BalanceSubSection({ item, staged, onStage }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const balanceEvidence = candidate.evidence?.fieldEvidence?.balance || [];
  const formulaEvidence = balanceEvidence.find((entry) => entry.truth === "formula_derived" || entry.truth === "projected");
  const [value, setValue] = useState(staged?.args?.currentBalance != null ? String(staged.args.currentBalance) : "");

  const stage = (raw) => {
    setValue(raw);
    if (raw === "") { onStage("balance", null); return; }
    const num = Number(raw);
    if (Number.isFinite(num)) onStage("balance", { action: "resolveBalance", args: { currentBalance: num }, label: `Balance ${formatMoney(num)}` });
  };

  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>{formulaEvidence ? "Is this your current balance?" : "What's the current balance?"}</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>
        {formulaEvidence
          ? `We found ${formatMoney(formulaEvidence.value)} in your workbook. This comes from a formula, not an actual statement.`
          : "We're missing your current balance for this debt."}
      </p>
      {formulaEvidence ? (
        <Button size="sm" variant={staged?.args?.currentBalance === formulaEvidence.value ? "primary" : "secondary"} style={{ marginBottom: 10 }} onClick={() => stage(String(formulaEvidence.value))}>
          Yes, use {formatMoney(formulaEvidence.value)}
        </Button>
      ) : null}
      <Field label={formulaEvidence ? "Or enter my current balance" : "Current balance"}>
        <MoneyInput value={value} onChange={(event) => stage(event.target.value)} placeholder="0.00" />
      </Field>
    </Card>
  );
}

// REVIEW-2: matches import/AprCandidatesField.jsx's balance-type labeling
// (Purchases / Cash advance / Balance transfer / Penalty rate) - this
// component previously showed bare percentages with no context, a real
// double-implementation gap relative to the already-enhanced Import Review
// component for the same underlying evidence shape.
const APR_BALANCE_TYPE_LABELS = {
  purchase: "Purchases",
  cash_advance: "Cash advance",
  balance_transfer: "Balance transfer",
  penalty: "Penalty rate",
};

function AprSubSection({ item, staged, onStage }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const aprEvidence = candidate.evidence?.fieldEvidence?.apr || [];
  const knownCandidates = [...new Map(
    aprEvidence.filter((entry) => entry.aprStatus === "known" && entry.apr != null).map((entry) => [`${entry.apr}`, entry])
  ).values()];
  const strongest = knownCandidates[0] || null;
  const [manual, setManual] = useState("");
  const [useManual, setUseManual] = useState(false);

  const stageApr = (apr) => onStage("apr", { action: "resolveApr", args: { apr, aprStatus: "known" }, label: `APR ${formatPercent(apr)}` });

  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>{knownCandidates.length > 1 ? "Which APR applies?" : "What's the APR?"}</div>
      {knownCandidates.length > 1 ? (
        <div role="radiogroup" aria-label="Possible APR values" style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {knownCandidates.map((entry) => {
            const balanceTypeLabel = APR_BALANCE_TYPE_LABELS[entry.provenance?.matchedText];
            return (
              <label key={entry.apr} style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.body, color: palette.tx }}>
                <input type="radio" name={`apr-${item.id}`} checked={!useManual && staged?.args?.apr === entry.apr} onChange={() => { setUseManual(false); stageApr(entry.apr); }} />
                {formatPercent(entry.apr)}
                {balanceTypeLabel ? <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>— {balanceTypeLabel}</span> : null}
                {entry === strongest ? <Badge tone="info">Most likely</Badge> : null}
              </label>
            );
          })}
          <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.body, color: palette.tx }}>
            <input type="radio" name={`apr-${item.id}`} checked={useManual} onChange={() => setUseManual(true)} />
            Enter another APR
          </label>
        </div>
      ) : (
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>We don&apos;t know the APR for this debt yet.</p>
      )}
      {useManual || !knownCandidates.length ? (
        <Field label="APR (%)" style={{ marginTop: 8 }}>
          <Input
            type="number" min="0" step="0.01" value={manual} placeholder="e.g. 7.25"
            onChange={(event) => {
              setManual(event.target.value);
              if (event.target.value === "") { onStage("apr", null); return; }
              const pct = Number(event.target.value);
              if (Number.isFinite(pct)) stageApr(pct / 100);
            }}
          />
        </Field>
      ) : null}
    </Card>
  );
}

function MinimumPaymentSubSection({ staged, onStage }) {
  const palette = ttzPalette;
  const [value, setValue] = useState(staged?.args?.minimumPayment != null ? String(staged.args.minimumPayment) : "");
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>What&apos;s the minimum payment?</div>
      <Field label="Minimum payment">
        <MoneyInput
          value={value}
          placeholder="0.00"
          onChange={(event) => {
            const raw = event.target.value;
            setValue(raw);
            if (raw === "") { onStage("minimum", null); return; }
            const num = Number(raw);
            if (Number.isFinite(num)) onStage("minimum", { action: "resolveMinimumPayment", args: { minimumPayment: num }, label: `Minimum ${formatMoney(num)}` });
          }}
        />
      </Field>
    </Card>
  );
}

function DueDaySubSection({ staged, onStage }) {
  const palette = ttzPalette;
  const [value, setValue] = useState(staged?.args?.dueDay != null ? String(staged.args.dueDay) : "");
  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>Payment due day</div>
      <Field label="Due day (1-31)">
        <Input
          type="number" min="1" max="31" value={value} placeholder="e.g. 21"
          onChange={(event) => {
            const raw = event.target.value;
            setValue(raw);
            if (raw === "") { onStage("dueDay", null); return; }
            const day = Number(raw);
            if (Number.isInteger(day) && day >= 1 && day <= 31) onStage("dueDay", { action: "resolveDueDate", args: { dueDay: day }, label: `Due day ${day}` });
          }}
        />
      </Field>
    </Card>
  );
}

// DATA-HH1: owner resolution now offers three kinds of choice - a real
// verified member, an existing household financial person (no account
// required), Joint, or Unassigned - plus a way to add a genuinely new
// household person on the spot. The live suggestion below is computed here,
// not stored on the candidate (Part 31 - matching stays pure/derivable, no
// redundant persisted state) - it is always a SUGGESTION; nothing here ever
// auto-selects it (Part 6 - "possible is not automatic confirmation").
function OwnerSubSection({ item, members, people = [], staged, onStage, onCreatePerson }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const { verifiedMembers: activeMembers, financialProfiles: activePeople } = getAssignableDebtOwners({ members, people });
  const [value, setValue] = useState(
    staged?.args
      ? staged.args.ownerType === "member" ? `member:${staged.args.ownerId}`
      : staged.args.ownerType === "person" ? `person:${staged.args.ownerId}`
      : staged.args.ownerType
      : ""
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const suggestion = candidate.ownerSuggestion
    ? matchImportedOwnerToIdentity({ rawName: candidate.ownerSuggestion, members: activeMembers, people: activePeople })
    : null;
  const suggestedName = suggestion?.kind === "member"
    ? activeMembers.find((member) => member.uid === suggestion.membershipUid)?.displayName
    : suggestion?.kind === "person"
      ? activePeople.find((person) => person.id === suggestion.personId)?.displayName
      : "";

  const stageOwner = (raw) => {
    setValue(raw);
    if (!raw) { onStage("owner", null); return; }
    if (raw.startsWith("member:")) onStage("owner", { action: "resolveOwner", args: { ownerType: "member", ownerId: raw.slice(7) }, label: "Owner set" });
    else if (raw.startsWith("person:")) onStage("owner", { action: "resolveOwner", args: { ownerType: "person", ownerId: raw.slice(7) }, label: "Owner set" });
    else onStage("owner", { action: "resolveOwner", args: { ownerType: raw, ownerId: "" }, label: "Owner set" });
  };

  const useSuggestion = () => {
    if (suggestion?.kind === "member") stageOwner(`member:${suggestion.membershipUid}`);
    else if (suggestion?.kind === "person") stageOwner(`person:${suggestion.personId}`);
  };

  const handleCreatePerson = async () => {
    if (!onCreatePerson) return;
    setCreating(true);
    setCreateError("");
    try {
      const person = await onCreatePerson(candidate.ownerSuggestion);
      stageOwner(`person:${person.id}`);
    } catch {
      setCreateError("We couldn't add that person yet. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>Who does this belong to?</div>
      {candidate.ownerSuggestion ? (
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 8 }}>
          {suggestion?.status === "exact" || suggestion?.status === "strong"
            ? `Suggested owner: ${candidate.ownerSuggestion}`
            : suggestion?.status === "possible"
              ? `Possible match: "${candidate.ownerSuggestion}" may be ${suggestedName} - please confirm.`
              : `We couldn't match "${candidate.ownerSuggestion}" to someone in your household.`}
        </p>
      ) : null}
      {(suggestion?.status === "strong" || suggestion?.status === "possible") && !value && suggestedName ? (
        <div style={{ marginBottom: 8 }}>
          <Button size="sm" variant="secondary" onClick={useSuggestion}>Use {suggestedName}</Button>
        </div>
      ) : null}
      <Field label="Confirmed owner">
        <Select value={value} onChange={(event) => stageOwner(event.target.value)}>
          <option value="">Choose an owner</option>
          <option value="unassigned">Unassigned</option>
          <option value="joint">Joint / Household</option>
          {activeMembers.length ? (
            <optgroup label="Verified members">
              {activeMembers.map((member) => <option key={member.uid} value={`member:${member.uid}`}>{member.displayName || member.uid}</option>)}
            </optgroup>
          ) : null}
          {activePeople.length ? (
            <optgroup label="Financial profiles (not connected to an account)">
              {activePeople.map((person) => <option key={person.id} value={`person:${person.id}`}>{person.displayName}</option>)}
            </optgroup>
          ) : null}
        </Select>
      </Field>
      {candidate.ownerSuggestion && onCreatePerson ? (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="ghost" disabled={creating} onClick={handleCreatePerson}>
            {creating ? "Adding..." : `+ Add "${candidate.ownerSuggestion}" as a new household person`}
          </Button>
          {createError ? <p style={{ ...TYPE_SCALE.caption, color: palette.da, marginTop: 4 }}>{createError}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

function BusinessScopeSubSection({ staged, onStage }) {
  const palette = ttzPalette;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>This looks like business debt</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>Do you want it in this household payoff plan?</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant={staged?.args?.decision === "exclude" ? "primary" : "secondary"} onClick={() => onStage("scope", { action: "resolveBusinessScope", args: { decision: "exclude" }, label: "Keep it out" })}>Keep it out</Button>
        <Button size="sm" variant={staged?.args?.decision === "include" ? "primary" : "ghost"} onClick={() => onStage("scope", { action: "resolveBusinessScope", args: { decision: "include" }, label: "Include it" })}>Include it</Button>
      </div>
    </Card>
  );
}

function DebtClassificationSubSection({ item, staged, onStage }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 4 }}>Is this a debt?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 10 }}>
        {candidate.accountName} - is this a loan you&apos;re paying down to $0?
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant={staged?.args?.classification === "debt" ? "primary" : "secondary"} onClick={() => onStage("classification", { action: "resolveDebtClassification", args: { classification: "debt" }, label: "It's a debt" })}>Yes, it&apos;s debt</Button>
        <Button size="sm" variant={staged?.args?.classification === "bill" ? "primary" : "ghost"} onClick={() => onStage("classification", { action: "resolveDebtClassification", args: { classification: "bill" }, label: "It's a bill" })}>No, it&apos;s just a bill</Button>
      </div>
    </Card>
  );
}

// REVIEW-2: what's ALREADY resolved for this candidate, collapsed into a
// compact checklist instead of getting zero visual acknowledgment - the
// inverse of item.types (a field only appears here when its corresponding
// REVIEW_TYPES flag is NOT present, i.e. nothing about it needs a decision).
function ConfirmedEvidenceSummary({ item }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const rows = [];
  if (candidate.creditorName || candidate.accountName) rows.push(["Creditor", candidate.creditorName || candidate.accountName]);
  if (!item.types.includes(REVIEW_TYPES.balanceConfirmation) && candidate.currentBalance != null) rows.push(["Balance", formatMoney(candidate.currentBalance)]);
  if (!item.types.includes(REVIEW_TYPES.aprConfirmation) && candidate.aprStatus === "known") rows.push(["APR", formatPercent(candidate.apr)]);
  if (!item.types.includes(REVIEW_TYPES.minimumPaymentConfirmation) && candidate.minimumPayment != null) rows.push(["Minimum due", formatMoney(candidate.minimumPayment)]);
  if (!item.types.includes(REVIEW_TYPES.dueDateConfirmation) && candidate.dueDate) rows.push(["Due date", formatDueDateDisplay(candidate.dueDate)]);
  if (candidate.debtType && candidate.debtType !== "other") rows.push(["Debt type", candidate.debtType.replace(/_/g, " ")]);
  if (!rows.length) return null;
  return (
    <Card variant="default" padding="var(--ttz-space-3, 12px)">
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: 8 }}>Unified verification</div>
      <div style={{ ...TYPE_SCALE.overline, color: palette.go, marginBottom: 6 }}>Confirmed fields</div>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", gap: 8, ...TYPE_SCALE.supporting, color: palette.tx }}>
            <span aria-hidden="true" style={{ color: palette.go }}>✓</span>
            <span style={{ color: palette.tx2 }}>{label}:</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// One card per open review item - every applicable section renders inline,
// stacked, so the user answers whatever they know in one continuous scroll
// instead of a modal per field (Part 2/34).
//
// REVIEW-2: the root card no longer amber-washes the whole item just
// because SOMETHING inside it is unresolved - the unresolved sub-section(s)
// below already carry their own warning styling; doubling that onto the
// container too was the "orange on orange" this phase was asked to fix. A
// small blocking/non-blocking badge in the header carries that signal
// instead, cheaply and honestly, without dominating the whole card.
export default function ReviewSessionCard({ item, isHousehold, members, people = [], debts, latestSnapshotsByDebt, stagedForItem = {}, onStage, onLeaveForLater, onSaveItem, onCreatePerson, busy, resultMessage, resultTone }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const title = candidate.accountName || candidate.creditorName || "Debt statement";
  const hasMatch = item.types.includes(REVIEW_TYPES.matchDecision) || item.types.includes(REVIEW_TYPES.multipleMatches);
  const hasDuplicate = item.types.includes(REVIEW_TYPES.duplicateImport) && !hasMatch;
  const hasNothingStaged = !Object.keys(stagedForItem).length;

  return (
    <Card className="ttz-review-session" variant="default">
      <div className="ttz-review-session-header" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(180px, auto)", gap: 16, alignItems: "start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ttz-review-session-title" style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, minWidth: 0, overflowWrap: "anywhere" }}>{title}</div>
          <div className="ttz-review-session-tags" style={{ display: "flex", width: "100%", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
            <Badge wrap tone={item.blocking ? "warning" : "neutral"}>{item.blocking ? "Affects your plan" : "Can wait"}</Badge>
            {item.types.map((type) => <Badge key={type} tone={item.blocking ? "warning" : "neutral"}>{REVIEW_TYPE_LABEL[type] || type}</Badge>)}
          </div>
        </div>
        <div className="ttz-review-session-actions" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, width: "100%" }}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onLeaveForLater} style={{ width: "100%" }}>{leaveForLaterLabel()}</Button>
          <Button size="sm" variant="primary" disabled={busy || hasNothingStaged} onClick={onSaveItem} style={{ width: "100%" }}>{saveThisDebtLabel()}</Button>
        </div>
      </div>

      {resultMessage ? (
        <div role="status" style={{ ...TYPE_SCALE.caption, color: resultTone === "danger" ? palette.da : resultTone === "warning" ? palette.wa : palette.go, marginBottom: 10, fontWeight: 700 }}>
          {resultMessage}
        </div>
      ) : null}

      <ConfirmedEvidenceSummary item={item} />

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {hasMatch ? (
          <MatchSubSection item={item} staged={stagedForItem.match} onStage={onStage} debts={debts} latestSnapshotsByDebt={latestSnapshotsByDebt} />
        ) : hasDuplicate ? (
          <DuplicateSubSection staged={stagedForItem.duplicate} onStage={onStage} />
        ) : (
          <NewDebtSubSection staged={stagedForItem.newDebt} onStage={onStage} />
        )}
        {item.types.includes(REVIEW_TYPES.debtClassification) ? <DebtClassificationSubSection item={item} staged={stagedForItem.classification} onStage={onStage} /> : null}
        {item.types.includes(REVIEW_TYPES.businessScope) ? <BusinessScopeSubSection staged={stagedForItem.scope} onStage={onStage} /> : null}
        {item.types.includes(REVIEW_TYPES.balanceConfirmation) ? <BalanceSubSection item={item} staged={stagedForItem.balance} onStage={onStage} /> : null}
        {item.types.includes(REVIEW_TYPES.aprConfirmation) ? <AprSubSection item={item} staged={stagedForItem.apr} onStage={onStage} /> : null}
        {item.types.includes(REVIEW_TYPES.minimumPaymentConfirmation) ? <MinimumPaymentSubSection staged={stagedForItem.minimum} onStage={onStage} /> : null}
        {item.types.includes(REVIEW_TYPES.dueDateConfirmation) ? <DueDaySubSection staged={stagedForItem.dueDay} onStage={onStage} /> : null}
        {isHousehold && item.types.includes(REVIEW_TYPES.ownerMatch) ? (
          <OwnerSubSection item={item} members={members} people={people} staged={stagedForItem.owner} onStage={onStage} onCreatePerson={onCreatePerson} />
        ) : null}
      </div>
    </Card>
  );
}
