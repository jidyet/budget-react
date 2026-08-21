import React from "react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import OwnerBadge from "../ui/OwnerBadge.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatShortDate } from "../formatting.js";
import { REVIEW_TYPE_LABEL, getReviewWhy } from "../../../services/tracktozero/reviewCopy.js";

// One review = one card. Answers "what needs checking, why, what do I do"
// (REVIEW-1B Part 8) without exposing raw status names or JSON. Never
// mutates anything itself - onOpen just opens the detail experience.
export default function ReviewCard({ item, isHousehold, onOpen }) {
  const palette = ttzPalette;
  const candidate = item.candidate;
  const title = candidate.accountName || candidate.creditorName || "Debt statement";
  const why = getReviewWhy(item);

  return (
    <Card
      variant={item.blocking ? "warning" : "default"}
      style={{
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        boxShadow: "var(--ttz-shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: 4,
          borderRadius: 999,
          background: item.blocking
            ? "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(245,158,11,0.95) 100%)"
            : `linear-gradient(90deg, ${palette.ac} 0%, ${palette.go} 100%)`,
          margin: "-4px -4px 14px",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{title}</div>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>
            {item.blocking ? "This one can shift the plan, so let’s not leave it messy." : "Quick cleanup now keeps your debt picture trustworthy."}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {item.types.map((type) => (
              <Badge key={type} tone={item.blocking ? "warning" : "neutral"}>{REVIEW_TYPE_LABEL[type] || type}</Badge>
            ))}
          </div>
        </div>
        <Button size="sm" variant="primary" onClick={() => onOpen(item)}>Review now</Button>
      </div>
      <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: "10px 0 0" }}>{why}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, ...TYPE_SCALE.caption, color: palette.muted }}>
        {candidate.statementDate ? <span>Statement: {formatShortDate(candidate.statementDate)}</span> : null}
        {item.createdAt ? <span>Uploaded: {formatShortDate(item.createdAt)}</span> : null}
        {isHousehold ? <OwnerBadge ownerType={candidate.ownerType}>{candidate.ownerSuggestion || (candidate.ownerType === "joint" ? "Joint" : "Unassigned")}</OwnerBadge> : null}
      </div>
    </Card>
  );
}
