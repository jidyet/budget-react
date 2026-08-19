import React from "react";
import PageHeader from "../layout/PageHeader.jsx";
import MetricCard from "../ui/MetricCard.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { getWorkspacePresentation } from "../workspacePresentation.js";

// UX-6.1: portfolio header. "+ Add debt" (account creation) and "Import
// statement" (a source of new candidates) are page-level actions,
// structurally separate from Quick Update's ongoing-maintenance actions
// (task requirement) - neither lives inside QuickUpdateRail.
//
// UX-6.2: the title uses workspace-aware voice ("My debt" for a Personal
// workspace, "Our debt" for Household) via the shared getWorkspacePresentation
// helper, instead of the previous workspace-agnostic "What you owe."
export default function PortfolioHeader({ portfolio, workspace, onAddDebt, onImportStatement, canManage }) {
  const palette = ttzPalette;
  const { debtHeading } = getWorkspacePresentation(workspace);
  return (
    <div>
      <PageHeader
        title={debtHeading}
        actions={
          <>
            <Button variant="secondary" disabled={!canManage} onClick={onImportStatement}>Import statement</Button>
            <Button variant="primary" disabled={!canManage} onClick={onAddDebt}>+ Add debt</Button>
          </>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
        {portfolio.summaryCards.map((card) => (
          <MetricCard
            key={card.key}
            label={card.label}
            value={card.key === "leftToGo" || card.key === "monthlyMinDue" ? money(card.value) : card.value}
            supporting={card.supporting}
            tone={card.tone === "warning" ? palette.wa : card.tone === "danger" ? palette.da : card.tone === "info" ? palette.info : undefined}
          />
        ))}
      </div>
    </div>
  );
}
