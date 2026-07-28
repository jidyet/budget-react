import { fx } from "../../utils/budgetUtils";
import { getBillDisplayName, getBillMonthlyCoverageStatus, isBillOverdue, isMonthlyBill } from "../../services/billModel";

function pickFocusDebt(allAccts, progress) {
  const active = allAccts.filter((a) => Number(a.cur_bal ?? 0) > 0.01 && !isMonthlyBill(a));
  if (!active.length) return null;

  // 1. Behind this month — overdue, unpaid, still has a balance
  const overdue = active
    .filter((a) => isBillOverdue(a))
    .sort((a, b) => Number(a.d_left) - Number(b.d_left));
  if (overdue.length) return { debt: overdue[0], reason: "Behind this month" };

  // 2. Almost done — smallest balance not yet cleared
  if (progress.almostDoneDebt && !progress.almostDoneDebt.cleared) {
    return { debt: progress.almostDoneDebt, reason: "Smallest left" };
  }

  // 3. Highest APR (avalanche pick)
  if (progress.nextFocusDebt) {
    const dLeft = Number(progress.nextFocusDebt.d_left ?? 999);
    const apr = Number(
      progress.nextFocusDebt.effectiveApr ??
      progress.nextFocusDebt.apr_v ??
      progress.nextFocusDebt.apr ?? 0
    );
    const reason =
      dLeft >= 0 && dLeft <= 7 ? "Due soon"
      : apr > 0.01              ? "High APR"
      :                           "Biggest balance";
    return { debt: progress.nextFocusDebt, reason };
  }

  return null;
}

const REASON_COLORS = {
  "Behind this month": { bg: "da", text: "da" },
  "High APR":          { bg: "wa", text: "wa" },
  "Due soon":          { bg: "wa", text: "wa" },
  "Smallest left":     { bg: "go", text: "go" },
  "Biggest balance":   { bg: "ac", text: "ac" },
};

export default function FocusDebtCard({ palette: c, allAccts, progress, onOpenBill }) {
  if (!allAccts?.length) return null;

  const result = pickFocusDebt(allAccts, progress);
  if (!result) return null;

  const { debt, reason } = result;
  const balance = Number(debt.cur_bal ?? debt.currentBalance ?? 0);
  const dueThisMonth = Number(debt.min_due_v ?? debt.budgeted_min ?? 0);
  const isMonthly = isMonthlyBill(debt);
  const coverageStatus = getBillMonthlyCoverageStatus(debt);
  const paidSoFar = Number(debt.paid_v ?? 0);
  const covered = coverageStatus === "covered" || coverageStatus === "overcovered";

  const colorKey = REASON_COLORS[reason] ?? { bg: "ac", text: "ac" };
  const badgeBg = c[colorKey.bg];
  const badgeText = c[colorKey.text];

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${c.border}`,
        background: `linear-gradient(135deg, ${c.ac}10, ${c.surf} 50%, ${c.surf2})`,
        padding: "16px 18px",
        boxShadow: `0 12px 28px rgba(0,0,0,0.07)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: c.muted,
          marginBottom: 5,
          fontFamily: "'Instrument Sans',sans-serif",
        }}
      >
        Focus debt
      </div>

      {/* Bill name */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          color: c.tx,
          marginBottom: 6,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {getBillDisplayName(debt)}
      </div>

      {/* Reason badge */}
      <span
        style={{
          display: "inline-block",
          padding: "3px 9px",
          borderRadius: 999,
          background: `${badgeBg}22`,
          border: `1px solid ${badgeBg}55`,
          color: badgeText,
          fontSize: 11,
          fontWeight: 900,
          marginBottom: 14,
          fontFamily: "'Instrument Sans',sans-serif",
          alignSelf: "flex-start",
        }}
      >
        {reason}
      </span>

      {/* Numbers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: c.muted,
              marginBottom: 2,
              fontFamily: "'Instrument Sans',sans-serif",
            }}
          >
            Balance
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>
            {fx(balance)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: c.muted,
              marginBottom: 2,
              fontFamily: "'Instrument Sans',sans-serif",
            }}
          >
            Due this month
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>
            {dueThisMonth > 0 ? fx(dueThisMonth) : "—"}
          </div>
        </div>
      </div>

      {/* Monthly coverage hint */}
      {isMonthly && (
        <div
          style={{
            fontSize: 12,
            color: covered ? c.go : paidSoFar > 0 ? c.wa : c.muted,
            marginBottom: 12,
            fontFamily: "'Instrument Sans',sans-serif",
          }}
        >
          {covered
            ? "Covered this month ✓"
            : paidSoFar > 0
            ? `${fx(paidSoFar)} paid so far`
            : "Not covered yet this month"}
        </div>
      )}

      {/* Fix 5: payoff progress bar + hint */}
      {(() => {
        const cur       = Number(debt.cur_bal ?? 0);
        const start     = Number(debt.starting_bal ?? debt.base_bal_v ?? debt.startingBalance ?? cur);
        const apr       = Number(debt.apr_v ?? debt.apr ?? debt.effectiveApr ?? 0);
        const payoffPct = start > 0 ? Math.min(((start - cur) / start) * 100, 100) : 0;
        const extraSavings = Math.max(0, Math.round((cur * apr) / 12 * 3));
        const hint = apr > 0 && extraSavings > 0
          ? `${Math.round(payoffPct)}% paid off · paying $50 extra saves ~$${extraSavings}`
          : apr === 0
          ? `${Math.round(payoffPct)}% paid off · no-interest plan`
          : `${Math.round(payoffPct)}% paid off`;
        const safePayoffPct = Math.max(0, Math.min(Number(payoffPct || 0), 100));
        return (
          <div style={{ marginBottom: 12 }}>
            <div style={{ width: "100%", height: 6, background: "var(--color-border-tertiary, rgba(0,0,0,0.1))", borderRadius: 3, overflow: "hidden", margin: "8px 0 4px" }}>
              <div style={{ width: `${safePayoffPct}%`, height: "100%", background: "var(--color-text-danger, #E24B4A)", borderRadius: 3, minWidth: safePayoffPct > 0 ? 4 : 0, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>{hint}</div>
          </div>
        );
      })()}

      {/* Action */}
      <button
        type="button"
        onClick={() => onOpenBill?.(debt.id)}
        style={{
          alignSelf: "flex-start",
          marginTop: "auto",
          padding: "9px 16px",
          borderRadius: 10,
          border: `1px solid ${c.border2}`,
          background: c.surf2,
          color: c.tx,
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "'Instrument Sans',sans-serif",
        }}
      >
        Open bill
      </button>
    </div>
  );
}
