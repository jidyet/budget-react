import React from "react";
import PageHeader from "../layout/PageHeader.jsx";
import MetricCard from "../ui/MetricCard.jsx";
import Button from "../ui/Button.jsx";
import { ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";

// UX-6.1: "What you owe" portfolio header. "+ Add debt" (account creation)
// and "Import statement" (a source of new candidates) are page-level
// actions, structurally separate from Quick Update's ongoing-maintenance
// actions (task requirement) - neither lives inside QuickUpdateRail.
export default function PortfolioHeader({ portfolio, onAddDebt, onImportStatement, canManage }) {
  const palette = ttzPalette;
  return (
    <div>
      <PageHeader
        title="What you owe"
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
            value={card.key === "leftToGo" ? money(card.value) : card.value}
            tone={card.tone === "warning" ? palette.wa : card.tone === "danger" ? palette.da : undefined}
          />
        ))}
      </div>
    </div>
  );
}
