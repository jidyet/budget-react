import { getBillDisplayName } from "../../services/billModel";

/**
 * AlmostDoneCard — Phase 6 update
 * Supporting card: "Closest to gone" label, mini ratio bar when debt exists.
 */
export default function AlmostDoneCard({ palette, debt, reducedMotion }) {
  const c = palette;
  const hasDebt = !!debt;
  const ratio = hasDebt && debt.startingBalance > 0
    ? Math.min(1, Math.max(0, (debt.paidDown || 0) / debt.startingBalance))
    : 0;
  const pct = Math.round(ratio * 100);
  const minDue = hasDebt ? Number(debt.min_due_v ?? debt.budgeted_min ?? 0) : 0;
  const curBal = hasDebt ? Number(debt.cur_bal ?? 0) : 0;
  const paymentsLeft = minDue > 0 ? Math.ceil(curBal / minDue) : null;

  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 18,
      background: hasDebt
        ? `linear-gradient(135deg, ${c.ac}18 0%, ${c.surf} 55%)`
        : `linear-gradient(135deg, ${c.surf2} 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${hasDebt ? c.ac + "44" : c.border}`,
      display: "grid",
      gap: 6,
      boxShadow: hasDebt ? `0 4px 18px ${c.ac}14` : "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: hasDebt ? c.ac : c.muted }}>
        Closest to gone
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: hasDebt ? c.ac : c.tx, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {hasDebt ? getBillDisplayName(debt) : "Keep going"}
      </div>
      {hasDebt ? (
        <>
          {(() => {
            const safePayoffPct = Math.max(0, Math.min(Number(pct || 0), 100));
            return (
              <div style={{ width: "100%", height: 6, background: "var(--color-border-tertiary, rgba(0,0,0,0.1))", borderRadius: 3, overflow: "hidden", margin: "8px 0 4px" }}>
                <div style={{ width: `${safePayoffPct}%`, height: "100%", background: "var(--color-text-success, #1D9E75)", borderRadius: 3, minWidth: safePayoffPct > 0 ? 4 : 0, transition: reducedMotion ? "none" : "width 0.3s ease" }} />
              </div>
            );
          })()}
          <div style={{ fontSize: 11, color: c.muted }}>
            {debt.currentBalanceLabel || ""} left · {pct}% paid off{paymentsLeft ? ` · ~${paymentsLeft} payments left` : ""}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: c.tx2 }}>All debts on track!</div>
      )}
    </div>
  );
}
