import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import useReducedMotion from "../../../hooks/useReducedMotion.js";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { CATEGORY_CONFIG } from "./debtCategoryConfig.js";
import { deriveCategoryBreakdown } from "../debtPortfolioView.js";

// UX-6.1: visual category tiles - the locked requirement that debt grouping
// must not be "only a dropdown." Only categories with at least one debt (in
// the current owner scope) are shown. Every tile is a real <button> so it is
// keyboard/tap accessible with no hover-only functionality (the "View N ->"
// CTA is always rendered, not revealed on hover) - hover/focus only adds a
// restrained elevation change.
function CategoryTile({ entry, breakdown, onSelect }) {
  const [active, setActive] = useState(false);
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  const Icon = entry.icon;
  return (
    <Card
      variant="interactive"
      style={{
        textAlign: "left",
        display: "grid",
        gap: 10,
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
          gap: 10,
          cursor: "pointer",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--ttz-radius-md, 12px)",
              background: palette.acS || palette.surf2,
              color: palette.ac || palette.tx,
            }}
          >
            <Icon size={20} aria-hidden="true" />
          </span>
          {breakdown.reviewCount > 0 ? <Badge tone="warning">{breakdown.reviewCount} needs review</Badge> : null}
        </div>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{entry.label}</div>
          <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 2 }}>
            {breakdown.count} account{breakdown.count === 1 ? "" : "s"} · {money(breakdown.balance)}
          </div>
        </div>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.ac || palette.tx2, fontWeight: 800 }}>
          View {breakdown.count === 1 ? "1 account" : `all ${breakdown.count}`} →
        </div>
      </button>
    </Card>
  );
}

export default function CategoryGrid({ portfolio, ownerFilter, latestSnapshotsByDebt, onSelectCategory }) {
  const breakdown = deriveCategoryBreakdown(portfolio, { ownerFilter, latestSnapshotsByDebt });
  const byGroup = new Map(breakdown.map((entry) => [entry.group, entry]));
  const visible = CATEGORY_CONFIG
    .map((entry) => ({ entry, breakdown: byGroup.get(entry.group) }))
    .filter(({ breakdown: b }) => b && b.count > 0)
    .sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);

  if (!visible.length) return null;

  return (
    <div
      role="list"
      aria-label="Debt categories"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--ttz-space-4, 16px)" }}
    >
      {visible.map(({ entry, breakdown: b }) => (
        <div role="listitem" key={entry.group}>
          <CategoryTile entry={entry} breakdown={b} onSelect={onSelectCategory} />
        </div>
      ))}
    </div>
  );
}
