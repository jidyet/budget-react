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

const DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT = 5;

// GATE-10B.1D: turns a payoffSimulate*-shaped aggregate `projection` array
// into TrendChart's expected point shape - one tiny adapter reused by every
// chart-bearing view below, so each view doesn't hand-roll its own mapping.
const toBalancePoints = (projection = []) => projection.map((row) => ({ month: row.month, balance: row.remaining_debt }));

const GAP = "var(--ttz-space-4, 16px)";

function PlanMetric({ label, value, tone = "default" }) {
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
    warning: { bg: tones.warning.bg, border: tones.warning.border, color: tones.warning.fg },
    success: { bg: tones.success.bg, border: tones.success.border, color: tones.success.fg },
  }[tone] || { bg: ttzPalette.surf2, border: ttzPalette.border, color: ttzPalette.tx };

  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bg, minWidth: 0 }}>
      <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{label}</div>
      <div style={{ ...TYPE_SCALE.metricSm, color: colors.color, marginTop: 6, minWidth: 0 }}>{value}</div>
    </div>
  );
}

function formatMonthLabel(value) {
  if (!value) return "n/a";
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
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
function StrategyHeader({ title, subtitle, isActive, warnings = [] }) {
  const criticalMessages = warnings.filter((warning) => warning.severity === "critical").map((warning) => warning.message);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{title}</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>{subtitle}</div>
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

function MyPlanView({ snapshot, service, refresh, runAction, writeState, onGoToDebts }) {
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
    />
  );
}

// GATE-10B.1D: split out of MyPlanView so the empty-plan early return above
// stays a plain function-scope check (React hooks can't follow a
// conditional early return - see the react-hooks/rules-of-hooks
// requirement) while this body can freely use hooks for the new chart/
// strategy-snapshot data fetches, only ever mounted once an active plan
// genuinely exists.
function MyPlanActiveBody({ snapshot, service, refresh, runAction, writeState, onGoToDebts, activeVersion, targetDebt, strategyLabel, debtsAwaitingReforecast, scrollToReforecast }) {
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
  const minimumsInterestDelta = activeStrategyResult && minimumsPreview
    ? safePercentDelta(minimumsPreview.estimatedInterest, activeStrategyResult.estimatedInterest)
    : null;

  const visiblePayoffQueue = showAllPayoffOrder ? payoffQueue : payoffQueue.slice(0, DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT);
  const hiddenPayoffCount = payoffQueue.length - visiblePayoffQueue.length;

  const chartSeries = [
    activePreview ? {
      id: "active", label: "Your active plan", colorToken: "ac",
      points: toBalancePoints(activePreview.projection), payoffMonth: activePreview.projectedZeroDate || undefined,
    } : null,
    minimumsPreview ? {
      id: "minimums", label: "Paying minimums only", colorToken: "muted", dashed: true,
      points: toBalancePoints(minimumsPreview.projection), payoffMonth: minimumsPreview.projectedZeroDate || undefined,
    } : null,
  ].filter(Boolean);

  const statusCode = snapshot.status?.code;
  const statusTone = STATUS_TONE[statusCode] || "info";

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
      <Card variant="default" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>My Plan</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>{strategyLabel} active</div>
          </div>
          <Badge tone="success">Active</Badge>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP, marginTop: GAP }}>
          <PlanMetric label="Projected debt-free" value={snapshot.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Months to $0" value={activePreview ? String(activePreview.monthsToZero) : "…"} />
          <PlanMetric label="Monthly target" value={money(activeVersion.extraMonthlyPayment || 0)} />
          <PlanMetric label="Projected interest" value={activePreview ? money(activePreview.estimatedInterest) : "…"} />
          <PlanMetric label="Total left to go" value={money(totalLeftToGo)} />
          <PlanMetric label="Strategy" value={strategyLabel} />
        </div>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 10 }}>
          Based on {payoffQueue.length} included debt{payoffQueue.length === 1 ? "" : "s"}.
          {snapshot.excludedDebts?.length ? ` ${snapshot.excludedDebts.length} debt${snapshot.excludedDebts.length === 1 ? " is" : "s are"} excluded until reviewed.` : ""}
        </div>
      </Card>

      <Card variant="default">
        <TrendChart
          title="Balance to $0"
          subtitle="Projected, based on your current balances, APRs, and payment assumptions."
          series={chartSeries}
          emptyState={<div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Loading your projection…</div>}
        />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 0.8fr)", gap: GAP }}>
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Your path to $0</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", paddingTop: 14 }}>
            {payoffQueue.length ? payoffQueue.map((debt, index) => (
              <div key={debt.id} style={{ minWidth: 120, textAlign: "center" }}>
                <div style={{ width: 16, height: 16, borderRadius: 999, background: index === 0 ? ttzPalette.ac : ttzPalette.border, margin: "0 auto 8px", border: `2px solid ${ttzPalette.surf}` }} />
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700 }}>{debt.name}</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>
                  {index === 0 ? "Current target" : "Up next"}
                </div>
              </div>
            )) : <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>No payoff order yet.</div>}
          </div>
        </Card>

        <Card variant="default">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Current target</div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginTop: 8 }}>{targetDebt?.name || "No target"}</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4 }}>{money(targetDebt?.currentBalance || 0)} remaining</div>
          <div style={{ marginTop: GAP, display: "grid", gap: 6 }}>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Interest: {targetDebt?.aprStatus === "unknown" ? "Unknown APR" : percent(targetDebt?.apr || 0)}</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Minimum due: {targetDebt?.minimumRequiredPayment == null ? "Not set" : money(targetDebt.minimumRequiredPayment)}</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Owner: {presentedOwnerLabel(targetDebt)}</div>
          </div>
          {onGoToDebts ? <Button variant="secondary" size="sm" onClick={onGoToDebts} style={{ marginTop: GAP }}>View debt</Button> : null}
        </Card>
      </div>

      {nextMove ? (
        <Card variant="default" style={{ borderLeft: `3px solid ${ttzPalette.ac}` }}>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.ac }}>Next move</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 6 }}>Focus extra payment on: {nextMove.targetDebtName}</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>{nextMove.body}</div>
          {nextMove.payoffMonth ? (
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 8 }}>Projected payoff for this debt: {nextMove.payoffMonth}</div>
          ) : null}
          {onGoToDebts ? <Button variant="secondary" onClick={onGoToDebts} style={{ marginTop: GAP }}>Record payment</Button> : null}
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: GAP }}>
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Plan health</div>
          <div style={{ marginTop: 8 }}>
            <Badge tone={statusTone}>{snapshot.status?.label || "Needs confirmation"}</Badge>
          </div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            {snapshot.status?.message || "TrackToZero doesn't have enough confirmed evidence yet to judge this plan's progress."}
          </div>
        </Card>

        {otherStrategyResult && activeStrategyResult ? (
          <Card variant="default">
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{strategyLabel} active vs {otherStrategyLabel}</div>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <ProgressStatRowInline label="Debt-free date" a={activeStrategyResult.projectedZeroDate} b={otherStrategyResult.projectedZeroDate} />
              <ProgressStatRowInline label="Total interest" a={money(activeStrategyResult.estimatedInterest)} b={money(otherStrategyResult.estimatedInterest)} />
              <ProgressStatRowInline label="Months to $0" a={String(activeStrategyResult.monthsToZero)} b={String(otherStrategyResult.monthsToZero)} />
              {minimumsInterestDelta?.value != null ? (
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 4 }}>
                  {strategyLabel} saves {minimumsInterestDelta.value.toFixed(1)}% in interest vs. paying minimums only.
                </div>
              ) : null}
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigateToPlanDestination("compare")} style={{ marginTop: GAP }}>Compare strategies</Button>
          </Card>
        ) : null}

        <Card variant="default">
          <AllocationDonut
            title="Monthly payment allocation"
            segments={allocation.segments}
            centerLabel={money(allocation.total)}
            centerSupporting="per month"
          />
          {allocation.unknownMinimumCount > 0 ? (
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 8 }}>
              {allocation.unknownMinimumCount} debt{allocation.unknownMinimumCount === 1 ? "" : "s"} with an unknown minimum {allocation.unknownMinimumCount === 1 ? "isn't" : "aren't"} included in this total.
            </div>
          ) : null}
        </Card>
      </div>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Payoff order</div>
        <div style={{ marginTop: GAP }}>
          <PayoffOrderList debts={visiblePayoffQueue} isHousehold={isHousehold} highlightFirst />
        </div>
        {hiddenPayoffCount > 0 ? (
          <Button variant="ghost" onClick={() => setShowAllPayoffOrder(true)} style={{ marginTop: GAP }}>View full payoff schedule ({payoffQueue.length})</Button>
        ) : showAllPayoffOrder && payoffQueue.length > DEFAULT_PAYOFF_ORDER_PREVIEW_COUNT ? (
          <Button variant="ghost" onClick={() => setShowAllPayoffOrder(false)} style={{ marginTop: GAP }}>Show fewer</Button>
        ) : null}
      </Card>

      {snapshot.excludedDebts?.length ? (
        <Card variant="default">
          <ExcludedDebtsSection debts={snapshot.excludedDebts} isHousehold={isHousehold} onGoToDebts={onGoToDebts} />
        </Card>
      ) : null}

      {snapshot.warnings?.length ? (
        <WarningCallout title="Plan status">{snapshot.warnings.map((warning) => warning.message || warning.code).join(" ")}</WarningCallout>
      ) : null}

      <ManagePlanCard snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} activeVersion={activeVersion} />
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
function StrategyExperience({ title, subtitle, result, isActive, isHousehold, hasActivePlan = true, onApply, onInspect, useLabel, applyActionLabel, runAction, writeState, currentZeroDate, onGoToDebts }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canUse = !!onApply && !isActive;
  const excludedDebts = result?.excludedDebts || [];
  const includedCount = result?.payoffOrder?.length || 0;

  const confirmApply = () => runAction(applyActionLabel, async () => {
    await onApply();
    setConfirmOpen(false);
  });

  return (
    <Card variant={isActive ? "highlight" : "default"}>
      <StrategyHeader title={title} subtitle={subtitle} isActive={isActive} warnings={result?.warnings || []} />

      <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 6 }}>
        Based on {includedCount} included debt{includedCount === 1 ? "" : "s"}.{excludedDebts.length ? ` ${excludedDebts.length} debt${excludedDebts.length === 1 ? " is" : "s are"} excluded until reviewed.` : ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP, marginTop: GAP }}>
        <PlanMetric label="Projected $0" value={result?.projectedZeroDate || "n/a"} tone="accent" />
        <PlanMetric label="Months to $0" value={String(result?.monthsToZero ?? "n/a")} />
        <PlanMetric label="First target" value={result?.payoffOrder?.[0]?.name || "n/a"} />
        <PlanMetric label="Projected interest" value={money(result?.estimatedInterest || 0)} />
      </div>

      <div style={{ marginTop: GAP }}>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginBottom: 6 }}>Payoff order</div>
        <PayoffOrderList debts={result?.payoffOrder || []} isHousehold={isHousehold} highlightFirst />
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
  const currentExtra = isActive ? Number(snapshot.activeContext.version.extraMonthlyPayment || 0) : 0;

  useEffect(() => {
    let active = true;
    service.compareStrategies(workspaceId).then((data) => { if (active) setResult(data); });
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

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{STRATEGY_EXPLAINERS[strategy]}</InfoCallout>

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
        onApply={async () => {
          await activateOrReforecastStrategy(service, workspaceId, strategy, hasActivePlan);
          await refresh();
        }}
      />

      <Card variant="default">
        <TrendChart
          title="Balance to $0"
          subtitle="Paying minimums vs this strategy, plus an extra-payment scenario once you preview one below."
          series={chartSeries}
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

      {speedUp ? (
        <Card variant="default" style={{ borderLeft: `3px solid ${ttzPalette.go}` }}>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.go }}>Want to speed this up?</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, marginTop: 6 }}>
            Add {money(speedUp.additionalMonthly)}/month → finish {speedUp.monthsSaved} month{speedUp.monthsSaved === 1 ? "" : "s"} earlier → save {money(speedUp.interestSaved)} in interest.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
            <Button variant="secondary" onClick={() => navigateToPlanDestination("what-if")}>Run What If</Button>
          </div>
        </Card>
      ) : null}

      <Card variant="default">
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

  const chartSeries = [
    { id: "snowball", label: "Snowball", colorToken: "ac", points: toBalancePoints(result.snowball.projection), payoffMonth: result.snowball.projectedZeroDate || undefined },
    { id: "avalanche", label: "Avalanche", colorToken: "go", dashed: true, points: toBalancePoints(result.avalanche.projection), payoffMonth: result.avalanche.projectedZeroDate || undefined },
  ];

  const interestByDebtEntries = [
    ...deriveInterestBreakdownSegments(result.snowball.perDebt, snapshot.payoffQueue || []),
  ];
  const compositionEntries = deriveDebtCompositionSegments(snapshot.payoffQueue || []);
  const compositionTokens = ["ac", "go", "info", "wa"];
  const allocation = deriveAllocationSegments(snapshot.payoffQueue || [], result[result.activeStrategy || "avalanche"]?.extraMonthlyPayment || 0);

  const confirmApply = () => runAction(`use ${confirmStrategy}`, async () => {
    await activateOrReforecastStrategy(service, workspaceId, confirmStrategy, hasActivePlan);
    setConfirmStrategy(null);
    await refresh();
  });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Snowball vs Avalanche</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP, marginTop: GAP }}>
          <PlanMetric label="Snowball $0" value={result.snowball.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Avalanche $0" value={result.avalanche.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Snowball months" value={String(result.snowball.monthsToZero ?? "n/a")} />
          <PlanMetric label="Avalanche months" value={String(result.avalanche.monthsToZero ?? "n/a")} />
          <PlanMetric label="Snowball interest" value={money(result.snowball.estimatedInterest || 0)} />
          <PlanMetric label="Avalanche interest" value={money(result.avalanche.estimatedInterest || 0)} />
        </div>
        {recommendation.monthsDelta != null || recommendation.interestDelta ? (
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 10 }}>
            {recommendation.monthsDelta ? `${recommendation.monthsDelta} month${recommendation.monthsDelta === 1 ? "" : "s"} difference` : null}
            {recommendation.monthsDelta && recommendation.interestDelta ? " · " : null}
            {recommendation.interestDelta ? `${money(recommendation.interestDelta)} interest difference` : null}
          </div>
        ) : null}
      </Card>

      <Card variant="default">
        <TrendChart title="Balance to $0" subtitle="Snowball vs Avalanche, both against your current debts and payment." series={chartSeries} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: GAP }}>
        <StrategyExperience title="Snowball" subtitle="Smallest balance first" result={result.snowball} isActive={result.activeStrategy === "snowball"} isHousehold={isHousehold} useLabel="Inspect Snowball" onInspect={() => navigateToPlanDestination("snowball")} onGoToDebts={onGoToDebts} />
        <StrategyExperience title="Avalanche" subtitle="Highest APR first" result={result.avalanche} isActive={result.activeStrategy === "avalanche"} isHousehold={isHousehold} useLabel="Inspect Avalanche" onInspect={() => navigateToPlanDestination("avalanche")} onGoToDebts={onGoToDebts} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: GAP }}>
        <Card variant="default">
          <AllocationDonut
            title="Interest breakdown (Snowball)"
            subtitle="Projected interest by debt."
            segments={interestByDebtEntries.map((entry, index) => ({ ...entry, colorToken: compositionTokens[index % compositionTokens.length] }))}
            centerLabel={money(result.snowball.estimatedInterest || 0)}
            centerSupporting="total interest"
          />
        </Card>
        <Card variant="default">
          <AllocationDonut
            title="Debt composition"
            subtitle="Included balance by category."
            segments={compositionEntries.map((entry, index) => ({ id: entry.group, label: categoryConfigForGroup(entry.group)?.label || "Other", value: entry.balance, colorToken: compositionTokens[index % compositionTokens.length] }))}
            centerLabel={money(compositionEntries.reduce((sum, entry) => sum + entry.balance, 0))}
            centerSupporting="included"
          />
        </Card>
        <Card variant="default">
          <AllocationDonut
            title="Payment allocation"
            subtitle={`Based on the ${result.activeStrategy ? (result.activeStrategy === "snowball" ? "Snowball" : "Avalanche") : "current"} plan's monthly payment.`}
            segments={allocation.segments}
            centerLabel={money(allocation.total)}
            centerSupporting="per month"
          />
        </Card>
      </div>

      {scenarioCompare ? (
        <MultiScenarioCompareCard
          title={`Scenario Compare (+${money(SCENARIO_COMPARE_AMOUNT)}/month)`}
          subtitle="What would adding the same extra payment do to each strategy?"
          entries={[
            { label: "Snowball baseline", previewResult: result.snowball },
            { label: `Snowball + ${money(SCENARIO_COMPARE_AMOUNT)}`, previewResult: scenarioCompare.snowballPlus },
            { label: "Avalanche baseline", previewResult: result.avalanche },
            { label: `Avalanche + ${money(SCENARIO_COMPARE_AMOUNT)}`, previewResult: scenarioCompare.avalanchePlus },
          ]}
        />
      ) : null}

      <Card variant={winnerLabel ? "highlight" : "default"}>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Decision summary</div>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 6 }}>{recommendation.headline}</div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6 }}>{recommendation.detail}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: GAP }}>
          {winnerStrategy && result.activeStrategy !== winnerStrategy ? (
            <Button variant="primary" onClick={() => setConfirmStrategy(winnerStrategy)} disabled={writeState?.inProgress}>
              Choose {winnerLabel}
            </Button>
          ) : null}
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
function PerDebtImpactTable({ rows }) {
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.debtId}>
              <td style={tdStyle}>{row.debtName}</td>
              <td style={tdStyle}>{row.baselinePayoffMonth || "Not reached"}</td>
              <td style={tdStyle}>{row.scenarioPayoffMonth || "Not reached"}</td>
              <td style={tdStyle}><Badge tone={IMPACT_CHANGE_TONE[row.change] || "neutral"}>{(IMPACT_CHANGE_LABEL[row.change] || (() => "No change"))(row)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StrategyDeltaRow({ label, result }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{label}</span>
      <span style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700 }}>{result?.projectedZeroDate || "n/a"} <span style={{ color: ttzPalette.muted, fontWeight: 500 }}>·</span> {money(result?.estimatedInterest || 0)}</span>
    </div>
  );
}

function WhatIfView({ snapshot, service, runAction, writeState }) {
  const [mode, setMode] = useState("recurring");
  const [extra, setExtra] = useState("100");
  const [amount, setAmount] = useState("500");
  const [targetDebtId, setTargetDebtId] = useState("");
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
    const activeStrategy = snapshot.activeContext?.version?.strategy || "avalanche";
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
        const result = await service.previewCustomTarget(workspaceId, { targetDebtId, extraMonthlyPayment: nextExtra, detailed: true });
        if (!result) { setPreviewNotice("That debt could not be found."); return; }
        setPreview({ baseline: toSide(result.baseline), scenario: toSide(result.custom) });
        return;
      }
      if (!hasActivePlan) {
        setPreviewNotice("Build and activate a plan first (try Compare) so there's a current payment to add to - or pick a specific debt above to preview targeting extra money at it right away.");
        return;
      }
      const [baselineResult, scenarioResult] = await Promise.all([
        service.previewTrend(workspaceId, { strategy: activeStrategy, extraMonthlyPayment: currentExtra, detailed: true }),
        service.previewReforecast(workspaceId, { extraMonthlyPayment: nextExtra }, { detailed: true }),
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
      const result = await service.previewOneTimePayment(workspaceId, { amount: lump, targetDebtId, detailed: true });
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
    const result = await service.previewCustomTarget(workspaceId, { targetDebtId, detailed: true });
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

  const chartSeries = preview ? [
    { id: "baseline", label: "Current plan", colorToken: "muted", dashed: true, points: toBalancePoints(preview.baseline?.projection), payoffMonth: preview.baseline?.label || undefined },
    { id: "scenario", label: "Scenario", colorToken: "ac", points: toBalancePoints(preview.scenario?.projection), payoffMonth: preview.scenario?.label || undefined },
  ] : [];
  const interestDelta = preview ? safePercentDelta(preview.baseline?.interest, preview.scenario?.interest) : null;
  const interestDeltaMoney = preview ? Math.abs(Number(preview.scenario?.interest || 0) - Number(preview.baseline?.interest || 0)) : 0;
  const impactRows = preview ? derivePerDebtImpactRows(preview.baseline?.perDebt, preview.scenario?.perDebt, snapshot.payoffQueue || []) : [];

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>What do you want to test?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
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
              style={{
                border: `1px solid ${mode === option.key ? ttzPalette.ac : ttzPalette.border}`,
                background: mode === option.key ? ttzPalette.acS : "transparent",
                color: mode === option.key ? ttzPalette.ac : ttzPalette.tx2,
                padding: "8px 12px",
                borderRadius: 999,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.4fr)", gap: GAP }}>
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Choose scenario</div>
          {mode === "recurring" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <Field label="Extra per month">
                <MoneyInput value={extra} onChange={(event) => { setExtra(event.target.value); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }} />
              </Field>
              <Field label="Apply toward" help="Leave on All to add it to your overall plan payment - your strategy decides where it goes.">
                <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setPreview(null); setPreviewNotice(""); setOtherStrategies(null); }}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {mode === "one-time" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
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
            </div>
          ) : null}

          {mode === "target" || mode === "custom" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <Field label="Target debt">
                <Select value={targetDebtId} onChange={(event) => setTargetDebtId(event.target.value)}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <div style={{ marginTop: GAP, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={runPreview} disabled={writeState.inProgress} loading={writeState.action === "preview what-if"}>Preview impact</Button>
            <Button variant="secondary" onClick={saveScenario} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
          </div>
          <div style={{ marginTop: GAP }}>
            <Input value={scenarioName} placeholder="Scenario name" onChange={(event) => setScenarioName(event.target.value)} />
          </div>
        </Card>

        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Current vs scenario</div>
          {preview ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP }}>
                <PlanMetric label="Current plan" value={preview.baseline?.label || "n/a"} />
                <PlanMetric label="Scenario" value={preview.scenario?.label || "n/a"} />
                <PlanMetric label="Current interest" value={money(preview.baseline?.interest || 0)} />
                <PlanMetric label="Scenario interest" value={money(preview.scenario?.interest || 0)} tone="success" />
              </div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>{monthLabelDeltaText(preview.baseline?.label, preview.scenario?.label) || "Same payoff time as your current plan"}</p>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, margin: 0 }}>{describePercentDelta(interestDelta, interestDeltaMoney)}</p>
              <InfoCallout>This is a hypothetical preview only. It will not create a PaymentEvent.</InfoCallout>
            </div>
          ) : previewNotice ? (
            <WarningCallout style={{ marginTop: GAP }}>{previewNotice}</WarningCallout>
          ) : (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP }}>Choose a scenario and preview what would happen before saving or applying.</p>
          )}
        </Card>
      </div>

      {preview ? (
        <Card variant="default">
          <TrendChart title="Balance to $0" subtitle="Your current plan vs this scenario." series={chartSeries} />
        </Card>
      ) : null}

      {impactRows.length ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Per-debt impact</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4, marginBottom: GAP }}>How this scenario changes each debt&apos;s own payoff timing, biggest change first.</p>
          <PerDebtImpactTable rows={impactRows} />
        </Card>
      ) : null}

      {otherStrategies ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Vs other strategies</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4, marginBottom: GAP }}>The same change, applied to Snowball and Avalanche instead.</p>
          <div style={{ display: "grid", gap: 6 }}>
            <StrategyDeltaRow label="Current Snowball" result={otherStrategies.snowballBase} />
            <StrategyDeltaRow label="Snowball + this scenario" result={otherStrategies.snowballScenario} />
            <StrategyDeltaRow label="Current Avalanche" result={otherStrategies.avalancheBase} />
            <StrategyDeltaRow label="Avalanche + this scenario" result={otherStrategies.avalancheScenario} />
          </div>
        </Card>
      ) : null}
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

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>When do you want to reach $0?</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: GAP, marginTop: GAP }}>
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
        </div>
        <div style={{ display: "grid", alignContent: "end", marginTop: GAP }}>
          <Button variant="primary" onClick={check} disabled={!targetMonth || writeState.inProgress} loading={writeState.action === "check feasibility"}>Check feasibility</Button>
        </div>
      </Card>

      {result && result.valid === false ? (
        <WarningCallout>{result.reason || "Choose a target date in the future."}</WarningCallout>
      ) : null}

      {result && result.valid !== false ? (
        <Card variant={result.feasible ? "highlight" : "default"}>
          {result.feasible ? (
            <div style={{ display: "grid", gap: GAP }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Target planning</div>
                {feasibility ? <Badge tone={FEASIBILITY_TONE[feasibility]}>{FEASIBILITY_LABEL[feasibility]}</Badge> : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP }}>
                <PlanMetric label="Target date" value={formatMonthLabel(result.targetMonth)} />
                <PlanMetric label="Current projected $0" value={result.projectedZeroDate || "n/a"} />
                <PlanMetric label="Current payment" value={money(result.currentMonthlyExtra || 0)} />
                <PlanMetric label="Required payment" value={money(result.requiredMonthlyExtra || 0)} />
                <PlanMetric label="Additional needed" value={money(Math.max(0, result.additionalNeeded || 0))} tone={result.additionalNeeded > 0 ? "warning" : "success"} />
              </div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, margin: 0 }}>
                {result.additionalNeeded > 0
                  ? `To reach $0 by ${formatMonthLabel(result.targetMonth)}, increase your monthly payment by ${money(result.additionalNeeded)} to ${money(result.requiredMonthlyExtra)}/mo.`
                  : `You're already on pace to reach $0 by ${formatMonthLabel(result.targetMonth)} at your current payment.`}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {result.additionalNeeded > 0 ? (
                  <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState.inProgress}>Apply this payment increase</Button>
                ) : (
                  <Badge tone="success">Already on pace</Badge>
                )}
                <Input value={scenarioName} placeholder="Scenario name" onChange={(event) => setScenarioName(event.target.value)} style={{ minWidth: 180 }} />
                <Button variant="secondary" onClick={saveScenarioIt} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
              </div>
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

      {result?.feasible && result.baseline ? (
        <>
          <Card variant="default">
            <TrendChart title="Balance to $0" subtitle="Current pace vs the payment this target requires." series={chartSeries} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: GAP }}>
            <Card variant="default">
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Current pace vs this target</div>
              <div style={{ display: "grid", gap: 6, marginTop: GAP }}>
                <ProgressStatRowInline label="Payoff date" a={result.baseline.projectedZeroDate} b={result.scenario.projectedZeroDate} />
                <ProgressStatRowInline label="Monthly payment" a={money(result.currentMonthlyExtra)} b={money(result.requiredMonthlyExtra)} />
                <ProgressStatRowInline label="Total interest" a={money(result.baseline.estimatedInterest)} b={money(result.scenario.estimatedInterest)} />
              </div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP, marginBottom: 0 }}>{describePercentDelta(interestDelta, interestDeltaMoney)}</p>
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
              <PerDebtImpactTable rows={impactRows} />
            </Card>
          ) : null}
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

function SavedScenariosView({ snapshot, service, refresh, runAction, writeState }) {
  const [scenarios, setScenarios] = useState(null);
  const [planHistory, setPlanHistory] = useState(null);
  const [previewsById, setPreviewsById] = useState({});
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.listWorkspaceScenarios(workspaceId).then((result) => { if (active) setScenarios(result || []); });
    service.listPlanHistory(workspaceId).then((result) => { if (active) setPlanHistory(result || []); });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (scenarios === null) return <LoadingState label="Loading saved scenarios" />;

  const hasActivePlan = !!snapshot.activeContext?.version;

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

  // GATE-10B.1D: "best option right now" and "Compare selected" are both
  // computed ONLY over scenarios already previewed THIS session
  // (previewsById, populated as each ScenarioCard's own "View" button is
  // clicked) - never a background preview burst across every saved
  // scenario on page load. A disclosed scope limit, not an oversight.
  const previewedEntries = Object.entries(previewsById).map(([scenarioId, result]) => {
    const scenario = scenarios.find((item) => item.id === scenarioId) || result.scenario;
    return { scenario, preview: scenarioPreviewForChart(scenario, result.preview) };
  });
  const bestOption = pickBestByZeroDate(previewedEntries);
  const compareEntries = [...selectedIds]
    .map((scenarioId) => previewedEntries.find((entry) => entry.scenario?.id === scenarioId))
    .filter((entry) => entry?.preview);

  const groupCounts = scenarios.reduce((acc, scenario) => {
    acc[scenario.type] = (acc[scenario.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "grid", gap: GAP }}>
      {scenarios.length ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{scenarios.length} saved scenario{scenarios.length === 1 ? "" : "s"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {Object.entries(groupCounts).map(([type, count]) => (
              <Badge key={type} tone="neutral">{SCENARIO_TYPE_LABELS[type] || type} · {count}</Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {bestOption ? (
        <Card variant="highlight">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Best option right now</div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginTop: 4 }}>{bestOption.scenario?.name || "Scenario"}</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 6, marginBottom: 0 }}>
            Projected $0 <strong>{bestOption.preview.projectedZeroDate}</strong> - the earliest among the {previewedEntries.length} scenario{previewedEntries.length === 1 ? "" : "s"} you&apos;ve previewed this session (not every saved scenario has been checked yet).
          </p>
        </Card>
      ) : null}

      {!scenarios.length ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No saved scenarios yet</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Save a what-if, goal-date, or strategy idea to compare it later. Saved scenarios stay preview-only until you explicitly apply one.
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: GAP }}>
          {scenarios.map((scenario) => (
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
              onChanged={() => {
                setScenarios((current) => current?.filter((item) => item.id !== scenario.id) ?? current);
                setPreviewsById((current) => {
                  if (!(scenario.id in current)) return current;
                  const next = { ...current };
                  delete next[scenario.id];
                  return next;
                });
                setSelectedIds((current) => {
                  if (!current.has(scenario.id)) return current;
                  const next = new Set(current);
                  next.delete(scenario.id);
                  return next;
                });
              }}
              onPreviewed={handlePreviewed}
              selected={selectedIds.has(scenario.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {compareEntries.length >= 2 ? (
        <MultiScenarioCompareCard
          title="Compare selected scenarios"
          subtitle="Scenarios you've checked Compare on, side by side."
          entries={compareEntries.map((entry) => ({ label: entry.scenario.name, previewResult: entry.preview }))}
        />
      ) : selectedIds.size === 1 ? (
        <InfoCallout>Select at least one more previewed scenario to compare.</InfoCallout>
      ) : null}

      {planHistory?.length ? (
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan history</div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4, marginBottom: GAP }}>Every activated or reforecast version of your plan, newest first. This is your plan&apos;s own history, separate from the saved scenarios above.</p>
          <PlanHistoryTimeline versions={planHistory} />
        </Card>
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

function PlanHistoryTimeline({ versions }) {
  const strategyLabel = (strategy) => (strategy === "avalanche" ? "Avalanche" : strategy === "snowball" ? "Snowball" : strategy || "Custom");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {versions.map((version, index) => {
        const previous = versions[index + 1];
        const delta = previous ? monthLabelDeltaText(previous.projectedZeroDate, version.projectedZeroDate) : "";
        return (
          <div key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${ttzPalette.border}`, background: ttzPalette.surf2 }}>
            <div>
              <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>
                Version {version.versionNumber} · {strategyLabel(version.strategy)} · {money(Number(version.extraMonthlyPayment || 0))}/mo
              </div>
              <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2, marginTop: 2 }}>
                {version.createdBecause === "reforecast" ? "Reforecast" : "Activated"} · Projected $0: {version.projectedZeroDate || "n/a"}
              </div>
            </div>
            {delta ? <Badge tone="neutral">{delta}</Badge> : null}
          </div>
        );
      })}
    </div>
  );
}

function ScenarioCard({ scenario, service, workspaceId, currentZeroDate, hasActivePlan, runAction, writeState, refresh, onChanged, onPreviewed, selected = false, onToggleSelect }) {
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
    <Card variant="default">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{scenario.name}</div>
          <Badge tone="neutral" style={{ marginTop: 6 }}>{SCENARIO_TYPE_LABELS[scenario.type] || scenario.type}</Badge>
        </div>
        {loaded?.isStale ? <Badge tone="warning">Plan changed since saved</Badge> : null}
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
            {canApply ? (
              <Button variant="primary" size="sm" disabled={writeState.inProgress} onClick={() => setConfirmOpen(true)}>Apply</Button>
            ) : (
              <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, alignSelf: "center" }}>This kind of scenario is preview-only and can&apos;t be applied directly.</p>
            )}
            <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button>
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
          <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button>
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

export default function PlanSection({ snapshot, service, refresh, runAction, writeState, onGoToDebts }) {
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

  const viewProps = { snapshot, service, refresh, runAction, writeState, onGoToDebts };
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
  // plan") as a small overline above the existing "Your path to $0" title -
  // adds intentional Personal/Household distinction without discarding the
  // established page title.
  const { planHeading } = getWorkspacePresentation(snapshot.workspace);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{planHeading}</div>
        {/* UX-8: the Plan tab previously had zero semantic headings at all
            (every "title" here was a styled div) - this is the one real
            <h1> for the whole tab, rendered once regardless of which
            destination (My Plan/Compare/What If/etc.) is active, matching
            Home/Debts/Activity's existing one-h1-per-page pattern. Same
            visual style as before - a tag change, not a visual change. */}
        <h1 style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4, margin: "4px 0 0" }}>Your path to $0</h1>
      </div>

      <div role="tablist" aria-label="Plan sections" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PLAN_DESTINATIONS.map((item) => {
          const active = destination === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate(item.key)}
              style={{
                ...TYPE_SCALE.supporting,
                minHeight: 32,
                border: `1px solid ${active ? ttzPalette.ac : ttzPalette.border}`,
                background: active ? ttzPalette.acS : "transparent",
                color: active ? ttzPalette.ac : ttzPalette.tx2,
                padding: "0 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 800,
              }}
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
