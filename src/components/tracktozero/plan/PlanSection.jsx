import { useEffect, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import Input from "../ui/Input.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import ConfirmationDialog from "../ui/ConfirmationDialog.jsx";
import { ttzPalette, toneColors, TYPE_SCALE, STATUS_TONE } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { describeDebtReviewReasons, disambiguationSuffixForDebt, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import LenderIdentity from "../debts/LenderIdentity.jsx";
import { deriveDebtsAwaitingReforecast } from "../../../services/tracktozero/projectionStatusService.js";
import { PLAN_DESTINATIONS, resolvePlanDestination, buildPlanPath, navigateToPlanDestination } from "./planRouting.js";
import { getWorkspacePresentation } from "../workspacePresentation.js";
import { activateOrReforecastStrategy, applyPlanChange } from "./planActivation.js";
import {
  classifyGoalDateFeasibility,
  computeSpeedUpSuggestion,
  deriveAllocationSegments,
  deriveDebtCompositionSegments,
  deriveInterestBreakdownSegments,
  deriveNextMove,
  derivePerDebtImpactRows,
  deriveStrategyRecommendation,
  pickBestByZeroDate,
  safePercentDelta,
} from "../../../services/tracktozero/planInsights.js";
import { categoryConfigForGroup } from "../debts/debtCategoryConfig.js";
import TrendChart from "./charts/TrendChart.jsx";
import AllocationDonut from "./charts/AllocationDonut.jsx";
import MultiScenarioCompareCard from "./charts/MultiScenarioCompareCard.jsx";
import IconBadge from "./ui/IconBadge.jsx";
import InsightBanner from "./ui/InsightBanner.jsx";
import SectionCard from "./ui/SectionCard.jsx";
import PayoffOrderTable from "./ui/PayoffOrderTable.jsx";
import MomentumDots from "./ui/MomentumDots.jsx";
import HistoryTimeline from "./ui/HistoryTimeline.jsx";
import {
  Calendar, Clock, DollarSign, TrendingUp, Wallet, Compass, LineChart, ListOrdered, Target, Zap,
  HeartPulse, GitCompare, PieChart, CheckCircle2, AlertTriangle, AlertCircle, Info, Snowflake, Mountain,
  ArrowLeft, Trophy, Sparkles, ArrowRight, Lightbulb, ShieldCheck, Upload, FlaskConical, Flag, Archive,
} from "lucide-react";
import { derivePaymentTiming, paymentTimingLabel } from "../../../domain/tracktozero/paymentTiming.js";

const DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT = 5;

// GATE-10B.1E: STATUS_TONE (theme.js) already maps a plan-health status code
// to a Badge tone (success/warning/danger/info) - this is the matching icon
// per tone, reused wherever a status-driven IconBadge/InsightBanner needs
// one (My Plan's bottom banner, Snowball/Avalanche's active-strategy
// banner). Kept here rather than in theme.js since it's presentation
// (lucide-react components), not a design token.
const STATUS_ICON = { success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle, info: Info, neutral: Info };
const STATUS_TO_BANNER_TONE = { success: "go", warning: "wa", danger: "da", info: "info", neutral: "neutral" };

// GATE-10B.1E: every reference design shows a page-specific title/subtitle
// ("Snowball vs Avalanche", "What if?", "Saved plans & scenarios"...), not
// the one shared "Your path to $0" heading the shell previously rendered
// for all 7 destinations. Swapping the SHELL's own h1/subtitle text per
// destination (rather than duplicating a title inside every page) keeps
// GATE-10B.1's "one real <h1> per Plan tab" accessibility guarantee intact -
// still exactly one h1, its text just now matches what's actually shown.
const DESTINATION_TITLES = {
  "my-plan": { title: "My Plan", subtitle: "Your active payoff strategy, next steps, and path to debt freedom in one place." },
  snowball: { title: "Snowball", subtitle: "Knock out your smallest debts first to build momentum and quick wins that keep you going." },
  avalanche: { title: "Avalanche payoff plan", subtitle: "Focus on highest-APR debts first to save the most on interest." },
  compare: { title: "Snowball vs Avalanche", subtitle: "Compare payoff strategies side by side to choose your best path to debt freedom." },
  "what-if": { title: "What if?", subtitle: "Test how extra payments, one-time payments, or retargeting debt changes your payoff timeline before making it real." },
  "finish-by": { title: "Finish By", subtitle: "Set a target debt-free month and see how much extra payment it takes to hit it." },
  scenarios: { title: "Saved plans & scenarios", subtitle: "Revisit, compare, and apply any saved what-if, strategy, or finish-by target." },
};

// GATE-10B.1D: turns a payoffSimulate*-shaped aggregate `projection` array
// into TrendChart's expected point shape - one tiny adapter reused by every
// chart-bearing view below, so each view doesn't hand-roll its own mapping.
// GATE-10B.1E: also carries each month's own interest (row.total_interest,
// already computed by the engine and already summed elsewhere for
// estimatedInterest) - purely additive, existing callers that only read
// `.balance` are unaffected. This is what makes TrendChart's opt-in
// Balance/Interest/Cumulative-interest mode toggle (My Plan, Snowball) able
// to plot real numbers instead of a flat zero line.
const toBalancePoints = (projection = []) => projection.map((row) => ({ month: row.month, balance: row.remaining_debt, interest: row.total_interest }));

const GAP = "var(--ttz-space-4, 16px)";

function pillTabGroupStyle() {
  return {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    padding: 6,
    borderRadius: 16,
    border: `1px solid ${ttzPalette.isDark ? ttzPalette.border2 : (ttzPalette.waD || ttzPalette.border2)}`,
    background: ttzPalette.isDark
      ? `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`
      : "linear-gradient(180deg, rgba(242,153,74,0.12) 0%, rgba(255,255,255,0.96) 100%)",
  };
}

function pillTabButtonStyle(active) {
  return {
    ...TYPE_SCALE.supporting,
    minHeight: 32,
    border: `1px solid ${active ? ttzPalette.wa : "transparent"}`,
    background: active ? (ttzPalette.waD || ttzPalette.surf) : "transparent",
    // The orange treatment marks the active tab; tab labels remain
    // monochrome so plan navigation matches the rest of the app.
    color: active ? ttzPalette.tx : ttzPalette.tx2,
    padding: "0 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 800,
    boxShadow: active ? "var(--ttz-shadow-sm)" : "none",
  };
}

function PlanMetric({ label, value, tone = "default", icon }) {
  // GATE-10B.1C: warning/success used to be hardcoded light-mode-only hex
  // values (e.g. "#fff7ed") that bypassed ttzPalette entirely, so they never
  // followed a theme change (a pale-orange/pale-green box would stay pale
  // even on the dark background). toneColors(ttzPalette) already provides
  // theme-aware bg/border/fg for both, exactly like every other tone chip in
  // the app.
  const tones = toneColors(ttzPalette);
  const colors = {
    default: { bg: ttzPalette.surf2, border: ttzPalette.border, color: ttzPalette.tx },
    accent: { bg: ttzPalette.acS, border: ttzPalette.ac, color: ttzPalette.ac },
    feature: { bg: `linear-gradient(180deg, ${ttzPalette.acS} 0%, ${ttzPalette.surf2} 100%)`, border: ttzPalette.ac, color: ttzPalette.ac },
    warning: { bg: tones.warning.bg, border: tones.warning.border, color: tones.warning.fg },
    success: { bg: tones.success.bg, border: tones.success.border, color: tones.success.fg },
  }[tone] || { bg: ttzPalette.surf2, border: ttzPalette.border, color: ttzPalette.tx };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        boxShadow: "var(--ttz-shadow-sm)",
        minWidth: 0,
        minHeight: 104,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{label}</div>
        {icon ? <IconBadge icon={icon} tone={tone === "accent" || tone === "feature" ? "ac" : tone === "warning" ? "wa" : tone === "success" ? "go" : "neutral"} size="sm" /> : null}
      </div>
      <div style={{ ...(tone === "feature" ? TYPE_SCALE.metricLg : TYPE_SCALE.metricSm), color: colors.color, marginTop: 8, minWidth: 0 }}>{value}</div>
    </div>
  );
}

function formatMonthLabel(value) {
  if (!value) return "n/a";
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  // GATE-10B.1E fix: formatting a UTC-midnight Date without pinning the
  // formatter's own timeZone to UTC used the runtime's LOCAL timezone
  // instead - in any timezone behind UTC (most of the US), "2026-10"
  // rendered as "Sep 2026," a real one-month-off bug found live on Finish
  // By's "Target date" tile showing a different month than the date the
  // user had actually typed into the input field.
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// Presentation-only date-label arithmetic - both inputs are already-computed
// "Mon YYYY" strings from trusted service output (payoffSimulate's own
// month labels), so comparing them is not new payoff math, just display.
function monthLabelDeltaText(fromLabel, toLabel) {
  if (!fromLabel || !toLabel) return "";
  const from = new Date(`1 ${fromLabel}`);
  const to = new Date(`1 ${toLabel}`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (months === 0) return "Same payoff time as your current plan";
  const count = Math.abs(months);
  const unit = `month${count === 1 ? "" : "s"}`;
  return months < 0 ? `${count} ${unit} sooner than your current plan` : `${count} ${unit} later than your current plan`;
}

// UX-8.2: the "payoff journey" - a numbered, card-like sequence rather than
// a dense text list. Deliberately shows no per-debt payoff date: the engine
// (payoffEngine.js's payoffSimulate) only tracks aggregate balance/interest
// per month, never a per-account zero-crossing, so a per-debt date here
// would be fabricated. debts must always be exactly payoffOrder/payoffQueue
// (never a separately-iterated debt list) - see getEligiblePlanDebts.
function PayoffOrderList({ debts = [], isHousehold = false, highlightFirst = false }) {
  if (!debts.length) return <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>No debts included in this preview.</p>;

  return (
    <ol style={{ display: "grid", gap: 8, padding: 0, margin: 0, listStyle: "none" }}>
      {debts.map((debt, index) => {
        const isFirst = highlightFirst && index === 0;
        const suffix = disambiguationSuffixForDebt(debt, debts, { isHousehold });
        return (
          <li
            key={debt.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${isFirst ? ttzPalette.ac : ttzPalette.border}`,
              background: isFirst ? ttzPalette.acS : "transparent",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                display: "grid", placeItems: "center",
                background: isFirst ? ttzPalette.ac : ttzPalette.surf2,
                color: isFirst ? "#fff" : ttzPalette.tx2,
                fontWeight: 700, fontSize: 13,
              }}
            >
              {index + 1}
            </div>
            <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
              <LenderIdentity creditorName={debt.name} disambiguator={suffix} size="sm" />
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span>{money(debt.currentBalance || 0)}</span>
                <span>{debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}</span>
                {isHousehold ? <Badge tone="neutral">{presentedOwnerLabel(debt)}</Badge> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// UX-8.2: the complement to PayoffOrderList - every included debt that
// isn't safe to drive real plan math, shown with its concrete reason(s) and
// a way to fix it. Never implies these debts receive payments. debts here
// must always be exactly result.excludedDebts/snapshot.excludedDebts (the
// same getExcludedPlanDebts complement of payoffOrder/payoffQueue), never a
// separately-filtered debt list.
function ExcludedDebtsSection({ debts = [], isHousehold = false, onGoToDebts }) {
  if (!debts.length) return null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Excluded from this preview</div>
      {debts.map((debt) => (
        <div key={debt.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, border: `1px solid ${ttzPalette.border}` }}>
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            {/* UX-8.3: reuses the exact same disambiguationSuffixForDebt call
                PayoffOrderList already makes - this section previously
                skipped it, a real gap since a same-named excluded debt was
                just as ambiguous here as in the numbered list it complements. */}
            <LenderIdentity creditorName={debt.name} disambiguator={disambiguationSuffixForDebt(debt, debts, { isHousehold })} size="sm" />
            {isHousehold ? <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{presentedOwnerLabel(debt)}</div> : null}
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
              {describeDebtReviewReasons(debt, isHousehold).filter((reason) => reason.blocksPlan).map((reason) => reason.label).join(" · ") || "Needs review"}
            </div>
          </div>
          {onGoToDebts ? <Button variant="secondary" size="sm" onClick={onGoToDebts}>Review & edit</Button> : null}
        </div>
      ))}
    </div>
  );
}

// UX-8.2: shows every critical warning, not just warnings[0] - the prior
// index-0-only truncation could hide or misattribute the real exclusion
// warning whenever more than one warning existed for a preview.
function StrategyHeader({ title, subtitle, isActive, warnings = [], icon }) {
  const criticalMessages = warnings.filter((warning) => warning.severity === "critical").map((warning) => warning.message);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon ? <IconBadge icon={icon} tone={isActive ? "go" : "ac"} size="md" /> : null}
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{title}</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>{subtitle}</div>
          </div>
        </div>
        {isActive ? <Badge tone="success">Active strategy</Badge> : <Badge tone="neutral">Preview</Badge>}
      </div>
      {criticalMessages.length ? (
        <WarningCallout title="Watch this">
          <div style={{ display: "grid", gap: 4 }}>
            {criticalMessages.map((message) => <div key={message}>{message}</div>)}
          </div>
        </WarningCallout>
      ) : null}
    </div>
  );
}

function MyPlanView({ snapshot, service, refresh, runAction, writeState, onGoToDebts, reviewSnapshot }) {
  const activeVersion = snapshot?.activeContext?.version;
  const targetDebt = snapshot.targetDebt || snapshot.payoffQueue?.[0];
  const goTo = navigateToPlanDestination;

  if (!activeVersion) {
    return (
      <Card variant="default">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>My Plan</div>
            <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, marginTop: 6 }}>Build your path to $0</div>
          </div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>
            You haven&apos;t activated a payoff plan yet. See what Snowball and Avalanche would look like with your debts,
            compare the tradeoffs, or test another path before choosing the plan you want to follow.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={() => goTo("compare")}>Compare Snowball vs Avalanche</Button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLAN_DESTINATIONS.filter((item) => item.key !== "my-plan").slice(0, 4).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTo(item.key)}
                  style={{ border: `1px solid ${ttzPalette.border}`, background: "transparent", color: ttzPalette.tx2, borderRadius: 999, padding: "8px 12px", cursor: "pointer" }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const strategyLabel = activeVersion.strategy === "snowball" ? "Snowball" : "Avalanche";
  // UX-8.2: also catches an existing plan debt whose APR/required payment/
  // inclusion changed via the new debt-edit surface since the plan was last
  // set, not just a brand-new debt (see deriveDebtsAwaitingReforecast).
  const debtsAwaitingReforecast = deriveDebtsAwaitingReforecast({
    debts: snapshot.debts || [],
    payoffQueue: snapshot.payoffQueue || [],
    startingDebtSnapshot: activeVersion.startingDebtSnapshot || [],
  });
  const scrollToReforecast = () => document.getElementById("ux82-reforecast-card")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <MyPlanActiveBody
      snapshot={snapshot}
      service={service}
      refresh={refresh}
      runAction={runAction}
      writeState={writeState}
      onGoToDebts={onGoToDebts}
      activeVersion={activeVersion}
      targetDebt={targetDebt}
      strategyLabel={strategyLabel}
      debtsAwaitingReforecast={debtsAwaitingReforecast}
      scrollToReforecast={scrollToReforecast}
      reviewSnapshot={reviewSnapshot}
    />
  );
}

// GATE-10B.1D: split out of MyPlanView so the empty-plan early return above
// stays a plain function-scope check (React hooks can't follow a
// conditional early return - see the react-hooks/rules-of-hooks
// requirement) while this body can freely use hooks for the new chart/
// strategy-snapshot data fetches, only ever mounted once an active plan
// genuinely exists.
function MyPlanActiveBody({ snapshot, service, refresh, runAction, writeState, onGoToDebts, activeVersion, targetDebt, strategyLabel, debtsAwaitingReforecast, scrollToReforecast, reviewSnapshot }) {
  const workspaceId = snapshot.workspace.id;
  const isHousehold = snapshot.workspace.type === "household";
  const [activePreview, setActivePreview] = useState(null);
  const [minimumsPreview, setMinimumsPreview] = useState(null);
  const [strategyCompare, setStrategyCompare] = useState(null);
  const [showAllPayoffOrder, setShowAllPayoffOrder] = useState(false);

  useEffect(() => {
    let active = true;
    service.previewTrend(workspaceId, { strategy: activeVersion.strategy, extraMonthlyPayment: activeVersion.extraMonthlyPayment }).then((result) => { if (active) setActivePreview(result); });
    service.previewTrend(workspaceId, { strategy: activeVersion.strategy, extraMonthlyPayment: 0, detailed: false }).then((result) => { if (active) setMinimumsPreview(result); });
    service.compareStrategies(workspaceId).then((result) => { if (active) setStrategyCompare(result); });
    return () => { active = false; };
  }, [service, workspaceId, activeVersion.id, activeVersion.strategy, activeVersion.extraMonthlyPayment]);

  const payoffQueue = snapshot.payoffQueue || [];
  const totalLeftToGo = payoffQueue.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0);
  const nextMove = deriveNextMove({ targetDebt, activeVersion, perDebt: activePreview?.perDebt || {} });
  const allocation = deriveAllocationSegments(payoffQueue, activeVersion.extraMonthlyPayment);
  const otherStrategy = activeVersion.strategy === "snowball" ? "avalanche" : "snowball";
  const otherStrategyLabel = otherStrategy === "snowball" ? "Snowball" : "Avalanche";
  const otherStrategyResult = strategyCompare?.[otherStrategy];
  const activeStrategyResult = strategyCompare?.[activeVersion.strategy];
  const interestSavedVsMinimums = minimumsPreview && activePreview
    ? Math.abs(Number(minimumsPreview.estimatedInterest || 0) - Number(activePreview.estimatedInterest || 0))
    : null;

  const visiblePayoffQueue = showAllPayoffOrder ? payoffQueue : payoffQueue.slice(0, DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT);
  const hiddenPayoffCount = payoffQueue.length - visiblePayoffQueue.length;

  const chartSeries = [
    activePreview ? {
      id: "active",
      label: `Your plan (${strategyLabel})`,
      colorToken: "ac",
      points: toBalancePoints(activePreview.projection),
      payoffMonth: activePreview.projectedZeroDate || undefined,
    } : null,
    minimumsPreview ? {
      id: "minimums",
      label: "Minimum payments",
      colorToken: "muted",
      dashed: true,
      points: toBalancePoints(minimumsPreview.projection),
      payoffMonth: minimumsPreview.projectedZeroDate || undefined,
    } : null,
  ].filter(Boolean);

  const statusCode = snapshot.status?.code;
  const statusTone = STATUS_TONE[statusCode] || "info";
  const bannerTone = STATUS_TO_BANNER_TONE[statusTone] || "info";
  const activeDebtsCount = (snapshot.debts || []).filter((debt) => debt.status === "active").length;
  const paidOffCount = (snapshot.debts || []).filter((debt) => debt.status === "paid_off").length;
  const importReviewCount = (reviewSnapshot?.actionableCount ?? reviewSnapshot?.openCount ?? 0) || (reviewSnapshot?.staleBatchCount ?? 0);
  const projectedZeroDateLabel = activePreview?.projectedZeroDate || snapshot.projectedZeroDate || "n/a";
  const monthlyTargetValue = allocation.total || 0;
  const firstTargetTiming = targetDebt
    ? paymentTimingLabel(derivePaymentTiming(targetDebt, { paymentEvents: snapshot.paymentEventsByDebt?.[targetDebt.id] || [] }))
    : "Not scheduled";

  return (
    <div style={{ display: "grid", gap: GAP }}>
      {debtsAwaitingReforecast.length ? (
        <WarningCallout title="This plan may be out of date">
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              {debtsAwaitingReforecast.map((debt) => debt.name).join(", ")} {debtsAwaitingReforecast.length === 1 ? "has" : "have"} changed since this plan was last set, so the numbers below may not reflect {debtsAwaitingReforecast.length === 1 ? "it" : "them"} yet.
            </div>
            <Button variant="secondary" size="sm" onClick={scrollToReforecast} style={{ justifySelf: "start" }}>Reforecast plan</Button>
          </div>
        </WarningCallout>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Badge tone="success">{strategyLabel} active</Badge>
        </div>
        <div className="ttz-plan-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: GAP }}>
          <PlanMetric label="Projected debt-free date" value={projectedZeroDateLabel} tone="success" icon={Calendar} />
          <PlanMetric label="Months to $0" value={activePreview ? `${activePreview.monthsToZero} months` : "…"} icon={Clock} />
          <PlanMetric label="Monthly target" value={money(monthlyTargetValue)} tone="feature" icon={DollarSign} />
          <PlanMetric label="Projected interest" value={activePreview ? money(activePreview.estimatedInterest) : "…"} icon={TrendingUp} />
          <PlanMetric label="Total left to go" value={money(totalLeftToGo)} icon={Wallet} />
          <PlanMetric label="Strategy" value={strategyLabel} tone="success" icon={Compass} />
        </div>
      </div>

      <div className="ttz-plan-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 7fr) minmax(320px, 5fr)", gap: GAP, alignItems: "start" }}>
        <div style={{ display: "grid", gap: GAP }}>
          <SectionCard number={1} title="Balance to $0 over time">
            <TrendChart
              series={chartSeries}
              showModes
              emptyState={<div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Loading your projection...</div>}
            />
          </SectionCard>

          <div className="ttz-plan-payoff-target-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.95fr)", gap: GAP, alignItems: "start" }}>
            <SectionCard number={2} title="Your payoff order">
              <PayoffOrderTable debts={visiblePayoffQueue} isHousehold={isHousehold} highlightFirst perDebt={activePreview?.perDebt || {}} />
              {hiddenPayoffCount > 0 ? (
                <Button variant="ghost" onClick={() => setShowAllPayoffOrder(true)} style={{ marginTop: GAP }}>View full payoff schedule -&gt;</Button>
              ) : showAllPayoffOrder && payoffQueue.length > DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT ? (
                <Button variant="ghost" onClick={() => setShowAllPayoffOrder(false)} style={{ marginTop: GAP }}>Show fewer</Button>
              ) : null}
            </SectionCard>

            <SectionCard number={3} title="Current first target">
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <LenderIdentity creditorName={targetDebt?.name || ""} size="lg" />
                  {isHousehold && targetDebt ? <Badge tone="neutral">{presentedOwnerLabel(targetDebt)}</Badge> : null}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <LabelValueRow label="Current balance" value={money(targetDebt?.currentBalance || 0)} />
                  <LabelValueRow label="APR" value={targetDebt?.aprStatus === "unknown" ? "Unknown APR" : percent(targetDebt?.apr || 0)} />
                  <LabelValueRow label="Minimum due" value={targetDebt?.minimumRequiredPayment == null ? "Not set" : money(targetDebt.minimumRequiredPayment)} />
                  <LabelValueRow label="Due date" value={firstTargetTiming} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onGoToDebts ? <Button variant="primary" size="sm" onClick={onGoToDebts}>Record payment</Button> : null}
                  {onGoToDebts ? <Button variant="secondary" size="sm" onClick={onGoToDebts}>View debt ?</Button> : null}
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        <div style={{ display: "grid", gap: GAP, alignSelf: "stretch" }}>
          <SectionCard number={4} title="Next move">
            {nextMove ? (
              <div style={{ display: "grid", gap: 18, minHeight: 156 }}>
                <div className="ttz-plan-next-move-grid" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) minmax(180px, 220px)", gap: 18, alignItems: "start" }}>
                  <div
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 999,
                      border: `1px dashed ${ttzPalette.go}`,
                      display: "grid",
                      placeItems: "center",
                      background: `radial-gradient(circle at 50% 50%, ${ttzPalette.goS} 0%, transparent 72%)`,
                    }}
                  >
                    <IconBadge icon={Target} tone="go" size="lg" />
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Next move</div>
                    <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
                      Focus extra payment on <span style={{ color: ttzPalette.go }}>{nextMove.targetDebtName}</span>
                    </div>
                    <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, maxWidth: 360 }}>{nextMove.body}</div>
                  </div>
                  <div className="ttz-plan-next-move-actions" style={{ display: "grid", gap: 10, alignSelf: "start" }}>
                    <Button variant="primary" size="sm" onClick={scrollToReforecast} style={{ width: "100%", justifyContent: "center" }}>Apply extra payment</Button>
                    {onGoToDebts ? <Button variant="secondary" size="sm" onClick={onGoToDebts} style={{ width: "100%", justifyContent: "center" }}>Record payment</Button> : null}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>No target debt yet.</p>
            )}
          </SectionCard>

          <SectionCard number={5} title="Plan health">
            <div className="ttz-plan-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0 }}>
              <MiniPlanHealthStat icon={STATUS_ICON[statusTone] || CheckCircle2} tone={bannerTone} title="Payments" value="on track" />
              <MiniPlanHealthStat icon={ShieldCheck} tone="neutral" title={String(activeDebtsCount)} value="active debts" />
              <MiniPlanHealthStat icon={Flag} tone="go" title={String(paidOffCount)} value="paid off" />
              <MiniPlanHealthStat icon={AlertTriangle} tone={importReviewCount > 0 ? "wa" : "neutral"} title={String(importReviewCount)} value="import items needing review" />
            </div>
          </SectionCard>

          <div className="ttz-plan-secondary-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: GAP }}>
            {otherStrategyResult && activeStrategyResult ? (
              <SectionCard number={6} title="Strategy comparison snapshot">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }} />
                        <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.go, fontWeight: 800 }}>{strategyLabel} (active)</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{otherStrategyLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Debt-free date", activeStrategyResult.projectedZeroDate, otherStrategyResult.projectedZeroDate],
                        ["Total interest", money(activeStrategyResult.estimatedInterest), money(otherStrategyResult.estimatedInterest)],
                        ["Months to $0", String(activeStrategyResult.monthsToZero), String(otherStrategyResult.monthsToZero)],
                        ["vs Snowball", strategyLabel === "Snowball" ? "?" : monthLabelDeltaText(otherStrategyResult.projectedZeroDate, activeStrategyResult.projectedZeroDate), strategyLabel === "Snowball" ? monthLabelDeltaText(activeStrategyResult.projectedZeroDate, otherStrategyResult.projectedZeroDate) : "?"],
                      ].map(([rowLabel, a, b]) => (
                        <tr key={rowLabel}>
                          <td style={{ padding: "7px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2, borderTop: `1px solid ${ttzPalette.border}` }}>{rowLabel}</td>
                          <td style={{ padding: "7px 8px", ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700, borderTop: `1px solid ${ttzPalette.border}` }}>{a}</td>
                          <td style={{ padding: "7px 8px", ...TYPE_SCALE.body, color: ttzPalette.tx2, borderTop: `1px solid ${ttzPalette.border}` }}>{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            ) : <div />}

            <SectionCard number={7} title="Payment allocation">
              <AllocationDonut
                segments={allocation.segments}
                centerLabel={money(monthlyTargetValue)}
                centerSupporting="/ month"
              />
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 10 }}>
                This split keeps your minimums covered first, then pushes the extra toward your current target debt.
              </div>
              {allocation.unknownMinimumCount > 0 ? (
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 8 }}>
                  {allocation.unknownMinimumCount} debt{allocation.unknownMinimumCount === 1 ? "" : "s"} with an unknown minimum {allocation.unknownMinimumCount === 1 ? "isn't" : "aren't"} included in this total.
                </div>
              ) : null}
            </SectionCard>
          </div>
        </div>
      </div>
      {snapshot.excludedDebts?.length ? (
        <Card variant="default">
          <ExcludedDebtsSection debts={snapshot.excludedDebts} isHousehold={isHousehold} onGoToDebts={onGoToDebts} />
        </Card>
      ) : null}

      <InsightBanner
        icon={Target}
        tone="go"
        headline={projectedZeroDateLabel && projectedZeroDateLabel !== "n/a" ? `You're on track to be debt-free by ${projectedZeroDateLabel}.` : "You're on track with your payoff plan."}
        detail={`Keep paying ${money(monthlyTargetValue)}/month to stay on schedule.`}
        chips={[
          interestSavedVsMinimums != null ? { label: "Interest saved vs. minimums", value: money(interestSavedVsMinimums) } : null,
          { label: "Active strategy", value: strategyLabel, tone: "go" },
        ].filter(Boolean)}
      />

      {snapshot.warnings?.length ? (
        <InfoCallout title="Projection notes">
          {snapshot.warnings.map((warning) => warning.message || warning.code).join(" ")}
        </InfoCallout>
      ) : null}

      <ManagePlanCard snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} activeVersion={activeVersion} />
    </div>
  );
}

function MiniPlanHealthStat({ icon, tone = "neutral", title, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        padding: "4px 14px",
        borderLeft: `1px solid ${ttzPalette.border}`,
      }}
    >
      <IconBadge icon={icon} tone={tone} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE_SCALE.metricXs, color: ttzPalette.tx, textTransform: "none" }}>{title}</div>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{value}</div>
      </div>
    </div>
  );
}

function ProgressStatRowInline({ label, a, b }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{label}</span>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700 }}>{a || "n/a"} <span style={{ color: ttzPalette.muted, fontWeight: 500 }}>vs</span> {b || "n/a"}</span>
    </div>
  );
}

// GATE-10B.1E: a single label:value row (no "vs" comparison) - the detail
// rows inside My Plan's "Current first target" card and similar single-debt
// summaries elsewhere.
function LabelValueRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{label}</span>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700 }}>{value || "n/a"}</span>
    </div>
  );
}

// UX-4.1 Part 10: My Plan's secondary actions - reforecast, change
// strategy, and a lightweight plan history (not the full UX-7 milestone
// system, explicitly deferred). Reforecast reuses the exact same
// previewReforecast/applyReforecast primitives as everywhere else in the
// Plan Hub; changing strategy just links to the standalone Snowball/
// Avalanche pages, which already own that confirm-before-apply flow.
function ManagePlanCard({ snapshot, service, refresh, runAction, writeState, activeVersion }) {
  const [draftExtra, setDraftExtra] = useState(String(activeVersion.extraMonthlyPayment || 0));
  const [preview, setPreview] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.listPlanHistory(workspaceId).then((result) => { if (active) setHistory(result || []); });
    return () => { active = false; };
  }, [service, workspaceId, writeState.success]);

  const hasChanges = (Number(draftExtra) || 0) !== Number(activeVersion.extraMonthlyPayment || 0);

  const previewChanges = () => runAction("preview reforecast", async () => {
    setPreview(await service.previewReforecast(workspaceId, { extraMonthlyPayment: Number(draftExtra) || 0 }));
  }, { write: false });

  const applyChanges = () => runAction("apply reforecast", async () => {
    await service.applyReforecast(workspaceId, { extraMonthlyPayment: Number(draftExtra) || 0 });
    setPreview(null);
    setConfirmOpen(false);
    await refresh();
  });

  return (
    <div id="ux82-reforecast-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Reforecast</div>
        <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 4 }}>Adjust your monthly extra payment. Preview before you apply.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: GAP }}>
          <Field label="Extra monthly payment">
            <MoneyInput value={draftExtra} min="0" step="0.01" onChange={(event) => { setDraftExtra(event.target.value); setPreview(null); }} />
          </Field>
          <Button variant="secondary" disabled={!hasChanges || writeState.inProgress} loading={writeState.action === "preview reforecast"} onClick={previewChanges}>Preview</Button>
        </div>
        {preview ? (
          <div style={{ marginTop: GAP }}>
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
              Payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
            </p>
            <Button variant="primary" disabled={writeState.inProgress} onClick={() => setConfirmOpen(true)} style={{ marginTop: 8 }}>Apply</Button>
          </div>
        ) : null}
        <ConfirmationDialog
          open={confirmOpen}
          title="Apply this to your real plan?"
          confirmLabel={writeState.action === "apply reforecast" ? "Applying..." : "Apply"}
          onConfirm={applyChanges}
          onCancel={() => setConfirmOpen(false)}
        >
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>This creates a new plan version. Your current plan is kept in your plan history, never overwritten.</p>
          {preview ? (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
              Estimated payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
            </p>
          ) : null}
          {snapshot.excludedDebts?.length ? (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
              {snapshot.excludedDebts.length} debt{snapshot.excludedDebts.length === 1 ? "" : "s"} ({snapshot.excludedDebts.map((debt) => debt.name).join(", ")}) will not be part of this plan until reviewed.
            </p>
          ) : null}
        </ConfirmationDialog>
      </Card>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Change strategy</div>
        <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 4 }}>Compare Snowball and Avalanche side by side, or inspect either one directly.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("snowball")}>Snowball</Button>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("avalanche")}>Avalanche</Button>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("compare")}>Compare</Button>
        </div>
      </Card>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan history</div>
        {history === null ? (
          <LoadingState label="Loading plan history..." />
        ) : !history.length ? (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>No plan history yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: GAP }}>
            {history.map((version) => (
              <div key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: `1px solid ${ttzPalette.border}`, paddingBottom: 8 }}>
                <div>
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>
                    Version {version.versionNumber} · {version.strategy === "snowball" ? "Snowball" : "Avalanche"}
                    {version.id === activeVersion.id ? <Badge tone="success" style={{ marginLeft: 6 }}>Current</Badge> : null}
                  </div>
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 2 }}>
                    {version.createdBecause === "activation" ? "Activated" : version.createdBecause === "reforecast" ? "Reforecast" : "Updated"} · {money(version.extraMonthlyPayment)}/mo extra
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// UX-4.1: applying a strategy always requires explicit confirmation with a
// before/after figure - never an implicit apply-on-click. The confirm step
// lives here, once, so Snowball/Avalanche (and anything else that reaches
// this component) can't accidentally skip it.
function StrategyExperience({ title, subtitle, result, isActive, isHousehold, hasActivePlan = true, onApply, onInspect, useLabel, applyActionLabel, runAction, writeState, currentZeroDate, onGoToDebts, showMomentum = false, icon }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canUse = !!onApply && !isActive;
  const excludedDebts = result?.excludedDebts || [];
  const includedCount = result?.payoffOrder?.length || 0;

  const confirmApply = () => runAction(applyActionLabel, async () => {
    await onApply();
    setConfirmOpen(false);
  });

  return (
    <Card
      variant={isActive ? "highlight" : "default"}
      style={{
        background: isActive
          ? `linear-gradient(180deg, ${ttzPalette.goD || ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`
          : `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
        border: `1px solid ${isActive ? ttzPalette.go : ttzPalette.border}`,
        boxShadow: "var(--ttz-shadow-md)",
      }}
    >
      <StrategyHeader title={title} subtitle={subtitle} isActive={isActive} warnings={result?.warnings || []} icon={icon} />

      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 6 }}>
        Based on {includedCount} included debt{includedCount === 1 ? "" : "s"}.{excludedDebts.length ? ` ${excludedDebts.length} debt${excludedDebts.length === 1 ? " is" : "s are"} excluded until reviewed.` : ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP, marginTop: GAP }}>
        <PlanMetric label="Projected $0" value={result?.projectedZeroDate || "n/a"} tone="accent" icon={Calendar} />
        <PlanMetric label="Months to $0" value={String(result?.monthsToZero ?? "n/a")} icon={Clock} />
        <PlanMetric label="First target" value={result?.payoffOrder?.[0]?.name || "n/a"} icon={Target} />
        <PlanMetric label="Projected interest" value={money(result?.estimatedInterest || 0)} icon={TrendingUp} />
      </div>

      <div style={{ marginTop: GAP }}>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginBottom: 6 }}>Payoff order</div>
        <PayoffOrderTable debts={result?.payoffOrder || []} isHousehold={isHousehold} highlightFirst perDebt={result?.perDebt || {}} showMomentum={showMomentum} />
      </div>

      {excludedDebts.length ? (
        <div style={{ marginTop: GAP }}>
          <ExcludedDebtsSection debts={excludedDebts} isHousehold={isHousehold} onGoToDebts={onGoToDebts} />
        </div>
      ) : null}

      {onApply && !isActive ? (
        <div style={{ marginTop: GAP, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState?.inProgress}>
            {useLabel}
          </Button>
        </div>
      ) : onInspect ? (
        <div style={{ marginTop: GAP }}>
          <Button variant={isActive ? "secondary" : "primary"} onClick={onInspect}>
            {useLabel}
          </Button>
        </div>
      ) : null}

      {canUse ? (
        <ConfirmationDialog
          open={confirmOpen}
          title={hasActivePlan ? `Switch to ${title}?` : `Activate ${title}?`}
          confirmLabel={writeState?.action === applyActionLabel ? "Applying..." : "Apply"}
          onConfirm={confirmApply}
          onCancel={() => setConfirmOpen(false)}
        >
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{hasActivePlan ? "This creates a new plan version. Your current plan is kept in your plan history, never overwritten." : "This creates and activates your first payoff plan."}</p>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Estimated payoff moves from <strong>{currentZeroDate || "n/a"}</strong> to <strong>{result?.projectedZeroDate || "n/a"}</strong>.
          </p>
          {excludedDebts.length ? (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
              {excludedDebts.length} debt{excludedDebts.length === 1 ? "" : "s"} ({excludedDebts.map((debt) => debt.name).join(", ")}) will not be part of this plan until reviewed.
            </p>
          ) : null}
        </ConfirmationDialog>
      ) : null}
    </Card>
  );
}

// GATE-10B.1D: shared by SnowballView/AvalancheView below - StrategyExperience
// itself is left completely untouched (it's also reused, unmodified, by
// CompareStrategiesView's compact side-by-side cards, and this new
// chart/speed-up/inline-what-if content only belongs on the standalone
// strategy pages, not Compare's tighter card). One body avoids duplicating
// this substantial new data-fetching/rendering logic twice for two
// strategies that only differ in label/ordering.
const STRATEGY_EXPLAINERS = {
  snowball: "Snowball pays off your smallest balance first, regardless of interest rate. Each payoff frees up its minimum payment to roll onto the next one, building momentum fast.",
  avalanche: "Avalanche pays off your highest-APR debt first. It's the interest-optimal order - usually the cheapest path to $0, even if the first win takes longer to feel.",
};

function StrategyPageBody({ strategy, title, subtitle, useLabel, applyActionLabel, snapshot, service, refresh, runAction, writeState, onGoToDebts, showCompositionDonut = false }) {
  const [result, setResult] = useState(null);
  const [strategyPreview, setStrategyPreview] = useState(null);
  const [minimumsPreview, setMinimumsPreview] = useState(null);
  const [speedUp, setSpeedUp] = useState(null);
  const [whatIfExtra, setWhatIfExtra] = useState("");
  const [whatIfPreview, setWhatIfPreview] = useState(null);
  const workspaceId = snapshot.workspace.id;
  const hasActivePlan = !!snapshot.activeContext?.version;
  const isActive = (snapshot.activeContext?.version?.strategy || "") === strategy;
  // GATE-10B.1E fix: the extra monthly payment is a household-level
  // commitment, not something specific to whichever strategy currently
  // orders it - previously this zeroed out on any NON-active strategy's
  // page, which made "Compare to paying minimums" (and the inline
  // Add-extra-monthly-payment baseline) compare $0-extra against $0-extra
  // on Avalanche's page whenever Snowball was the active strategy, always
  // producing a degenerate "You'll save $0.00" result regardless of the
  // real committed payment. Reproduced live: Avalanche's own preview page
  // showed "Debt-free date Jun 2029 / Total interest $3,846.73" identically
  // in BOTH the "Avalanche" and "Paying minimums only" columns.
  const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);

  useEffect(() => {
    let active = true;
    // GATE-10B.1E: detailed:true - purely an options flag already built in
    // GATE-10B.1D, not new engine work - what makes the payoff-order table's
    // real "Payoff timing" column (via StrategyExperience -> PayoffOrderTable)
    // possible on the standalone Snowball/Avalanche pages too, not just Compare.
    service.compareStrategies(workspaceId, { detailed: true }).then((data) => { if (active) setResult(data); });
    service.previewTrend(workspaceId, { strategy, extraMonthlyPayment: currentExtra }).then((r) => { if (active) setStrategyPreview(r); });
    service.previewTrend(workspaceId, { strategy, extraMonthlyPayment: 0, detailed: false }).then((r) => { if (active) setMinimumsPreview(r); });
    computeSpeedUpSuggestion({ strategy, currentExtra }, (opts) => service.previewTrend(workspaceId, opts)).then((s) => { if (active) setSpeedUp(s); });
    return () => { active = false; };
  }, [service, workspaceId, strategy, currentExtra]);

  if (!result) return <LoadingState label={`Loading ${title}`} />;

  const otherStrategy = strategy === "snowball" ? "avalanche" : "snowball";
  const otherStrategyLabel = otherStrategy === "snowball" ? "Snowball" : "Avalanche";
  const otherResult = result[otherStrategy];

  const runInlineWhatIf = () => runAction(`preview ${strategy} what-if`, async () => {
    const addition = Number(whatIfExtra) || 0;
    if (addition <= 0) { setWhatIfPreview(null); return; }
    setWhatIfPreview(await service.previewTrend(workspaceId, { strategy, extraMonthlyPayment: currentExtra + addition }));
  }, { write: false });

  const chartSeries = [
    minimumsPreview ? { id: "minimums", label: "Paying minimums", colorToken: "muted", dashed: true, points: toBalancePoints(minimumsPreview.projection), payoffMonth: minimumsPreview.projectedZeroDate || undefined } : null,
    strategyPreview ? { id: "baseline", label: title, colorToken: "ac", points: toBalancePoints(strategyPreview.projection), payoffMonth: strategyPreview.projectedZeroDate || undefined } : null,
    whatIfPreview ? { id: "whatif", label: `${title} + ${money(Number(whatIfExtra) || 0)}`, colorToken: "go", dashed: true, points: toBalancePoints(whatIfPreview.projection), payoffMonth: whatIfPreview.projectedZeroDate || undefined } : null,
  ].filter(Boolean);

  const compositionTokens = ["ac", "go", "info", "wa"];
  const compositionSegments = showCompositionDonut
    ? deriveDebtCompositionSegments(snapshot.payoffQueue || []).map((entry, index) => ({
        id: entry.group,
        label: categoryConfigForGroup(entry.group)?.label || "Other",
        value: entry.balance,
        colorToken: compositionTokens[index % compositionTokens.length],
      }))
    : [];
  const compositionTotal = compositionSegments.reduce((sum, segment) => sum + segment.value, 0);

  // GATE-10B.1E: Avalanche's "Compare to paying minimums" card - reuses the
  // SAME minimumsPreview/strategyPreview already fetched for the chart
  // above, never a separate computation, so the card and the chart can
  // never silently disagree.
  const strategyVsMinimumsDelta = minimumsPreview && strategyPreview
    ? {
        interestSaved: Math.max(0, Number(minimumsPreview.estimatedInterest || 0) - Number(strategyPreview.estimatedInterest || 0)),
        monthsSooner: Math.max(0, Number(minimumsPreview.monthsToZero || 0) - Number(strategyPreview.monthsToZero || 0)),
      }
    : null;

  if (strategy === "snowball") {
    const currentResult = result[strategy];
    const payoffRows = currentResult?.payoffOrder || [];
    const firstTarget = payoffRows[0] || null;
    const firstTargetOwner = firstTarget ? presentedOwnerLabel(firstTarget) : null;
    const firstTargetPerDebt = currentResult?.perDebt?.[firstTarget?.id] || null;
    const dueLabel = firstTarget ? paymentTimingLabel(derivePaymentTiming(firstTarget)) : "n/a";
    const versusOtherMonths = currentResult?.monthsToZero != null && otherResult?.monthsToZero != null
      ? Math.max(0, Number(otherResult.monthsToZero) - Number(currentResult.monthsToZero))
      : 0;
    const versusOtherInterest = currentResult && otherResult
      ? Math.max(0, Number(otherResult.estimatedInterest || 0) - Number(currentResult.estimatedInterest || 0))
      : 0;

    return (
      <div style={{ display: "grid", gap: GAP }}>
        <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
              overflow: "hidden",
            }}
          >
            <div className="ttz-strategy-hero-grid" style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.8fr) repeat(4, minmax(120px, 0.5fr))", gap: 0 }}>
              <div style={{ padding: 22, borderRight: `1px solid ${ttzPalette.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: `1px solid ${ttzPalette.go}`, display: "grid", placeItems: "center", color: ttzPalette.go, boxShadow: "0 0 0 8px rgba(34,197,94,0.06)" }}>
                    <CheckCircle2 size={28} />
                  </div>
                  <div style={{ minWidth: 0, display: "grid", gap: 6, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Snowball strategy is active</div>
                      <Badge tone="success">Recommended</Badge>
                    </div>
                    <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, maxWidth: 560 }}>You&apos;ll be debt-free on {currentResult?.projectedZeroDate || "n/a"}. Keep going—momentum is on your side.</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: 22, borderRight: `1px solid ${ttzPalette.border}` }}>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Projected debt-free date</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.go, marginTop: 8 }}>{currentResult?.projectedZeroDate || "n/a"}</div>
              </div>
              <div style={{ padding: 22, borderRight: `1px solid ${ttzPalette.border}` }}>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Months to $0</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.go, marginTop: 8 }}>{currentResult?.monthsToZero ?? "n/a"}</div>
              </div>
              <div style={{ padding: 22, borderRight: `1px solid ${ttzPalette.border}` }}>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Projected interest</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.go, marginTop: 8 }}>{money(currentResult?.estimatedInterest || 0)}</div>
              </div>
              <div style={{ padding: 22 }}>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>First target debt</div>
                <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 800, marginTop: 8 }}>{firstTarget ? `${firstTarget.name}${firstTargetOwner ? ` — ${firstTargetOwner}` : ""}` : "n/a"}</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.go, marginTop: 4 }}>{money(firstTarget?.currentBalance || 0)}</div>
              </div>
            </div>
          </Card>

        <div className="ttz-plan-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: GAP }}>
          <PlanMetric label="Projected debt-free date" value={currentResult?.projectedZeroDate || "n/a"} tone="accent" icon={Calendar} />
          <PlanMetric label="Months to $0" value={currentResult?.monthsToZero != null ? `${currentResult.monthsToZero} months` : "n/a"} tone="success" icon={Clock} />
          <PlanMetric label="Projected interest" value={money(currentResult?.estimatedInterest || 0)} tone="success" icon={DollarSign} />
          <PlanMetric label="First target" value={firstTarget ? `${firstTarget.name}${firstTargetOwner ? ` — ${firstTargetOwner}` : ""}` : "n/a"} tone="default" icon={Target} />
        </div>

        <div className="ttz-strategy-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: GAP, alignItems: "stretch" }}>
          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Payoff order (Snowball)</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 4 }}>Smallest balance first</div>
            <div style={{ marginTop: GAP }}>
              <PayoffOrderTable
                debts={payoffRows}
                isHousehold={snapshot.workspace.type === "household"}
                highlightFirst
                perDebt={currentResult?.perDebt || {}}
                showMomentum
              />
            </div>
          </Card>

          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <TrendChart
              title="Balance to $0 over time"
              subtitle=""
              series={chartSeries}
              showModes
              emptyState={<div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Loading your projection…</div>}
            />
            <div style={{ marginTop: GAP }}>
              <InsightBanner
                icon={CheckCircle2}
                tone="go"
                headline={`You’ll be debt-free on ${currentResult?.projectedZeroDate || "n/a"}.`}
                detail={monthLabelDeltaText(snapshot.projectedZeroDate, currentResult?.projectedZeroDate) || "Every payment gets you closer to freedom."}
              />
            </div>
          </Card>
        </div>

        <div className="ttz-strategy-bottom-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(320px, 1fr) minmax(320px, 0.9fr)", gap: GAP, alignItems: "stretch" }}>
          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Want to speed this up?</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>Small extra payments can create big results.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: GAP }}>
              <Button variant="primary" onClick={() => navigateToPlanDestination("what-if")}>Run What If</Button>
              <Button variant="secondary">Add extra monthly payment</Button>
            </div>
            {speedUp ? (
              <div style={{ marginTop: GAP }}>
                <InfoCallout>
                  Add {money(speedUp.additionalMonthly)}/month to finish {speedUp.monthsSaved} month{speedUp.monthsSaved === 1 ? "" : "s"} earlier and save {money(speedUp.interestSaved)} in interest.
                </InfoCallout>
              </div>
            ) : null}
          </Card>

          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Current first target</div>
              <Badge tone="success">Step 1 of {Math.max(1, payoffRows.length)}</Badge>
            </div>
            <div className="ttz-strategy-target-grid" style={{ display: "grid", gridTemplateColumns: "108px minmax(0, 1fr)", gap: 16, marginTop: GAP, alignItems: "start" }}>
              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 16,
                  border: `1px solid ${ttzPalette.border}`,
                  background: ttzPalette.surf,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  padding: 12,
                  boxSizing: "border-box",
                }}
              >
                <LenderIdentity creditorName={firstTarget?.name} size="xl" showName={false} />
              </div>
              <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
                <div
                  className="ttz-strategy-target-stats"
                  style={{
                    display: "inline-grid",
                    gap: 4,
                    width: "fit-content",
                    maxWidth: "100%",
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: `1px solid ${ttzPalette.border}`,
                    background: "rgba(15,23,42,0.18)",
                  }}
                >
                  <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, lineHeight: 1.1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {firstTarget ? `${firstTarget.name}${firstTargetOwner ? ` — ${firstTargetOwner}` : ""}` : "n/a"}
                  </div>
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
                    {String(firstTarget?.debtType || "Debt")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 0,
                    border: `1px solid ${ttzPalette.border}`,
                    borderRadius: 18,
                    overflow: "hidden",
                    background: "rgba(15,23,42,0.18)",
                  }}
                >
                  {[
                    ["Current balance", money(firstTarget?.currentBalance || 0)],
                    ["APR", firstTarget?.aprStatus === "unknown" ? "Unknown APR" : percent(firstTarget?.apr || 0)],
                    ["Min. due", money(firstTarget?.minimumRequiredPayment || 0)],
                  ].map(([label, value], index) => (
                    <div key={label} style={{ minWidth: 0, padding: "14px 16px", borderLeft: index === 0 ? "none" : `1px solid ${ttzPalette.border}` }}>
                      <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx, fontSize: 13, lineHeight: 1.2 }}>{value}</div>
                      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 6 }}>{label}</div>
                    </div>
                  ))}
                </div>

                <div className="ttz-strategy-target-actions" style={{ display: "flex", gap: 10, alignItems: "stretch", justifyContent: "flex-start", flexWrap: "wrap" }}>
                  <Button variant="primary">Record payment</Button>
                  <Button variant="secondary">View debt</Button>
                </div>
              </div>
            </div>
          </Card>

          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Snowball vs Avalanche</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>See how Snowball compares to the Avalanche strategy.</div>
            <div style={{ marginTop: GAP, display: "grid", gap: 10 }}>
              <ProgressStatRowInline label="Debt-free date" a={currentResult?.projectedZeroDate} b={otherResult?.projectedZeroDate} />
              <ProgressStatRowInline label="Total interest" a={money(currentResult?.estimatedInterest || 0)} b={money(otherResult?.estimatedInterest || 0)} />
              <ProgressStatRowInline label="Interest saved vs minimums" a={strategyVsMinimumsDelta ? money(strategyVsMinimumsDelta.interestSaved) : "n/a"} b={otherResult ? money(Math.max(0, Number(minimumsPreview?.estimatedInterest || 0) - Number(otherResult.estimatedInterest || 0))) : "n/a"} />
            </div>
            <div style={{ marginTop: GAP }}>
              <Button variant="secondary" onClick={() => navigateToPlanDestination("compare")}>Compare strategies</Button>
            </div>
          </Card>
        </div>

        <Card
          variant="default"
          style={{
            background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
            boxShadow: "var(--ttz-shadow-md)",
            padding: 18,
          }}
        >
          <div className="ttz-strategy-target-actions" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) auto auto", gap: 18, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <IconBadge icon={Sparkles} tone="go" size="sm" />
              <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>You’re building momentum. Keep it up — every payment gets you closer to freedom.</div>
            </div>
            <Badge tone="success">Payments on track</Badge>
            <button type="button" onClick={() => navigateToPlanDestination("scenarios")} style={{ all: "unset", cursor: "pointer", ...TYPE_SCALE.body, color: ttzPalette.ac, fontWeight: 700 }}>View activity →</button>
          </div>
        </Card>
      </div>
    );
  }

  if (strategy === "avalanche") {
    const activePlan = snapshot.activeContext?.version;
    const currentResult = result[strategy];
    const payoffRows = currentResult?.payoffOrder || [];

    return (
      <div style={{ display: "grid", gap: GAP }}>
        <div className="ttz-plan-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: GAP }}>
          <PlanMetric label="Projected debt-free date" value={currentResult?.projectedZeroDate || "n/a"} tone="success" icon={Calendar} />
          <PlanMetric label="Total interest" value={money(currentResult?.estimatedInterest || 0)} icon={DollarSign} />
          <PlanMetric label="Total interest saved" value={money(strategyVsMinimumsDelta?.interestSaved || 0)} tone="success" icon={TrendingUp} />
          <PlanMetric label="Monthly target" value={money(Number(currentResult?.monthlyTarget || activePlan?.monthlyTarget || activePlan?.requiredTotalMonthly || 0))} tone="feature" icon={Target} />
          <PlanMetric label="Extra payoff amount" value={money(Number(currentExtra || 0))} tone="warning" icon={Wallet} />
          <PlanMetric label="Left to go" value={money(snapshot.totalDebt || 0)} icon={Compass} />
        </div>

        <div className="ttz-strategy-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(340px, 0.95fr)", gap: GAP, alignItems: "start" }}>
          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Your path to $0</div>
            <div style={{ marginTop: GAP }}>
              <TrendChart
                title=""
                subtitle=""
                series={chartSeries}
                emptyState={<div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Loading your projection…</div>}
              />
            </div>

            {strategyVsMinimumsDelta ? (
              <div style={{ marginTop: GAP }}>
                <InfoCallout>
                  You&apos;ll be debt-free ~{strategyVsMinimumsDelta.monthsSooner} month{strategyVsMinimumsDelta.monthsSooner === 1 ? "" : "s"} sooner and save {money(strategyVsMinimumsDelta.interestSaved)} in interest with your {money(currentExtra)}/month extra payoff.
                </InfoCallout>
              </div>
            ) : null}

            <div style={{ marginTop: GAP }}>
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Avalanche payoff order (highest APR first)</div>
              <div style={{ marginTop: 12 }}>
                <PayoffOrderTable
                  debts={payoffRows}
                  isHousehold={snapshot.workspace.type === "household"}
                  highlightFirst
                  perDebt={currentResult?.perDebt || {}}
                />
              </div>
            </div>
          </Card>

          <div style={{ display: "grid", gap: GAP }}>
            <Card
              variant="default"
              style={{
                background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
                boxShadow: "var(--ttz-shadow-md)",
              }}
            >
              <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Balance breakdown</div>
              <div style={{ marginTop: GAP }}>
                <AllocationDonut
                  segments={compositionSegments}
                  centerLabel={money(compositionTotal)}
                  centerSupporting="Total debt"
                />
              </div>
            </Card>

            <Card
              variant="default"
              style={{
                background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
                boxShadow: "var(--ttz-shadow-md)",
              }}
            >
              <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Compare to paying minimums</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: GAP, marginTop: GAP }}>
                <div style={{ padding: 16, borderRadius: 16, border: `1px solid ${ttzPalette.ac}`, background: ttzPalette.acS }}>
                  <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>Avalanche (+{money(currentExtra)}/mo)</div>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    <LabelValueRow label="Debt-free date" value={strategyPreview?.projectedZeroDate || "n/a"} />
                    <LabelValueRow label="Total interest" value={strategyPreview ? money(strategyPreview.estimatedInterest) : "n/a"} />
                    <LabelValueRow label="Interest saved" value={money(strategyVsMinimumsDelta?.interestSaved || 0)} />
                    <LabelValueRow label="Months debt-free sooner" value={strategyVsMinimumsDelta?.monthsSooner ? `${strategyVsMinimumsDelta.monthsSooner} months` : "—"} />
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 16, border: `1px solid ${ttzPalette.border}`, background: ttzPalette.surf2 }}>
                  <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.tx2 }}>Paying minimums only</div>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    <LabelValueRow label="Debt-free date" value={minimumsPreview?.projectedZeroDate || "n/a"} />
                    <LabelValueRow label="Total interest" value={minimumsPreview ? money(minimumsPreview.estimatedInterest) : "n/a"} />
                    <LabelValueRow label="Interest saved" value="—" />
                    <LabelValueRow label="Months debt-free sooner" value="—" />
                  </div>
                </div>
              </div>

              {strategyVsMinimumsDelta ? (
                <div style={{ marginTop: GAP }}>
                  <InsightBanner
                    icon={CheckCircle2}
                    tone="go"
                    headline="Great choice!"
                    detail={`You'll save ${money(strategyVsMinimumsDelta.interestSaved)} and be debt free ${strategyVsMinimumsDelta.monthsSooner} month${strategyVsMinimumsDelta.monthsSooner === 1 ? "" : "s"} sooner.`}
                  />
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{STRATEGY_EXPLAINERS[strategy]}</InfoCallout>

      {isActive ? (
        <InsightBanner
          icon={CheckCircle2}
          tone="go"
          headline={`${title} strategy is active`}
          detail="Keep going - momentum is on your side."
          chips={[
            result[strategy]?.projectedZeroDate ? { label: "Debt-free date", value: result[strategy].projectedZeroDate } : null,
            result[strategy]?.monthsToZero != null ? { label: "Months to $0", value: String(result[strategy].monthsToZero) } : null,
          ].filter(Boolean)}
        />
      ) : null}

      <StrategyExperience
        title={title}
        subtitle={subtitle}
        result={result[strategy]}
        isActive={isActive}
        isHousehold={snapshot.workspace.type === "household"}
        hasActivePlan={hasActivePlan}
        useLabel={useLabel}
        applyActionLabel={applyActionLabel}
        runAction={runAction}
        writeState={writeState}
        currentZeroDate={snapshot.projectedZeroDate}
        onGoToDebts={onGoToDebts}
        icon={strategy === "snowball" ? Snowflake : Mountain}
        showMomentum={strategy === "snowball"}
        onApply={async () => {
          await activateOrReforecastStrategy(service, workspaceId, strategy, hasActivePlan);
          await refresh();
        }}
      />

      <Card
        variant="default"
        style={{
          background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
          boxShadow: "var(--ttz-shadow-md)",
        }}
      >
        <TrendChart
          title="Balance to $0"
          subtitle="Paying minimums vs this strategy, plus an extra-payment scenario once you preview one below."
          series={chartSeries}
          showModes={strategy === "snowball"}
          emptyState={<div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Loading your projection…</div>}
        />
      </Card>

      {showCompositionDonut ? (
        <Card variant="default">
          <AllocationDonut
            title="Debt composition"
            subtitle="Where your included balance currently sits, by category."
            segments={compositionSegments}
            centerLabel={money(compositionTotal)}
            centerSupporting="included"
          />
        </Card>
      ) : null}

      {strategyVsMinimumsDelta ? (
        <>
          <Card
            variant="default"
            style={{
              background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-sm)",
            }}
          >
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Compare to paying minimums</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: GAP, marginTop: GAP }}>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>{title}{currentExtra ? ` (+${money(currentExtra)}/mo)` : ""}</div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <LabelValueRow label="Debt-free date" value={strategyPreview?.projectedZeroDate} />
                  <LabelValueRow label="Total interest" value={strategyPreview ? money(strategyPreview.estimatedInterest) : "n/a"} />
                </div>
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.tx2 }}>Paying minimums only</div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <LabelValueRow label="Debt-free date" value={minimumsPreview?.projectedZeroDate} />
                  <LabelValueRow label="Total interest" value={minimumsPreview ? money(minimumsPreview.estimatedInterest) : "n/a"} />
                </div>
              </div>
            </div>
          </Card>
          <InsightBanner
            icon={Sparkles}
            tone="go"
            headline="Great choice!"
                  detail={`You'll save ${money(strategyVsMinimumsDelta.interestSaved)}${strategyVsMinimumsDelta.monthsSooner > 0 ? ` and be debt-free ${strategyVsMinimumsDelta.monthsSooner} month${strategyVsMinimumsDelta.monthsSooner === 1 ? "" : "s"} sooner` : ""}.`}
          />
        </>
      ) : null}

      {speedUp ? (
        <Card variant="default" style={{ borderLeft: `3px solid ${ttzPalette.go}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconBadge icon={Lightbulb} tone="go" size="sm" />
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.go }}>Want to speed this up?</div>
          </div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, marginTop: 6 }}>
            Add {money(speedUp.additionalMonthly)}/month → finish {speedUp.monthsSaved} month{speedUp.monthsSaved === 1 ? "" : "s"} earlier → save {money(speedUp.interestSaved)} in interest.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
            <Button variant="secondary" onClick={() => navigateToPlanDestination("what-if")}>Run What If</Button>
          </div>
        </Card>
      ) : null}

      <Card
        variant="default"
        style={{
          background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
          boxShadow: "var(--ttz-shadow-sm)",
        }}
      >
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Add extra monthly payment</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: GAP }}>
          <Field label="Extra per month">
            <MoneyInput value={whatIfExtra} onChange={(event) => { setWhatIfExtra(event.target.value); setWhatIfPreview(null); }} />
          </Field>
          <Button variant="secondary" disabled={!whatIfExtra || writeState.inProgress} loading={writeState.action === `preview ${strategy} what-if`} onClick={runInlineWhatIf}>Preview</Button>
          <Button variant="ghost" onClick={() => navigateToPlanDestination("what-if")}>Open full What If</Button>
        </div>
        {whatIfPreview ? (
          <div style={{ marginTop: GAP, display: "grid", gap: 6 }}>
            <ProgressStatRowInline label="Projected $0" a={strategyPreview?.projectedZeroDate} b={whatIfPreview.projectedZeroDate} />
            <ProgressStatRowInline label="Projected interest" a={strategyPreview ? money(strategyPreview.estimatedInterest) : "n/a"} b={money(whatIfPreview.estimatedInterest)} />
          </div>
        ) : null}
      </Card>

      {otherResult ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{title} vs {otherStrategyLabel}</div>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <ProgressStatRowInline label="Debt-free date" a={result[strategy].projectedZeroDate} b={otherResult.projectedZeroDate} />
            <ProgressStatRowInline label="Total interest" a={money(result[strategy].estimatedInterest)} b={money(otherResult.estimatedInterest)} />
            <ProgressStatRowInline label="Months to $0" a={String(result[strategy].monthsToZero)} b={String(otherResult.monthsToZero)} />
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigateToPlanDestination("compare")} style={{ marginTop: GAP }}>Compare strategies</Button>
        </Card>
      ) : null}
    </div>
  );
}

function SnowballView({ snapshot, service, refresh, runAction, writeState, onGoToDebts }) {
  return (
    <StrategyPageBody
      strategy="snowball"
      title="Snowball"
      subtitle="Smallest balance first"
      useLabel="Use Snowball"
      applyActionLabel="use snowball"
      snapshot={snapshot}
      service={service}
      refresh={refresh}
      runAction={runAction}
      writeState={writeState}
      onGoToDebts={onGoToDebts}
    />
  );
}

function AvalancheView({ snapshot, service, refresh, runAction, writeState, onGoToDebts }) {
  return (
    <StrategyPageBody
      strategy="avalanche"
      title="Avalanche"
      subtitle="Highest APR first"
      useLabel="Use Avalanche"
      applyActionLabel="use avalanche"
      snapshot={snapshot}
      service={service}
      refresh={refresh}
      runAction={runAction}
      writeState={writeState}
      onGoToDebts={onGoToDebts}
      showCompositionDonut
    />
  );
}

const SCENARIO_COMPARE_AMOUNT = 100;

function CompareStrategiesView({ snapshot, service, refresh, runAction, writeState, onGoToDebts }) {
  const [result, setResult] = useState(null);
  const [scenarioCompare, setScenarioCompare] = useState(null);
  const [confirmStrategy, setConfirmStrategy] = useState(null);
  const [savedComparison, setSavedComparison] = useState(false);
  const workspaceId = snapshot.workspace.id;
  const isHousehold = snapshot.workspace.type === "household";
  const hasActivePlan = !!snapshot.activeContext?.version;
  // The scenario is "current extra + $100," not a flat $100 replacing
  // whatever's already committed - using a flat amount would make adding
  // money look like it HURTS the payoff date whenever the current extra is
  // already above $100 (reproduced live before this fix).
  const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);

  useEffect(() => {
    let active = true;
    service.compareStrategies(workspaceId, { detailed: true }).then((data) => {
      if (active) setResult(data);
    });
    // Scenario Compare (+$100/month) reuses the SAME previewTrend engine
    // call every other page's chart uses - never separate math from What If.
    Promise.all([
      service.previewTrend(workspaceId, { strategy: "snowball", extraMonthlyPayment: currentExtra + SCENARIO_COMPARE_AMOUNT }),
      service.previewTrend(workspaceId, { strategy: "avalanche", extraMonthlyPayment: currentExtra + SCENARIO_COMPARE_AMOUNT }),
    ]).then(([snowballPlus, avalanchePlus]) => { if (active) setScenarioCompare({ snowballPlus, avalanchePlus }); });
    return () => {
      active = false;
    };
  }, [service, workspaceId, currentExtra]);

  if (!result) return <LoadingState label="Comparing strategies" />;

  const recommendation = deriveStrategyRecommendation({ snowball: result.snowball, avalanche: result.avalanche });
  const winnerLabel = recommendation.code === "avalanche_better" ? "Avalanche" : recommendation.code === "snowball_better" ? "Snowball" : null;
  const winnerStrategy = recommendation.code === "avalanche_better" ? "avalanche" : recommendation.code === "snowball_better" ? "snowball" : null;
  const activeStrategyKey = result.activeStrategy || winnerStrategy || "avalanche";
  const activeStrategyLabel = activeStrategyKey === "snowball" ? "Snowball" : "Avalanche";
  const activeStrategyResult = result[activeStrategyKey];
  const winnerResult = winnerStrategy ? result[winnerStrategy] : activeStrategyResult;
  const winnerTone = winnerStrategy === "snowball" ? "ac" : "go";
  const comparisonTokens = ["blue", "green", "orange"];

  const chartSeries = [
    { id: "snowball", label: "Snowball", colorToken: "blue", points: toBalancePoints(result.snowball.projection), payoffMonth: result.snowball.projectedZeroDate || undefined },
    { id: "avalanche", label: "Avalanche", colorToken: "green", points: toBalancePoints(result.avalanche.projection), payoffMonth: result.avalanche.projectedZeroDate || undefined },
  ];

  const interestByDebtEntries = [
    ...deriveInterestBreakdownSegments(result.snowball.perDebt, snapshot.payoffQueue || []),
  ];
  const compositionEntries = deriveDebtCompositionSegments(snapshot.payoffQueue || []);
  const allocation = deriveAllocationSegments(snapshot.payoffQueue || [], result[result.activeStrategy || "avalanche"]?.extraMonthlyPayment || 0);
  const winnerTarget = winnerResult?.payoffOrder?.[0] || null;
  const strategyTargetDelta = winnerStrategy
    ? Math.abs(Number(result.snowball.monthsToZero || 0) - Number(result.avalanche.monthsToZero || 0))
    : 0;
  const currentFirstTarget = activeStrategyResult?.payoffOrder?.[0] || null;
  const orangePrimaryStyle = {
    background: `linear-gradient(135deg, ${ttzPalette.wa} 0%, #ff8a1a 100%)`,
    border: `1px solid ${ttzPalette.wa}`,
    color: "#ffffff",
  };
  const compactScenarioRows = scenarioCompare ? [
    {
      strategy: "Snowball",
      payoff: scenarioCompare.snowballPlus?.projectedZeroDate || "n/a",
      interest: money(scenarioCompare.snowballPlus?.estimatedInterest || 0),
      delta: `~ ${Math.max(0, Number(result.snowball.monthsToZero || 0) - Number(scenarioCompare.snowballPlus?.monthsToZero || 0))} mo faster`,
      saved: `${money(Math.max(0, Number(result.snowball.estimatedInterest || 0) - Number(scenarioCompare.snowballPlus?.estimatedInterest || 0)))} saved`,
      tone: "ac",
    },
    {
      strategy: "Avalanche",
      payoff: scenarioCompare.avalanchePlus?.projectedZeroDate || "n/a",
      interest: money(scenarioCompare.avalanchePlus?.estimatedInterest || 0),
      delta: `~ ${Math.max(0, Number(result.avalanche.monthsToZero || 0) - Number(scenarioCompare.avalanchePlus?.monthsToZero || 0))} mo faster`,
      saved: `${money(Math.max(0, Number(result.avalanche.estimatedInterest || 0) - Number(scenarioCompare.avalanchePlus?.estimatedInterest || 0)))} saved`,
      tone: "go",
    },
  ] : [];

  const renderMiniPayoffRows = (debts = [], tone = "ac") => (
    <div style={{ display: "grid", gap: 8 }}>
      {debts.slice(0, 5).map((debt, index) => (
        <div
          key={`${tone}-${debt.id}`}
          style={{
            display: "grid",
            gridTemplateColumns: "28px minmax(0, 1fr) auto auto",
            gap: 10,
            alignItems: "center",
            paddingBottom: 8,
            borderBottom: `1px solid ${ttzPalette.border}`,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: tone === "go" ? ttzPalette.goD : ttzPalette.acS,
              color: tone === "go" ? ttzPalette.go : ttzPalette.ac,
              ...TYPE_SCALE.caption,
              fontWeight: 800,
            }}
          >
            {index + 1}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{debt.name}</div>
          </div>
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx }}>{money(debt.currentBalance || 0)}</div>
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{percent(debt.apr)}</div>
        </div>
      ))}
    </div>
  );

  const confirmApply = () => runAction(`use ${confirmStrategy}`, async () => {
    await activateOrReforecastStrategy(service, workspaceId, confirmStrategy, hasActivePlan);
    setConfirmStrategy(null);
    await refresh();
  });

  const saveComparison = () => runAction("save comparison", async () => {
    const strategyForScenario = winnerStrategy || result.activeStrategy || "avalanche";
    await service.saveScenario(workspaceId, {
      name: `Snowball vs Avalanche - ${new Date().toLocaleDateString()}`,
      type: "strategy_comparison",
      inputs: { strategy: strategyForScenario },
    });
    setSavedComparison(true);
  });

  // GATE-10B.1E: "Less interest" is only shown when there's a real winner to
  // discount FROM - a tie has no meaningful percentage to report (never a
  // fabricated 0%/NaN%).
  const higherInterest = Math.max(Number(result.snowball.estimatedInterest || 0), Number(result.avalanche.estimatedInterest || 0));
  const lowerInterest = Math.min(Number(result.snowball.estimatedInterest || 0), Number(result.avalanche.estimatedInterest || 0));
  const interestPercentDelta = winnerStrategy ? safePercentDelta(higherInterest, lowerInterest) : null;
  const recommendationTone = recommendation.code === "tie" ? "info" : recommendation.code === "tradeoff" ? "wa" : "go";

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => navigateToPlanDestination("my-plan")}
          className="ttz-focus-ring"
          style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, ...TYPE_SCALE.body, color: ttzPalette.wa, fontWeight: 700 }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to My Plan
        </button>
      </div>

      <Card
        variant="default"
        style={{
          padding: 0,
          overflow: "hidden",
          background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
        }}
      >
        <div className="ttz-compare-recommendation-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) repeat(4, minmax(120px, 0.55fr))", gap: 0 }}>
          <div style={{ padding: 22, borderRight: `1px solid ${ttzPalette.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: `1px solid ${ttzPalette.go}`, display: "grid", placeItems: "center", color: ttzPalette.go }}>
                {winnerStrategy ? <CheckCircle2 size={28} /> : <GitCompare size={28} />}
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>
                  {winnerLabel ? `${winnerLabel} is the better fit right now` : "Snowball and Avalanche are effectively tied right now"}
                </div>
                <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4 }}>{recommendation.detail}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: 18, borderRight: `1px solid ${ttzPalette.border}` }}>
            <div style={{ ...TYPE_SCALE.metricSm, color: winnerLabel ? ttzPalette.go : ttzPalette.tx }}>{interestPercentDelta?.value != null ? `${interestPercentDelta.value.toFixed(1)}%` : "Same"}</div>
            <div style={{ ...TYPE_SCALE.caption, color: winnerLabel ? ttzPalette.go : ttzPalette.tx2, marginTop: 4 }}>{winnerLabel ? "Less interest" : "Interest profile"}</div>
          </div>
          <div style={{ padding: 18, borderRight: `1px solid ${ttzPalette.border}` }}>
            <div style={{ ...TYPE_SCALE.metricSm, color: winnerLabel ? ttzPalette.go : ttzPalette.tx }}>{strategyTargetDelta || "Same"}</div>
            <div style={{ ...TYPE_SCALE.caption, color: winnerLabel ? ttzPalette.go : ttzPalette.tx2, marginTop: 4 }}>{winnerLabel ? "Months faster" : "Months to $0"}</div>
          </div>
          <div style={{ padding: 18, borderRight: `1px solid ${ttzPalette.border}` }}>
            <div style={{ ...TYPE_SCALE.metricSm, color: winnerLabel ? ttzPalette.go : ttzPalette.tx }}>{recommendation.interestDelta ? money(recommendation.interestDelta) : "$0"}</div>
            <div style={{ ...TYPE_SCALE.caption, color: winnerLabel ? ttzPalette.go : ttzPalette.tx2, marginTop: 4 }}>{winnerLabel ? "Interest saved" : "Interest delta"}</div>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx }}>{winnerLabel ? (strategyTargetDelta ? "Different" : "Same") : "Same"}</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 4 }}>Payoff month</div>
          </div>
        </div>
      </Card>

      <div className="ttz-compare-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: GAP }}>
        <PlanMetric label="Projected debt-free date" value={<>{result.snowball.projectedZeroDate}<span style={{ color: ttzPalette.tx2 }}> vs </span>{result.avalanche.projectedZeroDate}</>} icon={Calendar} />
        <PlanMetric label="Months to $0" value={<>{result.snowball.monthsToZero}<span style={{ color: ttzPalette.tx2 }}> vs </span>{result.avalanche.monthsToZero}</>} icon={Clock} />
        <PlanMetric label="Projected interest" value={<>{money(result.snowball.estimatedInterest)}<span style={{ color: ttzPalette.tx2 }}> vs </span>{money(result.avalanche.estimatedInterest)}</>} icon={DollarSign} />
        <PlanMetric label="First target" value={<>{result.snowball.payoffOrder?.[0]?.name || "n/a"}<span style={{ color: ttzPalette.tx2 }}> vs </span>{result.avalanche.payoffOrder?.[0]?.name || "n/a"}</>} icon={Target} />
      </div>

      <div className="ttz-compare-strategy-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(420px, 1.15fr)", gap: GAP, alignItems: "stretch" }}>
        <Card variant="default" style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconBadge icon={Snowflake} tone="ac" size="md" />
              <div>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Snowball</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Momentum builder</div>
              </div>
            </div>
            <Badge tone="info">Inspect strategy</Badge>
          </div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Pay off the smallest balances first to build quick wins and keep your momentum high.</div>
          <div className="ttz-compare-card-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.2fr)", gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${ttzPalette.border}`, background: ttzPalette.surf2 }}>
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>First target</div>
              <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700, marginTop: 8 }}>{result.snowball.payoffOrder?.[0]?.name || "n/a"}</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx, marginTop: 8 }}>{money(result.snowball.payoffOrder?.[0]?.currentBalance || 0)}</div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 6 }}>{percent(result.snowball.payoffOrder?.[0]?.apr)}</div>
            </div>
            <div>
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted, marginBottom: 8 }}>Payoff order (top 5)</div>
              {renderMiniPayoffRows(result.snowball.payoffOrder, "ac")}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Total payoff time <span style={{ color: ttzPalette.tx, marginLeft: 6 }}>{result.snowball.monthsToZero} months</span></div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Total interest <span style={{ color: ttzPalette.ac, marginLeft: 6 }}>{money(result.snowball.estimatedInterest)}</span></div>
            </div>
            <Button variant="secondary" onClick={() => navigateToPlanDestination("snowball")}>Inspect strategy</Button>
          </div>
        </Card>

        <Card variant="default" style={{ padding: 20, display: "grid", gap: 14, border: `1px solid ${ttzPalette.go}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconBadge icon={Mountain} tone="go" size="md" />
              <div>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Avalanche</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Interest optimizer</div>
              </div>
            </div>
            <Badge tone="success">{result.activeStrategy === "avalanche" ? "Active strategy" : "Inspect strategy"}</Badge>
          </div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Prioritize the highest interest rates first to minimize the total interest you pay.</div>
          <div className="ttz-compare-card-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.2fr)", gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${ttzPalette.border}`, background: ttzPalette.surf2 }}>
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.go }}>First target</div>
              <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700, marginTop: 8 }}>{result.avalanche.payoffOrder?.[0]?.name || "n/a"}</div>
              <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx, marginTop: 8 }}>{money(result.avalanche.payoffOrder?.[0]?.currentBalance || 0)}</div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 6 }}>{percent(result.avalanche.payoffOrder?.[0]?.apr)}</div>
            </div>
            <div>
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted, marginBottom: 8 }}>Payoff order (top 5)</div>
              {renderMiniPayoffRows(result.avalanche.payoffOrder, "go")}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Total payoff time <span style={{ color: ttzPalette.tx, marginLeft: 6 }}>{result.avalanche.monthsToZero} months</span></div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Total interest <span style={{ color: ttzPalette.go, marginLeft: 6 }}>{money(result.avalanche.estimatedInterest)}</span></div>
            </div>
            <Button variant="secondary" onClick={() => navigateToPlanDestination("avalanche")}>Inspect strategy</Button>
          </div>
        </Card>

        <SectionCard
          number={4}
          title="Balance to $0 over time"
          actions={<div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 0, borderTop: `3px solid ${ttzPalette.ac}` }} /> Snowball</span><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 0, borderTop: `3px solid ${ttzPalette.go}` }} /> Avalanche</span></div>}
          style={{ padding: 20 }}
        >
          <TrendChart series={chartSeries} />
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.go, marginTop: 12 }}>
            {winnerLabel ? `${winnerLabel} becomes debt-free ${strategyTargetDelta} month${strategyTargetDelta === 1 ? "" : "s"} sooner.` : "These strategies are effectively tied on timing."}
          </div>
        </SectionCard>
      </div>

      <div className="ttz-compare-charts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: GAP, alignItems: "stretch" }}>
        <Card variant="default">
          <AllocationDonut
            title="Interest breakdown (Snowball)"
            subtitle="Projected interest by debt."
            segments={interestByDebtEntries.map((entry, index) => ({ ...entry, colorToken: comparisonTokens[index % comparisonTokens.length] }))}
            centerLabel={money(result.snowball.estimatedInterest || 0)}
            centerSupporting="total interest"
          />
        </Card>
        <Card variant="default">
          <AllocationDonut
            title="Debt composition"
            subtitle="Included balance by category."
            segments={compositionEntries.map((entry, index) => ({ id: entry.group, label: categoryConfigForGroup(entry.group)?.label || "Other", value: entry.balance, colorToken: comparisonTokens[index % comparisonTokens.length] }))}
            centerLabel={money(compositionEntries.reduce((sum, entry) => sum + entry.balance, 0))}
            centerSupporting="Total balance"
          />
        </Card>
        <Card variant="default" style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Scenario compare (+{money(SCENARIO_COMPARE_AMOUNT)} / month)</div>
            <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4 }}>Add the same extra payment to each strategy and see the impact.</div>
          </div>
          {compactScenarioRows.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="ttz-compare-table-row" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1.1fr", gap: 8, ...TYPE_SCALE.overline, color: ttzPalette.muted }}>
                <div>Strategy</div>
                <div>Debt-free date</div>
                <div>Interest</div>
                <div>Vs. base plan</div>
              </div>
              {compactScenarioRows.map((row) => (
                <div key={row.strategy} className="ttz-compare-table-row" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1.1fr", gap: 8, alignItems: "center", paddingTop: 10, borderTop: `1px solid ${ttzPalette.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE_SCALE.body, color: ttzPalette.tx }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: row.tone === "go" ? ttzPalette.go : ttzPalette.ac, flexShrink: 0 }} />
                    {row.strategy}
                  </div>
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{row.payoff}</div>
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{row.interest}</div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ ...TYPE_SCALE.caption, color: row.tone === "go" ? ttzPalette.go : ttzPalette.ac }}>{row.delta}</div>
                    <div style={{ ...TYPE_SCALE.caption, color: row.tone === "go" ? ttzPalette.go : ttzPalette.ac }}>{row.saved}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <LoadingState label="Loading scenario compare..." />}
          <div style={{ marginTop: "auto", textAlign: "right" }}>
            <button
              type="button"
              onClick={() => navigateToPlanDestination("what-if")}
              className="ttz-focus-ring"
              style={{ all: "unset", cursor: "pointer", ...TYPE_SCALE.body, color: ttzPalette.ac, fontWeight: 700 }}
            >
              Explore more in What If
            </button>
          </div>
        </Card>
        <Card variant="default">
          <AllocationDonut
            title="Payment allocation (now)"
            subtitle={`Based on the ${activeStrategyLabel} plan's monthly payment.`}
            segments={allocation.segments}
            centerLabel={money(allocation.total)}
            centerSupporting="monthly payment"
          />
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 10 }}>
            This split keeps your required payments covered first, then sends the extra toward the target debt.
          </div>
        </Card>
      </div>

      <Card
        variant="default"
        style={{
          background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
          borderColor: winnerLabel ? ttzPalette.go : ttzPalette.border,
        }}
      >
        <div className="ttz-compare-summary-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) repeat(3, minmax(140px, 0.7fr)) auto", gap: 0, alignItems: "stretch" }}>
          <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: `1px solid ${ttzPalette.go}`, display: "grid", placeItems: "center", color: ttzPalette.go }}>
              <Trophy size={28} />
            </div>
            <div>
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Decision summary</div>
              <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>{recommendation.headline}</div>
              <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4 }}>{recommendation.detail}</div>
            </div>
          </div>
          <div style={{ padding: 18, borderLeft: `1px solid ${ttzPalette.border}`, display: "grid", placeItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...TYPE_SCALE.metricSm, color: winnerLabel ? ttzPalette.go : ttzPalette.tx }}>{strategyTargetDelta}</div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Months sooner</div>
            </div>
          </div>
          <div style={{ padding: 18, borderLeft: `1px solid ${ttzPalette.border}`, display: "grid", placeItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...TYPE_SCALE.metricSm, color: winnerLabel ? ttzPalette.go : ttzPalette.tx }}>{recommendation.interestDelta ? money(recommendation.interestDelta) : "$0"}</div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Interest saved</div>
            </div>
          </div>
          <div style={{ padding: 18, borderLeft: `1px solid ${ttzPalette.border}`, display: "grid", placeItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...TYPE_SCALE.metricSm, color: activeStrategyLabel === "Avalanche" ? ttzPalette.go : ttzPalette.ac }}>{activeStrategyLabel}</div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Active strategy</div>
            </div>
          </div>
          <div style={{ padding: 18, borderLeft: `1px solid ${ttzPalette.border}`, display: "grid", alignContent: "center", gap: 10 }}>
            {winnerStrategy && result.activeStrategy !== winnerStrategy ? (
              <Button variant="primary" style={orangePrimaryStyle} onClick={() => setConfirmStrategy(winnerStrategy)} disabled={writeState?.inProgress}>
                Choose {winnerLabel}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={saveComparison}
              disabled={writeState?.inProgress || savedComparison}
              className="ttz-focus-ring"
              style={{ all: "unset", cursor: savedComparison ? "default" : "pointer", ...TYPE_SCALE.body, color: savedComparison ? ttzPalette.tx2 : ttzPalette.ac, fontWeight: 700, textAlign: "center" }}
            >
              {savedComparison ? "Comparison saved" : "Save this comparison"}
            </button>
          </div>
        </div>
      </Card>

      <ConfirmationDialog
        open={!!confirmStrategy}
        title={hasActivePlan ? `Switch to ${confirmStrategy === "avalanche" ? "Avalanche" : "Snowball"}?` : `Activate ${confirmStrategy === "avalanche" ? "Avalanche" : "Snowball"}?`}
        confirmLabel={writeState?.action === `use ${confirmStrategy}` ? "Applying..." : "Apply"}
        onConfirm={confirmApply}
        onCancel={() => setConfirmStrategy(null)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{hasActivePlan ? "This creates a new plan version. Your current plan is kept in your plan history, never overwritten." : "This creates and activates your first payoff plan."}</p>
      </ConfirmationDialog>
    </div>
  );
}

// GATE-10B.1D: safePercentDelta -> a human sentence, shared by every page
// that surfaces an interest/time delta (What If, Finish By) so no two
// pages invent their own zero-denominator phrasing. Never "Infinity%" /
// "NaN%" / a fake "0%" - a zero-baseline delta gets a dollar-only sentence
// instead of a nonsensical percentage.
function describePercentDelta(delta, absoluteMoneyDelta, { noun = "interest" } = {}) {
  if (!delta || delta.direction === "same") return `No change in projected ${noun}.`;
  if (delta.value == null) return `${delta.direction === "decrease" ? "Saves" : "Adds"} ${money(absoluteMoneyDelta)} in ${noun}.`;
  const verb = delta.direction === "decrease" ? "less" : "more";
  return `${delta.value.toFixed(1)}% ${verb} ${noun} (${money(absoluteMoneyDelta)}).`;
}

const IMPACT_CHANGE_TONE = { earlier: "success", now_paid_off: "success", later: "warning", no_longer_reached: "warning", no_change: "neutral" };
const IMPACT_CHANGE_LABEL = {
  earlier: (row) => `${row.monthsDelta} month${row.monthsDelta === 1 ? "" : "s"} earlier`,
  later: (row) => `${row.monthsDelta} month${row.monthsDelta === 1 ? "" : "s"} later`,
  now_paid_off: () => "Now paid off in this window",
  no_longer_reached: () => "No longer paid off in this window",
  no_change: () => "No change",
};

// Shared by What If and Finish By's per-debt impact tables - resolves the
// gap this file used to document as impossible ("the engine only tracks
// aggregate balance/interest per month, never a per-account zero-crossing"),
// now real via payoffSimulateDetailed's perDebt output.
function PerDebtImpactTable({ rows, showImpactLevel = false }) {
  if (!rows.length) return null;
  const thStyle = { textAlign: "left", padding: "8px 10px", ...TYPE_SCALE.overline, color: ttzPalette.muted, borderBottom: `1px solid ${ttzPalette.border}` };
  const tdStyle = { padding: "8px 10px", ...TYPE_SCALE.body, color: ttzPalette.tx, borderBottom: `1px solid ${ttzPalette.border}` };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
        <thead>
          <tr>
            <th style={thStyle}>Debt</th>
            <th style={thStyle}>Current payoff</th>
            <th style={thStyle}>Scenario payoff</th>
            <th style={thStyle}>Change</th>
            {showImpactLevel ? <th style={thStyle}>Impact level</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.debtId}>
              <td style={tdStyle}>{row.debtName}</td>
              <td style={tdStyle}>{row.baselinePayoffMonth || "Not reached"}</td>
              <td style={tdStyle}>{row.scenarioPayoffMonth || "Not reached"}</td>
              <td style={tdStyle}><Badge tone={IMPACT_CHANGE_TONE[row.change] || "neutral"}>{(IMPACT_CHANGE_LABEL[row.change] || (() => "No change"))(row)}</Badge></td>
              {showImpactLevel ? (
                <td style={tdStyle}>
                  <Badge tone={IMPACT_LEVEL_TONE[impactLevelForMonthsDelta(row.monthsDelta)]}>{impactLevelForMonthsDelta(row.monthsDelta)}</Badge>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function WhatIfView({ snapshot, service, runAction, writeState }) {
  const [mode, setMode] = useState("recurring");
  const [extra, setExtra] = useState("100");
  const [amount, setAmount] = useState("500");
  const [targetDebtId, setTargetDebtId] = useState("");
  const [strategyContext, setStrategyContext] = useState(() => snapshot.activeContext?.version?.strategy || "avalanche");
  const [preview, setPreview] = useState(null);
  const [previewNotice, setPreviewNotice] = useState("");
  const [otherStrategies, setOtherStrategies] = useState(null);
  const [scenarioName, setScenarioName] = useState("");
  const workspaceId = snapshot.workspace.id;
  const hasActivePlan = !!snapshot.activeContext?.version;
  const debtOptions = [{ id: "", name: "All included debts" }, ...(snapshot.payoffQueue || [])];

  // UX-4.1: every preview branch is now zero-write AND resilient - a targeted
  // "add money every month" preview works even before any plan is active
  // (via previewCustomTarget's optional extraMonthlyPayment override), and
  // the untargeted "All" case honestly explains why it needs an active plan
  // instead of silently doing nothing. runAction (not a bare async
  // onClick) means any real failure surfaces in the shared error banner
  // instead of vanishing as an unhandled rejection.
  //
  // GATE-10B.1D: baseline AND scenario now both come back `detailed: true`
  // (via the same previewCustomTarget/previewOneTimePayment/
  // previewReforecast calls this always used - only the flag is new), so
  // the chart and per-debt impact table below are never a separate,
  // independently computed number from these metrics - same funnel, same
  // call, every time.
  const runPreview = () => runAction("preview what-if", async () => {
    setPreviewNotice("");
    setPreview(null);
    setOtherStrategies(null);
    const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);
    const toSide = (result) => (result ? {
      label: result.projectedZeroDate,
      interest: Number(result.estimatedInterest || 0),
      months: result.monthsToZero,
      projection: result.projection,
      perDebt: result.perDebt || {},
    } : null);

    if (mode === "recurring") {
      const addition = Number(extra) || 0;
      const nextExtra = currentExtra + addition;
      if (targetDebtId) {
        const result = await service.previewCustomTarget(workspaceId, { targetDebtId, extraMonthlyPayment: nextExtra, strategy: strategyContext, detailed: true });
        if (!result) { setPreviewNotice("That debt could not be found."); return; }
        setPreview({ baseline: toSide(result.baseline), scenario: toSide(result.custom) });
        return;
      }
      if (!hasActivePlan) {
        setPreviewNotice("Build and activate a plan first (try Compare) so there's a current payment to add to - or pick a specific debt above to preview targeting extra money at it right away.");
        return;
      }
      const [baselineResult, scenarioResult] = await Promise.all([
        service.previewTrend(workspaceId, { strategy: strategyContext, extraMonthlyPayment: currentExtra, detailed: true }),
        service.previewReforecast(workspaceId, { extraMonthlyPayment: nextExtra, strategy: strategyContext }, { detailed: true }),
      ]);
      setPreview({
        baseline: toSide(baselineResult),
        scenario: {
          label: scenarioResult.proposedZeroDate,
          interest: scenarioResult.projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
          months: scenarioResult.projection.length,
          projection: scenarioResult.projection,
          perDebt: scenarioResult.perDebt || {},
        },
      });
      // "Vs other strategies" applies the SAME plan-wide extra addition to
      // Snowball and Avalanche baselines - only meaningful when the
      // scenario is a plan-wide payment change (not a specific-debt
      // targeting, which doesn't generalize across strategy orderings).
      const [snowballBase, snowballScenario, avalancheBase, avalancheScenario] = await Promise.all([
        service.previewTrend(workspaceId, { strategy: "snowball", extraMonthlyPayment: currentExtra, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "snowball", extraMonthlyPayment: nextExtra, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "avalanche", extraMonthlyPayment: currentExtra, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "avalanche", extraMonthlyPayment: nextExtra, detailed: false }),
      ]);
      setOtherStrategies({ snowballBase, snowballScenario, avalancheBase, avalancheScenario });
      return;
    }

    if (mode === "one-time") {
      const lump = Number(amount) || 0;
      const result = await service.previewOneTimePayment(workspaceId, { amount: lump, targetDebtId, strategy: strategyContext, detailed: true });
      if (!result) { setPreviewNotice("Enter an amount and choose a debt to preview."); return; }
      setPreview({ baseline: toSide(result.baseline), scenario: toSide(result.withLumpSum) });
      const oneTimePayments = [{ debtId: result.targetDebtId, amount: lump, month: 0 }];
      const [snowballBase, snowballScenario, avalancheBase, avalancheScenario] = await Promise.all([
        service.previewTrend(workspaceId, { strategy: "snowball", extraMonthlyPayment: currentExtra, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "snowball", extraMonthlyPayment: currentExtra, oneTimePayments, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "avalanche", extraMonthlyPayment: currentExtra, detailed: false }),
        service.previewTrend(workspaceId, { strategy: "avalanche", extraMonthlyPayment: currentExtra, oneTimePayments, detailed: false }),
      ]);
      setOtherStrategies({ snowballBase, snowballScenario, avalancheBase, avalancheScenario });
      return;
    }

    if (!targetDebtId) { setPreviewNotice("Choose a debt to target first."); return; }
    const result = await service.previewCustomTarget(workspaceId, { targetDebtId, strategy: strategyContext, detailed: true });
    if (!result) { setPreviewNotice("That debt could not be found."); return; }
    setPreview({ baseline: toSide(result.baseline), scenario: toSide(result.custom) });
  }, { write: false });

  const saveScenario = () => runAction("save scenario", async () => {
    const name = scenarioName.trim() || `Scenario ${new Date().toLocaleDateString()}`;
    if (mode === "recurring") {
      const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);
      const nextExtra = currentExtra + (Number(extra) || 0);
      // Targeted at one debt -> the same preview-only "custom" pseudo-
      // strategy category as the Custom scenario mode below (never a real,
      // applicable PLAN_STRATEGIES value); untargeted -> a real, applicable
      // plan-wide extra payment.
      if (targetDebtId) {
        await service.saveScenario(workspaceId, { name, type: "custom_target", inputs: { targetDebtId, extraMonthlyPayment: nextExtra } });
      } else {
        await service.saveScenario(workspaceId, { name, type: "recurring_extra", inputs: { extraMonthlyPayment: nextExtra } });
      }
    }
    if (mode === "one-time") {
      await service.saveScenario(workspaceId, { name, type: "one_time", inputs: { amount: Number(amount) || 0, targetDebtId } });
    }
    if (mode === "custom") {
      await service.saveScenario(workspaceId, { name, type: "custom_target", inputs: { targetDebtId } });
    }
    setScenarioName("");
  });

  const interestDelta = preview ? safePercentDelta(preview.baseline?.interest, preview.scenario?.interest) : null;
  const interestDeltaMoney = preview ? Math.abs(Number(preview.scenario?.interest || 0) - Number(preview.baseline?.interest || 0)) : 0;
  const impactRows = preview ? derivePerDebtImpactRows(preview.baseline?.perDebt, preview.scenario?.perDebt, snapshot.payoffQueue || []) : [];
  const monthsSaved = preview && preview.baseline?.months != null && preview.scenario?.months != null
    ? Number(preview.baseline.months) - Number(preview.scenario.months)
    : null;
  const additionalMonthlyPayment = mode === "recurring" ? Number(extra) || 0 : mode === "one-time" ? null : 0;
  // GATE-10B.1E: the most-affected debt is genuinely computed (impactRows
  // is already sorted biggest-change-first by derivePerDebtImpactRows) -
  // never a hardcoded "first debt in the list."
  const mostAffectedDebt = impactRows[0] || null;
  const bestOtherStrategy = otherStrategies ? pickBestByZeroDate([
    { label: "Current Snowball", preview: otherStrategies.snowballBase },
    { label: "Snowball + this scenario", preview: otherStrategies.snowballScenario },
    { label: "Current Avalanche", preview: otherStrategies.avalancheBase },
    { label: "Avalanche + this scenario", preview: otherStrategies.avalancheScenario },
  ]) : null;
  const strategyContextLabel = strategyContext === "snowball" ? "Snowball" : "Avalanche";
  const chartSeriesForWhatIf = preview ? [
    {
      id: "baseline",
      label: `Current plan (${strategyContextLabel})`,
      colorToken: "blue",
      points: toBalancePoints(preview.baseline?.projection),
      payoffMonth: preview.baseline?.label || undefined,
    },
    {
      id: "scenario",
      label: "What-if scenario",
      colorToken: "green",
      points: toBalancePoints(preview.scenario?.projection),
      payoffMonth: preview.scenario?.label || undefined,
    },
  ] : [];
  const strategyComparisonTiles = otherStrategies ? [
    {
      label: "Current Snowball",
      supporting: "Your plan",
      projectedZeroDate: otherStrategies.snowballBase?.projectedZeroDate || "n/a",
      estimatedInterest: otherStrategies.snowballBase?.estimatedInterest || 0,
      monthsToZero: otherStrategies.snowballBase?.monthsToZero ?? null,
      tone: "blue",
      active: strategyContext === "snowball",
    },
    {
      label: "Snowball + What If",
      supporting: scenarioName.trim() || "+$100 to Chase",
      projectedZeroDate: otherStrategies.snowballScenario?.projectedZeroDate || "n/a",
      estimatedInterest: otherStrategies.snowballScenario?.estimatedInterest || 0,
      monthsToZero: otherStrategies.snowballScenario?.monthsToZero ?? null,
      tone: "green",
      active: strategyContext === "snowball",
    },
    {
      label: "Avalanche baseline",
      supporting: "For comparison",
      projectedZeroDate: otherStrategies.avalancheBase?.projectedZeroDate || "n/a",
      estimatedInterest: otherStrategies.avalancheBase?.estimatedInterest || 0,
      monthsToZero: otherStrategies.avalancheBase?.monthsToZero ?? null,
      tone: "blue",
      active: strategyContext === "avalanche",
    },
    {
      label: "Avalanche + What If",
      supporting: scenarioName.trim() || "+$100 to Chase",
      projectedZeroDate: otherStrategies.avalancheScenario?.projectedZeroDate || "n/a",
      estimatedInterest: otherStrategies.avalancheScenario?.estimatedInterest || 0,
      monthsToZero: otherStrategies.avalancheScenario?.monthsToZero ?? null,
      tone: "green",
      active: strategyContext === "avalanche",
    },
  ] : [];
  const firstDebtAffectedLabel = mostAffectedDebt?.debtName || "n/a";
  const compactImpactRows = impactRows.slice(0, 4);
  const currentPlanPillStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    ...TYPE_SCALE.caption,
    color: ttzPalette.tx2,
  };

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card
        variant="default"
        style={{
          background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
          boxShadow: "var(--ttz-shadow-md)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconBadge icon={TrendingUp} tone="ac" size="sm" />
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Scenario impact</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={currentPlanPillStyle}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ttz-chart-blue-base)" }} /> Current plan</span>
            <span style={currentPlanPillStyle}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ttz-chart-green-base)" }} /> Scenario</span>
          </div>
        </div>

        {preview ? (
          <div className="ttz-plan-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: GAP, marginTop: GAP }}>
            <PlanMetric label="Current projected $0" value={preview.baseline?.label || "n/a"} icon={Calendar} />
            <PlanMetric label="Scenario projected $0" value={preview.scenario?.label || "n/a"} tone="success" icon={Calendar} />
            <PlanMetric label="Months saved" value={monthsSaved != null ? String(monthsSaved) : "n/a"} tone="success" icon={Clock} />
            <PlanMetric label="Interest saved" value={money(interestDeltaMoney)} tone="success" icon={DollarSign} />
            <PlanMetric label="Additional monthly payment" value={additionalMonthlyPayment != null ? money(additionalMonthlyPayment) : money(Number(amount) || 0)} tone="warning" icon={Wallet} />
            <PlanMetric label="First debt affected" value={firstDebtAffectedLabel} icon={Target} />
          </div>
        ) : (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP, marginBottom: 0 }}>
            Build a scenario below and preview it to see payoff timing, savings, and which debt feels the change first.
          </p>
        )}
      </Card>

      <div
        className="ttz-whatif-main-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 0.9fr) minmax(0, 1.1fr) minmax(320px, 0.85fr)",
          gap: GAP,
          alignItems: "stretch",
        }}
      >
        <Card
          variant="default"
          style={{
            background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
            boxShadow: "var(--ttz-shadow-md)",
            position: "sticky",
            top: 12,
            gridRow: otherStrategies ? "1 / span 2" : "1",
          }}
          className="ttz-whatif-builder"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconBadge icon={FlaskConical} tone="ac" size="sm" />
            <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Scenario builder</div>
          </div>

          <div style={{ ...pillTabGroupStyle(), marginTop: GAP }}>
            {[
              { key: "recurring", label: "Add money every month" },
              { key: "one-time", label: "Make a one-time payment" },
              { key: "target", label: "Target another debt" },
              { key: "custom", label: "Custom scenario" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => { setMode(option.key); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }}
                style={pillTabButtonStyle(mode === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
            {mode === "recurring" ? (
              <>
                <Field label="Extra per month">
                  <MoneyInput value={extra} onChange={(event) => { setExtra(event.target.value); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }} />
                </Field>
                <Field label="Apply toward">
                  <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }}>
                    {debtOptions.map((debt) => (
                      <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}

            {mode === "one-time" ? (
              <>
                <Field label="Apply toward">
                  <Select value={targetDebtId} onChange={(event) => setTargetDebtId(event.target.value)}>
                    {debtOptions.map((debt) => (
                      <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="One-time payment">
                  <MoneyInput value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
              </>
            ) : null}

            {(mode === "target" || mode === "custom") ? (
              <Field label="Target debt">
                <Select value={targetDebtId} onChange={(event) => setTargetDebtId(event.target.value)}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Strategy context">
              <Select value={strategyContext} onChange={(event) => { setStrategyContext(event.target.value); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }}>
                <option value="avalanche">Avalanche</option>
                <option value="snowball">Snowball</option>
              </Select>
            </Field>

            <Field label="Scenario name">
              <Input value={scenarioName} placeholder="+$100 to Chase" onChange={(event) => setScenarioName(event.target.value)} />
            </Field>

            <div style={{ display: "grid", gap: 10 }}>
              <Button variant="primary" onClick={runPreview} disabled={writeState.inProgress} loading={writeState.action === "preview what-if"}>Preview impact</Button>
              <Button variant="secondary" onClick={saveScenario} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
              <Button variant="ghost" disabled style={{ justifyContent: "center", border: `1px solid ${ttzPalette.border}` }}>Apply to plan</Button>
            </div>

            {previewNotice ? <WarningCallout>{previewNotice}</WarningCallout> : null}
            <InfoCallout>This is a hypothetical preview only. It will not create a PaymentEvent.</InfoCallout>
          </div>
        </Card>

            <Card variant="default" style={{ height: "100%" }}>
              {preview ? (
                <TrendChart
                  title="Trend to zero"
                  subtitle="Current plan vs what-if scenario"
                  series={chartSeriesForWhatIf}
                  modeToggle
                />
              ) : (
                <>
                  <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Trend to zero</div>
                  <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP, marginBottom: 0 }}>Preview a scenario to see how the debt line moves when you change the plan.</p>
                </>
              )}
            </Card>

            <Card variant="default" style={{ height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <IconBadge icon={GitCompare} tone="go" size="sm" />
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>How your debt reacts over time</div>
              </div>
              {compactImpactRows.length ? (
                <div style={{ display: "grid", gap: 12, marginTop: GAP }}>
                  {compactImpactRows.map((row) => (
                    <div key={row.debtId} style={{ padding: 14, borderRadius: 14, border: `1px solid ${ttzPalette.border}`, background: ttzPalette.surf2 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) auto auto auto", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>{row.debtName}</div>
                          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 4 }}>{money(row.balance || 0)}</div>
                        </div>
                        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{row.baselineDate || "n/a"}</div>
                        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{row.scenarioDate || "n/a"}</div>
                        <Badge tone={row.monthsDelta > 0 ? "success" : row.monthsDelta < 0 ? "warning" : "neutral"}>
                          {row.monthsDelta > 0 ? `${row.monthsDelta} months earlier` : row.monthsDelta < 0 ? `${Math.abs(row.monthsDelta)} months later` : "No change"}
                        </Badge>
                      </div>
                      <div style={{ ...TYPE_SCALE.caption, color: row.monthsDelta > 0 ? ttzPalette.go : row.monthsDelta < 0 ? ttzPalette.wa : ttzPalette.tx2, marginTop: 10 }}>
                        {row.monthsDelta > 0 ? "Paid off faster with extra money applied." : row.monthsDelta < 0 ? "Payoff order shifts later." : "No change yet."}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP, marginBottom: 0 }}>Once you preview a scenario, we’ll show which debts move sooner, later, or stay flat.</p>
              )}
            </Card>

      {otherStrategies ? (
        <Card variant="default" className="ttz-whatif-summary" style={{ gridColumn: "2 / span 2" }}>
          <div style={{ display: "grid", gap: GAP }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconBadge icon={PieChart} tone="ac" size="sm" />
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Scenario vs other strategies</div>
            </div>
            <div className="ttz-whatif-strategy-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr)) minmax(280px, 1.2fr)", gap: GAP, alignItems: "stretch" }}>
              {strategyComparisonTiles.map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: `1px solid ${tile.tone === "green" ? ttzPalette.goD : ttzPalette.border}`,
                    background: tile.tone === "green" ? ttzPalette.goD : ttzPalette.surf2,
                  }}
                >
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>{tile.label}</div>
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 2 }}>{tile.supporting}</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                    <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Interest vs current plan</div>
                    <div style={{ ...TYPE_SCALE.body, color: tile.tone === "green" ? ttzPalette.go : ttzPalette.tx }}>{tile.active && tile.tone === "green" && interestDelta ? `${interestDelta.value?.toFixed(1) || "0"}%` : "Baseline"}</div>
                    <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Months to $0</div>
                    <div style={{ ...TYPE_SCALE.body, color: tile.tone === "green" ? ttzPalette.go : ttzPalette.tx }}>{tile.monthsToZero != null ? `${tile.monthsToZero} months` : "n/a"}</div>
                    <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{tile.projectedZeroDate}</div>
                  </div>
                </div>
              ))}

              <div style={{ padding: 18, borderRadius: 18, border: `1px solid ${ttzPalette.goD}`, background: `linear-gradient(180deg, ${ttzPalette.goD} 0%, ${ttzPalette.surf} 100%)`, display: "grid", gap: 10, alignContent: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <IconBadge icon={Trophy} tone="go" size="sm" />
                  <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Best scenario read</div>
                </div>
                <p style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, margin: 0 }}>
                  {bestOtherStrategy
                    ? `This scenario beats current ${strategyContextLabel} by ${monthsSaved != null ? monthsSaved : 0} months`
                    : "We’ll compare your strongest what-if outcome here."}
                </p>
                <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>
                  {bestOtherStrategy
                    ? `Projected ${bestOtherStrategy.preview.projectedZeroDate} and narrows the gap with ${bestOtherStrategy.label}.`
                    : "Run a preview to rank the scenarios side by side."}
                </p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
      </div>
    </div>
  );
}

// GATE-10B.1D: classifyGoalDateFeasibility is a disclosed, plan-internal
// heuristic (no income/budget field exists anywhere in this domain to base
// a real affordability judgment on) - the label/tone below say "how big a
// stretch is this relative to your current payment," never "you can afford
// this."
const FEASIBILITY_TONE = { comfortable: "success", achievable: "info", tight: "warning", infeasible: "danger" };
const FEASIBILITY_LABEL = { comfortable: "Comfortable increase", achievable: "Achievable", tight: "A significant stretch", infeasible: "Not realistic right now" };

// GATE-10B.1E: Finish By's "Impact level" badge - a disclosed, documented
// heuristic bucketing derivePerDebtImpactRows' own already-computed
// monthsDelta, not a fabricated severity score. Matches this page's
// existing "plan-internal heuristic, not certified advice" disclosure.
function impactLevelForMonthsDelta(monthsDelta) {
  if (monthsDelta >= 12) return "High";
  if (monthsDelta >= 3) return "Medium";
  return "Low";
}
const IMPACT_LEVEL_TONE = { High: "da", Medium: "wa", Low: "neutral" };

const SUSTAINABILITY_CHECKLIST = [
  "Automate the extra payment so it never depends on remembering",
  "Review progress monthly against this target",
  "Avoid taking on new debt while working toward this date",
  "Keep a separate emergency fund so a surprise expense doesn't derail the plan",
];

function FinishByView({ snapshot, service, refresh, runAction, writeState }) {
  const [targetMonth, setTargetMonth] = useState("");
  const [targetDebtId, setTargetDebtId] = useState("");
  const [result, setResult] = useState(null);
  const [scenarioName, setScenarioName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const workspaceId = snapshot.workspace.id;
  const debtOptions = [{ id: "", name: "All included debts" }, ...(snapshot.payoffQueue || [])];
  // GATE-10B.1: previously called service.applyReforecast unconditionally,
  // which requires a pre-existing active plan/version - a workspace with no
  // active plan yet would throw "No active plan to reforecast" here too
  // (same class of bug as ScenarioCard.apply, see applyPlanChange's own
  // comment in planActivation.js).
  const hasActivePlan = !!snapshot.activeContext?.version;

  // GATE-10B.1D: detailed:true - baseline/scenario now come back with the
  // SAME buildPlanPreviewFromDebts-shaped projection/perDebt every other
  // page's chart uses, over the exact scopedDebts/strategy the binary
  // search itself already used to reach this answer, so the chart/
  // per-debt table below can never disagree with the metrics above them.
  const check = () => runAction("check feasibility", async () => {
    if (!targetMonth) return;
    const preview = await service.previewGoalDate(workspaceId, { targetMonth, targetDebtId: targetDebtId || undefined, detailed: true });
    setResult(preview);
  }, { write: false });

  const applyIt = () => runAction("apply finish by", async () => {
    const overrides = { extraMonthlyPayment: result.requiredMonthlyExtra };
    await applyPlanChange(service, workspaceId, hasActivePlan, { draftOverrides: overrides, reforecastOverrides: overrides });
    setConfirmOpen(false);
    setResult(null);
    await refresh();
  });

  const saveScenarioIt = () => runAction("save scenario", async () => {
    const name = scenarioName.trim() || `Finish by ${formatMonthLabel(targetMonth)}`;
    await service.saveScenario(workspaceId, { name, type: "goal_date", inputs: { targetMonth, targetDebtId: targetDebtId || undefined } });
    setScenarioName("");
  });

  const feasibility = result && result.valid !== false ? classifyGoalDateFeasibility(result) : null;
  const chartSeries = result?.baseline ? [
    { id: "baseline", label: "Current pace", colorToken: "muted", dashed: true, points: toBalancePoints(result.baseline.projection), payoffMonth: result.baseline.projectedZeroDate || undefined },
    { id: "scenario", label: "Finish-by plan", colorToken: "ac", points: toBalancePoints(result.scenario.projection), payoffMonth: result.scenario.projectedZeroDate || undefined },
  ] : [];
  const interestDelta = result?.baseline ? safePercentDelta(result.baseline.estimatedInterest, result.scenario.estimatedInterest) : null;
  const interestDeltaMoney = result?.baseline ? Math.abs(Number(result.scenario?.estimatedInterest || 0) - Number(result.baseline?.estimatedInterest || 0)) : 0;
  const impactRows = result?.baseline ? derivePerDebtImpactRows(result.baseline.perDebt, result.scenario.perDebt, snapshot.payoffQueue || []).slice(0, 5) : [];
  const allocation = result?.feasible ? deriveAllocationSegments(snapshot.payoffQueue || [], result.requiredMonthlyExtra || 0) : null;
  // GATE-10B.1D's previewGoalDate defaults to "avalanche" internally when no
  // plan is active yet (its own baseVersion?.strategy || "avalanche") - this
  // mirrors that exact fallback so the "Pro tip" copy is never a guess.
  const goalStrategyLabel = (snapshot.activeContext?.version?.strategy || "avalanche") === "snowball" ? "Snowball" : "Avalanche";
  const targetDateLabel = result?.targetMonth ? formatMonthLabel(result.targetMonth) : "Choose a month";
  const currentZeroDate = result?.projectedZeroDate || result?.nearestFeasibleZeroDate || "Preview needed";
  const additionalNeeded = Math.max(0, Number(result?.additionalNeeded || 0));
  const requiredMonthly = Number(result?.requiredMonthlyExtra || 0);
  const finishMonthsSooner = result?.baseline?.monthsToZero != null && result?.scenario?.monthsToZero != null
    ? Math.max(0, result.baseline.monthsToZero - result.scenario.monthsToZero)
    : 0;

  const scenarioControls = (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>1. Scenario controls</div>
      <div className="ttz-finish-control-fields" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, .85fr) auto", gap: GAP, marginTop: GAP, alignItems: "end" }}>
        <Field label="Target debt-free month">
          <Input type="month" value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value); setResult(null); }} />
        </Field>
        <Field label="Debt (optional - defaults to all included debts)">
          <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setResult(null); }}>
            {debtOptions.map((debt) => (
              <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Strategy (optional)">
          <Input value={goalStrategyLabel} readOnly aria-label="Strategy used for this finish-by preview" />
        </Field>
        <Button variant="primary" onClick={check} disabled={!targetMonth || writeState.inProgress} loading={writeState.action === "check feasibility"}>Check feasibility</Button>
      </div>
    </Card>
  );

  const proTip = (
    <Card variant="default" style={{ borderLeft: `3px solid ${ttzPalette.wa}`, background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <IconBadge icon={Lightbulb} tone="warning" size="sm" />
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.wa }}>Pro tip</div>
      </div>
      <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: "10px 0 0" }}>
        Extra payments use {goalStrategyLabel} by default, so your highest-impact debt gets the first boost.
      </p>
    </Card>
  );

  const finishFlow = (
    <Card variant="default" style={{
      background: `linear-gradient(120deg, ${ttzPalette.surf2} 0%, ${ttzPalette.acS || ttzPalette.surf} 100%)`,
      borderColor: result?.feasible ? ttzPalette.go : ttzPalette.border,
    }}>
      <div className="ttz-finish-flow" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1.2fr)", alignItems: "center", gap: 20 }}>
        <IconBadge icon={Target} tone="go" size="lg" />
        <div><div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Target debt-free month</div><div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.go, marginTop: 4 }}>{targetDateLabel}</div></div>
        <ArrowRight aria-hidden="true" color={ttzPalette.ac} size={28} />
        <div><div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Current projected $0 date</div><div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.ac, marginTop: 4 }}>{currentZeroDate}</div></div>
        <ArrowRight aria-hidden="true" color={ttzPalette.ac} size={28} />
        <div><div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Feasibility status</div><div style={{ ...TYPE_SCALE.cardTitle, color: result?.feasible ? ttzPalette.go : ttzPalette.wa, marginTop: 4 }}>{feasibility ? FEASIBILITY_LABEL[feasibility] : "Let's check it"}</div><div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 4 }}>Based on the payment details in your plan.</div></div>
      </div>
    </Card>
  );

  return (
    <div style={{ display: "grid", gap: GAP }}>
      {finishFlow}
      {false && result && result.valid !== false ? (
        <InsightBanner
          icon={Flag}
          tone={result.feasible ? "go" : "wa"}
          headline="Target debt-free month → Current projected $0 → Feasibility"
          detail={`${formatMonthLabel(result.targetMonth)}  →  ${result.projectedZeroDate || result.nearestFeasibleZeroDate || "n/a"}  →  ${feasibility ? FEASIBILITY_LABEL[feasibility] : "Checking"}`}
        />
      ) : null}

      <div className="ttz-finish-controls" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, .32fr)", gap: GAP }}>
        {scenarioControls}
        {proTip}
      </div>

      {result && result.valid === false ? (
        <WarningCallout>{result.reason || "Choose a target date in the future."}</WarningCallout>
      ) : null}

      {result && result.valid !== false ? (
          <Card
            variant={result.feasible ? "highlight" : "default"}
            style={{
              background: result.feasible
                ? `linear-gradient(180deg, ${ttzPalette.goD || ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`
                : `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
              boxShadow: "var(--ttz-shadow-md)",
            }}
          >
          {result.feasible ? (
            <div style={{ display: "grid", gap: GAP }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Your finish-by plan</div>
                {feasibility ? <Badge tone={FEASIBILITY_TONE[feasibility]}>{FEASIBILITY_LABEL[feasibility]}</Badge> : null}
              </div>
              <div className="ttz-finish-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: GAP }}>
                <PlanMetric label="Current projected $0 date" value={result.projectedZeroDate || "n/a"} icon={Calendar} />
                <PlanMetric label="Target date" value={formatMonthLabel(result.targetMonth)} tone="success" icon={Target} />
                <PlanMetric label="Additional monthly needed" value={`+${money(additionalNeeded)}/mo`} tone={additionalNeeded > 0 ? "warning" : "success"} icon={TrendingUp} />
                <PlanMetric label="Interest savings" value={money(interestDeltaMoney)} tone="success" icon={DollarSign} />
                <PlanMetric label="Required total monthly" value={`${money(requiredMonthly)}/mo`} tone="accent" icon={Wallet} />
              </div>
              <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, margin: 0 }}>{describePercentDelta(interestDelta, interestDeltaMoney)}</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: GAP }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>That target is not realistic right now</div>
                {feasibility ? <Badge tone={FEASIBILITY_TONE[feasibility]}>{FEASIBILITY_LABEL[feasibility]}</Badge> : null}
              </div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>{result.reason || "The current plan would need a larger payment than is realistic."}</p>
              <PlanMetric label="Nearest feasible date at your current pace" value={result.nearestFeasibleZeroDate || "n/a"} />
            </div>
          )}
        </Card>
      ) : null}

      {false && result?.feasible && result.baseline ? (
        <>
          <Card variant="default">
            <TrendChart title="Balance to $0" subtitle="Current pace vs the payment this target requires." series={chartSeries} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: GAP }}>
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan comparison</div>
              <div style={{ overflowX: "auto", marginTop: GAP }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }} />
                      <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Current plan</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.ac, fontWeight: 800 }}>Finish-by scenario</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Months to $0", String(result.baseline.monthsToZero ?? "n/a"), String(result.scenario.monthsToZero ?? "n/a"), result.baseline.monthsToZero != null && result.scenario.monthsToZero != null ? `${result.baseline.monthsToZero - result.scenario.monthsToZero}` : "n/a"],
                      ["Payoff date", result.baseline.projectedZeroDate || "n/a", result.scenario.projectedZeroDate || "n/a", monthLabelDeltaText(result.baseline.projectedZeroDate, result.scenario.projectedZeroDate) || "Same"],
                      ["Total interest", money(result.baseline.estimatedInterest), money(result.scenario.estimatedInterest), `-${money(interestDeltaMoney)}`],
                      ["Total paid", money(Number(result.baseline.startingTotalBalance || 0) + Number(result.baseline.estimatedInterest || 0)), money(Number(result.scenario.startingTotalBalance || 0) + Number(result.scenario.estimatedInterest || 0)), ""],
                      ["Monthly payment", money(result.currentMonthlyExtra || 0), money(result.requiredMonthlyExtra || 0), `+${money(Math.max(0, result.additionalNeeded || 0))}`],
                    ].map(([rowLabel, current, scenario, change]) => (
                      <tr key={rowLabel}>
                        <td style={{ padding: "6px 8px", ...TYPE_SCALE.caption, color: ttzPalette.tx2, borderTop: `1px solid ${ttzPalette.border}` }}>{rowLabel}</td>
                        <td style={{ padding: "6px 8px", ...TYPE_SCALE.body, color: ttzPalette.tx, borderTop: `1px solid ${ttzPalette.border}` }}>{current}</td>
                        <td style={{ padding: "6px 8px", ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700, borderTop: `1px solid ${ttzPalette.border}` }}>{scenario}</td>
                        <td style={{ padding: "6px 8px", ...TYPE_SCALE.body, color: ttzPalette.go, borderTop: `1px solid ${ttzPalette.border}` }}>{change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {allocation?.segments.length ? (
              <Card variant="default">
                <AllocationDonut
                  title="Payment allocation"
                  subtitle="What the required payment would go toward."
                  segments={allocation.segments}
                  centerLabel={money(allocation.total)}
                  centerSupporting="per month"
                />
              </Card>
            ) : null}
          </div>

          {impactRows.length ? (
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Most-impacted debts</div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4, marginBottom: GAP }}>Top {impactRows.length} debt{impactRows.length === 1 ? "" : "s"} most affected by this target, biggest change first.</p>
              <PerDebtImpactTable rows={impactRows} showImpactLevel />
            </Card>
          ) : null}

          <Card variant="default">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconBadge icon={ShieldCheck} tone="go" size="sm" />
              <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.go }}>Make it sustainable</div>
            </div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
              {SUSTAINABILITY_CHECKLIST.map((item) => (
                <li key={item} style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{item}</li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {result?.feasible && result.baseline ? (
        <>
          <div className="ttz-finish-main-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(250px, .56fr) minmax(300px, .7fr)", gap: GAP }}>
            <Card variant="default">
              <TrendChart title="Balance to $0 over time" subtitle="Current pace vs the payment this target requires." series={chartSeries} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: ttzPalette.go, ...TYPE_SCALE.caption }}>
                <CheckCircle2 size={16} />
                Stay on track with this payment and you’ll be debt-free {finishMonthsSooner ? `${finishMonthsSooner} months earlier.` : "on your target date."}
              </div>
            </Card>
            {allocation?.segments.length ? (
              <Card variant="default">
                <AllocationDonut title="Payment allocation in finish-by plan" subtitle="Where the required payment goes." segments={allocation.segments} centerLabel={money(allocation.total)} centerSupporting="per month" />
              </Card>
            ) : <Card variant="default"><EmptyState title="Payment allocation" description="Run a feasible preview to see the split." /></Card>}
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan comparison</div>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ textAlign: "left", padding: "6px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }} />
                    <th style={{ textAlign: "left", padding: "6px", ...TYPE_SCALE.caption, color: ttzPalette.ac }}>Current plan</th>
                    <th style={{ textAlign: "left", padding: "6px", ...TYPE_SCALE.caption, color: ttzPalette.go }}>Finish-by plan</th>
                    <th style={{ textAlign: "left", padding: "6px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Change</th>
                  </tr></thead>
                  <tbody>{[
                    ["Months to $0", String(result.baseline.monthsToZero ?? "n/a"), String(result.scenario.monthsToZero ?? "n/a"), finishMonthsSooner ? `-${finishMonthsSooner}` : "Same"],
                    ["Payoff date", result.baseline.projectedZeroDate || "n/a", result.scenario.projectedZeroDate || "n/a", monthLabelDeltaText(result.baseline.projectedZeroDate, result.scenario.projectedZeroDate) || "Same"],
                    ["Total interest", money(result.baseline.estimatedInterest), money(result.scenario.estimatedInterest), `-${money(interestDeltaMoney)}`],
                    ["Monthly payment", money(result.currentMonthlyExtra || 0), money(result.requiredMonthlyExtra || 0), `+${money(additionalNeeded)}`],
                  ].map(([label, current, scenario, change]) => <tr key={label}>
                    <td style={{ padding: "8px 6px", borderTop: `1px solid ${ttzPalette.border}`, ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{label}</td>
                    <td style={{ padding: "8px 6px", borderTop: `1px solid ${ttzPalette.border}`, ...TYPE_SCALE.caption, color: ttzPalette.tx }}>{current}</td>
                    <td style={{ padding: "8px 6px", borderTop: `1px solid ${ttzPalette.border}`, ...TYPE_SCALE.caption, color: ttzPalette.go }}>{scenario}</td>
                    <td style={{ padding: "8px 6px", borderTop: `1px solid ${ttzPalette.border}`, ...TYPE_SCALE.caption, color: ttzPalette.go }}>{change}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <Button variant="secondary" style={{ marginTop: 10, width: "100%" }} onClick={() => navigateToPlanDestination("compare")}>View details</Button>
            </Card>
          </div>

          <div className="ttz-finish-bottom-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, .62fr) minmax(230px, .42fr)", gap: GAP }}>
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Top debts most impacted by this plan</div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: "4px 0 10px" }}>The balances this target changes most, biggest shift first.</p>
              {impactRows.length ? <PerDebtImpactTable rows={impactRows} showImpactLevel /> : <EmptyState title="No debt changes yet" description="Run a preview with a target date to compare each debt." />}
            </Card>
            <Card variant="default" style={{ borderColor: ttzPalette.wa }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}><IconBadge icon={Sparkles} tone="warning" size="sm" /><div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Recommended action</div></div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, margin: "18px 0" }}>
                {additionalNeeded > 0 ? <>Add <strong style={{ color: ttzPalette.go }}>{money(additionalNeeded)}/month</strong> to finish <strong style={{ color: ttzPalette.ac }}>{finishMonthsSooner} months earlier.</strong></> : "You’re already on pace for this target."}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {additionalNeeded > 0 ? <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState.inProgress}>Apply this plan</Button> : <Badge tone="success">Already on pace</Badge>}
                <Input value={scenarioName} placeholder="Scenario name" onChange={(event) => setScenarioName(event.target.value)} />
                <Button variant="secondary" onClick={saveScenarioIt} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
              </div>
            </Card>
            <Card variant="default">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><IconBadge icon={ShieldCheck} tone="go" size="sm" /><div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Make it sustainable</div></div>
              <ul style={{ margin: "14px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                {SUSTAINABILITY_CHECKLIST.map((item) => <li key={item} style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{item}</li>)}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      <ConfirmationDialog
        open={confirmOpen}
        title={hasActivePlan ? "Apply this to your real plan?" : "Start this payoff plan?"}
        confirmLabel={writeState.action === "apply finish by" ? "Applying..." : "Apply"}
        onConfirm={applyIt}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{hasActivePlan ? "This creates a new plan version. Your current plan is kept in your plan history, never overwritten." : "This will make this payment increase your active plan. You can reforecast later as balances, payments, or goals change."}</p>
        {result ? (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Extra payment becomes <strong>{money(result.requiredMonthlyExtra)}/mo</strong>, projected payoff <strong>{result.projectedZeroDate}</strong>.
          </p>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}

const WHATIF_SCENARIO_TYPES = ["recurring_extra", "one_time", "custom_target"];

function SavedScenariosView({ snapshot, service, refresh, runAction, writeState }) {
  const [scenarios, setScenarios] = useState(null);
  const [planHistory, setPlanHistory] = useState(null);
  const [previewsById, setPreviewsById] = useState({});
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showTopCompare, setShowTopCompare] = useState(false);
  const workspaceId = snapshot.workspace.id;

  const reloadScenarios = () => {
    service.listWorkspaceScenarios(workspaceId, { includeArchived: true }).then((result) => setScenarios(result || []));
  };

  useEffect(() => {
    let active = true;
    service.listWorkspaceScenarios(workspaceId, { includeArchived: true }).then((result) => { if (active) setScenarios(result || []); });
    service.listPlanHistory(workspaceId).then((result) => { if (active) setPlanHistory(result || []); });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (scenarios === null) return <LoadingState label="Loading saved scenarios" />;

  const hasActivePlan = !!snapshot.activeContext?.version;
  const activeVersion = snapshot.activeContext?.version;

  const handlePreviewed = (scenarioId, result) => {
    setPreviewsById((current) => ({ ...current, [scenarioId]: result }));
  };
  const toggleSelect = (scenarioId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(scenarioId)) next.delete(scenarioId); else next.add(scenarioId);
      return next;
    });
  };
  const onCardChanged = (scenarioId) => () => {
    reloadScenarios();
    setPreviewsById((current) => {
      if (!(scenarioId in current)) return current;
      const next = { ...current };
      delete next[scenarioId];
      return next;
    });
    setSelectedIds((current) => {
      if (!current.has(scenarioId)) return current;
      const next = new Set(current);
      next.delete(scenarioId);
      return next;
    });
  };

  // GATE-10B.1D: "best option right now"/"Compare selected"/"Compare Top 3"
  // are all computed ONLY over scenarios already previewed THIS session
  // (previewsById, populated as each ScenarioCard's own "View" button is
  // clicked) - never a background preview burst across every saved
  // scenario on page load. A disclosed scope limit, not an oversight.
  const previewedEntries = Object.entries(previewsById).map(([scenarioId, result]) => {
    const scenario = scenarios.find((item) => item.id === scenarioId) || result.scenario;
    return { scenario, preview: scenarioPreviewForChart(scenario, result.preview) };
  });
  const validPreviewedEntries = previewedEntries.filter((entry) => entry.preview?.projectedZeroDate);
  const bestOption = pickBestByZeroDate(previewedEntries);
  const rankedEntries = [...validPreviewedEntries].sort((a, b) => {
    const timeA = new Date(`1 ${a.preview.projectedZeroDate}`).getTime();
    const timeB = new Date(`1 ${b.preview.projectedZeroDate}`).getTime();
    return timeA !== timeB ? timeA - timeB : Number(a.preview.estimatedInterest || 0) - Number(b.preview.estimatedInterest || 0);
  });
  const top3Entries = rankedEntries.slice(0, 3);
  const compareEntries = [...selectedIds]
    .map((scenarioId) => previewedEntries.find((entry) => entry.scenario?.id === scenarioId))
    .filter((entry) => entry?.preview);

  const activeScenarios = scenarios.filter((scenario) => scenario.status !== "archived");
  const archivedScenarios = scenarios.filter((scenario) => scenario.status === "archived");
  const strategySnapshots = activeScenarios.filter((scenario) => scenario.type === "strategy_comparison");
  const whatIfScenarios = activeScenarios.filter((scenario) => WHATIF_SCENARIO_TYPES.includes(scenario.type));
  const finishByScenarios = activeScenarios.filter((scenario) => scenario.type === "goal_date");
  const renderScenarioCard = (scenario, { isArchived = false } = {}) => (
    <ScenarioCard
      key={scenario.id}
      scenario={scenario}
      service={service}
      workspaceId={workspaceId}
      currentZeroDate={snapshot.projectedZeroDate}
      hasActivePlan={hasActivePlan}
      runAction={runAction}
      writeState={writeState}
      refresh={refresh}
      onChanged={onCardChanged(scenario.id)}
      onPreviewed={handlePreviewed}
      selected={selectedIds.has(scenario.id)}
      onToggleSelect={toggleSelect}
      isArchived={isArchived}
    />
  );

  const columns = [
    { key: "active", title: "Active Plan", icon: Zap },
    { key: "strategy", title: "Saved Strategy Snapshots", icon: GitCompare },
    { key: "whatif", title: "Saved What-If Scenarios", icon: Sparkles },
    { key: "finishby", title: "Saved Finish-By Targets", icon: Flag },
    { key: "archived", title: "Archived", icon: Archive },
  ];
  const activePlanName = activeVersion
    ? `${activeVersion.strategy === "snowball" ? "Snowball" : "Avalanche"} +${money(Number(activeVersion.extraMonthlyPayment || 0))}/mo`
    : "No active plan";
  const savedBestDate = bestOption?.preview?.projectedZeroDate || "No preview yet";
  const savedBestInterest = validPreviewedEntries.length
    ? Math.min(...validPreviewedEntries.map((entry) => Number(entry.preview.estimatedInterest || Infinity)))
    : null;
  const latestUpdate = planHistory?.[0]?.createdAt
    ? new Date(planHistory[0].createdAt).toLocaleDateString()
    : "No plan changes yet";

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <div className="ttz-saved-summary-ribbon" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: GAP, padding: 14, border: `1px solid ${ttzPalette.border}`, borderRadius: 16, background: `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)` }}>
        <LabelValueRow label="Active plan" value={activePlanName} />
        <LabelValueRow label="Saved scenarios" value={String(activeScenarios.length)} />
        <LabelValueRow label="Archived" value={String(archivedScenarios.length)} />
        <LabelValueRow label="Last updated" value={latestUpdate} />
      </div>

      <div className="ttz-saved-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: GAP }}>
        <PlanMetric label="Active plan" value={activePlanName} tone="accent" icon={Zap} />
        <PlanMetric label="Saved scenarios" value={String(activeScenarios.length)} icon={Sparkles} />
        <PlanMetric label="Best projected payoff date" value={savedBestDate} tone="success" icon={Calendar} />
        <PlanMetric label="Best interest outcome" value={savedBestInterest == null ? "No preview yet" : money(savedBestInterest)} tone="success" icon={DollarSign} />
        <PlanMetric label="Archived items" value={String(archivedScenarios.length)} tone="warning" icon={Archive} />
      </div>

      <div className="ttz-saved-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.9fr) minmax(260px, .56fr)", gap: GAP, alignItems: "start" }}>
        <div style={{ display: "grid", gap: GAP }}>
          {!activeScenarios.length && !archivedScenarios.length ? (
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No saved scenarios yet</div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8, marginBottom: 0 }}>
                Save a what-if, goal-date, or strategy idea to compare it later. Saved scenarios stay preview-only until you explicitly apply one.
              </p>
            </Card>
          ) : null}

          {/* GATE-10B.1E: the board always renders, even with zero saved
              scenarios - "Active Plan" reflects real plan state, not
              scenario state, so it stays useful/visible regardless of
              whether anything's been saved yet. Each column already has its
              own honest "None saved yet." fallback. */}
          <div className="ttz-saved-board" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: GAP, alignItems: "start" }}>
            {columns.map((column) => (
              <div key={column.key} style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <IconBadge icon={column.icon} tone="ac" size="sm" />
                  <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{column.title}</div>
                  <Badge tone="neutral" style={{ marginLeft: "auto" }}>{column.key === "strategy" ? strategySnapshots.length : column.key === "whatif" ? whatIfScenarios.length : column.key === "finishby" ? finishByScenarios.length : column.key === "archived" ? archivedScenarios.length : activeVersion ? 1 : 0}</Badge>
                </div>
                {column.key === "active" ? (
                  activeVersion ? (
                    <Card variant="highlight">
                      <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{activeVersion.strategy === "snowball" ? "Snowball" : "Avalanche"} active</div>
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        <LabelValueRow label="Projected $0" value={snapshot.projectedZeroDate || "n/a"} />
                        <LabelValueRow label="Extra/mo" value={money(Number(activeVersion.extraMonthlyPayment || 0))} />
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => navigateToPlanDestination("my-plan")} style={{ marginTop: GAP }}>Open My Plan</Button>
                    </Card>
                  ) : (
                    <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>No active plan yet.</p>
                  )
                ) : column.key === "strategy" ? (
                  strategySnapshots.length ? strategySnapshots.map((scenario) => renderScenarioCard(scenario)) : <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>None saved yet.</p>
                ) : column.key === "whatif" ? (
                  whatIfScenarios.length ? whatIfScenarios.map((scenario) => renderScenarioCard(scenario)) : <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>None saved yet.</p>
                ) : column.key === "finishby" ? (
                  finishByScenarios.length ? finishByScenarios.map((scenario) => renderScenarioCard(scenario)) : <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>None saved yet.</p>
                ) : (
                  archivedScenarios.length ? archivedScenarios.map((scenario) => renderScenarioCard(scenario, { isArchived: true })) : <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Nothing archived.</p>
                )}
              </div>
            ))}
          </div>

        </div>

        <div style={{ display: "grid", gap: GAP, position: "sticky", top: 16 }}>
          <Card variant="default">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconBadge icon={Sparkles} tone="ac" size="sm" />
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Saved insight</div>
            </div>
            {bestOption ? (
              <div style={{ marginTop: GAP }}>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Best option right now</div>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginTop: 4 }}>{bestOption.scenario?.name || "Scenario"}</div>
                <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6, marginBottom: 0 }}>
                  Projected $0 <strong>{bestOption.preview.projectedZeroDate}</strong> - earliest among the {validPreviewedEntries.length} scenario{validPreviewedEntries.length === 1 ? "" : "s"} you&apos;ve previewed this session.
                </p>
              </div>
            ) : (
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP }}>Preview a saved scenario (click &quot;View&quot;) to start building insight here.</p>
            )}

            {validPreviewedEntries.length ? (
              <div style={{ marginTop: GAP }}>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted, marginBottom: 6 }}>How it compares</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Scenario</th>
                        <th style={{ textAlign: "left", padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Payoff</th>
                        <th style={{ textAlign: "left", padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>Interest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedEntries.map((entry) => (
                        <tr key={entry.scenario.id}>
                          <td style={{ padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx, borderTop: `1px solid ${ttzPalette.border}` }}>{entry.scenario.name}</td>
                          <td style={{ padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx, borderTop: `1px solid ${ttzPalette.border}` }}>{entry.preview.projectedZeroDate}</td>
                          <td style={{ padding: "4px 6px", ...TYPE_SCALE.caption, color: ttzPalette.tx, borderTop: `1px solid ${ttzPalette.border}` }}>{money(entry.preview.estimatedInterest || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {validPreviewedEntries.length ? (
              <div style={{ marginTop: GAP }}>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted, marginBottom: 6 }}>Payoff date trend</div>
                <PayoffDateTrendMini entries={rankedEntries.map((entry) => ({ id: entry.scenario.id, label: entry.scenario.name, date: entry.preview.projectedZeroDate }))} />
              </div>
            ) : null}

            {top3Entries.length >= 2 ? (
              <Button variant="secondary" onClick={() => setShowTopCompare(true)} style={{ marginTop: GAP, width: "100%" }}>Compare Top {top3Entries.length}</Button>
            ) : null}
          </Card>
        </div>
      </div>

      {planHistory?.length ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan history timeline</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4, marginBottom: GAP }}>Every activated or reforecast version of your plan, oldest to newest. This is your plan&apos;s own history, separate from the saved scenarios above.</p>
          <PlanHistoryTimeline versions={planHistory} />
        </Card>
      ) : null}

      {showTopCompare && top3Entries.length >= 2 ? (
        <MultiScenarioCompareCard
          title={`Top ${top3Entries.length} Scenarios`}
          subtitle="The best-ranked scenarios you've previewed this session, side by side."
          entries={top3Entries.map((entry) => ({ label: entry.scenario.name, previewResult: entry.preview }))}
        />
      ) : null}

      {compareEntries.length >= 2 ? (
        <MultiScenarioCompareCard
          title="Compare selected scenarios"
          subtitle="Scenarios you've checked Compare on, side by side."
          entries={compareEntries.map((entry) => ({ label: entry.scenario.name, previewResult: entry.preview }))}
        />
      ) : selectedIds.size === 1 ? (
        <InfoCallout>Select at least one more previewed scenario to compare.</InfoCallout>
      ) : null}
    </div>
  );
}

const APPLICABLE_SCENARIO_TYPES = ["recurring_extra", "strategy_comparison", "goal_date"];
const SCENARIO_TYPE_LABELS = {
  recurring_extra: "Recurring extra payment",
  one_time: "One-time payment",
  custom_target: "Custom target debt",
  goal_date: "Finish-by date",
  strategy_comparison: "Strategy switch",
};

// Each scenario type's preview comes back in its own natural shape
// (previewReforecast/previewOneTimePayment/previewCustomTarget/
// previewGoalDate/compareStrategies each already return exactly what their
// own tab shows) - this just picks the one "where would this land"
// headline figure out of that shape rather than reshaping the trusted
// service output into something new.
const scenarioProjectedZeroDate = (scenario, preview) => {
  if (!preview) return "";
  if (scenario.type === "recurring_extra") return preview.proposedZeroDate || "";
  if (scenario.type === "one_time") return preview.withLumpSum?.projectedZeroDate || "";
  if (scenario.type === "custom_target") return preview.custom?.projectedZeroDate || "";
  if (scenario.type === "goal_date") return preview.projectedZeroDate || preview.nearestFeasibleZeroDate || "";
  if (scenario.type === "strategy_comparison") return preview[scenario.inputs?.strategy]?.projectedZeroDate || "";
  return "";
};

// GATE-10B.1D: each scenario type's getScenarioPreview({detailed:true})
// result comes back in its own natural shape (same as
// scenarioProjectedZeroDate above) - this picks out the ONE
// buildPlanPreviewFromDebts-shaped sub-object each type actually has
// {projectedZeroDate, projection, perDebt, estimatedInterest}, so
// MultiScenarioCompareCard/pickBestByZeroDate can work identically across
// every scenario type without re-deriving their own math. Returns null
// (never a fabricated number) whenever the scenario type has no such
// object yet - e.g. an infeasible goal_date has no "scenario" to chart.
function scenarioPreviewForChart(scenario, preview) {
  if (!preview) return null;
  if (scenario.type === "recurring_extra") {
    if (!preview.projection?.length) return null;
    return {
      projectedZeroDate: preview.proposedZeroDate || "",
      projection: preview.projection,
      perDebt: preview.perDebt || {},
      estimatedInterest: preview.projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
    };
  }
  if (scenario.type === "one_time") return preview.withLumpSum || null;
  if (scenario.type === "custom_target") return preview.custom || null;
  if (scenario.type === "goal_date") return preview.feasible ? preview.scenario : null;
  if (scenario.type === "strategy_comparison") return preview[scenario.inputs?.strategy] || null;
  return null;
}

// GATE-10B.1E: renders Plan History through the new shared HistoryTimeline
// primitive instead of a plain vertical list - reshapes the SAME real
// listPlanHistory data (newest-first) into oldest-first icon-node entries,
// never fabricating an event that isn't a real, already-recorded PlanVersion.
function PlanHistoryTimeline({ versions }) {
  const strategyLabel = (strategy) => (strategy === "avalanche" ? "Avalanche" : strategy === "snowball" ? "Snowball" : strategy || "Custom");
  const chronological = [...versions].reverse();
  const entries = chronological.map((version, index) => {
    const previous = chronological[index - 1];
    const delta = previous ? monthLabelDeltaText(previous.projectedZeroDate, version.projectedZeroDate) : "";
    const isReforecast = version.createdBecause === "reforecast";
    return {
      id: version.id,
      icon: isReforecast ? FlaskConical : Flag,
      tone: isReforecast ? "info" : "go",
      date: version.createdAt ? new Date(version.createdAt).toLocaleDateString() : "",
      title: `Version ${version.versionNumber} · ${strategyLabel(version.strategy)}`,
      description: `${money(Number(version.extraMonthlyPayment || 0))}/mo · Projected $0: ${version.projectedZeroDate || "n/a"}${delta ? ` (${delta})` : ""}`,
    };
  });
  return <HistoryTimeline entries={entries} />;
}

// GATE-10B.1E: Saved's "Payoff date trend" - a genuinely real chart (this
// was explicitly deferred as "not built" in GATE-10B.1D), plotting each
// previewed-this-session scenario's own projectedZeroDate against when it
// was previewed. This is NOT TrendChart (that's balance-over-month; this
// axis is date-over-preview-order), so it's its own small, honest,
// dependency-free SVG rather than forcing an incompatible shape into
// TrendChart. Colors resolved from ttzPalette inside the render body.
function PayoffDateTrendMini({ entries }) {
  const palette = ttzPalette;
  const parsed = entries
    .map((entry) => ({ ...entry, time: new Date(`1 ${entry.date}`).getTime() }))
    .filter((entry) => !Number.isNaN(entry.time));
  if (parsed.length < 2) {
    return <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: 0 }}>Preview at least 2 scenarios this session to see a trend.</p>;
  }
  const width = 320;
  const height = 130;
  const pad = 22;
  const times = parsed.map((p) => p.time);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const scaleX = (index) => pad + (parsed.length > 1 ? (index / (parsed.length - 1)) * (width - pad * 2) : 0);
  // Earlier payoff date (a "better" outcome) plots higher (smaller y) - an
  // upward-trending line reads as "getting better," matching how every
  // other chart in this app treats a lower balance/earlier date as good.
  const scaleY = (time) => (maxT === minT ? height / 2 : pad + ((time - minT) / (maxT - minT)) * (height - pad * 2));
  const path = parsed.map((p, index) => `${index === 0 ? "M" : "L"} ${scaleX(index)} ${scaleY(p.time)}`).join(" ");
  const summary = parsed.map((p) => `${p.label}: ${p.date}`).join(", ");

  return (
    <div role="img" aria-label={`Payoff date trend across ${parsed.length} previewed scenarios: ${summary}`}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path d={path} fill="none" stroke={palette.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {parsed.map((p, index) => (
          <circle key={p.id || index} cx={scaleX(index)} cy={scaleY(p.time)} r={4} fill={palette.surf} stroke={palette.ac} strokeWidth="2" />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>
        <span>{parsed[0].label}</span>
        <span>{parsed.at(-1).label}</span>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, service, workspaceId, currentZeroDate, hasActivePlan, runAction, writeState, refresh, onChanged, onPreviewed, selected = false, onToggleSelect, isArchived = false }) {
  const [loaded, setLoaded] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canApply = APPLICABLE_SCENARIO_TYPES.includes(scenario.type);

  const load = () => runAction("preview scenario", async () => {
    const result = await service.getScenarioPreview(workspaceId, scenario.id);
    setLoaded(result);
    onPreviewed?.(scenario.id, result);
  }, { write: false });

  const archive = () => runAction("archive scenario", async () => {
    await service.archiveScenario(workspaceId, scenario.id);
    onChanged();
  });

  const apply = () => runAction("apply scenario", async () => {
    await service.applyScenario(workspaceId, scenario.id);
    setConfirmOpen(false);
    setLoaded(null);
    await refresh();
  });

  const previewZeroDate = scenarioProjectedZeroDate(scenario, loaded?.preview);
  const deltaText = monthLabelDeltaText(currentZeroDate, previewZeroDate);
  const chartPreview = loaded ? scenarioPreviewForChart(scenario, loaded.preview) : null;

  return (
    <Card
      variant="default"
      style={{
        background: selected
          ? `linear-gradient(180deg, ${ttzPalette.acS} 0%, ${ttzPalette.surf} 100%)`
          : `linear-gradient(180deg, ${ttzPalette.surf2} 0%, ${ttzPalette.surf} 100%)`,
        border: `1px solid ${selected ? ttzPalette.ac : ttzPalette.border}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{scenario.name}</div>
          <Badge tone="neutral" style={{ marginTop: 6 }}>{SCENARIO_TYPE_LABELS[scenario.type] || scenario.type}</Badge>
        </div>
        {isArchived ? <Badge tone="neutral">Archived</Badge> : loaded?.isStale ? <Badge tone="warning">Plan changed since saved</Badge> : null}
      </div>

      {loaded ? (
        <div style={{ marginTop: GAP, display: "grid", gap: GAP }}>
          {loaded.isStale ? (
            <WarningCallout>Your plan has changed since this was saved, so these numbers may no longer reflect where you actually stand. Re-preview before applying.</WarningCallout>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP }}>
            <PlanMetric label="Projected $0" value={previewZeroDate || "n/a"} tone="accent" />
            <PlanMetric label="Vs. your current plan" value={deltaText || "n/a"} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canApply && !isArchived ? (
              <Button variant="primary" size="sm" disabled={writeState.inProgress} onClick={() => setConfirmOpen(true)}>Apply</Button>
            ) : !canApply ? (
              <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, alignSelf: "center" }}>This kind of scenario is preview-only and can&apos;t be applied directly.</p>
            ) : null}
            {!isArchived ? <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button> : null}
            {chartPreview ? (
              <label style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE_SCALE.caption, color: ttzPalette.tx2, cursor: "pointer" }}>
                <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(scenario.id)} />
                Compare
              </label>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: GAP, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" disabled={writeState.inProgress} loading={writeState.action === "preview scenario"} onClick={load}>View</Button>
          {!isArchived ? <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button> : null}
        </div>
      )}

      <ConfirmationDialog
        open={confirmOpen}
        title={hasActivePlan ? "Apply this to your real plan?" : "Start this payoff plan?"}
        confirmLabel={writeState.action === "apply scenario" ? "Applying..." : "Apply"}
        onConfirm={apply}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{hasActivePlan ? "This creates a new plan version. Your current plan is kept in your plan history, never overwritten." : "This will make this scenario your active plan. You can reforecast later as balances, payments, or goals change."}</p>
        {loaded?.isStale ? <WarningCallout style={{ marginTop: 8 }}>Your plan has changed since this scenario was saved - the numbers above were just re-checked, but double-check they still look right.</WarningCallout> : null}
      </ConfirmationDialog>
    </Card>
  );
}

export default function PlanSection({ snapshot, service, refresh, runAction, writeState, onGoToDebts, reviewSnapshot }) {
  const [destination, setDestination] = useState(() => resolvePlanDestination(typeof window !== "undefined" ? window.location.pathname : "/plan/my-plan"));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncDestination = () => setDestination(resolvePlanDestination(window.location.pathname));
    window.addEventListener("popstate", syncDestination);
    syncDestination();
    return () => window.removeEventListener("popstate", syncDestination);
  }, []);

  const navigate = (nextDestination) => {
    const path = buildPlanPath(nextDestination);
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== path) {
        window.history.pushState({}, "", path);
      }
    }
    setDestination(nextDestination);
  };

  const viewProps = { snapshot, service, refresh, runAction, writeState, onGoToDebts, reviewSnapshot };
  let currentView;
  switch (destination) {
    case "snowball": currentView = <SnowballView {...viewProps} />; break;
    case "avalanche": currentView = <AvalancheView {...viewProps} />; break;
    case "compare": currentView = <CompareStrategiesView {...viewProps} />; break;
    case "what-if": currentView = <WhatIfView {...viewProps} />; break;
    case "finish-by": currentView = <FinishByView {...viewProps} />; break;
    case "scenarios": currentView = <SavedScenariosView {...viewProps} />; break;
    case "my-plan":
    default: currentView = <MyPlanView {...viewProps} />;
  }

  // UX-6.2: workspace-aware voice ("My payoff plan" / "Household payoff
  // plan") as a small overline above the page's own title - adds
  // intentional Personal/Household distinction without discarding the
  // established page title.
  const { planHeading } = getWorkspacePresentation(snapshot.workspace);
  const { title: destinationTitle, subtitle: destinationSubtitle } = DESTINATION_TITLES[destination] || DESTINATION_TITLES["my-plan"];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{planHeading}</div>
        {/* UX-8: the Plan tab previously had zero semantic headings at all
            (every "title" here was a styled div) - this is the one real
            <h1> for the whole tab, rendered once regardless of which
            destination (My Plan/Compare/What If/etc.) is active, matching
            Home/Debts/Activity's existing one-h1-per-page pattern.
            GATE-10B.1E: text is now destination-specific (matching every
            reference design's own page title) instead of one fixed
            "Your path to $0" shared across all 7 tabs - still exactly one
            h1 per page, just accurate to what's actually shown below it. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <h1 style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, margin: 0 }}>{destinationTitle}</h1>
          {destination === "snowball" ? <Badge tone="info">Smallest balance first</Badge> : null}
        </div>
        {destinationSubtitle ? <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6, marginBottom: 0, maxWidth: 720 }}>{destinationSubtitle}</p> : null}
      </div>

      <div className="ttz-plan-tab-strip" role="tablist" aria-label="Plan sections" style={pillTabGroupStyle()}>
        {PLAN_DESTINATIONS.map((item) => {
          const active = destination === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate(item.key)}
              style={pillTabButtonStyle(active)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div>{currentView}</div>
    </div>
  );
}
