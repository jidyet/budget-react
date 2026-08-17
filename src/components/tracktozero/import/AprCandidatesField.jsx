import React from "react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatPercent as percent } from "../formatting.js";

// UX-6.1: token-based rewrite of the monolith's AprCandidatesField, same
// dedup contract, extended to show a balance-type label (Purchases / Cash
// advance / Balance transfer / Penalty rate) when the underlying evidence
// carries one (statementCandidateAdapter.js's fieldEvidence.apr entries
// carry provenance.matchedText = the raw balanceType) - falls back to a
// plain percentage-only list when it doesn't, rather than inventing a label.
const BALANCE_TYPE_LABELS = {
  purchase: "Purchases",
  cash_advance: "Cash advance",
  balance_transfer: "Balance transfer",
  penalty: "Penalty rate",
};

export default function AprCandidatesField({ candidate, canManage, onUpdate }) {
  const aprEvidence = candidate.evidence?.fieldEvidence?.apr || candidate.evidence?.aprCandidates || [];
  const knownCandidates = [...new Map(
    aprEvidence
      .map((entry) => (typeof entry === "number" ? { apr: entry, aprStatus: "known" } : entry))
      .filter((entry) => entry?.aprStatus === "known" && entry.apr != null)
      .map((entry) => [`${entry.apr}`, entry])
  ).values()];
  if (knownCandidates.length < 2) return null;
  const palette = ttzPalette;
  return (
    <Card variant="warning" style={{ gridColumn: "1 / -1" }} padding="var(--ttz-space-3, 12px)">
      <p style={{ ...TYPE_SCALE.cardTitle, margin: "0 0 8px", color: palette.wa }}>We found more than one APR. Which one applies?</p>
      <div role="radiogroup" aria-label="Possible APR values" style={{ display: "grid", gap: 6 }}>
        {knownCandidates.map((entry, index) => {
          const balanceTypeLabel = BALANCE_TYPE_LABELS[entry.provenance?.matchedText];
          return (
            <label key={entry.apr} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                name={`apr-candidates-${candidate.candidateId}`}
                disabled={!canManage}
                checked={candidate.aprStatus === "known" && Number(candidate.apr) === Number(entry.apr)}
                onChange={() => onUpdate({ apr: entry.apr, aprStatus: "known" })}
              />
              {percent(entry.apr)}
              {balanceTypeLabel ? <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>— {balanceTypeLabel}</span> : null}
              {index === 0 ? <Badge tone="info">Most likely</Badge> : null}
            </label>
          );
        })}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="radio"
            name={`apr-candidates-${candidate.candidateId}`}
            disabled={!canManage}
            checked={candidate.aprStatus === "unknown"}
            onChange={() => onUpdate({ apr: null, aprStatus: "unknown" })}
          />
          I don&apos;t know yet
        </label>
      </div>
    </Card>
  );
}
