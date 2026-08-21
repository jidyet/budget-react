import React from "react";
import { formatMoney as money } from "../formatting.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import { presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { getWorkspacePresentation } from "../workspacePresentation.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";

// Home's single dominant surface (UX-7): exactly one deterministic next
// move (see deriveNextMove's priority chain), one primary CTA. Everything
// else on Home is supporting detail underneath this.
export default function NextMoveHero({ homeContext, actions }) {
  const { nextMove, currentTarget, isHousehold, workspace, primaryRemainingDebt } = homeContext;
  const { nextMoveEyebrow } = getWorkspacePresentation(workspace);
  const handler = actions?.[nextMove?.action] || actions?.debts;

  // Household Next Move must show a real resolved owner or "Joint" - never
  // a vague "Everyone" placeholder.
  const ownerLine = isHousehold && currentTarget
    ? presentedOwnerLabel(currentTarget)
    : null;

  return (
    <Card
      variant="elevated"
      style={{
        padding: 30,
        background: ttzPalette.bg === "#08111d"
          ? `radial-gradient(circle at top right, rgba(24,167,225,0.18), transparent 30%), linear-gradient(180deg, rgba(13,23,38,0.98) 0%, rgba(11,19,31,0.98) 100%)`
          : `radial-gradient(circle at top right, rgba(24,167,225,0.10), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,250,255,0.98) 100%)`,
        border: `1px solid ${ttzPalette.border2}`,
        boxShadow: "var(--ttz-shadow-lg)",
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>{nextMoveEyebrow}</div>
          {ownerLine ? <Badge tone="info">{ownerLine}</Badge> : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {/* UX-8.3: lender identity only appears when Next Move actually
              targets a specific Debt (record payment / update balance /
              stay-on-target) - never for a generic action like Review
              imports, Build plan, Reforecast, or Add debt. */}
          {nextMove?.targetDebt ? (
            <LenderIdentity creditorName={nextMove.targetDebt.name} debtType={nextMove.targetDebt.debtType} lastFour={nextMove.targetDebt.accountReferenceSafe} size="lg" />
          ) : null}
          <h1 style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, margin: 0, fontSize: "clamp(1.5rem, 1.1rem + 1.6vw, 2.1rem)" }}>
            {nextMove?.label || "Check your plan"}
          </h1>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0, maxWidth: 640 }}>
            {nextMove?.body || ""}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={handler}>{nextMove?.ctaLabel || "View details"}</Button>
          <div style={{ display: "grid", justifyItems: "end", gap: 2 }}>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Left to go</div>
            <div style={{ fontFamily: "var(--ttz-font-body)", fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: 18, color: ttzPalette.tx }}>
              {money(primaryRemainingDebt)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
