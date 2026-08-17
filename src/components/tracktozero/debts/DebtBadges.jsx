import React from "react";
import Badge from "../ui/Badge.jsx";
import { effectiveOwnerType, isConfirmedZero, isDebtNeedsReview, looksLikeJunkOwnerLabel, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";

// Token-based rewrite of the monolith's DebtBadges - same badge set, same
// needs-review derivation (kept in lockstep with debtPortfolioView.js's own
// needs-review check so the badge on a card never disagrees with which list
// the card is sorted into).
export default function DebtBadges({ debt, isTarget, isHousehold }) {
  const paidOff = isConfirmedZero(debt);
  const junkOwner = isHousehold && looksLikeJunkOwnerLabel(debt.ownerLabel);
  const needsReview = !paidOff && (
    isDebtNeedsReview(debt)
    || debt.aprStatus === "unknown"
    || Number(debt.minimumRequiredPayment || 0) <= 0
    || (isHousehold && effectiveOwnerType(debt) === "unassigned")
    || junkOwner
  );
  const ownerLabel = presentedOwnerLabel(debt);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
      {isTarget && <Badge tone="info">Current target</Badge>}
      {paidOff && <Badge tone="success">Paid off</Badge>}
      {isHousehold && <Badge tone="neutral">{ownerLabel}</Badge>}
      {debt.aprStatus === "unknown" && <Badge tone="warning">APR unknown</Badge>}
      {needsReview && <Badge tone="warning">Needs review</Badge>}
      {!debt.includedInCorePayoffPlan && <Badge tone="neutral">Excluded from core date</Badge>}
    </div>
  );
}
