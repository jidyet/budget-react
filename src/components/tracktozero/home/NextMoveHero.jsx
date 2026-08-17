import React from "react";
import { formatMoney as money } from "../formatting.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import { presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { getWorkspacePresentation } from "../workspacePresentation.js";

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
        padding: 28,
        background: `linear-gradient(135deg, ${ttzPalette.surf} 0%, ${ttzPalette.acS} 100%)`,
        border: `1px solid ${ttzPalette.border}`,
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>{nextMoveEyebrow}</div>
          {ownerLine ? <Badge tone="info">{ownerLine}</Badge> : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, margin: 0, fontSize: "clamp(1.5rem, 1.1rem + 1.6vw, 2.1rem)" }}>
            {nextMove?.label || "Check your plan"}
          </h1>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0, maxWidth: 640 }}>
            {nextMove?.body || ""}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={handler}>{nextMove?.ctaLabel || "View details"}</Button>
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
            {money(primaryRemainingDebt)} remaining
          </div>
        </div>
      </div>
    </Card>
  );
}
