import React, { useMemo } from "react";
import { formatMoney, formatPercent, formatShortDate } from "../formatting.js";
import { ttzPalette, toneColors, TYPE_SCALE, STATUS_TONE } from "../theme.js";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { deriveHomeContext } from "./homeViewModels.js";
import { PERIOD_STATES } from "./homeMonthlyStatus.js";

const GAP = "var(--ttz-space-5, 24px)";
const GAP_SM = "var(--ttz-space-4, 16px)";
const RADIUS = "var(--ttz-radius-lg, 16px)";

const money = (value) => formatMoney(Number(value || 0));
const shortDate = (value) => formatShortDate(value);
const dueDayLabel = (dueDay) => (Number(dueDay) > 0 ? `Due day ${dueDay}` : "");
const strategyLabel = (strategy) => strategy === "snowball"
  ? "Snowball"
  : strategy === "avalanche"
    ? "Avalanche"
    : "No active strategy";

const gridColumns = (min = 260) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: GAP_SM,
});

const responsiveMetricValueStyle = {
  fontFamily: "var(--ttz-font-mono)",
  fontWeight: 700,
  fontSize: "clamp(1.45rem, 1rem + 1.8vw, 2.4rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.02em",
  overflowWrap: "anywhere",
  minWidth: 0,
};

const responsiveHeroValueStyle = {
  fontFamily: "var(--ttz-font-mono)",
  fontWeight: 800,
  fontSize: "clamp(2.05rem, 1.35rem + 3vw, 3.5rem)",
  lineHeight: 1.02,
  letterSpacing: "-0.03em",
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

function ProgressRing({ progress, title, subtitle }) {
  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const circumference = 2 * Math.PI * 54;
  const dash = circumference * (percent / 100);
  const ariaLabel = progress?.confirmed
    ? `${Math.round(percent)}% of confirmed starting debt has been eliminated. ${money(progress.latestBalance)} remains.`
    : "0% confirmed progress. Update your balances over time to see your payoff progress here.";

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center" }}>
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
              stroke={progress?.confirmed && percent > 0 ? ttzPalette.ac : ttzPalette.border2}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform="rotate(-90 74 74)"
            />
          </svg>
          <div style={{ position: "absolute", display: "grid", justifyItems: "center", gap: 2 }}>
            <div style={{ ...TYPE_SCALE.display, fontSize: 32, color: ttzPalette.tx }}>{Math.round(percent)}%</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{progress?.confirmed ? "confirmed" : "needs history"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6, width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 4 }}>
            <div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Starting</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx }}>{money(progress?.openingBalance || 0)}</div>
            </div>
            <div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Current</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx }}>{money(progress?.latestBalance || 0)}</div>
            </div>
            <div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Goal</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx }}>$0</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Knocked out</span>
            <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx }}>{money(progress?.eliminated || 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Remaining</span>
            <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx }}>{money(progress?.latestBalance || 0)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DebtFreedomHero({ homeContext }) {
  const {
    progress,
    zeroDay,
    primaryRemainingDebt,
    primaryDebtScopeLabel,
    secondaryDebtMetric,
    excludedDebt,
    hasActivePlan,
    debtSnapshot,
  } = homeContext;
  return (
    <Card
      variant="elevated"
      style={{
        padding: 28,
        background: `linear-gradient(135deg, ${ttzPalette.surf} 0%, ${ttzPalette.acS} 100%)`,
        border: `1px solid ${ttzPalette.border}`,
      }}
    >
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>Debt freedom</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge tone="info">{debtSnapshot?.activeLabel || `${homeContext.debtCount} debts tracked`}</Badge>
            {secondaryDebtMetric ? <Badge tone="warning">{money(secondaryDebtMetric.value)} excluded</Badge> : null}
          </div>
        </div>
        <div style={gridColumns(260)}>
          <MetricBlock
            label={hasActivePlan ? "Debt remaining" : "Confirmed debt remaining"}
            value={money(primaryRemainingDebt)}
            supporting={excludedDebt > 0 ? `${debtSnapshot?.activeLabel || primaryDebtScopeLabel} in your active payoff journey.` : (debtSnapshot?.activeLabel || primaryDebtScopeLabel)}
            emphasis
          />
          <MetricBlock
            label="Knocked out"
            value={money(progress?.eliminated || 0)}
            supporting={progress?.confirmed ? "Confirmed progress only — never projected." : "This stays at $0 until you have confirmed balance movement."}
          />
          <MetricBlock
            label="Progress to $0"
            value={`${Math.round(progress?.percent || 0)}%`}
            supporting={progress?.confirmed ? `${money(progress?.latestBalance || 0)} still left.` : "Your starting point is set. Progress gets stronger after another confirmed balance update."}
          />
          <MetricBlock
            label="Projected $0"
            value={zeroDay ? shortDate(zeroDay) : hasActivePlan ? "Not projected yet" : "Choose a plan"}
            supporting={zeroDay ? "Projected from your active plan." : hasActivePlan ? "A projected $0 date appears once the plan is reachable." : "A projected $0 date appears after you activate a payoff plan."}
          />
        </div>
        <div style={{ ...TYPE_SCALE.supporting, color: ttzPalette.tx2 }}>
          {hasActivePlan
            ? "Home is your fastest snapshot of what remains, what you've already knocked out, and what your active plan is aiming next."
            : "Home is your fastest snapshot of what you owe now, what you've already confirmed, and what to do next."}
        </div>
      </div>
    </Card>
  );
}

function DebtSnapshotCard({ homeContext, onGoToDebts }) {
  const debtSnapshot = homeContext.debtSnapshot;
  if (!debtSnapshot) return null;

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Your debts</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{debtSnapshot.activeLabel}</div>
        <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx }}>{money(debtSnapshot.remainingDebt)} remaining</div>
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

function ThisMonthCard({ homeContext, onRecordPayment, onViewDetails, onCompareStrategies }) {
  const { currentTarget, strategy, activeVersion, monthlyStatus, planHealth, nextMove } = homeContext;
  if (!activeVersion) return null;

  const toneKey = monthlyStatus?.state === PERIOD_STATES.recorded
    ? "success"
    : monthlyStatus?.state === PERIOD_STATES.partially_recorded
      ? "warning"
      : monthlyStatus?.state === PERIOD_STATES.more_than_planned
        ? "info"
        : STATUS_TONE[planHealth?.code] || "info";
  const tone = toneColors(ttzPalette)[toneKey];

  if (!currentTarget || !monthlyStatus || monthlyStatus.state === PERIOD_STATES.no_target) {
    return (
      <Card variant="elevated" style={{ padding: 24, borderLeft: `4px solid ${tone.fg}` }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ ...TYPE_SCALE.overline, color: tone.fg }}>This month</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Your plan needs a target before Home can guide this month.</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
            Review your debts and plan setup so TrackToZero can point to the right payoff target next.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={onViewDetails}>View debts</Button>
            <Button variant="secondary" onClick={onCompareStrategies}>Compare strategies</Button>
          </div>
        </div>
      </Card>
    );
  }

  const primaryAction = monthlyStatus.shouldUpdateBalance
    ? { label: "Update balance", onClick: onViewDetails }
    : monthlyStatus.shouldRecordPayment
      ? { label: monthlyStatus.ctaLabel || "Record payment", onClick: onRecordPayment }
      : { label: monthlyStatus.ctaLabel || "View debt", onClick: onViewDetails };

  return (
    <Card variant="elevated" style={{ padding: 24, borderLeft: `4px solid ${tone.fg}` }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ ...TYPE_SCALE.overline, color: tone.fg }}>This month</div>
            <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, fontSize: 24 }}>{currentTarget.name}</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{(currentTarget.ownerLabel || "Unassigned")} · Current target</div>
          </div>
          <Badge tone="info">Current target</Badge>
        </div>

        <div style={gridColumns(150)}>
          <MetricBlock
            label="Planned this month"
            value={money(monthlyStatus.plannedAmount)}
            supporting={`Required ${money(monthlyStatus.requiredPayment)} + extra ${money(monthlyStatus.extraPayment)}`}
          />
          <MetricBlock
            label="Recorded so far"
            value={money(monthlyStatus.recordedAmount)}
            supporting={monthlyStatus.paymentCount > 0 ? `${monthlyStatus.paymentCount} payment${monthlyStatus.paymentCount === 1 ? "" : "s"} recorded` : "Nothing recorded yet"}
          />
          <MetricBlock label="Status" value={monthlyStatus.headline} supporting={monthlyStatus.supporting} />
          {dueDayLabel(currentTarget.dueDay) ? <MetricBlock label="Timing" value={dueDayLabel(currentTarget.dueDay)} /> : null}
        </div>

        <div style={{ padding: 14, borderRadius: RADIUS, background: ttzPalette.surf2, border: `1px solid ${ttzPalette.border}` }}>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Your next move</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: "8px 0 0" }}>
            <strong>{nextMove?.label || monthlyStatus.headline}</strong> {nextMove?.body || monthlyStatus.supporting} Your active {strategyLabel(strategy).toLowerCase()} plan is currently aiming extra money at <strong>{currentTarget.name}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          <Button variant="secondary" onClick={onViewDetails}>View debt details</Button>
        </div>
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

function TrajectoryChart({ homeContext }) {
  const observed = homeContext.trajectory?.observed || [];
  const projected = homeContext.trajectory?.projected || [];
  const allPoints = [...observed, ...projected];
  if (!allPoints.length) return null;
  const hasProjection = projected.length > 1;
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
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Household snapshot</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>Included payoff debt by owner. Joint debt is counted once.</div>
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
                  <span style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>{money(item.totalDebt)}</span>
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

function MomentumCard({ homeContext }) {
  const momentum = homeContext.momentum;
  const progress = homeContext.progress;
  if (!momentum || !progress) return null;

  let movementCopy = "No later confirmed movement yet.";
  if (momentum.latestMovement) {
    const delta = Number(momentum.latestMovement.delta || 0);
    movementCopy = `${delta < 0 ? "-" : "+"}${money(Math.abs(delta))} since ${shortDate(momentum.latestMovement.from)}`;
  }

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Momentum</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{momentum.headline}</div>
        <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.ac }}>{money(momentum.eliminated || 0)} eliminated</div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{momentum.supporting || `Latest confirmed movement: ${movementCopy}`}</div>
      </div>
    </Card>
  );
}

function NextMilestoneCard({ homeContext, onViewMyPlan }) {
  const milestone = homeContext.nextMilestone;
  if (!milestone) return null;
  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Next milestone</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>{milestone.title}</div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{milestone.supporting}</div>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Projected · {shortDate(milestone.period)}</div>
        <Button variant="secondary" onClick={onViewMyPlan}>View My Plan</Button>
      </div>
    </Card>
  );
}

function InsightCards({ homeContext, onViewMyPlan, onGoToReview, onGoToDebts, onCompareStrategies }) {
  const actions = { plan: onViewMyPlan, review: onGoToReview, debts: onGoToDebts, compare: onCompareStrategies };
  const insights = homeContext.insights || [];
  if (!insights.length) return null;
  return (
    <div style={gridColumns(250)}>
      {insights.map((insight, index) => (
        <Card key={`${insight.title}-${index}`} variant="default" style={{ padding: 20 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Badge tone={insight.tone || "info"}>
              {insight.tone === "danger" ? "Needs attention" : insight.tone === "warning" ? "Improve" : "Insight"}
            </Badge>
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{insight.title}</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{insight.body}</div>
            {insight.cta && actions[insight.action] ? <Button variant="secondary" onClick={actions[insight.action]}>{insight.cta}</Button> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

function WhatIfCard({ homeContext, onTryWhatIf }) {
  const scenario = homeContext.whatIf;
  return (
    <Card variant="default" style={{ padding: 20 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>What If?</div>
        {scenario ? (
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
            Projected improvement: {scenario.monthsSaved > 0 ? `${scenario.monthsSaved} months sooner` : "timeline unchanged"}
            {scenario.interestSaved > 0 ? ` · ${money(scenario.interestSaved)} less interest` : ""}
          </div>
        ) : (
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Preview a safe scenario without changing your active plan.</div>
        )}
        <Button variant="secondary" onClick={onTryWhatIf}>{scenario ? "View My Plan What If" : "Try What If"}</Button>
      </div>
    </Card>
  );
}

function ReviewSummaryCard({ homeContext, onGoToReview }) {
  if (!homeContext.openReviewCount) return null;
  const tone = homeContext.blockingReviewCount > 0 ? "warning" : "info";
  const colors = toneColors(ttzPalette)[tone];
  return (
    <Card variant="default" style={{ padding: 20, borderLeft: `4px solid ${colors.fg}` }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ ...TYPE_SCALE.overline, color: colors.fg }}>Needs attention</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
          {homeContext.blockingReviewCount > 0
            ? `${homeContext.blockingReviewCount} item${homeContext.blockingReviewCount === 1 ? "" : "s"} need a quick review.`
            : `${homeContext.openReviewCount} item${homeContext.openReviewCount === 1 ? "" : "s"} need a quick review.`}
        </div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
          {homeContext.blockingReviewCount > 0
            ? "Clean these up to keep your payoff plan accurate."
            : "Clean these up to keep your payoff picture accurate."}
        </div>
        <Button variant="secondary" onClick={onGoToReview}>Review now</Button>
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

function NoActivePlanState({ homeContext, onCompareStrategies, onAddDebt, onGoToReview, onGoToDebts }) {
  return (
    <div style={{ display: "grid", gap: GAP }}>
      <DebtFreedomHero homeContext={homeContext} />

      <div style={gridColumns(280)}>
        <Card variant="default" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Pick your payoff path</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No active payoff plan</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              Compare Snowball and Avalanche with your current debts, then pick the payoff path you want to follow.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={onCompareStrategies}>Compare strategies</Button>
              <Button variant="secondary" onClick={onAddDebt}>Add debt</Button>
            </div>
          </div>
        </Card>

        <Card variant="default" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>This month</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No monthly payoff target yet.</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              Once you choose a plan, we'll show what your plan expects this month, what you've recorded, and your next move.
            </div>
          </div>
        </Card>
      </div>

      <div style={gridColumns(280)}>
        <ProgressRing
          progress={homeContext.progress || { confirmed: false, openingBalance: 0, latestBalance: 0, eliminated: 0, percent: 0 }}
          title="Confirmed progress"
          subtitle={homeContext.progress?.confirmed ? "Based on your confirmed balance history so far" : "Your starting point is set. Update your balance after your next statement and we'll show how much you've knocked out."}
        />

        <DebtSnapshotCard homeContext={homeContext} onGoToDebts={onGoToDebts || onAddDebt} />

        <Card variant="default" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Needs attention</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
              {homeContext.openReviewCount > 0
                ? `${homeContext.openReviewCount} item${homeContext.openReviewCount === 1 ? "" : "s"} need a quick review.`
                : `${homeContext.debtCount} debt${homeContext.debtCount === 1 ? "" : "s"} tracked.`}
            </div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
              {homeContext.openReviewCount > 0
                ? "Clean these up to keep your payoff picture accurate."
                : "You're ready to compare payoff strategies and choose your plan."}
            </div>
            {homeContext.openReviewCount > 0 ? <Button variant="secondary" onClick={onGoToReview}>Review now</Button> : null}
          </div>
        </Card>

        {homeContext.isHousehold ? <HouseholdBreakdownCard homeContext={homeContext} onGoToDebts={onGoToDebts || onAddDebt} /> : null}
      </div>

      <TrajectoryChart homeContext={homeContext} />
    </div>
  );
}

function BlockingReviewState({ homeContext, onGoToReview, onGoToDebts }) {
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
    </div>
  );
}

function AllPaidOffState({ homeContext, onViewMyPlan }) {
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
  onRecordPayment,
  onViewDetails,
  onPreviewScenario,
  onViewMyPlan,
  onCompareStrategies,
  onTryWhatIf,
  onGoToDebts,
}) {
  const homeContext = useMemo(() => deriveHomeContext(snapshot, reviewSnapshot, scenario), [snapshot, reviewSnapshot, scenario]);

  const goToMyPlan = onViewMyPlan || onGoToPlan;
  const goToCompare = onCompareStrategies || onGoToPlan;
  const goToWhatIf = onTryWhatIf || (() => onPreviewScenario?.(100));
  const goToDebts = onGoToDebts || onViewDetails || onAddDebt || onGoToPlan;

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
        <NoActivePlanState homeContext={homeContext} onCompareStrategies={goToCompare} onAddDebt={onAddDebt} onGoToReview={onGoToReview} onGoToDebts={goToDebts} />
      </main>
    );
  }

  if (homeContext.homeState === "blocking-review") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <BlockingReviewState homeContext={homeContext} onGoToReview={onGoToReview} onGoToDebts={goToDebts} />
      </main>
    );
  }

  if (homeContext.homeState === "all-paid-off") {
    return (
      <main style={{ display: "grid", gap: GAP }}>
        <AllPaidOffState homeContext={homeContext} onViewMyPlan={goToMyPlan} />
      </main>
    );
  }

  return (
    <main style={{ display: "grid", gap: GAP }}>
      <DebtFreedomHero homeContext={homeContext} />

      <div style={gridColumns(320)}>
        <ThisMonthCard
          homeContext={homeContext}
          onRecordPayment={onRecordPayment || goToDebts}
          onViewDetails={goToDebts}
          onCompareStrategies={goToCompare}
        />
        <ProgressRing
          progress={homeContext.progress}
          title="Confirmed progress"
          subtitle={homeContext.progress?.confirmed ? "Confirmed debt eliminated vs confirmed debt remaining" : "Your starting point is set. Progress updates after a new confirmed balance snapshot."}
        />
      </div>

      <div style={gridColumns(320)}>
        <TrajectoryChart homeContext={homeContext} />
        <div style={{ display: "grid", gap: GAP_SM }}>
          <ActivePlanCard
            homeContext={homeContext}
            onViewMyPlan={goToMyPlan}
            onCompareStrategies={goToCompare}
            onTryWhatIf={goToWhatIf}
          />
          <ReviewSummaryCard homeContext={homeContext} onGoToReview={onGoToReview} />
        </div>
      </div>

      <div style={gridColumns(260)}>
        <DebtSnapshotCard homeContext={homeContext} onGoToDebts={goToDebts} />
        {homeContext.isHousehold ? <HouseholdBreakdownCard homeContext={homeContext} onGoToDebts={goToDebts} /> : null}
        <MomentumCard homeContext={homeContext} />
        <NextMilestoneCard homeContext={homeContext} onViewMyPlan={goToMyPlan} />
        <WhatIfCard homeContext={homeContext} onTryWhatIf={goToWhatIf} />
      </div>

      <InsightCards
        homeContext={homeContext}
        onViewMyPlan={goToMyPlan}
        onGoToReview={onGoToReview}
        onGoToDebts={goToDebts}
        onCompareStrategies={goToCompare}
      />

      <ProjectionFootnote />
    </main>
  );
}
