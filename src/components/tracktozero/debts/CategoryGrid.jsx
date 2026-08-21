import React, { useMemo, useState } from "react";
import { debtCategoryGroupFor } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { derivePaymentTiming, paymentTimingLabel } from "../../../domain/tracktozero/paymentTiming.js";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import useReducedMotion from "../../../hooks/useReducedMotion.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { CATEGORY_CONFIG } from "./debtCategoryConfig.js";
import { deriveCategoryBreakdown, filterDebtsByOwnerScope } from "../debtPortfolioView.js";

function buildCategoryInsights(portfolio, ownerFilter) {
  const debts = filterDebtsByOwnerScope(
    [...portfolio.activeDebts, ...portfolio.reviewDebts, ...portfolio.paidOffDebts],
    ownerFilter
  );
  const byGroup = new Map();

  for (const debt of debts) {
    const group = debtCategoryGroupFor(debt.debtType);
    if (!byGroup.has(group)) {
      byGroup.set(group, {
        highestKnownApr: null,
        nextDueLabel: null,
        nextDueRank: Infinity,
      });
    }
    const entry = byGroup.get(group);
    if (debt.aprStatus !== "unknown" && debt.apr != null) {
      const apr = Number(debt.apr || 0);
      entry.highestKnownApr = entry.highestKnownApr == null ? apr : Math.max(entry.highestKnownApr, apr);
    }

    const timing = derivePaymentTiming(debt, { paymentEvents: [] });
    const rank = timing.daysUntil == null ? Infinity : Math.abs(timing.daysUntil);
    if (rank < entry.nextDueRank) {
      entry.nextDueRank = rank;
      entry.nextDueLabel = paymentTimingLabel(timing);
    }
  }

  return byGroup;
}

function CategoryTile({ entry, breakdown, insight, onSelect }) {
  const [active, setActive] = useState(false);
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  const Icon = entry.icon;
  const supportingLine = entry.routeSlug === "mortgage"
    ? (insight?.nextDueLabel || "Tracked outside your core payoff date")
    : insight?.highestKnownApr != null
      ? `Highest APR: ${percent(insight.highestKnownApr)}`
      : breakdown.reviewCount > 0
        ? `${breakdown.reviewCount} need review`
        : "All set";

  return (
    <Card
      variant="interactive"
      style={{
        textAlign: "left",
        display: "grid",
        gap: 12,
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        transform: !reducedMotion && active ? "translateY(-2px)" : "none",
        boxShadow: active ? "var(--ttz-shadow-md, 0 8px 24px rgba(10,34,54,0.08))" : "var(--ttz-shadow-sm, 0 1px 2px rgba(10,34,54,0.06))",
        transition: reducedMotion ? "none" : "transform 120ms ease, box-shadow 120ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(entry.routeSlug)}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        aria-label={`View ${breakdown.count} ${entry.label.toLowerCase()}`}
        className="ttz-focus-ring"
        style={{
          all: "unset",
          display: "grid",
          gap: 12,
          cursor: "pointer",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              borderRadius: "var(--ttz-radius-md, 12px)",
              background: palette.acS || palette.surf2,
              color: palette.ac || palette.tx,
              animation: reducedMotion ? "none" : "ttz-category-icon-breathe 3.2s ease-in-out infinite",
              boxShadow: "var(--ttz-shadow-sm)",
            }}
          >
            <Icon
              size={20}
              aria-hidden="true"
              style={{
                transform: !reducedMotion && active ? "scale(1.15)" : "scale(1)",
                transition: reducedMotion ? "none" : "transform 150ms ease",
              }}
            />
          </span>
          {breakdown.reviewCount > 0 ? <Badge tone="warning">{breakdown.reviewCount} need attention</Badge> : <Badge tone="neutral">Clean</Badge>}
        </div>
        {!reducedMotion ? (
          <style>{"@keyframes ttz-category-icon-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }"}</style>
        ) : null}

        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{entry.label}</div>
          <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 4 }}>
            {breakdown.count} account{breakdown.count === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ ...TYPE_SCALE.metric, color: palette.tx, fontSize: "clamp(1.25rem, 0.95rem + 0.9vw, 1.8rem)", lineHeight: 1.05 }}>
          {money(breakdown.balance)}
        </div>

        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
          {supportingLine}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
          <span
            aria-hidden="true"
            style={{
              minWidth: 116,
              height: 32,
              padding: "0 12px",
              borderRadius: "var(--ttz-radius-sm, 8px)",
              border: `1px solid ${palette.border2 || palette.border}`,
              color: palette.tx,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8125rem",
              fontWeight: 700,
              boxSizing: "border-box",
            }}
          >
            Open category
          </span>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, whiteSpace: "nowrap" }}>
            {breakdown.reviewCount > 0 ? "Needs attention" : "All set"}
          </div>
        </div>
      </button>
    </Card>
  );
}

export default function CategoryGrid({ portfolio, ownerFilter, latestSnapshotsByDebt, onSelectCategory }) {
  const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter, latestSnapshotsByDebt });
  const insights = useMemo(() => buildCategoryInsights(portfolio, ownerFilter), [portfolio, ownerFilter]);
  const byGroup = new Map(breakdown.map((entry) => [entry.group, entry]));
  const visible = CATEGORY_CONFIG
    .map((entry) => ({ entry, breakdown: byGroup.get(entry.group) }))
    .filter(({ breakdown: item }) => item && item.count > 0)
    .sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);

  if (!visible.length) return null;

  return (
    <div
      role="list"
      aria-label="Debt categories"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}
    >
      {visible.map(({ entry, breakdown: item }) => (
        <div role="listitem" key={entry.group}>
          <CategoryTile entry={entry} breakdown={item} insight={insights.get(entry.group)} onSelect={onSelectCategory} />
        </div>
      ))}
    </div>
  );
}
