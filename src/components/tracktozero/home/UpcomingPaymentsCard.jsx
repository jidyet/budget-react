import React, { useState } from "react";
import { formatMoney as money } from "../formatting.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import { presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { PAYMENT_TIMING_STATUS } from "../../../domain/tracktozero/paymentTiming.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";

// GATE-10B.1: this used to render every entry unconditionally - on a
// household with several debts due the same week, that's an unbounded wall
// of cards on Home (worst on mobile, where it pushed all subsequent Home
// content far down the page). upcoming.entries already arrives sorted by
// priority (comparePaymentTiming, homeViewModels.js) - due-date-passed,
// then due-today, then due-this-week - so a simple slice of the front of
// the list is already the right "most urgent first" preview.
const DEFAULT_PREVIEW_COUNT = 3;

// BETA-3: required-payment EXECUTION, not the extra-payoff STRATEGY - this
// card never overlaps with DebtFreedomHero/ThisMonthCard/NextMoveHero's
// "current target" concept. A debt shows up here purely because of its own
// dueDay, whether or not it's part of the active core payoff plan.
const STATUS_TONE_KEY = {
  [PAYMENT_TIMING_STATUS.dueDatePassed]: "warning",
  [PAYMENT_TIMING_STATUS.dueToday]: "danger",
  [PAYMENT_TIMING_STATUS.dueThisWeek]: "info",
};

// Never render "$0 due" for a debt with an unknown required payment - the
// summary line always separates "known" money from "needs review" counts
// instead of silently summing a missing amount as zero.
const summaryLine = (upcoming) => {
  if (!upcoming || upcoming.count === 0) return "Nothing due in the next 7 days.";
  const parts = [`${upcoming.count} required payment${upcoming.count === 1 ? "" : "s"} due in the next 7 days`];
  if (upcoming.knownAmountCount > 0) parts.push(`${money(upcoming.totalKnownAmount)} known`);
  if (upcoming.unknownAmountCount > 0) {
    parts.push(`${upcoming.unknownAmountCount} need${upcoming.unknownAmountCount === 1 ? "s" : ""} review for the amount due`);
  }
  return parts.join(" · ");
};

export default function UpcomingPaymentsCard({ homeContext, onGoToDebts, onRecordPayment }) {
  const upcoming = homeContext?.upcomingPayments;
  const [expanded, setExpanded] = useState(false);
  if (!upcoming) return null;
  const isHousehold = homeContext?.isHousehold;
  const visibleEntries = expanded ? upcoming.entries : upcoming.entries.slice(0, DEFAULT_PREVIEW_COUNT);
  const hiddenCount = upcoming.entries.length - visibleEntries.length;

  return (
    <Card variant="default" style={{ padding: 24, borderLeft: `3px solid ${ttzPalette.wa}` }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Upcoming payments</div>
          <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, marginTop: 4 }}>
            What&apos;s due on your debts - separate from what your plan is putting extra money toward.
          </div>
        </div>

        <div role="status" aria-live="polite" style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
          {summaryLine(upcoming)}
        </div>

        {upcoming.count === 0 ? (
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>You&apos;re caught up for the next 7 days.</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10 }}>
              {visibleEntries.map((entry) => {
                const toneKey = STATUS_TONE_KEY[entry.timing.status] || "info";
                return (
                  <div
                    key={entry.debt.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: 12,
                      borderRadius: 12,
                      background: ttzPalette.surf2,
                      border: `1px solid ${ttzPalette.border}`,
                    }}
                  >
                    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                      <LenderIdentity creditorName={entry.debt.name} debtType={entry.debt.debtType} lastFour={entry.debt.accountReferenceSafe} size="sm" />
                      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
                        {isHousehold ? `${presentedOwnerLabel(entry.debt)} · ` : ""}
                        {entry.minimumRequiredPayment != null ? `${money(entry.minimumRequiredPayment)} required` : "Required amount needs review"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Badge tone={toneKey}>{entry.label}</Badge>
                      <Button variant="secondary" onClick={() => (onRecordPayment ? onRecordPayment(entry.debt.id) : onGoToDebts?.())}>Record payment</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {hiddenCount > 0 ? (
              <Button variant="ghost" onClick={() => setExpanded(true)}>View all {upcoming.entries.length} payments</Button>
            ) : expanded && upcoming.entries.length > DEFAULT_PREVIEW_COUNT ? (
              <Button variant="ghost" onClick={() => setExpanded(false)}>Show fewer</Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
