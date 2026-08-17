import React from "react";
import Badge from "../ui/Badge.jsx";
import { describeDebtReviewReasons, isConfirmedZero, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";

// Token-based rewrite of the monolith's DebtBadges - same badge set, same
// needs-review derivation (kept in lockstep with debtPortfolioView.js's own
// needs-review check so the badge on a card never disagrees with which list
// the card is sorted into). UX-8.2: the needs-review condition itself now
// comes from describeDebtReviewReasons, the same shared reason list the new
// Review & Edit surfaces show, so the badge and the concrete reasons can
// never disagree about whether a debt needs review.
export default function DebtBadges({ debt, isTarget, isHousehold }) {
  const paidOff = isConfirmedZero(debt);
  const needsReview = describeDebtReviewReasons(debt, isHousehold).length > 0;
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
