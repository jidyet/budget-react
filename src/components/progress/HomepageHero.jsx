/**
 * HomepageHero
 *
 * Big number: total debt balance (paydown bills only).
 * Progress bar: lifetime debt payoff progress.
 * Bottom strip: min. debt payments/mo vs monthly recurring bills/mo.
 * Month/year selector: top-right for context switching.
 */

import { MONTHS } from "../../data/mockAccounts";
import { getBillBalance, isDebtBill, isMonthlyBill } from "../../services/billModel";
import { fx0 } from "../../utils/budgetUtils";

const safeSum = (arr, fn) =>
  arr.reduce((sum, item) => sum + Math.max(0, Number(fn(item) || 0)), 0);

export default function HomepageHero({
  palette,
  isMobile,
  isHousehold,
  progress,
  selMonth,
  setSelMonth,
  selYear,
  setSelYear,
  selStyle,
  reducedMotion,
}) {
  const c = palette;

  // Split bills into debt (paydown/noInterest) and monthly recurring
  const allDebts = progress?.progressByDebt || [];
  const debts = allDebts.filter((d) => isDebtBill(d));
  const monthlyBills = allDebts.filter((d) => isMonthlyBill(d));

  // Lifetime progress — debt bills only
  const lifetimeStart = debts.reduce((sum, d) => sum + Math.max(0, d.startingBalance || 0), 0);
  const lifetimeRemaining = progress?.totalDebtLeft || 0;
  const lifetimePaidDown = Math.max(0, lifetimeStart - lifetimeRemaining);
  const lifetimeRatio = lifetimeStart > 0 ? Math.min(1, lifetimePaidDown / lifetimeStart) : 0;
  const lifetimePct = Math.round(lifetimeRatio * 100);

  // Bottom strip — monthly obligation totals
  const debtMinTotal = safeSum(debts, (b) => b.min_due_v ?? b.budgeted_min);
  const monthlyRecurringTotal = safeSum(monthlyBills, (b) => b.min_due_v ?? b.budgeted_min);
  const debtMinLabel = fx0(debtMinTotal);
  const monthlyRecurringLabel = fx0(monthlyRecurringTotal);

  // Fix 2: due/paid/left breakdown per column
  const debtDue  = safeSum(debts, (b) => b.min_due_v ?? b.budgeted_min ?? b.amount_due ?? 0);
  const debtPaid = safeSum(debts, (b) => b.paid_v ?? 0);
  const debtLeft = Math.max(debtDue - debtPaid, 0);
  const debtPct  = debtDue > 0 ? Math.min((debtPaid / debtDue) * 100, 100) : 0;

  const billsDue       = safeSum(monthlyBills, (b) => b.min_due_v ?? b.budgeted_min ?? b.amount_due ?? 0);
  const billsPaid      = safeSum(monthlyBills, (b) => b.paid_v ?? 0);
  const billsPaidCapped = Math.min(billsPaid, billsDue);
  const billsLeft      = Math.max(billsDue - billsPaidCapped, 0);
  const billsPct       = billsDue > 0 ? Math.min((billsPaidCapped / billsDue) * 100, 100) : 0;

  const yearOptions = Array.from(
    new Set([selYear - 1, selYear, selYear + 1, new Date().getFullYear() + 1])
  ).sort((a, b) => a - b);

  const hasData = debts.length > 0 || monthlyBills.length > 0;
  const hasDebt = debts.length > 0;
  const debtRemainingLabel = progress?.totalDebtLeftLabel || "—";
  const debugEnabled = Boolean(import.meta?.env?.DEV);

  if (debugEnabled) {
    const billSnapshot = (bill) => ({
      name: bill?.name || bill?.billName || "(unnamed)",
      billType: bill?.billType || bill?.type || "?",
      chosen_balance: getBillBalance(bill),
      raw: {
        cur_bal: bill?.cur_bal,
        currentBalance: bill?.currentBalance,
        base_bal_v: bill?.base_bal_v,
        paid_v: bill?.paid_v,
        purch_v: bill?.purch_v,
        starting_bal: bill?.starting_bal,
      },
    });
    console.group("=== TRACKTOZERO HERO DEBT DEBUG ===");
    console.log("Debt bills:", debts.length, "| Monthly bills:", monthlyBills.length);
    console.log("lifetimeStart:", lifetimeStart, "| lifetimeRemaining:", lifetimeRemaining, "| pct:", lifetimePct);
    console.log("debtMinTotal:", debtMinTotal, "| monthlyRecurringTotal:", monthlyRecurringTotal);
    console.log("Debt bills:", debts.map(billSnapshot));
    console.log("Monthly bills:", monthlyBills.map(billSnapshot));
    console.groupEnd();
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.ac}14, ${c.surf} 40%, ${c.surf2} 84%, ${c.wa}10)`,
        border: `1px solid ${c.border}`,
        borderRadius: 24,
        padding: isMobile ? "20px 18px 18px" : "24px 26px 20px",
        boxShadow: `0 20px 48px ${c.ac}12`,
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Eyebrow row — label left, month/year selectors right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: c.muted,
            fontFamily: "'Instrument Sans',sans-serif",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {isHousehold ? "Your household · debt balance" : "Debt balance"}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <select
            style={{ ...selStyle, fontSize: 11, padding: "4px 6px", borderRadius: 8, minWidth: 0 }}
            value={selMonth}
            onChange={(e) => setSelMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m.slice(0, 3)}</option>)}
          </select>
          <select
            style={{ ...selStyle, fontSize: 11, padding: "4px 6px", borderRadius: 8, minWidth: 0 }}
            value={selYear}
            onChange={(e) => setSelYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Hero number — paydown debt only */}
      <div
        style={{
          fontSize: isMobile ? 40 : 52,
          fontWeight: 900,
          color: c.tx,
          lineHeight: 1,
          marginBottom: 14,
          letterSpacing: "-0.02em",
          paddingRight: isMobile ? 80 : 140,
          fontFamily: "'DM Mono',monospace",
        }}
      >
        {hasDebt ? debtRemainingLabel : <span style={{ opacity: 0.3 }}>No debts yet</span>}
      </div>

      {/* Lifetime progress bar */}
      {hasDebt && lifetimeStart > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: `${c.ac}20`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                width: `${lifetimeRatio * 100}%`,
                background: `linear-gradient(90deg, ${c.ac}, ${c.ac}CC)`,
                transition: reducedMotion ? "none" : "width 0.8s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 5, fontFamily: "'Instrument Sans',sans-serif" }}>
            {lifetimePct}% paid off · {MONTHS[selMonth - 1]} {selYear}
          </div>
        </div>
      )}

      {/* Bottom strip — monthly obligation breakdown */}
      {hasData && (
        <div
          style={{
            display: "flex",
            gap: 0,
            marginTop: hasDebt && lifetimeStart > 0 ? 4 : 0,
            paddingTop: 12,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          {/* Min. debt payments column */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: c.ac,
                marginBottom: 3,
                fontFamily: "'Instrument Sans',sans-serif",
              }}
            >
              Debt payments
            </div>
            <div
              style={{
                fontSize: isMobile ? 16 : 19,
                fontWeight: 900,
                color: c.tx,
                fontFamily: "'DM Mono',monospace",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {debtMinLabel}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'Instrument Sans',sans-serif",
                  fontWeight: 600,
                  color: c.muted,
                  marginLeft: 1,
                }}
              >
                /mo
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: c.muted,
                marginTop: 2,
                fontFamily: "'Instrument Sans',sans-serif",
              }}
            >
              {debts.length} account{debts.length !== 1 ? "s" : ""}
            </div>
            {debtDue > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: c.muted }}>
                  <span>Due</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(debtDue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: c.go }}>
                  <span>Paid</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(debtPaid)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: debtLeft > 0 ? c.wa : c.go }}>
                  <span>Left</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(debtLeft)}</span>
                </div>
                <div style={{ marginTop: 4, height: 3, borderRadius: 999, background: `${c.ac}20`, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${debtPct}%`, background: c.ac, transition: "width 0.6s ease" }} />
                </div>
              </div>
            )}
          </div>

          {/* Vertical divider */}
          <div
            style={{
              width: 1,
              background: c.border,
              margin: "0 14px",
              flexShrink: 0,
              alignSelf: "stretch",
            }}
          />

          {/* Monthly recurring column */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: c.muted,
                marginBottom: 3,
                fontFamily: "'Instrument Sans',sans-serif",
              }}
            >
              Monthly recurring
            </div>
            <div
              style={{
                fontSize: isMobile ? 16 : 19,
                fontWeight: 900,
                color: c.tx,
                fontFamily: "'DM Mono',monospace",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {monthlyRecurringLabel}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'Instrument Sans',sans-serif",
                  fontWeight: 600,
                  color: c.muted,
                  marginLeft: 1,
                }}
              >
                /mo
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: c.muted,
                marginTop: 2,
                fontFamily: "'Instrument Sans',sans-serif",
              }}
            >
              {monthlyBills.length} bill{monthlyBills.length !== 1 ? "s" : ""}
            </div>
            {billsDue > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: c.muted }}>
                  <span>Due</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(billsDue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: c.go }}>
                  <span>Paid</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(billsPaidCapped)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Instrument Sans',sans-serif", color: billsLeft > 0 ? c.wa : c.go }}>
                  <span>Left</span><span style={{ fontFamily: "'DM Mono',monospace" }}>{fx0(billsLeft)}</span>
                </div>
                <div style={{ marginTop: 4, height: 3, borderRadius: 999, background: `${c.muted}20`, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${billsPct}%`, background: c.muted, transition: "width 0.6s ease" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
