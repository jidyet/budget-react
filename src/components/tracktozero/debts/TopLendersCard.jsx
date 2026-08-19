import React, { useMemo, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { groupDebtsByLender } from "./debtExplorerView.js";

const DEFAULT_PREVIEW_COUNT = 5;

// GATE-10B.1C: portfolio-wide "Top Lenders" - reuses groupDebtsByLender
// exactly as-is (already shape-agnostic; previously only ever called scoped
// to one category from CategoryDetailPage). Sorted by total balance
// descending and sliced to the top 5, matching the same preview+"View all
// N" template UpcomingPaymentsCard/ActivityPreviewCard already use.
export default function TopLendersCard({ debts, onGoToDebts }) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => {
    const grouped = groupDebtsByLender(debts || []).filter((group) => !group.ungrouped);
    return [...grouped].sort((a, b) => b.total - a.total);
  }, [debts]);

  if (!groups.length) return null;
  const visible = expanded ? groups : groups.slice(0, DEFAULT_PREVIEW_COUNT);
  const hiddenCount = groups.length - visible.length;
  const totalAccounts = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Top lenders</div>
          <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, marginTop: 4 }}>
            Recognized lenders across your portfolio, largest balance first.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, alignItems: "start" }}>
          {visible.map((group) => (
            <button
              key={group.lenderId}
              type="button"
              onClick={() => onGoToDebts?.()}
              disabled={!onGoToDebts}
              className={onGoToDebts ? "ttz-card-hover ttz-focus-ring" : undefined}
              style={{
                all: "unset",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                background: ttzPalette.surf2,
                border: `1px solid ${ttzPalette.border}`,
                cursor: onGoToDebts ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <LenderIdentity creditorName={group.canonicalName} size="sm" />
                {onGoToDebts ? <Badge tone="neutral">View</Badge> : null}
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>{money(group.total)}</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
                  {group.count} account{group.count === 1 ? "" : "s"}{group.highestKnownApr != null ? ` · ${percent(group.highestKnownApr)} highest APR` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>

        {hiddenCount > 0 ? (
          <Button variant="ghost" onClick={() => setExpanded(true)}>View all {groups.length} accounts</Button>
        ) : expanded && groups.length > DEFAULT_PREVIEW_COUNT ? (
          <Button variant="ghost" onClick={() => setExpanded(false)}>Show fewer</Button>
        ) : null}

        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>
          {totalAccounts} account{totalAccounts === 1 ? "" : "s"} across {groups.length} recognized lender{groups.length === 1 ? "" : "s"}.
        </div>
      </div>
    </Card>
  );
}
