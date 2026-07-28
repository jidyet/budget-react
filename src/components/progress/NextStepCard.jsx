import { getBillDisplayName } from "../../services/billModel";

/**
 * NextStepCard — Phase 4
 *
 * The single most actionable card on the homepage.
 * - `body` is the headline: "Finish Barclaycard", "Pay MBNA first", etc.
 * - `detail` is the supporting line: "$340 left", "Due today", etc.
 * - Mini progress bar shown when there is a specific debt target
 * - Tone-aware: warn (amber), accent (brand), success (green), default (neutral)
 * - Single full-width button on mobile
 */

export default function NextStepCard({
  palette,
  isMobile,
  nextMove,
  targetDebt,       // progress.almostDoneDebt || progress.nextFocusDebt — may be null
  onDueNext,
  onPayoff,
  onBills,
  reducedMotion,
}) {
  const c = palette;
  if (!nextMove?.body) return null;

  // ── Tone colours ─────────────────────────────────────────────────────────
  const toneMap = {
    warn:    { border: c.wa, glow: `${c.wa}18`, badge: `${c.wa}22`, badgeText: c.wa, bar: c.wa },
    accent:  { border: c.ac, glow: `${c.ac}14`, badge: `${c.ac}1A`, badgeText: c.ac, bar: c.ac },
    success: { border: c.go || c.ac, glow: `${(c.go || c.ac)}14`, badge: `${(c.go || c.ac)}1A`, badgeText: c.go || c.ac, bar: c.go || c.ac },
    default: { border: c.border2, glow: "transparent", badge: c.surf2, badgeText: c.muted, bar: c.ac },
  };
  const tone = toneMap[nextMove.tone] || toneMap.default;

  // ── CTA label ────────────────────────────────────────────────────────────
  const ctaLabel = {
    "due-next": "See what's due",
    "payoff":   "Open payoff plan",
    "bills":    "Open bills",
    "overview": "See your progress",
  }[nextMove.action] || "Take a look";

  const handleCta = () => {
    if (nextMove.action === "due-next") { onDueNext?.(); return; }
    if (nextMove.action === "payoff")   { onPayoff?.(); return; }
    onBills?.();
  };

  // ── Target debt mini progress ─────────────────────────────────────────────
  const hasDebtBar = targetDebt &&
    typeof targetDebt.startingBalance === "number" &&
    targetDebt.startingBalance > 0;
  const debtRatio = hasDebtBar
    ? Math.min(1, Math.max(0, targetDebt.paidDown / targetDebt.startingBalance))
    : 0;
  const debtPct = Math.round(debtRatio * 100);

  return (
    <div
      style={{
        marginBottom: 16,
        background: c.surf,
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${tone.border}`,
        borderRadius: 18,
        padding: isMobile ? "18px 16px" : "20px 22px",
        boxShadow: `0 12px 32px ${tone.glow}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Eyebrow badge ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: 999,
          background: tone.badge,
          color: tone.badgeText,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Your next step
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: isMobile ? 20 : 24,
          fontWeight: 900,
          color: c.tx,
          lineHeight: 1.2,
          marginBottom: nextMove.detail ? 6 : 16,
        }}
      >
        {nextMove.body}
      </div>

      {/* ── Supporting detail ─────────────────────────────────────────────── */}
      {nextMove.detail && (
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6, marginBottom: 16 }}>
          {nextMove.detail}
        </div>
      )}

      {/* ── Mini debt progress bar ────────────────────────────────────────── */}
      {hasDebtBar && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted }}>
              {getBillDisplayName(targetDebt)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: tone.badgeText }}>
              {debtPct}% paid off
            </div>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: `${tone.bar}20`, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                width: `${debtPct}%`,
                background: tone.bar,
                transition: reducedMotion ? "none" : "width 0.7s ease",
              }}
            />
          </div>
          {targetDebt.currentBalanceLabel && (
            <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
              {targetDebt.currentBalanceLabel} remaining
            </div>
          )}
        </div>
      )}

      {/* ── CTA button ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleCta}
        style={{
          width: isMobile ? "100%" : "auto",
          padding: isMobile ? "13px 0" : "11px 20px",
          borderRadius: 12,
          border: "none",
          background: tone.border,
          color: nextMove.tone === "default" ? c.tx : "#001014",
          fontSize: 13,
          fontWeight: 900,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
