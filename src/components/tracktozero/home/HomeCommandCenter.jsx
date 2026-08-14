/**
 * HomeCommandCenter.jsx
 *
 * UX-2: HOME COMMAND CENTER + MOMENTUM EXPERIENCE
 *
 * The emotional and functional heart of TrackToZero.
 * Users should understand within 5 seconds:
 * 1. How much debt is left?
 * 2. Am I moving?
 * 3. What should I do next?
 * 4. Which debt are we attacking?
 * 5. When could I hit $0?
 * 6. Is anything stopping TrackToZero from trusting my plan?
 *
 * Renders one of several intentional states:
 * - No debts: activation state
 * - Debts but no plan: build plan state
 * - Blocking review: needs quick check state
 * - Active healthy plan: command center
 * - Critical plan: needs tweak state
 * - All paid off: celebration state
 */

import React, { useMemo } from "react";
import { ttzPalette, toneColors, TYPE_SCALE } from "../theme.js";
import { formatMoney, formatShortDate } from "../formatting.js";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { deriveHomeContext } from "./homeViewModels.js";
import * as lang from "./homeLanguage.js";

const PADDING = "var(--ttz-space-5, 24px)";
const SPACING = "var(--ttz-space-4, 16px)";
const GAP_LARGE = "var(--ttz-space-6, 32px)";

// ─────────────────────────────────────────────────────────────────────────
// STATE: NO DEBTS — Activation
// ─────────────────────────────────────────────────────────────────────────

function NoDebtState({ onUploadBudget, onAddDebt }) {
  return (
    <div style={{ display: "grid", gap: GAP_LARGE }}>
      <Card variant="elevated" style={{ textAlign: "center" }}>
        <div style={{ ...TYPE_SCALE.headline, marginBottom: SPACING, color: ttzPalette.tx }}>
          {lang.noDebtHeadline()}
        </div>
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginBottom: GAP_LARGE }}>
          {lang.noDebtSupporting()}
        </p>
        <div style={{ display: "grid", gap: SPACING, gridTemplateColumns: "1fr 1fr" }}>
          <Button variant="primary" onClick={onUploadBudget}>
            {lang.noDebtCtaPrimary()}
          </Button>
          <Button variant="secondary" onClick={onAddDebt}>
            {lang.noDebtCtaSecondary()}
          </Button>
        </div>
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP_LARGE, fontSize: "0.9em" }}>
          {lang.noDebtHint()}
        </p>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STATE: DEBTS BUT NO PLAN — Build Plan Activation
// ─────────────────────────────────────────────────────────────────────────

function NoActivePlanState({ homeContext, onBuildPlan }) {
  const { totalDebt, openReviewCount } = homeContext;

  return (
    <div style={{ display: "grid", gap: GAP_LARGE }}>
      <Card variant="elevated">
        <div style={{ ...TYPE_SCALE.headline, marginBottom: SPACING, color: ttzPalette.tx }}>
          {lang.noActivePlanHeadline()}
        </div>
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginBottom: GAP_LARGE }}>
          {lang.noActivePlanSupporting()}
        </p>
        <div style={{ display: "grid", gap: SPACING, gridTemplateColumns: "auto auto", justifyContent: "start", marginBottom: GAP_LARGE }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Total debt entered</div>
            <div style={{ ...TYPE_SCALE.metric, color: ttzPalette.tx, marginTop: 4 }}>
              {formatMoney(totalDebt)}
            </div>
          </div>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Needs review</div>
            <div style={{ ...TYPE_SCALE.metric, color: ttzPalette.tx, marginTop: 4 }}>
              {openReviewCount}
            </div>
          </div>
        </div>
        <Button variant="primary" onClick={onBuildPlan} style={{ width: "100%" }}>
          {lang.noActivePlanCta()}
        </Button>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HERO: DEBT FREEDOM SCOREBOARD
// ─────────────────────────────────────────────────────────────────────────

function DebtFreedomHero({ homeContext }) {
  const { totalDebt, progress, zeroDay } = homeContext;
  const palette = ttzPalette;

  const percentCleared = progress?.percent || 0;

  return (
    <Card variant="elevated" padding={PADDING} style={{ background: `linear-gradient(135deg, ${palette.acS || palette.surf2} 0%, ${palette.surf} 100%)` }}>
      <div style={{ display: "grid", gap: GAP_LARGE }}>
        {/* Progress bar */}
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: palette.muted, marginBottom: 8 }}>
            {lang.momentumLabel()}
          </div>
          <div style={{ height: 8, background: palette.border, borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${percentCleared}%`,
                background: palette.go,
                transition: "width 0.4s ease-out",
              }}
              role="progressbar"
              aria-valuenow={percentCleared}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Debt payoff progress"
            />
          </div>
          <p style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 6 }}>
            {percentCleared > 0 ? `You're moving. ${lang.clearedLabel(percentCleared)}` : "Progress starts after your next confirmed balance update."}
          </p>
        </div>

        {/* Main metrics grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: SPACING }}>
          {/* Left to Go */}
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{lang.leftToGoLabel()}</div>
            <div style={{ ...TYPE_SCALE.metric, color: palette.tx, marginTop: 4 }}>
              {formatMoney(totalDebt)}
            </div>
          </div>

          {/* Zero Day (if reachable) */}
          {zeroDay && (
            <div>
              <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{lang.zeroDayLabel()}</div>
              <div style={{ ...TYPE_SCALE.metric, color: palette.tx, marginTop: 4 }}>
                {formatShortDate(zeroDay)}
              </div>
              <p style={{ ...TYPE_SCALE.caption, color: palette.muted, marginTop: 2 }}>
                {lang.zeroDaySupporting()}
              </p>
            </div>
          )}

          {/* Starting debt (if we know it) */}
          {progress?.openingBalance > 0 && (
            <div>
              <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{lang.startingDebtLabel()}</div>
              <div style={{ ...TYPE_SCALE.metric, color: palette.tx2, marginTop: 4, fontSize: "0.9em" }}>
                {formatMoney(progress.openingBalance)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NEXT MOVE CARD — Most Actionable
// ─────────────────────────────────────────────────────────────────────────

function YourNextMoveCard({ homeContext, onRecordPayment, onViewDetails }) {
  const { currentTarget, strategy, extraMonthlyPayment } = homeContext;
  const isHousehold = homeContext.isHousehold;
  const palette = ttzPalette;

  if (!currentTarget) return null;

  const minimumPayment = Number(currentTarget.minimumRequiredPayment || 0);
  const extraPayment = Number(extraMonthlyPayment || 0);
  const totalPayment = minimumPayment + extraPayment;

  // Determine tone
  let tone = "accent";
  if (homeContext.planHealth?.code === "critical") tone = "danger";
  if (homeContext.planHealth?.code === "ahead") tone = "success";

  const tones = toneColors(palette);
  const toneStyle = tones[tone] || tones.accent;

  return (
    <Card
      variant="elevated"
      style={{
        borderLeft: `4px solid ${toneStyle.fg}`,
        background: `linear-gradient(90deg, ${toneStyle.bg}15 0%, transparent 100%)`,
      }}
    >
      <div style={{ ...TYPE_SCALE.overline, color: toneStyle.fg, marginBottom: SPACING }}>
        {lang.nextMoveEyebrow()}
      </div>

      <div style={{ display: "grid", gap: SPACING, marginBottom: GAP_LARGE }}>
        {/* Debt name + owner */}
        <div>
          <h3 style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, margin: 0 }}>{currentTarget.name}</h3>
          {isHousehold && (
            <p style={{ ...TYPE_SCALE.body, color: palette.muted, marginTop: 4 }}>
              {currentTarget.ownerLabel || "Unassigned"}
            </p>
          )}
        </div>

        {/* Balance and APR */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACING }}>
          <div>
            <div style={{ ...TYPE_SCALE.caption, color: palette.muted }}>Balance</div>
            <div style={{ ...TYPE_SCALE.body, color: palette.tx, marginTop: 2, fontWeight: 700 }}>
              {formatMoney(currentTarget.currentBalance)}
            </div>
          </div>
          <div>
            <div style={{ ...TYPE_SCALE.caption, color: palette.muted }}>APR</div>
            <div style={{ ...TYPE_SCALE.body, color: palette.tx, marginTop: 2, fontWeight: 700 }}>
              {currentTarget.apr != null ? `${(currentTarget.apr * 100).toFixed(2)}%` : "Unknown"}
            </div>
          </div>
        </div>

        {/* Payment recommendation (if available) */}
        {totalPayment > 0 && (
          <div style={{ background: palette.surf, padding: SPACING, borderRadius: "var(--ttz-radius-md, 12px)" }}>
            <div style={{ ...TYPE_SCALE.caption, color: palette.muted }}>Recommended payment</div>
            <div style={{ ...TYPE_SCALE.metric, color: palette.tx, marginTop: 4 }}>
              {formatMoney(totalPayment)}
            </div>
            {minimumPayment > 0 && extraPayment > 0 && (
              <p style={{ ...TYPE_SCALE.caption, color: palette.muted, marginTop: 4 }}>
                {formatMoney(minimumPayment)} minimum + {formatMoney(extraPayment)} extra
              </p>
            )}
          </div>
        )}

        {/* Strategy explanation */}
        {strategy && (
          <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: 0 }}>
            <strong>Why this debt:</strong> {lang.strategyExplanation(strategy, currentTarget.name)}
          </p>
        )}
      </div>

      {/* CTAs */}
      <div style={{ display: "grid", gap: SPACING, gridTemplateColumns: "1fr auto" }}>
        <Button variant="primary" onClick={onRecordPayment}>
          Record payment
        </Button>
        <Button variant="secondary" onClick={onViewDetails}>
          Details
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PLAN HEALTH CARD
// ─────────────────────────────────────────────────────────────────────────

function PlanHealthCard({ homeContext, onSeeOptions }) {
  const { planHealth, warnings } = homeContext;
  const palette = ttzPalette;

  if (!planHealth) return null;

  const tones = toneColors(palette);
  const healthCode = planHealth.code || "unknown";
  const tone = {
    ahead: "success",
    on_track: "success",
    slightly_behind: "warning",
    needs_review: "warning",
    needs_balance_update: "info",
    insufficient_data: "info",
    critical: "danger",
  }[healthCode] || "neutral";

  const toneStyle = tones[tone];

  // Show if health is good: don't show card, save space for action
  if (tone === "success") return null;

  return (
    <Card variant="elevated" style={{ borderLeft: `4px solid ${toneStyle.fg}`, background: toneStyle.bg }}>
      <div style={{ ...TYPE_SCALE.overline, color: toneStyle.fg, marginBottom: SPACING }}>
        {lang.planHealthHeadline(planHealth)}
      </div>

      <p style={{ ...TYPE_SCALE.body, color: palette.tx, margin: 0, marginBottom: GAP_LARGE }}>
        {lang.planHealthDetail(planHealth)}
      </p>

      {/* Critical plan warning detail */}
      {healthCode === "critical" && warnings?.length > 0 && (
        <ul style={{ margin: "0 0 " + GAP_LARGE + " 0", paddingLeft: 20, color: palette.tx2 }}>
          {warnings.slice(0, 2).map((w, i) => (
            <li key={i} style={{ ...TYPE_SCALE.body, marginBottom: 4 }}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      {lang.planHealthCta(planHealth) && (
        <Button variant="secondary" onClick={onSeeOptions} style={{ width: "100%" }}>
          {lang.planHealthCta(planHealth)}
        </Button>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// UP NEXT PREVIEW
// ─────────────────────────────────────────────────────────────────────────

function UpNextCard({ homeContext, onSeePlan }) {
  const { payoffQueue, currentTarget } = homeContext;
  const palette = ttzPalette;

  if (!payoffQueue || payoffQueue.length === 0) return null;

  // Show up to 3 in queue
  const preview = payoffQueue.slice(0, 3);

  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.overline, color: palette.muted, marginBottom: GAP_LARGE }}>
        {lang.upNextLabel()}
      </div>

      <div style={{ display: "grid", gap: SPACING }}>
        {preview.map((debt, index) => {
          const isTarget = debt.id === currentTarget?.id;
          return (
            <div key={debt.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: SPACING }}>
              <div style={{ ...TYPE_SCALE.metric, color: palette.muted }}>{index + 1}</div>
              <div>
                <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: isTarget ? 700 : 500 }}>
                  {debt.name} {isTarget && <span style={{ color: palette.ac }}>← Current</span>}
                </div>
                <p style={{ ...TYPE_SCALE.caption, color: palette.muted, margin: "4px 0 0" }}>
                  {formatMoney(debt.currentBalance)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {payoffQueue.length > 3 && (
        <Button variant="secondary" onClick={onSeePlan} style={{ width: "100%", marginTop: GAP_LARGE }}>
          See full plan
        </Button>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HOUSEHOLD BREAKDOWN (for household workspaces)
// ─────────────────────────────────────────────────────────────────────────

function HouseholdBreakdownCard({ homeContext }) {
  const { householdBreakdown } = homeContext;
  const palette = ttzPalette;

  if (!householdBreakdown || householdBreakdown.length === 0) return null;

  const totalDisplayed = householdBreakdown.reduce((sum, item) => sum + item.totalDebt, 0);

  return (
    <Card variant="default">
      <div style={{ ...TYPE_SCALE.overline, color: palette.muted, marginBottom: GAP_LARGE }}>
        {lang.householdSummaryLabel()}
      </div>

      <div style={{ ...TYPE_SCALE.metric, color: palette.tx, marginBottom: GAP_LARGE }}>
        {formatMoney(totalDisplayed)}
      </div>

      <div style={{ display: "grid", gap: SPACING }}>
        {householdBreakdown.map((member) => (
          <div key={member.uid || member.type} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: SPACING, borderBottom: `1px solid ${palette.border}`, paddingBottom: SPACING }}>
            <div>
              <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 600 }}>
                {member.displayName}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 600 }}>
                {formatMoney(member.totalDebt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// QUICK CHECK INTEGRATION
// ─────────────────────────────────────────────────────────────────────────

function QuickCheckCard({ homeContext, onGoToReview }) {
  const { openReviewCount, blockingReviewCount } = homeContext;
  const palette = ttzPalette;

  if (!openReviewCount) return null;

  // Only show with strong visual weight if blocking; otherwise muted
  const isBlocking = blockingReviewCount > 0;
  const variant = isBlocking ? "warning" : "default";

  const tones = toneColors(palette);
  const toneStyle = isBlocking ? tones.warning : tones.info;

  return (
    <Card
      variant={variant}
      style={{
        borderLeft: isBlocking ? `4px solid ${toneStyle.fg}` : "none",
      }}
    >
      <div style={{ ...TYPE_SCALE.overline, color: toneStyle.fg, marginBottom: SPACING }}>
        {lang.quickCheckLabel()}
      </div>

      <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, marginBottom: SPACING }}>
        {lang.quickCheckHeadline(openReviewCount, blockingReviewCount)}
      </div>

      <Button variant={isBlocking ? "primary" : "secondary"} onClick={onGoToReview} style={{ width: "100%" }}>
        {lang.quickCheckCta()}
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ALL PAID OFF STATE
// ─────────────────────────────────────────────────────────────────────────

function AllPaidOffState() {
  return (
    <Card variant="elevated" style={{ textAlign: "center", background: toneColors(ttzPalette).success.bg }}>
      <div style={{ ...TYPE_SCALE.headline, color: toneColors(ttzPalette).success.fg, marginBottom: SPACING }}>
        {lang.allPaidOffHeadline()}
      </div>
      <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>
        {lang.allPaidOffSupporting()}
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN HOME COMMAND CENTER
// ─────────────────────────────────────────────────────────────────────────

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
  onSeeOptions,
}) {

  // Derive all presentation context
  const homeContext = useMemo(() => deriveHomeContext(snapshot, reviewSnapshot, scenario), [snapshot, reviewSnapshot, scenario]);

  const { homeState } = homeContext;

  // ─────────────────────────────────────────────────────────────────────
  // STATE ROUTING
  // ─────────────────────────────────────────────────────────────────────

  if (homeState === "no-debt") {
    return (
      <main style={{ display: "grid", gap: GAP_LARGE }}>
        <NoDebtState onUploadBudget={onUploadBudget} onAddDebt={onAddDebt} />
      </main>
    );
  }

  if (homeState === "no-plan") {
    return (
      <main style={{ display: "grid", gap: GAP_LARGE }}>
        <NoActivePlanState homeContext={homeContext} onBuildPlan={onGoToPlan} />
      </main>
    );
  }

  if (homeState === "all-paid-off") {
    return (
      <main style={{ display: "grid", gap: GAP_LARGE }}>
        <AllPaidOffState />
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACTIVE PLAN STATES (healthy, critical, or with blocking review)
  // ─────────────────────────────────────────────────────────────────────

  return (
    <main style={{ display: "grid", gap: GAP_LARGE }}>
      {/* HERO: Debt Freedom Scoreboard */}
      <DebtFreedomHero homeContext={homeContext} />

      {/* YOUR NEXT MOVE: Most Actionable */}
      <YourNextMoveCard homeContext={homeContext} onRecordPayment={onRecordPayment} onViewDetails={onViewDetails} />

      {/* PLAN HEALTH: Status & CTA */}
      <PlanHealthCard homeContext={homeContext} onSeeOptions={onSeeOptions} />

      {/* QUICK CHECK: Review Integration (only if open reviews exist) */}
      {homeContext.openReviewCount > 0 && <QuickCheckCard homeContext={homeContext} onGoToReview={onGoToReview} />}

      {/* UP NEXT: Queue Preview */}
      <UpNextCard homeContext={homeContext} onSeePlan={onGoToPlan} />

      {/* HOUSEHOLD BREAKDOWN: For household workspaces */}
      {homeContext.isHousehold && <HouseholdBreakdownCard homeContext={homeContext} />}
    </main>
  );
}
