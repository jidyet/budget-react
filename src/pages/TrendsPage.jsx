import { useMemo } from "react";
import { fx, pct, getEffectiveApr, getStartOfWeek } from "../utils/budgetUtils";
import { CAT_ICON } from "../data/mockAccounts";

const TrendsPage = ({
  c,
  isMobile,
  mounted,
  allAccts,
  allOwners,
  selMonth,
  selYear,
  income,
  assets,
  setCatF,
  navigateTo,
}) => {
  const CHART_COLORS = useMemo(() => [c.ac, c.go, c.wa, c.da, "#6366f1"], [c.ac, c.go, c.wa, c.da]);

  // ── Core derived data ──────────────────────────────────────────
  const activeDebts = useMemo(() =>
    allAccts.filter((a) => Number(a.cur_bal || 0) > 0.01),
  [allAccts]);

  const debtByAccount = useMemo(() =>
    activeDebts.map((a) => {
      const apr = getEffectiveApr(a, selMonth, selYear);
      const bal = Number(a.cur_bal || 0);
      const monthlyInterest = bal * (apr / 12);
      const planned = Math.max(0, Number(a.planned_v || 0));
      const paid = Math.max(0, Number(a.paid_v || 0));
      const minDue = Number(a.min_due_v || 0);
      const effectivePayment = planned > 0 ? planned : paid > 0 ? paid : minDue;
      const principal = Math.max(0, effectivePayment - monthlyInterest);
      return { ...a, apr, bal, monthlyInterest, minDue, planned, effectivePayment, principal };
    }).sort((a, b) => b.monthlyInterest - a.monthlyInterest),
  [activeDebts, selMonth, selYear]);

  const totals = useMemo(() => ({
    balance: debtByAccount.reduce((s, a) => s + a.bal, 0),
    interest: debtByAccount.reduce((s, a) => s + a.monthlyInterest, 0),
    minDue: debtByAccount.reduce((s, a) => s + a.minDue, 0),
    planned: debtByAccount.reduce((s, a) => s + a.effectivePayment, 0),
    principal: debtByAccount.reduce((s, a) => s + a.principal, 0),
  }), [debtByAccount]);

  // Next payment due
  const nextDue = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDate();
    const candidates = activeDebts
      .filter((a) => Number(a.due_day || 0) > 0)
      .map((a) => {
        const day = Number(a.due_day);
        const daysUntil = day >= todayDay ? day - todayDay : (new Date(selYear, selMonth, 0).getDate() - todayDay) + day;
        return { ...a, day, daysUntil };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
    return candidates[0] || null;
  }, [activeDebts, selMonth, selYear]);

  // Category breakdown
  const catRows = useMemo(() => {
    const bycat = {};
    allAccts.forEach((a) => { bycat[a.category] = (bycat[a.category] || 0) + (a.cur_bal || 0); });
    return Object.entries(bycat).sort((a, b) => b[1] - a[1]);
  }, [allAccts]);
  const totalCatDebt = useMemo(() => catRows.reduce((s, [, v]) => s + v, 0) || 1, [catRows]);

  // Owner breakdown
  const ownerRows = useMemo(() => allOwners
    .filter((o) => o !== "All")
    .map((owner) => ({
      owner,
      bal: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.cur_bal || 0), 0),
      interest: debtByAccount.filter((a) => a.owner === owner).reduce((s, a) => s + a.monthlyInterest, 0),
    }))
    .filter((o) => o.bal > 0)
    .sort((a, b) => b.bal - a.bal),
  [allAccts, allOwners, debtByAccount]);

  // Donut
  const donutBg = useMemo(() => {
    const { stops } = catRows.slice(0, 5).reduce((acc, [, v], i) => {
      const from = acc.runningPct;
      const pctV = (v / totalCatDebt) * 100;
      const to = from + pctV;
      acc.stops.push(`${CHART_COLORS[i % CHART_COLORS.length]} ${from}% ${to}%`);
      acc.runningPct = to;
      return acc;
    }, { runningPct: 0, stops: [] });
    return stops.length
      ? `conic-gradient(${stops.join(", ")})`
      : `conic-gradient(${c.border2} 0% 100%)`;
  }, [catRows, totalCatDebt, CHART_COLORS, c.border2]);

  // Due flow
  const { dueSeries, maxDueSeries } = useMemo(() => {
    const monthStart = new Date(selYear, selMonth - 1, 1);
    const monthEnd = new Date(selYear, selMonth, 0);
    const bands = [];
    const cursor = getStartOfWeek(monthStart);
    while (cursor <= monthEnd) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      const visibleStart = start < monthStart ? monthStart : start;
      const visibleEnd = end > monthEnd ? monthEnd : end;
      bands.push({
        start, end,
        label: `${visibleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}-${visibleEnd.toLocaleDateString("en-US", { day: "numeric" })}`,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    const series = bands.map((band) => ({
      label: band.label,
      val: allAccts.filter((a) => {
        const dueDay = Number(a.due_day || 0);
        if (!dueDay) return false;
        const dueDate = new Date(selYear, selMonth - 1, dueDay);
        return dueDate >= band.start && dueDate <= band.end && dueDate >= monthStart && dueDate <= monthEnd;
      }).reduce((s, a) => s + (a.min_due_v || 0), 0),
    }));
    return { dueSeries: series, maxDueSeries: Math.max(1, ...series.map((d) => d.val)) };
  }, [allAccts, selMonth, selYear]);

  // Top high-rate debts
  const topRateRows = useMemo(() =>
    debtByAccount.filter((a) => a.apr > 0).sort((a, b) => b.apr - a.apr).slice(0, 4),
  [debtByAccount]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16 }}>

      {/* ── 3 Summary cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ background: `linear-gradient(135deg, ${c.da}12, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Interest this month</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 900, color: totals.interest > 0 ? c.da : c.tx, marginBottom: 4 }}>{fx(totals.interest)}</div>
          <div style={{ fontSize: 12, color: c.tx2 }}>
            {totals.minDue > 0
              ? `${Math.round((totals.interest / totals.minDue) * 100)}% of your ${fx(totals.minDue)} minimum goes to interest`
              : "No minimum payments set"}
          </div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${c.ac}12, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Principal paid</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 900, color: c.ac, marginBottom: 4 }}>{fx(totals.principal)}</div>
          <div style={{ fontSize: 12, color: c.tx2 }}>
            {totals.minDue > 0
              ? `${Math.round((totals.principal / totals.minDue) * 100)}% of minimums actually reduce your debt`
              : "Pay more than interest to reduce balance"}
          </div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${c.go}12, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px", gridColumn: isMobile ? "1 / -1" : "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Next payment due</div>
          {nextDue ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 900, color: c.tx, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nextDue.name}</div>
              <div style={{ fontSize: 12, color: c.tx2 }}>
                {nextDue.daysUntil === 0 ? "Due today" : `In ${nextDue.daysUntil} day${nextDue.daysUntil === 1 ? "" : "s"}`}
                {" · "}{fx(nextDue.minDue || nextDue.min_due_v || 0)} due on the {nextDue.day}{((d) => d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th")(nextDue.day)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: c.muted }}>Set due dates on your bills to see this.</div>
          )}
        </div>
      </div>

      {/* ── Interest cost by debt ── */}
      {debtByAccount.length > 0 && (
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Monthly cost breakdown</div>
          <div style={{ fontSize: 12, color: c.tx2, marginBottom: 16 }}>
            Of your {fx(totals.minDue)} in minimums, {fx(totals.interest)} is interest — here's where it goes.
          </div>

          {/* Summary bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: c.muted, marginBottom: 5 }}>
              <span>Interest {fx(totals.interest)}</span>
              <span>Principal {fx(totals.principal)}</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: c.surf2, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${(totals.interest / Math.max(totals.minDue, 0.01)) * 100}%`, background: c.da, opacity: 0.85, transition: "width 0.5s" }} />
              <div style={{ width: `${(totals.principal / Math.max(totals.minDue, 0.01)) * 100}%`, background: c.ac, opacity: 0.7, transition: "width 0.5s" }} />
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: 99, background: c.da }} /><span style={{ color: c.muted }}>Interest</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: 99, background: c.ac }} /><span style={{ color: c.muted }}>Principal</span></div>
            </div>
          </div>

          {/* Per-debt cards */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {debtByAccount.slice(0, 6).map((a) => {
              const interestShare = a.minDue > 0 ? a.monthlyInterest / a.minDue : 0;
              const interestPct = Math.round(interestShare * 100);
              const principalPct = 100 - interestPct;
              const isHighCost = interestShare > 0.5;
              return (
                <div key={a.id} style={{
                  borderRadius: 12,
                  border: `1px solid ${isHighCost ? `${c.da}40` : c.border}`,
                  background: isHighCost ? `linear-gradient(135deg, ${c.da}08, ${c.surf})` : c.surf2,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {/* Name + APR badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.tx, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: isHighCost ? c.da : c.muted, background: isHighCost ? `${c.da}15` : c.surf, border: `1px solid ${isHighCost ? `${c.da}30` : c.border}`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                      {pct(a.apr)}
                    </div>
                  </div>

                  {/* Mini stacked bar */}
                  <div style={{ height: 6, borderRadius: 99, background: c.surf, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${interestPct}%`, background: c.da, opacity: 0.8, transition: "width 0.5s" }} />
                    <div style={{ width: `${principalPct}%`, background: c.ac, opacity: 0.6, transition: "width 0.5s" }} />
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                    <div>
                      <div style={{ fontSize: 10, color: c.muted, marginBottom: 1 }}>Interest</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: c.da, fontFamily: "'DM Mono',monospace" }}>{fx(a.monthlyInterest)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: c.muted, marginBottom: 1 }}>Principal</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: c.ac, fontFamily: "'DM Mono',monospace" }}>{fx(a.principal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: c.muted, marginBottom: 1 }}>Balance</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c.tx, fontFamily: "'DM Mono',monospace" }}>{fx(a.bal)}</div>
                    </div>
                  </div>

                  {/* Interest % label */}
                  <div style={{ fontSize: 11, color: isHighCost ? c.da : c.muted }}>
                    {interestPct}% of your {fx(a.minDue)} minimum is interest
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insight footer */}
          {totals.interest > 0 && totals.balance > 0 && (() => {
            const months = Math.ceil(totals.balance / Math.max(0.01, totals.principal));
            const totalInterestCost = totals.interest * months;
            return (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: `linear-gradient(135deg, ${c.da}08, ${c.surf2})`, border: `1px solid ${c.da}25`, fontSize: 12, color: c.tx2, lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: c.tx, marginBottom: 4 }}>At minimum payments only</div>
                <div>Payoff in roughly <strong style={{ color: c.tx }}>{months} months</strong> · <strong style={{ color: c.da }}>{fx(totalInterestCost)}</strong> total interest cost · only <strong style={{ color: c.ac }}>{Math.round((totals.principal / Math.max(totals.minDue, 0.01)) * 100)}%</strong> of each payment reduces your balance</div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Debt mix + Owner balance ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 10 }}>Debt mix</div>
          <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
            <div
              style={{ width: 160, height: 160, borderRadius: "50%", background: donutBg, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
              onClick={() => { setCatF("All"); navigateTo("bills"); }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.75"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: c.surf, display: "grid", placeItems: "center", border: `1px solid ${c.border}` }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: c.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total</div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700 }}>{fx(totalCatDebt)}</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, width: isMobile ? "100%" : "auto" }}>
              {catRows.slice(0, 5).map(([cat, val], i) => (
                <div
                  key={cat}
                  style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 12, cursor: "pointer" }}
                  onClick={() => { setCatF(cat); navigateTo("bills"); }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: CHART_COLORS[i % CHART_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{CAT_ICON[cat] || "-"} {cat}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: c.tx2 }}>{Math.round((val / totalCatDebt) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Who holds the balance</div>
          {ownerRows.length > 1 ? (
            <>
              <div style={{ height: 28, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 12 }}>
                {(() => {
                  const grandTotal = ownerRows.reduce((s, o) => s + o.bal, 0) || 1;
                  return ownerRows.map((o, i) => (
                    <div key={o.owner} title={`${o.owner}: ${fx(o.bal)}`}
                      style={{ width: `${(o.bal / grandTotal) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length], transition: "width 0.5s" }} />
                  ));
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(() => {
                  const grandTotal = ownerRows.reduce((s, o) => s + o.bal, 0) || 1;
                  return ownerRows.map((o, i) => (
                    <div key={o.owner}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                          <span style={{ color: c.tx, fontWeight: 700 }}>{o.owner}</span>
                        </div>
                        <div style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: c.tx }}>{fx(o.bal)}</div>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: c.surf2, overflow: "hidden" }}>
                        <div style={{ width: `${(o.bal / grandTotal) * 100}%`, height: "100%", background: CHART_COLORS[i % CHART_COLORS.length], opacity: 0.7 }} />
                      </div>
                      <div style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                        {pct(o.bal / grandTotal)} of debt · {fx(o.interest)}/mo interest
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: c.muted }}>
              {ownerRows.length === 1
                ? `All ${fx(ownerRows[0].bal)} is held by ${ownerRows[0].owner}.`
                : "Add owners to your bills to see the breakdown."}
            </div>
          )}
        </div>
      </div>

      {/* ── Due flow + Highest rates ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Due flow this month</div>
          <div style={{ fontSize: 11, color: c.muted, marginBottom: 10 }}>Week-by-week view of what's due.</div>
          {(() => {
            const W = 520, H = 220, PAD = { t: 28, r: 26, b: 58, l: 68 };
            const cW = W - PAD.l - PAD.r;
            const cH = H - PAD.t - PAD.b;
            const weekStep = dueSeries.length > 1 ? cW / (dueSeries.length - 1) : 0;
            const chartPts = dueSeries.map((d, i) => ({
              x: PAD.l + i * weekStep,
              y: PAD.t + cH - (d.val / maxDueSeries) * cH,
              val: d.val, label: d.label,
            }));
            const chartLine = chartPts.map((p) => `${p.x},${p.y}`).join(" ");
            const areaPath = chartPts.length
              ? `M${chartPts[0].x},${PAD.t + cH} ` + chartPts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${chartPts[chartPts.length - 1].x},${PAD.t + cH} Z`
              : "";
            return (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={isMobile ? "210" : "220"} style={{ display: "block" }}>
                <defs>
                  <linearGradient id="weeklyDueArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.ac} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={c.ac} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((f, i) => (
                  <line key={i} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="4,6" />
                ))}
                {[0, 0.5, 1].map((f, i) => (
                  <text key={i} x={PAD.l - 8} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="10" fill={c.muted} fontFamily="'DM Mono',monospace">
                    {fx(maxDueSeries * (1 - f))}
                  </text>
                ))}
                {chartPts.length > 1 && <path d={areaPath} fill="url(#weeklyDueArea)" />}
                <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke={c.border2} strokeWidth="1.5" />
                <polyline points={chartLine} fill="none" stroke={c.ac} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                {chartPts.map((p) => (
                  <g key={p.label}>
                    <circle cx={p.x} cy={p.y} r="5.5" fill={c.ac} stroke={c.surf} strokeWidth="2.5" />
                    <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="10" fill={c.muted} fontFamily="'DM Mono',monospace">{fx(p.val)}</text>
                    <text x={p.x} y={H - 18} textAnchor="middle" fontSize="11" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{p.label}</text>
                  </g>
                ))}
              </svg>
            );
          })()}
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Highest rates</div>
          <div style={{ fontSize: 11, color: c.muted, marginBottom: 14 }}>The debts costing you the most to carry.</div>
          {topRateRows.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {topRateRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigateTo("payoff")}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10, alignItems: "center", width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: 12,
                    border: `1px solid ${c.border}`,
                    background: `linear-gradient(135deg, ${c.da}10, ${c.surf})`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: c.tx2, marginTop: 2 }}>{fx(row.bal)} balance · {fx(row.monthlyInterest)}/mo interest</div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 800, color: c.da, flexShrink: 0 }}>
                    {Math.round(row.apr * 100)}%
                  </div>
                </button>
              ))}
              <div style={{ fontSize: 11, color: c.muted, textAlign: "center", paddingTop: 4 }}>
                Tap any to open Payoff and build a plan
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: c.muted }}>Add APR to your bills to compare rates.</div>
          )}
        </div>
      </div>

      {/* ── Net Worth ── */}
      {assets > 0 && (() => {
        const totalDebt = allAccts.reduce((s, a) => s + (Number(a.cur_bal) || 0), 0);
        const netWorth = assets - totalDebt;
        const total = assets + totalDebt || 1;
        const nwColor = netWorth >= 0 ? c.go : c.da;
        return (
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Net worth snapshot</div>
            <div style={{ height: 28, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 10 }}>
              <div title={`Assets: ${fx(assets)}`} style={{ width: `${(assets / total) * 100}%`, background: c.go, transition: "width 0.5s", minWidth: 2 }} />
              <div title={`Debt: ${fx(totalDebt)}`} style={{ width: `${(totalDebt / total) * 100}%`, background: c.da, transition: "width 0.5s", minWidth: 2 }} />
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[
                { label: "Assets", val: assets, color: c.go },
                { label: "Debt", val: totalDebt, color: c.da },
                { label: "Net Worth", val: netWorth, color: nwColor, signed: true },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: item.color }} />
                  <span style={{ color: c.tx2 }}>{item.label}</span>
                  <span style={{ color: item.signed ? item.color : c.tx, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                    {item.signed && item.val < 0 ? "-" : ""}{fx(Math.abs(item.val))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default TrendsPage;
