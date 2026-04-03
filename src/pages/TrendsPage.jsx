import { useMemo } from "react";
import { getMonthKey } from "../firebase";
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

  const catRows = useMemo(() => {
    const bycat = {};
    allAccts.forEach((a) => { bycat[a.category] = (bycat[a.category] || 0) + (a.cur_bal || 0); });
    return Object.entries(bycat).sort((a, b) => b[1] - a[1]);
  }, [allAccts]);

  const ownerRows = useMemo(() => allOwners
    .filter((o) => o !== "All")
    .map((owner) => ({
      owner,
      bal: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.cur_bal || 0), 0),
    }))
    .sort((a, b) => b.bal - a.bal),
  [allAccts, allOwners]);

  const totalCatDebt = useMemo(() => catRows.reduce((s, [, v]) => s + v, 0) || 1, [catRows]);
  const topCategory = catRows[0];
  const topOwner = ownerRows[0];

  const topRateRows = useMemo(() => allAccts
    .filter((a) => (a.effectiveApr ?? getEffectiveApr(a, selMonth, selYear)) > 0 && Number(a.cur_bal || 0) > 0)
    .map((a) => ({
      id: a.id,
      name: a.name,
      owner: a.owner,
      balance: Number(a.cur_bal || 0),
      apr: a.effectiveApr ?? getEffectiveApr(a, selMonth, selYear),
    }))
    .sort((a, b) => b.apr - a.apr || b.balance - a.balance)
    .slice(0, 4),
  [allAccts, selMonth, selYear]);

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

  const { dueSeries, maxDueSeries } = useMemo(() => {
    const monthStart = new Date(selYear, selMonth - 1, 1);
    const monthEnd  = new Date(selYear, selMonth, 0);
    const bands = [];
    const cursor = getStartOfWeek(monthStart);
    while (cursor <= monthEnd) {
      const start = new Date(cursor);
      const end   = new Date(cursor);
      end.setDate(end.getDate() + 6);
      const visibleStart = start < monthStart ? monthStart : start;
      const visibleEnd   = end   > monthEnd   ? monthEnd   : end;
      bands.push({
        start,
        end,
        label: `${visibleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}-${visibleEnd.toLocaleDateString("en-US", { day: "numeric" })}`,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    const series = bands.map((band) => ({
      label: band.label,
      val: allAccts
        .filter((a) => {
          const dueDay = Number(a.due_day || 0);
          if (!dueDay) return false;
          const dueDate = new Date(selYear, selMonth - 1, dueDay);
          return dueDate >= band.start && dueDate <= band.end && dueDate >= monthStart && dueDate <= monthEnd;
        })
        .reduce((s, a) => s + (a.min_due_v || 0), 0),
    }));
    return { dueSeries: series, maxDueSeries: Math.max(1, ...series.map((d) => d.val)) };
  }, [allAccts, selMonth, selYear]);

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ background: `linear-gradient(135deg, ${c.ac}14, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Biggest share</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{topCategory ? topCategory[0] : "No data yet"}</div>
          <div style={{ fontSize: 12, color: c.tx2 }}>{topCategory ? `${Math.round((topCategory[1] / totalCatDebt) * 100)}% of debt` : "Add bills to see trends"}</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${c.wa}12, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Top owner</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{topOwner?.owner || "No data yet"}</div>
          <div style={{ fontSize: 12, color: c.tx2 }}>{topOwner ? fx(topOwner.bal) : "Waiting for balances"}</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${c.go}12, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>This month due</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{fx(dueSeries.reduce((sum, item) => sum + item.val, 0))}</div>
          <div style={{ fontSize: 12, color: c.tx2 }}>Spread across {dueSeries.length} weekly view{dueSeries.length === 1 ? "" : "s"}</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${c.da}10, ${c.surf})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Highest rate</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
            {topRateRows[0] ? `${Math.round(topRateRows[0].apr * 100)}%` : "No APR yet"}
          </div>
          <div style={{ fontSize: 12, color: c.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {topRateRows[0] ? topRateRows[0].name : "Add APR to compare"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 10 }}>Debt mix</div>
          <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
            <div
              style={{ width: 170, height: 170, borderRadius: "50%", background: donutBg, display: "grid", placeItems: "center", cursor: "pointer", transition: "opacity 0.2s" }}
              onClick={() => { setCatF("All"); navigateTo("bills"); }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <div style={{ width: 108, height: 108, borderRadius: "50%", background: c.surf, display: "grid", placeItems: "center", border: `1px solid ${c.border}` }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: c.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Debt</div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 700 }}>{fx(totalCatDebt)}</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, width: isMobile ? "100%" : "auto" }}>
              {catRows.slice(0, 5).map(([cat, val], i) => (
                <div
                  key={cat}
                  style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 12, cursor: "pointer" }}
                  onClick={() => { setCatF(cat); navigateTo("bills"); }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: CHART_COLORS[i % CHART_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{CAT_ICON[cat] || "-"} {cat}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{Math.round((val / totalCatDebt) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          {(() => {
            const ownerColors = [c.ac, "#6366f1", c.wa, c.go, c.da];
            const ownerTotals = ownerRows.map((o, i) => ({ owner: o.owner, total: o.bal, color: ownerColors[i % ownerColors.length] })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
            const grandTotal = ownerTotals.reduce((s, d) => s + d.total, 0) || 1;
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Who holds the balance</div>
                <div style={{ height: 28, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 12 }}>
                  {ownerTotals.map((d) => (
                    <div key={d.owner} title={`${d.owner}: ${fx(d.total)}`}
                      style={{ width: `${(d.total / grandTotal) * 100}%`, background: d.color, transition: "width 0.5s" }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
                  {ownerTotals.map((d) => (
                    <div key={d.owner} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                      <span style={{ color: c.tx2 }}>{d.owner}</span>
                      <span style={{ color: c.tx, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fx(d.total)}</span>
                      <span style={{ color: c.muted }}>({pct(d.total / grandTotal)})</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          {(() => {
            const curMk = getMonthKey(selMonth, selYear);
            const last6Months = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date(selYear, selMonth - 1 - i, 1);
              const mk = getMonthKey(d.getMonth() + 1, d.getFullYear());
              const monthLabel = d.toLocaleString("default", { month: "short" });
              let total;
              if (mk === curMk) {
                total = allAccts.reduce((sum, a) => sum + (Number(a.cur_bal) || 0), 0);
              } else {
                total = allAccts.reduce((sum, a) => sum + (Number(a.starting_bal) || 0), 0);
              }
              last6Months.push({ label: monthLabel, total });
            }
            const W = 400, H = 160, PAD = { t: 16, r: 16, b: 32, l: 56 };
            const cW = W - PAD.l - PAD.r;
            const cH = H - PAD.t - PAD.b;
            const maxV = Math.max(...last6Months.map(d => d.total), 1);
            const minV = Math.min(...last6Months.map(d => d.total), 0);
            const range = maxV - minV || 1;
            const pts = last6Months.map((d, idx) => ({
              x: PAD.l + (idx / (last6Months.length - 1 || 1)) * cW,
              y: PAD.t + cH - ((d.total - minV) / range) * cH,
              val: d.total, label: d.label
            }));
            const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
            const areaPath = `M${pts[0].x},${PAD.t + cH} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length - 1].x},${PAD.t + cH} Z`;
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Debt over time</div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.ac} stopOpacity="0.25" />
                      <stop offset="100%" stopColor={c.ac} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((f, gi) => (
                    <line key={gi} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4" />
                  ))}
                  {[0, 0.5, 1].map((f, gi) => (
                    <text key={gi} x={PAD.l - 6} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                      {fx(minV + (1 - f) * range)}
                    </text>
                  ))}
                  <path d={areaPath} fill="url(#areaGrad)" />
                  <polyline points={polyline} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((p, pi) => (
                    <g key={pi}>
                      <circle cx={p.x} cy={p.y} r="4" fill={c.ac} stroke={c.surf} strokeWidth="2" />
                      <text x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{p.label}</text>
                    </g>
                  ))}
                </svg>
              </div>
            );
          })()}
          {(() => {
            const cfData = [];
            const curMk = getMonthKey(selMonth, selYear);
            for (let i = 5; i >= 0; i--) {
              const d = new Date(selYear, selMonth - 1 - i, 1);
              const mk = getMonthKey(d.getMonth() + 1, d.getFullYear());
              const monthLabel = d.toLocaleString("default", { month: "short" });
              let totalBills;
              if (mk === curMk) {
                totalBills = allAccts.reduce((sum, a) => sum + (Number(a.min_due_v) || 0), 0);
              } else {
                totalBills = allAccts.reduce((sum, a) => sum + (Number(a.budgeted_min) || 0), 0);
              }
              const incomeAmt = mk === curMk ? income.reduce((s, e) => s + (Number(e.amt) || 0), 0) : 0;
              cfData.push({ label: monthLabel, bills: totalBills, income: incomeAmt });
            }
            const maxCF = Math.max(...cfData.flatMap(d => [d.bills, d.income]), 1);
            const W = 440, H = 180, PAD = { t: 16, r: 16, b: 32, l: 56 };
            const cW = W - PAD.l - PAD.r;
            const cH = H - PAD.t - PAD.b;
            const barGroupW = cW / cfData.length;
            const barW = Math.min(barGroupW * 0.35, 22);
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Cash in vs bills</div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c.tx2 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: c.go }} /> Income</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c.tx2 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: c.da }} /> Bills</div>
                </div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                  {[0, 0.5, 1].map((f, gi) => (
                    <line key={gi} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4" />
                  ))}
                  {cfData.map((d, ci) => {
                    const cx = PAD.l + (ci + 0.5) * barGroupW;
                    const incomeH = (d.income / maxCF) * cH;
                    const billsH = (d.bills / maxCF) * cH;
                    return (
                      <g key={ci}>
                        <rect x={cx - barW - 2} y={PAD.t + cH - incomeH} width={barW} height={incomeH} rx="3" fill={c.go} opacity="0.85" />
                        <rect x={cx + 2} y={PAD.t + cH - billsH} width={barW} height={billsH} rx="3" fill={c.da} opacity="0.85" />
                        <text x={cx} y={H - 6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{d.label}</text>
                      </g>
                    );
                  })}
                  {[0, 0.5, 1].map((f, gi) => (
                    <text key={gi} x={PAD.l - 6} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                      {fx(maxCF * (1 - f))}
                    </text>
                  ))}
                </svg>
              </div>
            );
          })()}
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Due flow this month</div>
          <div style={{ fontSize: 11, color: c.muted, marginBottom: 10 }}>A calm week-by-week look at what is due next.</div>
          {(() => {
            const W = 520, H = 220, PAD = { t: 28, r: 26, b: 58, l: 48 };
            const cW = W - PAD.l - PAD.r;
            const cH = H - PAD.t - PAD.b;
            const weekStep = dueSeries.length > 1 ? cW / (dueSeries.length - 1) : 0;
            const chartPts = dueSeries.map((d, i) => ({
              x: PAD.l + (i * weekStep),
              y: PAD.t + cH - ((d.val / maxDueSeries) * cH),
              val: d.val, label: d.label,
            }));
            const chartLine = chartPts.map((p) => `${p.x},${p.y}`).join(" ");
            const areaPath = chartPts.length
              ? `M${chartPts[0].x},${PAD.t + cH} ` + chartPts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${chartPts[chartPts.length - 1].x},${PAD.t + cH} Z`
              : "";
            return (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={isMobile ? "210" : "220"} role="img" aria-label="Min due line chart" style={{ display: "block" }}>
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
      </div>

      {assets > 0 && (() => {
        const totalDebt = allAccts.reduce((s, a) => s + (Number(a.cur_bal) || 0), 0);
        const netWorth = assets - totalDebt;
        const total = assets + totalDebt || 1;
        const nwColor = netWorth >= 0 ? c.go : c.da;
        return (
          <div style={{ marginTop: 12, background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Net Worth Snapshot</div>
            <div style={{ height: 28, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 10 }}>
              <div title={`Assets: ${fx(assets)}`} style={{ width: `${(assets / total) * 100}%`, background: c.go, transition: "width 0.5s", minWidth: 2 }} />
              <div title={`Debt: ${fx(totalDebt)}`} style={{ width: `${(totalDebt / total) * 100}%`, background: c.da, transition: "width 0.5s", minWidth: 2 }} />
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: c.go }} />
                <span style={{ color: c.tx2 }}>Assets</span>
                <span style={{ color: c.tx, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fx(assets)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: c.da }} />
                <span style={{ color: c.tx2 }}>Debt</span>
                <span style={{ color: c.tx, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fx(totalDebt)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: nwColor }} />
                <span style={{ color: c.tx2 }}>Net Worth</span>
                <span style={{ color: nwColor, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{netWorth >= 0 ? "" : "-"}{fx(Math.abs(netWorth))}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {topRateRows.length > 0 && (
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Highest rates</div>
          <div style={{ fontSize: 11, color: c.muted, marginBottom: 12 }}>A simple look at the balances that cost the most to carry.</div>
          <div style={{ display: "grid", gap: 10 }}>
            {topRateRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigateTo("payoff")}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr auto" : "1.4fr auto auto",
                  gap: 10, alignItems: "center", width: "100%", textAlign: "left",
                  padding: "12px 14px", borderRadius: 12,
                  border: `1px solid ${c.border}`,
                  background: `linear-gradient(135deg, ${c.da}10, ${c.surf})`,
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: c.tx2 }}>{row.owner}</div>
                </div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 800, color: c.da }}>
                  {Math.round(row.apr * 100)}%
                </div>
                {!isMobile && (
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: c.tx2 }}>
                    {fx(row.balance)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendsPage;
