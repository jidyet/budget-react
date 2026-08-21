import React, { useMemo, useState } from "react";
import { derivePaymentTiming, paymentTimingLabel, PAYMENT_TIMING_STATUS } from "../../../domain/tracktozero/paymentTiming.js";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import LenderIdentity from "./LenderIdentity.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { groupDebtsByLender } from "./debtExplorerView.js";

const DEFAULT_PREVIEW_COUNT = 5;

function dueBadgeForGroup(group) {
  const timings = group.debts.map((debt) => derivePaymentTiming(debt, { paymentEvents: [] }));
  if (timings.some((timing) => timing.status === PAYMENT_TIMING_STATUS.dueToday)) {
    return { label: "Due today", tone: "danger" };
  }
  if (timings.some((timing) => timing.status === PAYMENT_TIMING_STATUS.dueDatePassed)) {
    return { label: "Due date passed", tone: "warning" };
  }
  const thisWeek = timings.find((timing) => timing.status === PAYMENT_TIMING_STATUS.dueThisWeek);
  if (thisWeek) return { label: paymentTimingLabel(thisWeek), tone: "warning" };
  return { label: "All set", tone: "success" };
}

export default function TopLendersCard({ debts, onGoToDebts, onSelectDebt }) {
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
    <Card
      variant="default"
      style={{
        padding: 20,
        background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
        border: `1px solid ${ttzPalette.border2 || ttzPalette.border}`,
        boxShadow: "var(--ttz-shadow-md)",
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Top lenders</div>
            <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, marginTop: 4 }}>
              Biggest balances first so you can spot concentration fast.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge tone="neutral">{groups.length} lender{groups.length === 1 ? "" : "s"}</Badge>
            {onGoToDebts ? <Button variant="ghost" size="sm" onClick={() => onGoToDebts?.()}>View all {totalAccounts} accounts</Button> : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
          {visible.map((group) => {
            const due = dueBadgeForGroup(group);
            return (
              <Card
                key={group.lenderId || group.canonicalName}
                variant="default"
                padding="14px"
                style={{
                  display: "grid",
                  gap: 10,
                  background: ttzPalette.surf,
                  border: `1px solid ${ttzPalette.border}`,
                  boxShadow: "var(--ttz-shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <LenderIdentity creditorName={group.canonicalName} size="sm" />
                  <Badge tone={due.tone}>{due.label}</Badge>
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div
                    style={{
                      ...TYPE_SCALE.metricSm,
                      color: ttzPalette.tx,
                      fontSize: "clamp(1rem, 0.88rem + 0.65vw, 1.35rem)",
                      lineHeight: 1.05,
                    }}
                  >
                    {money(group.total)}
                  </div>
                  <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2 }}>
                    {group.count} account{group.count === 1 ? "" : "s"}
                    {group.highestKnownApr != null ? ` • Highest APR ${percent(group.highestKnownApr)}` : ""}
                  </div>
                </div>

                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
                  Quick skim before you drill into the category.
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                  {onSelectDebt && group.debts[0] ? (
                    <Button variant="secondary" size="sm" onClick={() => onSelectDebt(group.debts[0])}>Show</Button>
                  ) : <span />}
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.ac, fontWeight: 700 }}>
                    Open
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {hiddenCount > 0 ? (
          <Button variant="ghost" onClick={() => setExpanded(true)}>View all {groups.length} lenders</Button>
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
