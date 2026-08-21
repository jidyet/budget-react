import React from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Wallet } from "lucide-react";
import PageHeader from "../layout/PageHeader.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { getWorkspacePresentation } from "../workspacePresentation.js";

const SUMMARY_ICON = {
  leftToGo: Wallet,
  active: CreditCard,
  monthlyMinDue: CalendarClock,
  review: AlertTriangle,
  paidOff: CheckCircle2,
};

function SummaryCard({ card }) {
  const palette = ttzPalette;
  const Icon = SUMMARY_ICON[card.key] || Wallet;
  const tone = card.tone === "warning"
    ? { fg: palette.wa, bg: palette.waD }
    : card.tone === "success"
      ? { fg: palette.go, bg: palette.goD }
      : card.tone === "info"
        ? { fg: palette.info, bg: palette.infoD }
        : { fg: palette.ac, bg: palette.acS || palette.surf2 };

  return (
    <Card
      variant="default"
      style={{
        minHeight: 132,
        display: "grid",
        gap: 10,
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        boxShadow: "var(--ttz-shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ ...TYPE_SCALE.overline, color: palette.tx2 }}>{card.label}</div>
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: tone.bg,
            color: tone.fg,
            border: `1px solid ${tone.fg}22`,
            flexShrink: 0,
          }}
        >
          <Icon size={20} />
        </span>
      </div>
      <div style={{ ...TYPE_SCALE.metric, color: tone.fg, fontSize: "clamp(1.25rem, 0.9rem + 1.25vw, 2rem)" }}>
        {card.key === "leftToGo" || card.key === "monthlyMinDue" ? money(card.value) : card.value}
      </div>
      <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>{card.supporting}</div>
    </Card>
  );
}

export default function PortfolioHeader({ portfolio, workspace, onAddDebt, onImportStatement, canManage }) {
  const palette = ttzPalette;
  const { debtHeading } = getWorkspacePresentation(workspace);

  return (
    <div style={{ display: "grid", gap: "var(--ttz-space-5, 24px)" }}>
      <PageHeader
        title={debtHeading}
        description="Everything you owe, grouped in a way that makes the next move obvious — not overwhelming."
        actions={
          <>
            <Button variant="secondary" disabled={!canManage} onClick={onImportStatement}>Import statement</Button>
            <Button variant="primary" disabled={!canManage} onClick={onAddDebt}>+ Add debt</Button>
          </>
        }
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--ttz-space-4, 16px)",
          padding: "14px 18px",
          borderRadius: 999,
          border: `1px solid ${palette.border2 || palette.border}`,
          background: `linear-gradient(180deg, ${palette.surf2} 0%, transparent 100%)`,
          boxShadow: "var(--ttz-shadow-sm)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ color: palette.tx2, fontSize: 14, fontWeight: 700 }}>
          Real talk: keep your debts current, keep your plan clean, and this page stays actually useful.
        </div>
        <div style={{ color: palette.ac, fontSize: 13, fontWeight: 800 }}>
          {workspace?.type === "household" ? "Household view" : "Personal view"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}>
        {portfolio.summaryCards.map((card) => (
          <SummaryCard key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}
