import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";

// Token-based rewrite of the monolith's ReconciliationSection - identical
// behavior/contract, only the visual layer changed. "This may already be in
// TrackToZero" duplicate/match resolution, unaffected by the UX-6.1
// reconciliation guardrail (which only changes WHETHER a match is offered,
// never how a match is resolved once offered).
export default function ReconciliationSection({ candidate, canManage, busy, onResolveMatch, onResolveNew }) {
  const reconciliation = candidate.evidence?.reconciliation;
  const matches = reconciliation?.matches || [];
  const resolved = !!reconciliation?.resolution;
  const [selectedDebtId, setSelectedDebtId] = useState(matches.length === 1 ? matches[0].debtId : "");
  const [acceptedFields, setAcceptedFields] = useState({ apr: true, minimumPayment: true, dueDay: true });
  const palette = ttzPalette;
  if (!matches.length || resolved) return null;
  const selectedMatch = matches.find((match) => match.debtId === selectedDebtId) || null;

  const formatDiffValue = (field, value) => {
    if (value == null || value === "") return "unknown";
    if (field === "apr") return percent(value);
    if (field === "balance" || field === "minimumPayment") return money(value);
    return String(value);
  };

  const buildMetadataUpdates = (match, fields) => {
    const updates = {};
    if (fields.apr && match.diff?.apr?.state === "changed" && match.diff.apr.newValue != null) updates.apr = match.diff.apr.newValue;
    if (fields.minimumPayment && match.diff?.minimumPayment?.state === "changed" && match.diff.minimumPayment.newValue != null) updates.minimumRequiredPayment = match.diff.minimumPayment.newValue;
    if (fields.dueDay && match.diff?.dueDay?.state === "changed" && match.diff.dueDay.newValue != null) updates.dueDay = match.diff.dueDay.newValue;
    return updates;
  };

  return (
    <Card variant="warning" style={{ marginBottom: 12 }}>
      <p style={{ ...TYPE_SCALE.cardTitle, margin: "0 0 4px", color: palette.wa }}>This may already be in TrackToZero</p>
      <p style={{ ...TYPE_SCALE.supporting, margin: "0 0 10px", color: palette.tx2 }}>
        {matches.length > 1 ? "More than one existing debt could match this import. Choose the right one, or keep it separate." : "We found an existing debt that looks like this one. Choose what to do before adding it."}
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        {matches.map((match) => (
          <label
            key={match.debtId}
            style={{ display: "grid", gap: 6, padding: 10, borderRadius: "var(--ttz-radius-md, 12px)", border: selectedDebtId === match.debtId ? `2px solid ${palette.wa}` : `1px solid ${palette.border2}`, background: palette.surf, cursor: "pointer" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name={`match-${candidate.candidateId}`} checked={selectedDebtId === match.debtId} onChange={() => setSelectedDebtId(match.debtId)} disabled={!canManage} />
              <strong>{match.debtName}</strong>
            </span>
            <span style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
              Existing balance {formatDiffValue("balance", match.diff?.balance?.existingValue)} · Imported balance {formatDiffValue("balance", match.diff?.balance?.newValue)}
            </span>
          </label>
        ))}
      </div>
      {selectedMatch ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {["apr", "minimumPayment", "dueDay"].filter((field) => selectedMatch.diff?.[field]?.state === "changed").map((field) => (
            <label key={field} style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.supporting, color: palette.tx2 }}>
              <input type="checkbox" checked={!!acceptedFields[field]} disabled={!canManage} onChange={() => setAcceptedFields((state) => ({ ...state, [field]: !state[field] }))} />
              Update {field === "apr" ? "APR" : field === "minimumPayment" ? "minimum payment" : "due day"}: {formatDiffValue(field, selectedMatch.diff[field].existingValue)} → {formatDiffValue(field, selectedMatch.diff[field].newValue)}
            </label>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="primary"
          disabled={!canManage || busy || !selectedMatch}
          title={!selectedMatch ? "Choose a match above first" : undefined}
          onClick={() => onResolveMatch(candidate.candidateId, selectedMatch.debtId, buildMetadataUpdates(selectedMatch, acceptedFields))}
        >
          Update this debt
        </Button>
        <Button type="button" disabled={!canManage || busy} onClick={() => onResolveNew(candidate.candidateId)}>
          It&apos;s a different debt
        </Button>
      </div>
    </Card>
  );
}
