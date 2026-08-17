import React, { useState } from "react";
import Drawer from "../ui/Drawer.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import DangerCallout from "../ui/DangerCallout.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import Input from "../ui/Input.jsx";
import Select from "../ui/Select.jsx";
import Field from "../ui/Field.jsx";
import Checkbox from "../ui/Checkbox.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatMoney, formatPercent } from "../formatting.js";
import { REVIEW_TYPES } from "../../../services/tracktozero/reviewDomain.js";
import { FRIENDLY_SAVE_FAILURE, FRIENDLY_STALE_MESSAGE, REVIEW_SUCCESS_COPY, getReviewWhy } from "../../../services/tracktozero/reviewCopy.js";

// REVIEW-1B's resolution surface. This component NEVER computes a match
// score, builds a BalanceSnapshot, writes Firestore, or decides financial
// idempotency itself (Part 42) - it only displays REVIEW-1A's own
// evidence/diff objects and calls the named REVIEW-1A service actions. All
// safety (atomicity, staleness, idempotency) already lives in those
// services; this file's job is to make the decision easy to understand.

const FIELD_LABEL = { apr: "APR", minimumRequiredPayment: "Minimum", dueDay: "Due day", balance: "Balance" };

function DiffRow({ label, existing, next }) {
  const palette = ttzPalette;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "12px 0", borderTop: `1px solid ${palette.border}`, alignItems: "start" }}>
      <div>
        <div style={{ ...TYPE_SCALE.caption, color: palette.muted, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 6 }}>TrackToZero</div>
        <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 500 }}>{existing}</div>
      </div>
      <div>
        <div style={{ ...TYPE_SCALE.caption, color: palette.muted, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 6 }}>New {label}</div>
        <div style={{ ...TYPE_SCALE.body, color: palette.ac, fontWeight: 700 }}>{next}</div>
      </div>
    </div>
  );
}

function MatchCandidateCard({ match, selected, onSelect }) {
  const palette = ttzPalette;
  return (
    <Card
      variant={selected ? "highlight" : "interactive"}
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}
      style={{ cursor: "pointer" }}
    >
      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{match.debtName}</div>
      <div style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 4 }}>{formatMoney(match.diff?.balance?.existingValue)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {match.reasons?.map((reason) => <Badge key={reason} tone="success">{reason}</Badge>)}
      </div>
    </Card>
  );
}

function MatchSection({ item, isHousehold, onUpdateExisting, onNewDebt, busy }) {
  const palette = ttzPalette;
  const matches = item.candidateEvidence?.reconciliation?.matches || [];
  const [selectedDebtId, setSelectedDebtId] = useState(matches.length === 1 ? matches[0].debtId : "");
  const [acceptedFields, setAcceptedFields] = useState({});
  const selectedMatch = matches.find((match) => match.debtId === selectedDebtId) || null;

  const toggleField = (field) => setAcceptedFields((state) => ({ ...state, [field]: !state[field] }));

  const buildMetadataUpdates = () => {
    const diff = selectedMatch?.diff || {};
    const updates = {};
    if (acceptedFields.apr && diff.apr?.newValue != null) {
      updates.apr = diff.apr.newValue;
      updates.aprStatus = "known";
    }
    if (acceptedFields.minimumRequiredPayment && diff.minimumPayment?.newValue != null) {
      updates.minimumRequiredPayment = diff.minimumPayment.newValue;
    }
    if (acceptedFields.dueDay && diff.dueDay?.newValue) {
      updates.dueDay = diff.dueDay.newValue;
    }
    return updates;
  };

  return (
    <Card variant="elevated">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, marginBottom: 12 }}>{matches.length > 1 ? "Which debt is this?" : "Possible match"}</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginBottom: 16 }}>{getReviewWhy(item)}</p>
      <div role={matches.length > 1 ? "radiogroup" : undefined} aria-label="Possible matching debts" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {matches.map((match) => (
          <MatchCandidateCard
            key={match.debtId}
            match={match}
            isHousehold={isHousehold}
            selected={selectedDebtId === match.debtId}
            onSelect={() => setSelectedDebtId(match.debtId)}
          />
        ))}
      </div>

      {selectedMatch ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${palette.border}` }}>
          <div style={{ ...TYPE_SCALE.overline, color: palette.muted, marginBottom: 12, fontWeight: 600, letterSpacing: "0.3px" }}>Why this looks like a match</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {selectedMatch.reasons?.map((reason) => <Badge key={reason} tone="success">{reason}</Badge>)}
          </div>
          <DiffRow label="Balance" existing={formatMoney(selectedMatch.diff.balance?.existingValue)} next={formatMoney(selectedMatch.diff.balance?.newValue)} />
          {selectedMatch.diff.apr?.newValue != null && selectedMatch.diff.apr?.state !== "same" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start", paddingTop: 12 }}>
              <DiffRow label="APR" existing={formatPercent(selectedMatch.diff.apr?.existingValue)} next={formatPercent(selectedMatch.diff.apr?.newValue)} />
              <div style={{ marginTop: 4 }}>
                <Checkbox label="Use new" checked={!!acceptedFields.apr} onChange={() => toggleField("apr")} />
              </div>
            </div>
          ) : null}
          {selectedMatch.diff.minimumPayment?.newValue != null && selectedMatch.diff.minimumPayment?.state !== "same" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start", paddingTop: 12 }}>
              <DiffRow label={FIELD_LABEL.minimumRequiredPayment} existing={formatMoney(selectedMatch.diff.minimumPayment?.existingValue)} next={formatMoney(selectedMatch.diff.minimumPayment?.newValue)} />
              <div style={{ marginTop: 4 }}>
                <Checkbox label="Use new" checked={!!acceptedFields.minimumRequiredPayment} onChange={() => toggleField("minimumRequiredPayment")} />
              </div>
            </div>
          ) : null}
          {selectedMatch.diff.dueDay?.newValue && selectedMatch.diff.dueDay?.state !== "same" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start", paddingTop: 12 }}>
              <DiffRow label={FIELD_LABEL.dueDay} existing={selectedMatch.diff.dueDay?.existingValue || "Not set"} next={selectedMatch.diff.dueDay?.newValue} />
              <div style={{ marginTop: 4 }}>
                <Checkbox label="Use new" checked={!!acceptedFields.dueDay} onChange={() => toggleField("dueDay")} />
              </div>
            </div>
          ) : null}

          <InfoCallout style={{ marginTop: 20 }} title={`Update ${selectedMatch.debtName}?`}>
            We&apos;ll keep this as the same debt, add the new confirmed balance, and update only the details you checked above.
            We won&apos;t create a payment automatically, and we won&apos;t erase your old balance history.
          </InfoCallout>
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Button variant="primary" disabled={busy} onClick={() => onUpdateExisting(selectedMatch.debtId, buildMetadataUpdates())}>
              {busy ? "Saving..." : "Update this debt"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onNewDebt}>It&apos;s a different debt</Button>
          </div>
        </div>
      ) : matches.length > 1 ? (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" disabled={busy} onClick={onNewDebt} style={{ width: "100%" }}>It&apos;s a new debt</Button>
        </div>
      ) : null}
    </Card>
  );
}

function DuplicateSection({ item, onKeep, onReviewAnyway, busy }) {
  const palette = ttzPalette;
  const [reviewAnyway, setReviewAnyway] = useState(false);
  if (reviewAnyway) return null;
  const duplicate = item.candidateEvidence?.reconciliation?.duplicate;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Already added?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>This looks like a statement you&apos;ve already added.</p>
      {duplicate ? <p style={{ ...TYPE_SCALE.caption, color: palette.muted }}>Matches a statement from an earlier import.</p> : null}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Button variant="primary" disabled={busy} onClick={onKeep}>Keep the one already in TrackToZero</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setReviewAnyway(true); onReviewAnyway?.(); }}>Review anyway</Button>
      </div>
    </Card>
  );
}

function BalanceSection({ item, onConfirm, busy }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const balanceEvidence = candidate.evidence?.fieldEvidence?.balance || [];
  const formulaEvidence = balanceEvidence.find((entry) => entry.truth === "formula_derived" || entry.truth === "projected");
  const [manualValue, setManualValue] = useState("");
  const [showManual, setShowManual] = useState(!formulaEvidence);

  if (formulaEvidence && !showManual) {
    return (
      <Card variant="warning">
        <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Is this your current balance?</div>
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>
          We found {formatMoney(formulaEvidence.value)} in your workbook. This number comes from a formula that looks like a projection, not an actual statement balance.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={busy} onClick={() => onConfirm(formulaEvidence.value)}>Yes, use {formatMoney(formulaEvidence.value)}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setShowManual(true)}>Enter my current balance</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>What&apos;s the current balance?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>We&apos;re missing your current balance for this debt.</p>
      <Field label="Current balance">
        <MoneyInput value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="0.00" />
      </Field>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={busy || manualValue === ""} onClick={() => onConfirm(Number(manualValue))}>Save</Button>
      </div>
    </Card>
  );
}

function AprSection({ item, onConfirm, busy }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const aprEvidence = candidate.evidence?.fieldEvidence?.apr || [];
  const knownCandidates = [...new Map(
    aprEvidence.filter((entry) => entry.aprStatus === "known" && entry.apr != null).map((entry) => [`${entry.apr}`, entry])
  ).values()];
  const strongest = knownCandidates[0] || null;
  const [selected, setSelected] = useState(knownCandidates.length === 1 ? knownCandidates[0].apr : null);
  const [manual, setManual] = useState("");
  const [useManual, setUseManual] = useState(knownCandidates.length === 0);

  const confirm = () => {
    if (useManual) onConfirm(Number(manual) / 100);
    else if (selected != null) onConfirm(selected);
  };

  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>{knownCandidates.length > 1 ? "Which APR applies to this debt?" : "What's the APR?"}</div>
      {knownCandidates.length > 1 ? (
        <div role="radiogroup" aria-label="Possible APR values" style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {knownCandidates.map((entry) => (
            <label key={entry.apr} style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.body, color: palette.tx }}>
              <input type="radio" name={`apr-${item.id}`} checked={!useManual && selected === entry.apr} onChange={() => { setSelected(entry.apr); setUseManual(false); }} />
              {formatPercent(entry.apr)}
              {entry === strongest ? <Badge tone="info">Most likely</Badge> : null}
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.body, color: palette.tx }}>
            <input type="radio" name={`apr-${item.id}`} checked={useManual} onChange={() => setUseManual(true)} />
            Enter another APR
          </label>
        </div>
      ) : (
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>We don&apos;t know the APR for this debt yet.</p>
      )}
      {useManual ? (
        <Field label="APR (%)" style={{ marginTop: 10 }}>
          <Input type="number" min="0" step="0.01" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="e.g. 7.25" />
        </Field>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={busy || (useManual ? manual === "" : selected == null)} onClick={confirm}>Save</Button>
      </div>
    </Card>
  );
}

function MinimumPaymentSection({ onConfirm, busy }) {
  const palette = ttzPalette;
  const [value, setValue] = useState("");
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>What&apos;s the minimum payment?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>We couldn&apos;t confirm your minimum payment.</p>
      <Field label="Minimum payment">
        <MoneyInput value={value} onChange={(event) => setValue(event.target.value)} placeholder="0.00" />
      </Field>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={busy || value === ""} onClick={() => onConfirm(Number(value))}>Save</Button>
      </div>
    </Card>
  );
}

function DueDaySection({ onConfirm, busy }) {
  const palette = ttzPalette;
  const [value, setValue] = useState("");
  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Payment due day</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>We&apos;re missing the day of the month this payment is due.</p>
      <Field label="Due day (1-31)">
        <Input type="number" min="1" max="31" value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. 21" />
      </Field>
      <div style={{ marginTop: 12 }}>
        <Button variant="secondary" disabled={busy || !value} onClick={() => onConfirm(value)}>Save</Button>
      </div>
    </Card>
  );
}

function OwnerSection({ item, members, onConfirm, busy }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const activeMembers = members.filter((member) => member.status !== "removed");
  const [value, setValue] = useState(candidate.ownerType === "member" && candidate.ownerId ? `member:${candidate.ownerId}` : "unassigned");
  const suggestionMatched = candidate.ownerSuggestion && activeMembers.some((member) => (member.displayName || "").toLowerCase() === candidate.ownerSuggestion.toLowerCase());

  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Who does this belong to?</div>
      {candidate.ownerSuggestion ? (
        <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>
          {suggestionMatched ? `Suggested owner: ${candidate.ownerSuggestion}` : `We couldn't match "${candidate.ownerSuggestion}" to someone in your household.`}
        </p>
      ) : null}
      <Field label="Confirmed owner">
        <Select value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="unassigned">Unassigned</option>
          <option value="joint">Joint / Household</option>
          {activeMembers.map((member) => <option key={member.uid} value={`member:${member.uid}`}>{member.displayName || member.uid}</option>)}
        </Select>
      </Field>
      <div style={{ marginTop: 12 }}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (value.startsWith("member:")) onConfirm({ ownerType: "member", ownerId: value.slice(7) });
            else onConfirm({ ownerType: value, ownerId: "" });
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function BusinessScopeSection({ onDecide, busy }) {
  const palette = ttzPalette;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>This looks like business debt</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Do you want it in this household payoff plan?</p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Button variant="primary" disabled={busy} onClick={() => onDecide("exclude")}>Keep it out</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDecide("include")}>Include it</Button>
      </div>
    </Card>
  );
}

function DebtClassificationSection({ item, onDecide, busy }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  return (
    <Card variant="warning">
      <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Is this a debt?</div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>
        {candidate.accountName} · {candidate.minimumPayment ? `${formatMoney(candidate.minimumPayment)}/month` : ""}
      </p>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Is this a loan you&apos;re paying down to $0?</p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Button variant="primary" disabled={busy} onClick={() => onDecide("debt")}>Yes, it&apos;s debt</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDecide("bill")}>No, it&apos;s just a bill</Button>
      </div>
    </Card>
  );
}

export default function ReviewDetail({ item, open, onClose, workspaceId, workspace, members = [], service, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [stale, setStale] = useState(false);
  if (!item) return null;
  const isHousehold = workspace?.type === "household";

  const finish = (type) => {
    setBusy(false);
    setErrorMessage("");
    setStale(false);
    const copyFn = REVIEW_SUCCESS_COPY[type];
    onResolved(copyFn ? copyFn(item.candidate.accountName) : "Saved.");
  };

  const runSimple = async (action) => {
    setBusy(true);
    setErrorMessage("");
    setStale(false);
    try {
      const result = await action();
      finish(result?.candidates?.find((c) => c.candidateId === item.importCandidateId)?.reviewResolution?.type || "confirmed_field");
    } catch {
      setBusy(false);
      setErrorMessage(FRIENDLY_SAVE_FAILURE);
    }
  };

  // Update Existing / New Debt: two-phase (decide, then commit) - both
  // REVIEW-1A primitives. Stale-review and per-candidate commit failures are
  // both possible here and get their own friendly treatment (Part 27).
  const runMatchResolution = async (resolveCall, successType) => {
    setBusy(true);
    setErrorMessage("");
    setStale(false);
    try {
      await resolveCall();
      try {
        await service.commitImportBatch(workspaceId, item.importBatchId);
      } catch (commitError) {
        const ourFailure = commitError?.failures?.find((entry) => entry.candidateId === item.importCandidateId);
        if (ourFailure?.code === "stale_review") {
          setBusy(false);
          setStale(true);
          return;
        }
        if (ourFailure) throw commitError;
        // A different candidate in the same batch failed - verify our own outcome below.
      }
      const snapshot = await service.getReviewSnapshot(workspaceId);
      const stillOpen = snapshot.openItems.find((openItem) => openItem.id === item.id);
      if (stillOpen) {
        setBusy(false);
        setErrorMessage(FRIENDLY_SAVE_FAILURE);
        return;
      }
      finish(successType);
    } catch {
      setBusy(false);
      setErrorMessage(FRIENDLY_SAVE_FAILURE);
    }
  };

  return (
    <Drawer open={open} title={item.candidate.accountName || "Review"} onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }} role="status" aria-live="polite">
        {stale ? (
          <DangerCallout title="This debt changed">
            {FRIENDLY_STALE_MESSAGE}
          </DangerCallout>
        ) : null}
        {errorMessage ? <WarningCallout title="Nothing changed">{errorMessage}</WarningCallout> : null}

        {item.types.includes(REVIEW_TYPES.duplicateImport) ? (
          <DuplicateSection
            item={item}
            busy={busy}
            onKeep={() => runSimple(() => service.dismissDuplicate(workspaceId, item.importBatchId, item.importCandidateId))}
          />
        ) : null}

        {(item.types.includes(REVIEW_TYPES.matchDecision) || item.types.includes(REVIEW_TYPES.multipleMatches)) ? (
          <MatchSection
            item={item}
            isHousehold={isHousehold}
            busy={busy}
            onUpdateExisting={(targetDebtId, metadataUpdates) =>
              runMatchResolution(
                () => service.resolveAsExistingDebt(workspaceId, item.importBatchId, item.importCandidateId, { targetDebtId, metadataUpdates }),
                "updated_existing_debt"
              )}
            onNewDebt={() => runMatchResolution(
              () => service.resolveAsNewDebt(workspaceId, item.importBatchId, item.importCandidateId),
              "created_new_debt"
            )}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.debtClassification) ? (
          <DebtClassificationSection
            item={item}
            busy={busy}
            onDecide={(classification) => runSimple(() => service.resolveDebtClassification(workspaceId, item.importBatchId, item.importCandidateId, { classification }))}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.businessScope) ? (
          <BusinessScopeSection
            busy={busy}
            onDecide={(decision) => runSimple(() => service.resolveBusinessScope(workspaceId, item.importBatchId, item.importCandidateId, { decision }))}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.balanceConfirmation) ? (
          <BalanceSection
            item={item}
            busy={busy}
            onConfirm={(currentBalance) => runSimple(() => service.resolveBalance(workspaceId, item.importBatchId, item.importCandidateId, { currentBalance }))}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.aprConfirmation) ? (
          <AprSection
            item={item}
            busy={busy}
            onConfirm={(apr) => runSimple(() => service.resolveApr(workspaceId, item.importBatchId, item.importCandidateId, { apr, aprStatus: "known" }))}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.minimumPaymentConfirmation) ? (
          <MinimumPaymentSection
            busy={busy}
            onConfirm={(minimumPayment) => runSimple(() => service.resolveMinimumPayment(workspaceId, item.importBatchId, item.importCandidateId, { minimumPayment }))}
          />
        ) : null}

        {item.types.includes(REVIEW_TYPES.dueDateConfirmation) ? (
          <DueDaySection
            busy={busy}
            onConfirm={(dueDay) => runSimple(() => service.resolveDueDate(workspaceId, item.importBatchId, item.importCandidateId, { dueDay }))}
          />
        ) : null}

        {isHousehold && item.types.includes(REVIEW_TYPES.ownerMatch) ? (
          <OwnerSection
            item={item}
            members={members}
            busy={busy}
            onConfirm={(owner) => runSimple(() => service.resolveOwner(workspaceId, item.importBatchId, item.importCandidateId, owner))}
          />
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => runSimple(() => service.deferReview(workspaceId, item.importBatchId, item.importCandidateId))}
          >
            Leave for later
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
