import React, { useMemo } from "react";
import { formatMoney, formatPercent, formatShortDate } from "../formatting.js";
import { ttzPalette, toneColors, TYPE_SCALE } from "../theme.js";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { deriveHomeContext } from "./homeViewModels.js";
import NextMoveHero from "./NextMoveHero.jsx";
import UpcomingPaymentsCard from "./UpcomingPaymentsCard.jsx";

// Below this many observed points, a full-size trend chart would just be a
// near-empty frame with one or two dots - a compact callout is more honest
// about "there isn't a trend yet" than dressing up sparse data as a chart.
const MIN_TRAJECTORY_POINTS_FOR_CHART = 3;

const GAP = "var(--ttz-space-5, 24px)";
const GAP_SM = "var(--ttz-space-4, 16px)";
const RADIUS = "var(--ttz-radius-lg, 16px)";

const money = (value) => formatMoney(Number(value || 0));
const shortDate = (value) => formatShortDate(value);
const strategyLabel = (strategy) => strategy === "snowball"
  ? "Snowball"
  : strategy === "avalanche"
    ? "Avalanche"
    : "No active strategy";

// GATE-10B.1: alignItems defaulted to CSS Grid's "stretch", so a long
// UpcomingPaymentsCard sharing a row with much shorter cards (DebtSnapshot/
// HouseholdBreakdown/etc. in the reduced Home states below) forced those
// siblings to stretch to match its height, producing large blank areas.
// "start" lets every card size to its own content instead.
const gridColumns = (min = 260) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: GAP_SM,
  alignItems: "start",
});

// GATE-10B.1C: the opposite choice from gridColumns above, deliberately -
// used only for a row of cards that should read as one matched set
// (Confirmed progress / Your debts / Debt by owner). Unlike Row 1's flex
// wrapper-div case, Card here IS the direct grid item (no wrapper between
// it and the grid container), so CSS Grid's "stretch" sets Card's OWN box
// height to the row's height directly - its background/border correctly
// fill that height (shorter content just leaves even bottom padding,
// exactly the "equal-size cards" look this is for), not the "blank space
// under a nested unstretched child" problem gridColumns' own comment
// describes for a different structural case.
const gridColumnsEqual = (min = 260) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: GAP_SM,
  alignItems: "stretch",
});

// Row 1's "~60-65% / ~35-40%" split (GATE-10B.1C) uses flex, not grid: an
// unequal flex-grow ratio (1.65 vs 1) on two items with generous min
// flex-basis values gives NextMoveHero the larger share on wide screens
// while still wrapping to a clean full-width stack once either item can't
// fit its basis - the same responsive behavior gridColumns' auto-fit gives
// the equal-share rows, just with a deliberate weighting instead of 1fr/1fr.
const row1Style = {
  display: "flex",
  gap: GAP_SM,
  flexWrap: "wrap",
  // "start" (not "stretch") for the same reason gridColumns uses it above:
  // Card is a plain block div with no height:100%, so a stretched flex
  // child would just leave blank space below the shorter card's content.
  alignItems: "start",
};

// UX-8.1: Home's financial figures previously used the mono font
// (var(--ttz-font-mono), DM Mono) at metric sizes - it reads as code, not as
// money. Money and other Home metrics now use the same primary UI font as
// everything else, with font-variant-numeric: tabular-nums doing the actual
// job the mono font was being used for (digits that line up), so a column of
// amounts still stays visually aligned without looking like a terminal.
const responsiveMetricValueStyle = {
  fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  fontSize: "clamp(1.3rem, 0.98rem + 1.5vw, 2.1rem)",
  lineHeight: 1.15,
  letterSpacing: "-0.01em",
  overflowWrap: "anywhere",
  minWidth: 0,
};

const responsiveHeroValueStyle = {
  fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 800,
  fontSize: "clamp(1.85rem, 1.3rem + 2.4vw, 3rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.02em",
  overflowWrap: "anywhere",
  minWidth: 0,
};

// A smaller money style for compact contexts (ProgressRing's Starting/
// Current/Reduction rows, card-level single amounts) - same font-family/
// tabular-nums contract as the two above, just sized down.
// GATE-10B.1C dark-mode fix: `color` is deliberately NOT baked into this
// shared constant. moneySmStyle is a plain object built once at module load
// (not a function re-evaluated per render), so a color captured here would
// freeze at whatever ttzPalette.tx equaled at import time and never follow a
// later theme change - unlike an inline `color: ttzPalette.tx` at each call
// site, which IS a fresh object literal evaluated on every render and so
// correctly picks up applyTheme's mutation. (Found live: this exact bug made
// "Your debts" remaining-balance text unreadable in dark mode until color
// was moved to each usage site.) Every spread of moneySmStyle below must set
// its own `color`.
const moneySmStyle = {
  fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  fontSize: 18,
  lineHeight: 1.25,
  overflowWrap: "anywhere",
  minWidth: 0,
};

const pathTime = (point) => new Date(point.at).getTime();

function MetricBlock({ label, value, supporting, emphasis = false }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{label}</div>
      <div style={{ ...(emphasis ? responsiveHeroValueStyle : responsiveMetricValueStyle), color: ttzPalette.tx }}>{value}</div>
      {supporting ? <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2 }}>{supporting}</div> : null}
    </div>
  );
}

function EmptyStateCard({ eyebrow, title, body, primaryCta, secondaryCta }) {
  return (
    <Card variant="elevated" style={{ padding: 32, textAlign: "center" }}>
      <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{eyebrow}</div>
      <h1 style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, margin: "10px 0 0" }}>{title}</h1>
      <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, maxWidth: 560, margin: "12px auto 0" }}>{body}</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        {primaryCta ? <Button variant="primary" onClick={primaryCta.onClick}>{primaryCta.label}</Button> : null}
        {secondaryCta ? <Button variant="secondary" onClick={secondaryCta.onClick}>{secondaryCta.label}</Button> : null}
      </div>
    </Card>
  );
}

// UX-8.1: the "Starting / Current / Goal" trio used to share one cramped
// 3-column row with "Knocked out"/"Remaining" crammed below it - numbers
// competed for space and the whole block read as one dense cluster. Each
// figure now gets its own clearly-labeled row (label left, tabular-nums
// value right), with "Confirmed reduction" as the one figure this card
// exists to prove, set apart from the plain starting/current facts by
// color only once it's actually genuine (> 0) - never colored as an
// achievement at 0%.
function ProgressStatRow({ label, value, emphasis = false, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2 }}>{label}</span>
      <span style={{ ...moneySmStyle, fontSize: emphasis ? 20 : 16, fontWeight: emphasis ? 800 : 700, color: tone || ttzPalette.tx }}>{value}</span>
    </div>
  );
}

function ProgressRing({ progress, title, subtitle }) {
  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const hasRealProgress = Boolean(progress?.confirmed && progress.eliminated > 0);
  const circumference = 2 * Math.PI * 54;
  const dash = circumference * (percent / 100);
  // Semantic color honesty (UX-8): the ring/eliminated figure is only ever
  // colored as success once a genuine confirmed reduction exists - 0%,
  // unconfirmed, or no-plan states stay neutral/brand-blue, never green.
  const ringColor = hasRealProgress ? ttzPalette.go : progress?.confirmed ? ttzPalette.ac : ttzPalette.border2;
  const ariaLabel = progress?.confirmed
    ? `${Math.round(percent)}% of confirmed starting debt has been eliminated. ${money(progress.latestBalance)} remains.`
    : "0% confirmed progress. Update your balances over time to see your payoff progress here.";

  return (
    <Card
      variant="default"
      className="ttz-card-hover"
      style={{ padding: 24, borderLeft: `3px solid ${hasRealProgress ? ttzPalette.go : ttzPalette.border2}` }}
    >
      <div style={{ display: "grid", gap: 18, justifyItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{title}</div>
          <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, marginTop: 4 }}>{subtitle}</div>
        </div>

        <div
          role="img"
          aria-label={ariaLabel}
          style={{ width: 148, height: 148, position: "relative", display: "grid", placeItems: "center" }}
        >
          <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
            <circle cx="74" cy="74" r="54" fill="none" stroke={ttzPalette.border} strokeWidth="12" />
            <circle
              cx="74"
              cy="74"
              r="54"
              fill="none"
              stroke={ringColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform="rotate(-90 74 74)"
            />
          </svg>
          <div style={{ position: "absolute", display: "grid", justifyItems: "center", gap: 2 }}>
            <div style={{ fontFamily: "var(--ttz-font-body)", fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: 32, color: ttzPalette.tx }}>{Math.round(percent)}%</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{progress?.confirmed ? "confirmed" : "needs history"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, width: "100%", textAlign: "left" }}>
          <ProgressStatRow label="Starting" value={money(progress?.openingBalance || 0)} />
          <ProgressStatRow label="Current" value={money(progress?.latestBalance || 0)} />
          <div style={{ height: 1, background: ttzPalette.border, margin: "2px 0" }} />
          <ProgressStatRow
            label="Confirmed reduction"
            value={money(progress?.eliminated || 0)}
            emphasis
            tone={hasRealProgress ? ttzPalette.go : ttzPalette.tx}
          />
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, textAlign: "right" }}>
            {money(progress?.latestBalance || 0)} remaining · Goal $0
          </div>
        </div>
      </div>
    </Card>
  );
}

function DebtSnapshotCard({ homeContext, onGoToDebts }) {
  const debtSnapshot = homeContext.debtSnapshot;
  if (!debtSnapshot) return null;

  return (
    <Card variant="default" className="ttz-card-hover" style={{ padding: 24, borderLeft: `3px solid ${ttzPalette.ac}` }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>Your debts</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{debtSnapshot.activeLabel}</div>
        <div style={{ ...moneySmStyle, fontSize: 20, color: ttzPalette.tx }}>{money(debtSnapshot.remainingDebt)} <span style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, fontWeight: 500 }}>remaining</span></div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
          {debtSnapshot.highestKnownApr != null
            ? `Highest known APR: ${formatPercent(debtSnapshot.highestKnownApr)}`
            : "Highest known APR: Unknown"}
        </div>
        <Button variant="secondary" onClick={onGoToDebts}>View debts</Button>
      </div>
    </Card>
  );
}

function ActivePlanCard({ homeContext, onViewMyPlan, onCompareStrategies, onTryWhatIf }) {
  const { activeVersion, currentTarget, planHealth, zeroDay, warnings } = homeContext;
  if (!activeVersion) return null;
  const primaryWarning = (warnings || [])[0];

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Your plan</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{strategyLabel(activeVersion.strategy)}</div>
          </div>
          <StatusBadge status={planHealth} />
        </div>

        <div style={gridColumns(150)}>
          <MetricBlock label="Projected $0" value={zeroDay ? shortDate(zeroDay) : "Not projected"} />
          <MetricBlock label="Current target" value={currentTarget?.name || "No target"} />
          <MetricBlock label="Extra payment" value={money(activeVersion.extraMonthlyPayment || 0)} />
        </div>

        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{planHealth?.message || "Your active plan is ready."}</div>

        {primaryWarning ? (
          <div style={{ padding: 14, borderRadius: RADIUS, background: toneColors(ttzPalette).warning.bg, color: ttzPalette.tx }}>
            <div style={{ ...TYPE_SCALE.cardTitle }}>Watch this</div>
            <div style={{ ...TYPE_SCALE.body, marginTop: 6 }}>{primaryWarning.message || primaryWarning.code}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={onViewMyPlan}>View My Plan</Button>
          <Button variant="secondary" onClick={onCompareStrategies}>Compare strategies</Button>
          <Button variant="secondary" onClick={onTryWhatIf}>Try What If</Button>
        </div>
      </div>
    </Card>
  );
}

function NotEnoughHistoryCard({ observed }) {
  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Your debt trend</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Not enough history yet</div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
          {observed.length
            ? `Your starting confirmed balance is ${money(observed[0]?.balance || 0)}. A couple more confirmed balance updates will unlock your trend chart.`
            : "Add a confirmed balance update to start building your debt trend."}
        </div>
      </div>
    </Card>
  );
}

function TrajectoryChart({ homeContext }) {
  const observed = homeContext.trajectory?.observed || [];
  const projected = homeContext.trajectory?.projected || [];
  const allPoints = [...observed, ...projected];
  const hasProjection = projected.length > 1;
  // A real projected path is still worth showing even with sparse observed
  // history (e.g. right after activating a plan) - the gate only replaces
  // the chart with a compact callout when there's neither a meaningful
  // observed trend NOR a projection to show.
  if (!allPoints.length || (!hasProjection && observed.length < MIN_TRAJECTORY_POINTS_FOR_CHART)) {
    return <NotEnoughHistoryCard observed={observed} />;
  }
  const hasObservedTrend = observed.length > 1;

  const width = 780;
  const height = 260;
  const pad = 28;
  const minX = Math.min(...allPoints.map((point) => pathTime(point)));
  const maxX = Math.max(...allPoints.map((point) => pathTime(point)));
  const maxY = Math.max(...allPoints.map((point) => Number(point.balance || 0)), 1);
  const scaleX = (point) => (
    maxX === minX
      ? pad
      : pad + (((pathTime(point) - minX) / (maxX - minX)) * (width - pad * 2))
  );
  const scaleY = (point) => height - pad - ((Number(point.balance || 0) / maxY) * (height - pad * 2));
  const drawPath = (points) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(point)} ${scaleY(point)}`).join(" ");

  const summary = hasProjection
    ? (hasObservedTrend
      ? `Confirmed debt decreased from ${money(observed[0]?.balance)} to ${money(observed.at(-1)?.balance)}. The active plan projects reaching $0 ${homeContext.zeroDay ? `in ${shortDate(homeContext.zeroDay)}` : "later on"}.`
      : `Confirmed starting debt is ${money(observed[0]?.balance || 0)}. The active plan projects reaching $0 ${homeContext.zeroDay ? `in ${shortDate(homeContext.zeroDay)}` : "later on"}.`)
    : (hasObservedTrend
      ? `Confirmed debt moved from ${money(observed[0]?.balance)} to ${money(observed.at(-1)?.balance)}. Pick a payoff plan to see your projected path to $0.`
      : `Your starting confirmed debt is ${money(observed[0]?.balance || 0)}. Add another confirmed balance update to see your debt trend.`);

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{hasProjection ? "Your path to $0" : "Your debt trend"}</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>
            {hasProjection
              ? "Confirmed balances are solid. Projected balances are dashed."
              : hasObservedTrend
                ? "Confirmed balances only. Pick a payoff plan to see your projected path to $0."
                : "You have a starting confirmed balance. Add another confirmed balance update to see your debt trend."}
          </div>
        </div>

        <div role="img" aria-label={summary}>
          <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={ttzPalette.border2} strokeWidth="1" />
            <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke={ttzPalette.border2} strokeWidth="1" />

            {observed.length > 1 ? (
              <path d={drawPath(observed)} fill="none" stroke={ttzPalette.ac} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {hasProjection ? (
              <path d={drawPath(projected)} fill="none" stroke={ttzPalette.info} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" />
            ) : null}

            {observed.map((point, index) => (
              // Bug fix: the plan's activation timestamp (the "starting"
              // point) can legitimately coincide with a debt's latest
              // confirmed balance timestamp (the "confirmed" point for the
              // same date), so `${kind}-${at}` alone collided. pointType
              // ("starting" vs "confirmed") always differs between them.
              <circle key={`${point.kind}-${point.pointType}-${point.at}-${index}`} cx={scaleX(point)} cy={scaleY(point)} r="5" fill={ttzPalette.ac} />
            ))}
            {projected.map((point, index) => (
              <circle key={`${point.kind}-${point.pointType}-${point.at}-${index}`} cx={scaleX(point)} cy={scaleY(point)} r={point.pointType === "zero" ? "6" : "4"} fill={ttzPalette.surf} stroke={ttzPalette.info} strokeWidth="2" />
            ))}
          </svg>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 18, height: 0, borderTop: `4px solid ${ttzPalette.ac}` }} />
            <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Confirmed</span>
          </div>
          {hasProjection ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 0, borderTop: `3px dashed ${ttzPalette.info}` }} />
              <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Projected</span>
            </div>
          ) : null}
        </div>

        {!hasObservedTrend ? (
          <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2 }}>
            Your progress history will get stronger after your next confirmed balance update.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function HouseholdBreakdownCard({ homeContext, onGoToDebts }) {
  const items = homeContext.householdBreakdown || [];
  if (!items.length) return null;
  const max = Math.max(...items.map((item) => item.totalDebt), 1);
  const allUnassignedOnly = items.length === 1 && items[0].type === "unassigned";

  return (
    <Card variant="default" className="ttz-card-hover" style={{ padding: 24, borderLeft: `3px solid ${ttzPalette.in}` }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Debt by owner</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>Included payoff debt for each verified household member. Joint debt is counted once.</div>
        </div>

        {allUnassignedOnly ? (
          <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: RADIUS, background: ttzPalette.surf2, border: `1px solid ${ttzPalette.border}` }}>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{money(items[0].totalDebt)} is currently unassigned.</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              Assign debt ownership to see how the household total breaks down.
            </div>
            <Button variant="secondary" onClick={onGoToDebts}>Review ownership</Button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {items.map((item) => (
              <div key={`${item.type}-${item.uid || item.displayName}`} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{item.displayName}</span>
                  <span style={{ ...moneySmStyle, fontSize: 15, color: ttzPalette.tx }}>{money(item.totalDebt)}</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: ttzPalette.surf2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(item.totalDebt / max) * 100}%`,
                      background: item.type === "joint" ? ttzPalette.info : item.type === "unassigned" ? ttzPalette.wa : ttzPalette.ac,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ReviewSummaryCard({ homeContext, onGoToReview }) {
  if (!homeContext.openReviewCount && !homeContext.staleBatchCount) return null;
  if (homeContext.staleBatchCount > 0 && !homeContext.openReviewCount) {
    return (
      <Card variant="default" className="ttz-card-hover" style={{ padding: 20, borderLeft: `4px solid ${toneColors(ttzPalette).warning.fg}` }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...TYPE_SCALE.overline, color: toneColors(ttzPalette).warning.fg }}>Import review</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
            {homeContext.staleBatchCount} older import{homeContext.staleBatchCount === 1 ? "" : "s"} need{homeContext.staleBatchCount === 1 ? "s" : ""} to be restarted.
          </div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
            These were created before the latest review model. Re-open Review to start fresh with today&apos;s import rules.
          </div>
          <Button variant="secondary" onClick={onGoToReview}>Open review</Button>
        </div>
      </Card>
    );
  }
  const tone = homeContext.blockingReviewCount > 0 ? "warning" : "info";
  const colors = toneColors(ttzPalette)[tone];
  return (
    <Card variant="default" className="ttz-card-hover" style={{ padding: 20, borderLeft: `4px solid ${colors.fg}`, background: tone === "warning" ? colors.bg : ttzPalette.surf }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ ...TYPE_SCALE.overline, color: colors.fg }}>Import review</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
          {homeContext.blockingReviewCount > 0
            ? `${homeContext.blockingReviewCount} decision${homeContext.blockingReviewCount === 1 ? "" : "s"} affect${homeContext.blockingReviewCount === 1 ? "s" : ""} your payoff plan.`
            : `${homeContext.openReviewCount} import decision${homeContext.openReviewCount === 1 ? "" : "s"} still need${homeContext.openReviewCount === 1 ? "s" : ""} your input.`}
        </div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
          {homeContext.blockingReviewCount > 0
            ? "Clean these up to keep your payoff plan accurate."
            : "Clean these up to keep your payoff picture accurate."}
        </div>
        <Button variant="secondary" onClick={onGoToReview}>Open review</Button>
      </div>
    </Card>
  );
}

function ProjectionFootnote() {
  return (
    <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, textAlign: "center" }}>
      Projections are estimates based on the information you&apos;ve provided. Actual balances, interest, fees, and payoff amounts may differ.
    </div>
  );
}

function NoActivePlanState({ homeContext, onCompareStrategies, onAddDebt, onGoToReview, onGoToDebts, onRecordPayment, paymentActions }) {
  return (
    <div style={{ display: "grid", gap: GAP }}>
      <div style={gridColumns(320)}>
        <Card variant="elevated" style={{ padding: 28 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>Your next move</div>
            <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, fontSize: 28 }}>
              You have {money(homeContext.totalDebt)} in confirmed debt.
            </div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              Choose a payoff strategy to see which debt to target first, your projected $0 date, and the payoff order TrackToZero would use.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: ttzPalette.tx2, display: "grid", gap: 6 }}>
              <li>Which debt to target first</li>
              <li>Your projected debt-free date</li>
              <li>Your payoff order across every included debt</li>
            </ul>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={onCompareStrategies}>Compare Snowball vs Avalanche</Button>
              <Button variant="secondary" onClick={onAddDebt}>Add debt</Button>
            </div>
          </div>
        </Card>

        <Card variant="default" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>What Home will unlock</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No active payoff plan yet.</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              Once you choose a plan, Home will show your monthly target, what you&apos;ve recorded, and your next step without guessing.
            </div>
          </div>
        </Card>
      </div>

      {/* GATE-10B.1C fix: UpcomingPaymentsCard was previously INSIDE this
          same summary-card grid (reproduced live: on a wide viewport with
          both Import review and Household breakdown present, auto-fit
          packed 5 cards - including the payments list - into one row). It's
          now its own full-width row, same as every other Home state. The
          inline hand-rolled "Import review" card is also replaced with the
          shared ReviewSummaryCard (the same consolidation the main
          active-plan state already got), so there is exactly one Import
          Review presentation across all of Home's states, not two - and it
          renders as its own full-width banner (not squeezed into the
          matched-size row below) since it's an actionable item, not a peer
          informational card. */}
      <ReviewSummaryCard homeContext={homeContext} onGoToReview={onGoToReview} />

      <div style={gridColumnsEqual(280)}>
        <ProgressRing
          progress={homeContext.progress || { confirmed: false, openingBalance: 0, latestBalance: 0, eliminated: 0, percent: 0 }}
          title="Confirmed progress"
          subtitle={homeContext.progress?.confirmed ? "Based on your confirmed balance history so far" : "Your starting point is set. Update your balance after your next statement and we'll show how much you've knocked out."}
        />

        <DebtSnapshotCard homeContext={homeContext} onGoToDebts={onGoToDebts || onAddDebt} />

        {homeContext.isHousehold ? <HouseholdBreakdownCard homeContext={homeContext} onGoToDebts={onGoToDebts || onAddDebt} /> : null}
      </div>

      <UpcomingPaymentsCard homeContext={homeContext} onGoToDebts={onGoToDebts || onAddDebt} onRecordPayment={onRecordPayment} {...paymentActions} />

      <TrajectoryChart homeContext={homeContext} />
    </div>
  );
}

function BlockingReviewState({ homeContext, onGoToReview, onGoToDebts, onRecordPayment, paymentActions }) {
  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="warning" style={{ padding: 24 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ ...TYPE_SCALE.overline, color: toneColors(ttzPalette).warning.fg }}>Needs review</div>
          <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, fontSize: 24 }}>TrackToZero can&apos;t fully trust this plan yet.</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
            Resolve the blocking review items before Home treats this plan&apos;s momentum and projection as fully trusted.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={onGoToReview}>Review now</Button>
            <Button variant="secondary" onClick={onGoToDebts}>View debts</Button>
          </div>
        </div>
      </Card>

      <div style={gridColumns(260)}>
        <Card variant="default" style={{ padding: 24 }}>
          <MetricBlock label="Debt remaining (provisional)" value={money(homeContext.primaryRemainingDebt)} />
          <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2, marginTop: 8 }}>This may change once blocking review items are resolved.</div>
        </Card>
        {homeContext.currentTarget ? (
          <Card variant="default" style={{ padding: 24 }}>
            <MetricBlock label="Current target (provisional)" value={homeContext.currentTarget.name} supporting={homeContext.currentTarget.ownerLabel || "Unassigned"} />
          </Card>
        ) : null}
      </div>

      {/* Required-payment timing is independent of whether the plan can be
          fully trusted yet - a real-world due date doesn't wait on review. */}
      <UpcomingPaymentsCard homeContext={homeContext} onGoToDebts={onGoToDebts} onRecordPayment={onRecordPayment} {...paymentActions} />
    </div>
  );
}

function AllPaidOffState({ homeContext, onViewMyPlan, onGoToDebts, onRecordPayment, paymentActions }) {
  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="elevated" style={{ padding: 32, textAlign: "center", background: toneColors(ttzPalette).success.bg }}>
        <div style={{ ...TYPE_SCALE.overline, color: toneColors(ttzPalette).success.fg }}>Completed</div>
        <h1 style={{ ...TYPE_SCALE.display, color: ttzPalette.tx, fontSize: 36, margin: "10px 0 0" }}>$0 remaining</h1>
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, maxWidth: 560, margin: "12px auto 0" }}>
          Your included debts are paid off. TrackToZero is preserving the journey without pretending projected milestones were confirmed early.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
          <Button variant="secondary" onClick={onViewMyPlan}>View My Plan</Button>
        </div>
      </Card>

      {homeContext.progress ? (
        <div style={gridColumns(250)}>
          <Card variant="default" style={{ padding: 24 }}>
            <MetricBlock label="Confirmed eliminated" value={money(homeContext.progress.eliminated)} />
          </Card>
          <Card variant="default" style={{ padding: 24 }}>
            <MetricBlock label="Starting debt" value={money(homeContext.progress.openingBalance)} />
          </Card>
        </div>
      ) : null}

      {/* A debt excluded from the core plan (e.g. a mortgage) can still have
          its own real-world due date even after every INCLUDED debt hits $0. */}
      <UpcomingPaymentsCard homeContext={homeContext} onGoToDebts={onGoToDebts} onRecordPayment={onRecordPayment} {...paymentActions} />
    </div>
  );
}

export default function HomeCommandCenter({
  snapshot,
  reviewSnapshot,
  scenario,
  onGoToPlan,
  onGoToReview,
  onUploadBudget,
  onAddDebt,
  onViewDetails,
  onPreviewScenario,
  onViewMyPlan,
  onCompareStrategies,
  onTryWhatIf,
  onGoToDebts,
  onRecordPayment,
  service,
  refresh,
  runAction,
  canObserve,
}) {
  const homeContext = useMemo(() => deriveHomeContext(snapshot, reviewSnapshot, scenario), [snapshot, reviewSnapshot, scenario]);

  const goToMyPlan = onViewMyPlan || onGoToPlan;
  const goToCompare = onCompareStrategies || onGoToPlan;
  const goToWhatIf = onTryWhatIf || (() => onPreviewScenario?.(100));
  const goToDebts = onGoToDebts || onViewDetails || onAddDebt || onGoToPlan;
  const nextMoveActions = { review: onGoToReview, plan: goToMyPlan, compare: goToCompare, debts: goToDebts };
  // GATE-10B.1C: bundled once and spread onto every UpcomingPaymentsCard
  // render site (main + no-plan/blocking-review/all-paid-off states) so
  // "Mark as paid" works identically no matter which Home state is showing.
  const paymentActions = { service, workspaceId: snapshot?.workspace?.id, refresh, runAction, canObserve };

  if (!snapshot) {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <Card variant="default" style={{ padding: 24 }}>
          <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx }}>Loading Home…</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>We&apos;re loading your latest payoff progress.</div>
        </Card>
      </main>
    );
  }

  if (homeContext.homeState === "no-debt") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <EmptyStateCard
          eyebrow="Start your path to $0"
          title="Add your debts"
          body="Add your debts to see your payoff options, understand what you owe, and build a plan."
          primaryCta={{ label: "Add debt", onClick: onAddDebt }}
          secondaryCta={{ label: "Import spreadsheet", onClick: onUploadBudget }}
        />
      </main>
    );
  }

  if (homeContext.homeState === "no-plan") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <NoActivePlanState homeContext={homeContext} onCompareStrategies={goToCompare} onAddDebt={onAddDebt} onGoToReview={onGoToReview} onGoToDebts={goToDebts} onRecordPayment={onRecordPayment} paymentActions={paymentActions} />
      </main>
    );
  }

  if (homeContext.homeState === "blocking-review") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <BlockingReviewState homeContext={homeContext} onGoToReview={onGoToReview} onGoToDebts={goToDebts} onRecordPayment={onRecordPayment} paymentActions={paymentActions} />
      </main>
    );
  }

  if (homeContext.homeState === "all-paid-off") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <AllPaidOffState homeContext={homeContext} onViewMyPlan={goToMyPlan} onGoToDebts={goToDebts} onRecordPayment={onRecordPayment} paymentActions={paymentActions} />
      </main>
    );
  }

  return (
    <main style={{ display: "grid", gap: GAP }}>
      {/* Row 1: the one deterministic next move, plus the active plan's own
          shape (strategy/target/extra payment) beside it - the two things
          that together answer "what should I do and why" in one glance. */}
      <div style={row1Style}>
        <div style={{ flex: "1.65 1 480px", minWidth: 0 }}>
          <NextMoveHero homeContext={homeContext} actions={nextMoveActions} />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <ActivePlanCard
            homeContext={homeContext}
            onViewMyPlan={goToMyPlan}
            onCompareStrategies={goToCompare}
            onTryWhatIf={goToWhatIf}
          />
        </div>
      </div>

      {/* Import review (unified, reused everywhere) surfaces as its own
          full-width banner when there's something to review, above the
          matched-size summary row below - an actionable item shouldn't be
          squeezed to match 3 informational cards' height, and returns null
          entirely when nothing needs review. */}
      <ReviewSummaryCard homeContext={homeContext} onGoToReview={onGoToReview} />

      {/* Row 2: confirmed progress, debt snapshot, and household breakdown
          (household workspaces only) - a matched-size set (gridColumnsEqual,
          not gridColumns) since these are peer summary cards, not a list of
          varying-length content. */}
      <div style={gridColumnsEqual(260)}>
        <ProgressRing
          progress={homeContext.progress}
          title="Confirmed progress"
          subtitle={homeContext.progress?.confirmed ? "Confirmed debt eliminated vs confirmed debt remaining" : "Your starting point is set. Progress updates after a new confirmed balance snapshot."}
        />
        <DebtSnapshotCard homeContext={homeContext} onGoToDebts={goToDebts} />
        {homeContext.isHousehold ? <HouseholdBreakdownCard homeContext={homeContext} onGoToDebts={goToDebts} /> : null}
      </div>

      {/* Row 3: upcoming payments, full width, own row. */}
      <UpcomingPaymentsCard homeContext={homeContext} onGoToDebts={goToDebts} onRecordPayment={onRecordPayment} {...paymentActions} />

      {/* Row 4: debt trend / trajectory, full width, own row. */}
      <TrajectoryChart homeContext={homeContext} />

      <ProjectionFootnote />
    </main>
  );
}
