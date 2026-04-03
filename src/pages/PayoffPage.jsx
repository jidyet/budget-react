import { useEffect, useState } from "react";
import ProviderMark from "../components/ProviderMark";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import { fx, pct } from "../utils/budgetUtils";

export default function PayoffPage(props) {
  const {
    mounted, c, isMobile, isTablet, allAccts, planOwner, setPlanOwner, planItems, setPlanItems,
    planMonthlyExtra, setPlanMonthlyExtra, whatIfExtra, setWhatIfExtra, planStrategy, setPlanStrategy,
    payoffSimulate, getEffectiveApr, setPlanId, setPlanName, planId, plans, planName,
    lblStyle, selStyle, inputStyle, savePlan, saveRawPlan, saveBtnStyle, buildDefaultPlanItems,
    selMonth, selYear, setPlanExpanded, planExpanded, goalDate, setGoalDate,
    goalRequiredExtra, setGoalRequiredExtra, showAllSimRows, setShowAllSimRows,
    MAX_SIMULATION_MONTHS, SIM_DISPLAY_ROWS, createPlanDraft, removePlan,
  } = props;

  const [whatIfDraft, setWhatIfDraft] = useState(String(whatIfExtra || 0));
  const [goalDateDraft, setGoalDateDraft] = useState(goalDate || "");
  const [scenarioAccountId, setScenarioAccountId] = useState(""); // "" = All debts
  const [goalDebtId, setGoalDebtId] = useState(""); // "" = All included debts

  useEffect(() => { setWhatIfDraft(String(whatIfExtra || 0)); }, [whatIfExtra]);
  useEffect(() => { setGoalDateDraft(goalDate || ""); }, [goalDate]);

  const owners = ["All", ...Array.from(new Set(allAccts.map((a) => a.owner))).filter(Boolean)];
  const scopedAccounts = planOwner === "All" ? allAccts : allAccts.filter((a) => a.owner === planOwner);
  const visibleRows = scopedAccounts.map((a) => {
    const key = String(a.id);
    return { ...a, include: !!planItems[key]?.include, extra: String(planItems[key]?.extra_payment ?? "0") };
  });
  const planGrouped = {};
  visibleRows.forEach((r) => {
    if (!planGrouped[r.category]) planGrouped[r.category] = [];
    planGrouped[r.category].push(r);
  });
  const planGroupKeys = Object.keys(planGrouped);
  const included = visibleRows.filter((r) => r.include);
  const extraMap = {};
  included.forEach((r) => { extraMap[r.id] = Number(r.extra || 0); });

  const scenarioAccounts = scopedAccounts.filter((a) => Number(a.cur_bal || 0) > 0.01);

  // "" = "All debts" — valid selection, don't auto-select first account
  useEffect(() => {
    if (!scenarioAccounts.length) {
      if (scenarioAccountId) setScenarioAccountId("");
      return;
    }
    if (scenarioAccountId === "") return;
    const stillExists = scenarioAccounts.some((a) => String(a.id) === String(scenarioAccountId));
    if (!stillExists) setScenarioAccountId("");
  }, [scenarioAccounts, scenarioAccountId]);

  // Keep goalDebtId in sync with available accounts
  useEffect(() => {
    if (!goalDebtId) return;
    const stillExists = scenarioAccounts.some((a) => String(a.id) === goalDebtId);
    if (!stillExists) setGoalDebtId("");
  }, [scenarioAccounts, goalDebtId]);

  const scenarioSelectedDebt = scenarioAccountId
    ? (scenarioAccounts.find((a) => String(a.id) === String(scenarioAccountId)) || null)
    : null;

  // Per-debt scenario rows (used only when a specific debt is selected)
  const scenarioBaselineRows = scenarioSelectedDebt
    ? payoffSimulate([scenarioSelectedDebt], "avalanche", 0, {}, selMonth, selYear)
    : [];
  const scenarioDebtRows = scenarioSelectedDebt
    ? payoffSimulate([scenarioSelectedDebt], "avalanche", Number(whatIfExtra || 0), {}, selMonth, selYear)
    : [];

  const runSim = (strategy, monthlyExtra, perAccountExtra = extraMap) =>
    payoffSimulate(included, strategy, Number(monthlyExtra || 0), perAccountExtra, selMonth, selYear);

  const currentPlanRows = runSim(planStrategy, Number(planMonthlyExtra || 0), extraMap);
  const scenarioExtraMap = scenarioSelectedDebt
    ? { ...extraMap, [scenarioSelectedDebt.id]: Number(extraMap[scenarioSelectedDebt.id] || 0) + Number(whatIfExtra || 0) }
    : extraMap;

  // simRows: apply whatIfExtra as per-account extra (specific debt) or monthly extra pool (all debts)
  const simRows = Number(whatIfExtra || 0) > 0
    ? (scenarioSelectedDebt
        ? runSim(planStrategy, Number(planMonthlyExtra || 0), scenarioExtraMap)
        : runSim(planStrategy, Number(planMonthlyExtra || 0) + Number(whatIfExtra || 0), extraMap))
    : currentPlanRows;

  const payoffMonths = simRows.length;
  const payoffEnd = simRows[simRows.length - 1]?.month || "n/a";
  const totalInterest = simRows.reduce((s, r) => s + (r.total_interest || 0), 0);
  const baselineRows = payoffSimulate(included, planStrategy, 0, {}, selMonth, selYear);
  const baselineMonths = baselineRows.length;
  const baselineInterest = baselineRows.reduce((s, r) => s + (r.total_interest || 0), 0);
  const interestSaved = Math.max(0, baselineInterest - totalInterest);
  const monthsSaved = Math.max(0, baselineMonths - payoffMonths);

  const totalScheduledDebtPayment = included.reduce((sum, acct) => {
    const planned = Math.max(0, Number(acct?.planned_v || 0));
    const paid = Math.max(0, Number(acct?.paid_v || 0));
    const minimum = Math.max(0, Number(acct?.min_due_v || 0));
    return sum + (planned > 0 ? planned : paid > 0 ? paid : minimum);
  }, 0);
  const totalPlannedPerAccountExtra = included.reduce((sum, acct) =>
    sum + Math.max(0, Number(extraMap[acct.id] || 0)), 0);
  const planMonthlyDebtPayment = totalScheduledDebtPayment + totalPlannedPerAccountExtra + Math.max(0, Number(planMonthlyExtra || 0));

  // What If stats — unified for both "specific debt" and "All debts" modes
  const whatIfBaselineRows = scenarioSelectedDebt ? scenarioBaselineRows : currentPlanRows;
  const whatIfScenarioRows = scenarioSelectedDebt ? scenarioDebtRows : simRows;
  const scenarioCurrentPayment = scenarioSelectedDebt
    ? (() => {
        const planned = Math.max(0, Number(scenarioSelectedDebt.planned_v || 0));
        const paid = Math.max(0, Number(scenarioSelectedDebt.paid_v || 0));
        const min = Math.max(0, Number(scenarioSelectedDebt.min_due_v || 0));
        return planned > 0 ? planned : paid > 0 ? paid : min;
      })()
    : planMonthlyDebtPayment;
  const scenarioCurrentBalance = scenarioSelectedDebt
    ? Number(scenarioSelectedDebt.cur_bal || 0)
    : included.reduce((s, a) => s + Number(a.cur_bal || 0), 0);
  const scenarioMonthsCurrent = whatIfBaselineRows.length;
  const scenarioMonthsNew = whatIfScenarioRows.length;
  const scenarioMonthsSaved = Math.max(0, scenarioMonthsCurrent - scenarioMonthsNew);
  const scenarioInterestSaved = Math.max(0,
    whatIfBaselineRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0) -
    whatIfScenarioRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0)
  );

  const scenarioComparisonRows = (() => {
    const totalRows = Math.max(whatIfBaselineRows.length, whatIfScenarioRows.length);
    return Array.from({ length: totalRows }, (_, index) => {
      const currentRow = whatIfBaselineRows[index];
      const newRow = whatIfScenarioRows[index];
      return {
        month: currentRow?.month || newRow?.month || `Month ${index + 1}`,
        currentBalance: Number(currentRow?.remaining_debt || 0),
        newBalance: Number(newRow?.remaining_debt || 0),
        currentInterest: Number(currentRow?.total_interest || 0),
        newInterest: Number(newRow?.total_interest || 0),
      };
    });
  })();

  const formatGoalMonth = (value) => {
    if (!value) return "";
    const parsed = new Date(`${value}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  // Standalone goalPlanner — independent of What If, uses goalDebtId
  const goalPlanner = (() => {
    if (!goalDate) return null;
    const [goalYearRaw, goalMonthRaw] = goalDate.split("-");
    const goalYearNum = Number(goalYearRaw);
    const goalMonthNum = Number(goalMonthRaw);
    if (!Number.isFinite(goalYearNum) || !Number.isFinite(goalMonthNum)) return { valid: false, reason: "invalid" };
    const targetRowCount = ((goalYearNum - selYear) * 12) + (goalMonthNum - selMonth) + 1;
    if (targetRowCount <= 0) return { valid: false, reason: "past" };
    const targetLabel = formatGoalMonth(goalDate);

    const goalAccounts = goalDebtId
      ? scenarioAccounts.filter((a) => String(a.id) === goalDebtId)
      : included;
    if (!goalAccounts.length) return { valid: false, reason: "no_accounts" };

    const goalExtraMap = goalDebtId ? { [goalDebtId]: Number(extraMap[goalDebtId] || 0) } : extraMap;
    const goalBaseMonthlyExtra = goalDebtId ? 0 : Number(planMonthlyExtra || 0);

    const goalBaselineRows = payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra, goalExtraMap, selMonth, selYear);
    const baselineFinishesOnTime = goalBaselineRows.length > 0 && goalBaselineRows.length <= targetRowCount;
    const baselineProjectionRow = goalBaselineRows[targetRowCount - 1] || goalBaselineRows[goalBaselineRows.length - 1] || null;
    const baselineRemainingAtGoal = baselineFinishesOnTime ? 0 : Math.max(0, Number(baselineProjectionRow?.remaining_debt || 0));
    const configuredFinishMonth = goalBaselineRows[goalBaselineRows.length - 1]?.month || "n/a";

    const simulateWithExtra = (additionalExtra) =>
      payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra + additionalExtra, goalExtraMap, selMonth, selYear);

    let additionalNeeded = 0;
    if (!baselineFinishesOnTime) {
      let lo = 0, hi = 250, result = null;
      const finishesByTarget = (rows) => rows.length > 0 && rows.length <= targetRowCount;
      while (hi < 100000 && !finishesByTarget(simulateWithExtra(hi))) hi *= 2;
      if (finishesByTarget(simulateWithExtra(hi))) {
        for (let iter = 0; iter < 30; iter++) {
          const mid = (lo + hi) / 2;
          if (finishesByTarget(simulateWithExtra(mid))) { result = mid; hi = mid; }
          else lo = mid;
        }
      }
      additionalNeeded = result === null ? null : Math.ceil(result);
    }

    const proposedRows = additionalNeeded === null ? [] : simulateWithExtra(additionalNeeded);
    const proposedFinishMonth = proposedRows[proposedRows.length - 1]?.month || configuredFinishMonth;

    const goalCurrentPayment = goalDebtId
      ? (() => {
          const a = goalAccounts[0];
          if (!a) return 0;
          const planned = Math.max(0, Number(a.planned_v || 0));
          const paid = Math.max(0, Number(a.paid_v || 0));
          const min = Math.max(0, Number(a.min_due_v || 0));
          return (planned > 0 ? planned : paid > 0 ? paid : min) + Number(extraMap[String(a.id)] || 0);
        })()
      : planMonthlyDebtPayment;

    return {
      valid: true,
      targetLabel,
      targetRowCount,
      goalDebtId,
      baselineFinishesOnTime,
      baselineRemainingAtGoal,
      configuredFinishMonth,
      additionalNeeded,
      proposedFinishMonth,
      proposedTotalMonthlyPayment: additionalNeeded === null ? null : goalCurrentPayment + (additionalNeeded || 0),
    };
  })();

  useEffect(() => {
    if (!goalPlanner?.valid) { setGoalRequiredExtra(null); return; }
    setGoalRequiredExtra(goalPlanner.additionalNeeded);
  }, [goalPlanner, setGoalRequiredExtra]);

  const recommendedTarget = (() => {
    const candidates = included.filter((a) => Number(a.cur_bal || 0) > 0.01);
    if (!candidates.length) return null;
    const ordered = [...candidates].sort((a, b) => {
      if (planStrategy === "snowball") return Number(a.cur_bal || 0) - Number(b.cur_bal || 0);
      return (b.effectiveApr ?? getEffectiveApr(b)) - (a.effectiveApr ?? getEffectiveApr(a));
    });
    return ordered[0] || null;
  })();
  const targetExtra = recommendedTarget ? Number(extraMap[recommendedTarget.id] || 0) : 0;
  const targetReason = recommendedTarget
    ? (planStrategy === "snowball" ? "smallest balance" : recommendedTarget.promoActive ? `promo deadline in ${recommendedTarget.promoUntil}` : "highest effective APR")
    : "";

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position: "relative", zIndex: 10, isolation: "isolate", pointerEvents: "auto", display: "flex", flexDirection: "column" }}>

      {/* ── Header card ── */}
      <div style={{ background: `linear-gradient(135deg, ${c.surf}, ${c.surf2})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: isMobile ? "16px 18px" : "18px 22px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Payoff plan</div>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: c.tx, marginBottom: 6 }}>Explore your options, then set up your plan below.</div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
          Use <strong>What If</strong> and <strong>Finish By</strong> to explore scenarios. When you're ready, configure your plan at the bottom — choose your debts, strategy, and extra payment, then save.
        </div>
      </div>

      {/* ── What If I Add More? — standalone panel (order:2) ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, order: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>What if I add more?</div>
        <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
          See exactly how much time and interest you would save by putting extra money toward a debt — or spread it across all debts at once.
        </div>

        {/* Input row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 12, alignItems: "start", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: c.tx2, whiteSpace: "nowrap" }}>Extra each month:</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: c.surf2, borderRadius: 8, padding: "4px 10px", border: `1.5px solid ${c.ac}` }}>
              <span style={{ color: c.tx2, fontSize: 14, fontWeight: 600 }}>$</span>
              <input
                type="number" min="0" step="50"
                value={whatIfDraft}
                onChange={(e) => setWhatIfDraft(e.target.value)}
                style={{ width: 90, padding: "6px 4px", border: "none", background: "transparent", color: c.tx, fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace", outline: "none" }}
              />
            </div>
            <button
              type="button"
              onClick={() => setWhatIfExtra(String(Number(whatIfDraft || 0)))}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Generate
            </button>
            {Number(whatIfExtra) > 0 && (
              <button
                type="button"
                onClick={() => { setWhatIfExtra("0"); setWhatIfDraft("0"); }}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: "transparent", color: c.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Clear
              </button>
            )}
          </div>
          <div>
            <div style={{ ...lblStyle, marginBottom: 6 }}>Apply this extra to</div>
            <select
              style={{ ...selStyle, width: "100%" }}
              value={scenarioAccountId}
              onChange={(e) => setScenarioAccountId(e.target.value)}
            >
              <option value="">All debts in plan (spread as monthly extra)</option>
              {scenarioAccounts.map((acct) => (
                <option key={acct.id} value={String(acct.id)}>
                  {`${acct.bank} (${acct.name})${acct.owner ? ` (${acct.owner})` : ""} | ${fx(acct.cur_bal || 0)}`}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 12, color: c.tx2 }}>
              {scenarioSelectedDebt
                ? `Extra goes directly to ${scenarioSelectedDebt.bank} ${scenarioSelectedDebt.name}, on top of the current payment.`
                : "Extra is added to your monthly pool and distributed using your chosen strategy."}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
            <div style={lblStyle}>{scenarioSelectedDebt ? "Debt Balance" : "Total Balance"}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: c.tx }}>
              {included.length ? fx(scenarioCurrentBalance) : "n/a"}
            </div>
          </div>
          <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
            <div style={lblStyle}>{scenarioSelectedDebt ? "Current Payment" : "Current Monthly"}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: c.tx }}>
              {included.length ? fx(scenarioCurrentPayment) : "n/a"}
            </div>
          </div>
          <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
            <div style={lblStyle}>New Payment</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: Number(whatIfExtra || 0) > 0 ? c.ac : c.tx }}>
              {included.length ? fx(scenarioCurrentPayment + Number(whatIfExtra || 0)) : "n/a"}
            </div>
          </div>
          <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
            <div style={lblStyle}>Time Saved</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: scenarioMonthsSaved > 0 ? c.ac : c.tx }}>
              {included.length ? `${scenarioMonthsSaved} mo` : "n/a"}
            </div>
            {scenarioInterestSaved > 0 && (
              <div style={{ fontSize: 11, color: c.ac, marginTop: 4 }}>Save {fx(scenarioInterestSaved)} interest</div>
            )}
          </div>
        </div>

        {/* Balance path chart — only when there's an extra to compare or a specific debt is showing */}
        {(Number(whatIfExtra || 0) > 0 || scenarioSelectedDebt) && scenarioComparisonRows.length > 1 && (() => {
          const W = 460, H = 180, PAD = { t: 16, r: 16, b: isMobile ? 40 : 32, l: 56 };
          const cW = W - PAD.l - PAD.r;
          const cH = H - PAD.t - PAD.b;
          const maxBal = Math.max(...whatIfBaselineRows.map((r) => r.remaining_debt || 0), ...whatIfScenarioRows.map((r) => r.remaining_debt || 0), 1);
          const buildPoints = (rows) => rows.map((r, i) => {
            const x = PAD.l + ((rows.length === 1 ? 0 : i / (rows.length - 1)) * cW);
            const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
            return `${x},${y}`;
          }).join(" ");
          const newPts = buildPoints(whatIfScenarioRows);
          const currentPts = buildPoints(whatIfBaselineRows);
          const areaPath = `M${PAD.l},${PAD.t + cH} ` + whatIfScenarioRows.map((r, i) => {
            const x = PAD.l + ((whatIfScenarioRows.length === 1 ? 0 : i / (whatIfScenarioRows.length - 1)) * cW);
            const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
            return `L${x},${y}`;
          }).join(" ") + ` L${W - PAD.r},${PAD.t + cH} Z`;
          const totalLen = scenarioComparisonRows.length;
          const xLabelIndexes = Array.from(new Set([0, Math.max(0, Math.floor((totalLen - 1) / 2)), Math.max(0, totalLen - 1)])).sort((a, b) => a - b);
          const xLabels = xLabelIndexes.map((i) => ({ i, label: scenarioComparisonRows[i]?.month || `Month ${i + 1}` }));
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10, marginBottom: 8, flexDirection: isMobile ? "column" : "row" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Balance Path</div>
                  <div style={{ fontSize: 13, color: c.tx2 }}>
                    {scenarioSelectedDebt
                      ? `${scenarioSelectedDebt.bank} ${scenarioSelectedDebt.name} — current payment vs adding ${fx(Number(whatIfExtra || 0))}/mo`
                      : `All included debts — current plan vs adding ${fx(Number(whatIfExtra || 0))}/mo extra`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>Current</span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>With extra</span>
                </div>
              </div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                <defs>
                  <linearGradient id="payoffGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.ac} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={c.ac} stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((f, gi) => (
                  <line key={gi} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4" />
                ))}
                {[0, 0.5, 1].map((f, gi) => (
                  <text key={gi} x={PAD.l - 6} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">{fx(maxBal * (1 - f))}</text>
                ))}
                <path d={areaPath} fill="url(#payoffGrad)" />
                <polyline points={currentPts} fill="none" stroke={c.tx} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                <polyline points={newPts} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {xLabels.map(({ i, label }) => {
                  const x = PAD.l + ((totalLen === 1 ? 0 : i / (totalLen - 1)) * cW);
                  const isFirst = i === xLabelIndexes[0];
                  const isLast = i === xLabelIndexes[xLabelIndexes.length - 1];
                  return <text key={i} x={x} y={H - 8} textAnchor={isFirst ? "start" : isLast ? "end" : "middle"} fontSize={isMobile ? "8" : "9"} fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{label}</text>;
                })}
              </svg>
            </div>
          );
        })()}

        {/* Month-by-month table */}
        {scenarioComparisonRows.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: "auto", borderTop: `1px solid ${c.border}`, paddingTop: 8, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr 1fr 1fr", gap: 8, padding: "0 0 8px", borderBottom: `1px solid ${c.border}` }}>
              <span style={lblStyle}>Month</span>
              <span style={lblStyle}>Current Balance</span>
              <span style={lblStyle}>With Extra</span>
              <span style={lblStyle}>Saved</span>
            </div>
            {(showAllSimRows ? scenarioComparisonRows : scenarioComparisonRows.slice(0, SIM_DISPLAY_ROWS)).map((r, i) => {
              const balanceSaved = Math.max(0, r.currentBalance - r.newBalance);
              return (
                <div key={`${r.month}-${i}`} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: `1px dashed ${c.border}` }}>
                  <span>{r.month}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{isMobile ? `Current: ${fx(r.currentBalance)}` : fx(r.currentBalance)}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{isMobile ? `New: ${fx(r.newBalance)}` : fx(r.newBalance)}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: balanceSaved > 0 ? c.ac : c.muted }}>{isMobile ? `Saved: ${fx(balanceSaved)}` : fx(balanceSaved)}</span>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {scenarioComparisonRows.length > SIM_DISPLAY_ROWS && !showAllSimRows && (
                <button type="button" onClick={() => setShowAllSimRows(true)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Show all {scenarioComparisonRows.length} months
                </button>
              )}
              {showAllSimRows && scenarioComparisonRows.length > SIM_DISPLAY_ROWS && (
                <button type="button" onClick={() => setShowAllSimRows(false)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Show less
                </button>
              )}
              {scenarioComparisonRows.length > 0 && (
                <button type="button" onClick={() => {
                  const rows = scenarioComparisonRows || [];
                  const win = window.open("", "_blank");
                  if (!win) return;
                  const html = `<!DOCTYPE html><html><head><title>Payoff Schedule</title><style>
                    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
                    h1 { font-size: 18px; margin-bottom: 4px; }
                    .meta { color: #666; margin-bottom: 20px; font-size: 11px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #ddd; }
                    td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
                    tr:nth-child(even) td { background: #fafafa; }
                    .money { font-family: monospace; }
                    @media print { body { margin: 0; } }
                  </style></head><body>
                    <h1>Debt Payoff Schedule</h1>
                    <div class="meta">Strategy: ${planStrategy} · Generated ${new Date().toLocaleDateString()} · Plan: ${planName || "Unnamed"}</div>
                    <table>
                      <thead><tr><th>#</th><th>Month</th><th>Current Balance</th><th>With Extra</th><th>Saved</th></tr></thead>
                      <tbody>
                        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.month || ""}</td><td class="money">$${(Number(r.currentBalance) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="money">$${(Number(r.newBalance) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="money">$${(Math.max(0, r.currentBalance - r.newBalance)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join("")}
                      </tbody>
                    </table>
                  </body></html>`;
                  win.document.write(html);
                  win.document.close();
                  win.print();
                }} style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  🖨 Print
                </button>
              )}
            </div>
          </div>
        )}
        {scenarioComparisonRows.length === 0 && Number(whatIfExtra || 0) === 0 && (
          <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>Enter an extra amount and click Generate to see the impact.</div>
        )}

        {/* Apply to plan */}
        {Number(whatIfExtra || 0) > 0 && (
          <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={async () => {
                const extra = Number(whatIfExtra || 0);
                if (scenarioSelectedDebt) {
                  // Build a plan scoped to only this debt
                  const key = String(scenarioSelectedDebt.id);
                  const newItems = scopedAccounts.map((a) => ({
                    account_id: a.id,
                    include: String(a.id) === key,
                    extra_payment: String(a.id) === key ? Number(extraMap[key] || 0) + extra : 0,
                  }));
                  const newItemMap = {};
                  scopedAccounts.forEach((a) => {
                    newItemMap[String(a.id)] = {
                      include: String(a.id) === key,
                      extra_payment: String(a.id) === key ? String(Number(extraMap[key] || 0) + extra) : "0",
                    };
                  });
                  setPlanItems(newItemMap);
                  setPlanMonthlyExtra("0");
                  setPlanName(`${scenarioSelectedDebt.name} — Focus Plan`);
                  setPlanId("");
                  await saveRawPlan({
                    name: `${scenarioSelectedDebt.name} — Focus Plan`,
                    owner: planOwner,
                    strategy: planStrategy,
                    monthly_extra: 0,
                    items: newItems,
                  });
                } else {
                  const newExtra = String(Number(planMonthlyExtra || 0) + extra);
                  setPlanMonthlyExtra(newExtra);
                  await savePlan(planId, { silent: false });
                }
                setWhatIfExtra("0");
                setWhatIfDraft("0");
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Apply +{fx(Number(whatIfExtra))}/mo to plan
            </button>
            <span style={{ fontSize: 12, color: c.tx2 }}>
              {scenarioSelectedDebt
                ? `Creates a focused plan for ${scenarioSelectedDebt.name} only`
                : `Adds to plan monthly extra — total ${fx(planMonthlyDebtPayment + Number(whatIfExtra || 0))}/mo`}
            </span>
          </div>
        )}
      </div>

      {/* ── Finish By — standalone panel (order:3) ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, order: 3 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Finish by</div>
        <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
          Pick a target date and we'll tell you exactly how much extra you need to pay each month to get there — no guessing required.
        </div>

        {/* Debt selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...lblStyle, marginBottom: 6 }}>Which debt are you targeting?</div>
          <select
            style={{ ...selStyle, width: isMobile ? "100%" : 360 }}
            value={goalDebtId}
            onChange={(e) => setGoalDebtId(e.target.value)}
          >
            <option value="">All debts (full plan)</option>
            {scenarioAccounts.map((acct) => (
              <option key={acct.id} value={String(acct.id)}>
                {`${acct.bank} (${acct.name})${acct.owner ? ` (${acct.owner})` : ""} | ${fx(acct.cur_bal || 0)}`}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 12, color: c.tx2 }}>
            {goalDebtId
              ? `Calculates what you need to pay on just this debt to finish by your date.`
              : `Calculates what you need to add to your plan total to pay off all included debts by your date.`}
          </div>
        </div>

        {/* Date picker row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: c.tx2, whiteSpace: "nowrap" }}>I want to be done by:</span>
          <input
            type="month"
            value={goalDateDraft}
            min={`${selYear}-${String(selMonth).padStart(2, "0")}`}
            onChange={(e) => setGoalDateDraft(e.target.value)}
            style={{ width: isMobile ? "100%" : 200, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 13, outline: "none" }}
          />
          <button
            type="button"
            onClick={() => { setGoalDate(goalDateDraft); if (!goalDateDraft) setGoalRequiredExtra(null); }}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Calculate
          </button>
          {goalDate && (
            <button
              type="button"
              onClick={() => { setGoalDate(""); setGoalDateDraft(""); setGoalRequiredExtra(null); }}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: "transparent", color: c.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Clear
            </button>
          )}
          {goalPlanner?.valid && goalPlanner.additionalNeeded !== null && (
            <div style={{ background: goalPlanner.additionalNeeded > 0 ? c.acD : c.surf2, border: `1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}40` : c.border2}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: goalPlanner.additionalNeeded > 0 ? c.ac : c.tx2, fontWeight: 700 }}>
              {goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}/mo needed` : "✓ On track"}
            </div>
          )}
        </div>

        {goalDate && !goalPlanner?.valid && goalPlanner?.reason !== "no_accounts" && (
          <div style={{ marginTop: 10, fontSize: 12, color: c.muted }}>
            Pick a month from {MONTHS[selMonth - 1]} {selYear} onward to run the projection.
          </div>
        )}
        {goalDate && goalPlanner?.reason === "no_accounts" && (
          <div style={{ marginTop: 10, fontSize: 12, color: c.muted }}>
            No debts are included in your plan. Go to <strong>Pick what goes in</strong> below to add some.
          </div>
        )}

        {goalPlanner?.valid && (
          <>
            {/* Excluded debt warning — only in "All debts" mode */}
            {!goalDebtId && (() => {
              const excludedTotal = scopedAccounts.reduce((sum, a) => {
                const key = String(a.id);
                return (!planItems[key]?.include && Number(a.cur_bal || 0) > 0.01) ? sum + Number(a.cur_bal || 0) : sum;
              }, 0);
              if (excludedTotal < 0.01) return null;
              return (
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: c.waD || c.surf2, border: `1px solid ${c.wa || c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                  <strong style={{ color: c.wa || c.tx }}>Heads up:</strong> {fx(excludedTotal)} in debt is not included in this plan and won't be covered by this projection. Go to <strong>Pick what goes in</strong> below to add those debts.
                </div>
              );
            })()}

            {/* Result cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
              <div style={{ background: c.surf2, border: `1px solid ${goalPlanner.baselineFinishesOnTime ? c.border : `${c.da}44`}`, borderRadius: 10, padding: 12 }}>
                <div style={lblStyle}>At your goal date</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: goalPlanner.baselineFinishesOnTime ? c.ac : c.da, lineHeight: 1.1 }}>
                  {goalPlanner.baselineFinishesOnTime ? "On time" : fx(goalPlanner.baselineRemainingAtGoal)}
                </div>
                <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                  {goalPlanner.baselineFinishesOnTime
                    ? `Your current plan finishes by ${goalPlanner.targetLabel}.`
                    : `Still owed by ${goalPlanner.targetLabel} on your current plan.`}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}44` : c.border}`, borderRadius: 10, padding: 12 }}>
                <div style={lblStyle}>Extra needed per month</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: goalPlanner.additionalNeeded > 0 ? c.ac : c.tx }}>
                  {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}` : "Nothing more"}
                </div>
                <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                  {goalPlanner.additionalNeeded === null
                    ? "Cannot compute — try a later date."
                    : goalPlanner.additionalNeeded > 0
                      ? `Add this each month to hit ${goalPlanner.targetLabel}.`
                      : `No increase needed to finish on time.`}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
                <div style={lblStyle}>Will finish</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.tx, lineHeight: 1.1 }}>
                  {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? goalPlanner.proposedFinishMonth : goalPlanner.configuredFinishMonth}
                </div>
                <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                  {goalPlanner.additionalNeeded > 0
                    ? `With +${fx(goalPlanner.additionalNeeded)}/mo — total ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo.`
                    : `Your current plan finishes here.`}
                </div>
              </div>
            </div>

            {/* Apply + summary */}
            {goalPlanner.additionalNeeded > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={async () => {
                    const needed = goalPlanner.additionalNeeded;
                    if (goalPlanner.goalDebtId) {
                      // Build a plan scoped to only this debt
                      const key = goalPlanner.goalDebtId;
                      const debtAcct = included.find((a) => String(a.id) === key);
                      const newItems = scopedAccounts.map((a) => ({
                        account_id: a.id,
                        include: String(a.id) === key,
                        extra_payment: String(a.id) === key ? Number(extraMap[key] || 0) + needed : 0,
                      }));
                      const newItemMap = {};
                      scopedAccounts.forEach((a) => {
                        newItemMap[String(a.id)] = {
                          include: String(a.id) === key,
                          extra_payment: String(a.id) === key ? String(Number(extraMap[key] || 0) + needed) : "0",
                        };
                      });
                      setPlanItems(newItemMap);
                      setPlanMonthlyExtra("0");
                      const planLabel = debtAcct ? `${debtAcct.name} — Goal Plan` : "Focused Goal Plan";
                      setPlanName(planLabel);
                      setPlanId("");
                      await saveRawPlan({
                        name: planLabel,
                        owner: planOwner,
                        strategy: planStrategy,
                        monthly_extra: 0,
                        items: newItems,
                      });
                    } else {
                      const newExtra = String(Number(planMonthlyExtra || 0) + needed);
                      setPlanMonthlyExtra(newExtra);
                      await savePlan(planId, { silent: false });
                    }
                  }}
                  style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  Apply +{fx(goalPlanner.additionalNeeded)}/mo to plan
                </button>
                <span style={{ fontSize: 12, color: c.tx2 }}>
                  {goalPlanner.goalDebtId
                    ? `Creates a focused plan for this debt only`
                    : `Sets plan monthly extra to ${fx(Number(planMonthlyExtra || 0) + goalPlanner.additionalNeeded)}/mo`}
                </span>
              </div>
            )}
            {goalPlanner.additionalNeeded !== null && (
              <div style={{ marginTop: 10, fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                {goalPlanner.additionalNeeded > 0
                  ? `On your current plan you would still have ${fx(goalPlanner.baselineRemainingAtGoal)} left by ${goalPlanner.targetLabel}. Add ${fx(goalPlanner.additionalNeeded)}/mo to bring your total to ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo and finish on time.`
                  : `Your current plan is already on track to finish by ${goalPlanner.targetLabel}.`}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Plan Impact cards (order:4) ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr 1fr 1fr", gap: 10, marginBottom: 12, order: 4 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Current Target</div>
          {recommendedTarget ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, minWidth: 0 }}>
                <ProviderMark bank={recommendedTarget.bank} name={recommendedTarget.name} size={18} />
                <div style={{ fontSize: 16, fontWeight: 800, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{recommendedTarget.name}</div>
              </div>
              <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5, marginBottom: 8 }}>
                This is the debt your <strong>{planStrategy === "snowball" ? "snowball" : "avalanche"}</strong> path would hit next because it has the {targetReason}.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>Bal {fx(recommendedTarget.cur_bal || 0)}</span>
                <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>APR {pct(recommendedTarget.effectiveApr ?? getEffectiveApr(recommendedTarget))}</span>
                <span style={{ padding: "5px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>Targeted extra {fx(targetExtra)}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: c.muted }}>Select at least one debt to see the next recommended target.</div>
          )}
        </div>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Plan Impact</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: c.tx, marginBottom: 2 }}>{payoffMonths ? `${payoffMonths} mo` : "n/a"}</div>
          <div style={{ fontSize: 12, color: c.tx2, marginBottom: 10 }}>How long this setup would take.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>Finish {payoffEnd}</span>
            <span style={{ padding: "5px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>{monthsSaved} mo faster</span>
          </div>
        </div>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Interest Outcome</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 800, color: c.tx, marginBottom: 2 }}>{fx(totalInterest)}</div>
          <div style={{ fontSize: 12, color: c.tx2, marginBottom: 10 }}>Interest you would pay on the debts in this plan.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>Baseline {fx(baselineInterest)}</span>
            <span style={{ padding: "5px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>Save {fx(interestSaved)}</span>
          </div>
        </div>
      </div>

      {/* ── Saved Plans (order:6) — includes always-on strategy compare ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto", order: 6 }}>
        {/* Strategy compare — always visible */}
        {(() => {
          const compareExtraMap = Number(whatIfExtra || 0) > 0 && scenarioSelectedDebt ? scenarioExtraMap : extraMap;
          const avaRows = runSim("avalanche", Number(planMonthlyExtra || 0), compareExtraMap);
          const snoRows = runSim("snowball", Number(planMonthlyExtra || 0), compareExtraMap);
          const avaMonths = avaRows.length;
          const snoMonths = snoRows.length;
          const avaInterest = avaRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
          const snoInterest = snoRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
          const better = avaInterest <= snoInterest ? "avalanche" : "snowball";
          return (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 10 }}>Strategy Comparison</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { key: "avalanche", label: "Avalanche", desc: "Highest APR first", months: avaMonths, interest: avaInterest },
                  { key: "snowball", label: "Snowball", desc: "Smallest balance first", months: snoMonths, interest: snoInterest },
                ].map((s) => (
                  <div
                    key={s.key}
                    onClick={() => setPlanStrategy(s.key)}
                    style={{ background: c.surf, border: `2px solid ${s.key === better ? c.ac : s.key === planStrategy ? c.in : c.border}`, borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.2s" }}
                  >
                    {s.key === better && (
                      <div style={{ fontSize: 11, fontWeight: 800, color: c.ac, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>★ Saves More</div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 800, color: c.tx, marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: c.muted, marginBottom: 14 }}>{s.desc}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.tx, fontFamily: "'DM Mono',monospace", marginBottom: 4, lineHeight: 1 }}>
                      {s.months} <span style={{ fontSize: 13, fontWeight: 500, color: c.tx2 }}>mo</span>
                    </div>
                    <div style={{ fontSize: 12, color: c.tx2 }}>
                      Interest: <span style={{ color: c.da, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fx(s.interest)}</span>
                    </div>
                    {s.key === planStrategy && (
                      <div style={{ marginTop: 10, fontSize: 11, color: c.ac, fontWeight: 600 }}>✓ Currently selected</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Plan controls */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: isMobile ? "stretch" : "center", marginBottom: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Saved plans</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 31, pointerEvents: "auto" }}>
            <button type="button" onClick={createPlanDraft} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}>New draft</button>
            {!!planId && (
              <button type="button" onClick={() => removePlan(planId)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.da}`, background: c.daD, color: c.da, cursor: "pointer", fontWeight: 700, position: "relative", zIndex: 32, pointerEvents: "auto" }}>Delete plan</button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1.3fr 1fr 1fr 1fr 1fr", gap: 8, position: "relative", zIndex: 31, isolation: "isolate", pointerEvents: "auto" }}>
          <div>
            <div style={lblStyle}>Saved plan</div>
            <select
              style={{ ...selStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              <option value="">Draft / unsaved</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.owner}</option>)}
            </select>
          </div>
          <div>
            <div style={lblStyle}>Name</div>
            <input style={{ ...inputStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planName} onChange={(e) => setPlanName(e.target.value)} />
          </div>
          <div>
            <div style={lblStyle}>Owner</div>
            <select
              style={{ ...selStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }}
              value={planOwner}
              onChange={(e) => {
                const v = e.target.value;
                setPlanOwner(v);
                const defaults = buildDefaultPlanItems(v, allAccts);
                const map = {};
                defaults.forEach((it) => {
                  const old = planItems[String(it.account_id)];
                  map[String(it.account_id)] = {
                    include: old ? old.include : true,
                    extra_payment: old ? old.extra_payment : "0",
                  };
                });
                setPlanItems(map);
              }}
            >
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={lblStyle}>Strategy</div>
            <select style={{ ...selStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planStrategy} onChange={(e) => setPlanStrategy(e.target.value)}>
              <option value="avalanche">Avalanche (APR)</option>
              <option value="snowball">Snowball (Balance)</option>
            </select>
          </div>
          <div>
            <div style={lblStyle}>Monthly extra ($)</div>
            <input type="number" style={{ ...inputStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planMonthlyExtra} onChange={(e) => setPlanMonthlyExtra(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: isMobile ? "stretch" : "flex-end", marginTop: 10 }}>
          <button type="button" onClick={() => savePlan(planId)} style={{ ...saveBtnStyle, width: isMobile ? "100%" : "auto", position: "relative", zIndex: 32, pointerEvents: "auto" }}>{planId ? "Save changes" : "Save draft"}</button>
        </div>
      </div>

      {/* ── Pick What Goes In (order:5) ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto", order: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", marginBottom: 8, gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Pick what goes in</div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Checked debts stay in the plan. Use the extra field to push a little more to one debt if you want.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap", width: isMobile ? "100%" : "auto", position: "relative", zIndex: 31, pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={() => {
                const next = {};
                visibleRows.forEach((r) => { next[String(r.id)] = { include: true, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" }; });
                setPlanItems(next);
              }}
              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => {
                const next = {};
                visibleRows.forEach((r) => { next[String(r.id)] = { include: false, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" }; });
                setPlanItems(next);
              }}
              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                const next = {};
                planGroupKeys.forEach((cat) => { next[cat] = true; });
                setPlanExpanded(next);
              }}
              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => {
                const next = {};
                planGroupKeys.forEach((cat) => { next[cat] = false; });
                setPlanExpanded(next);
              }}
              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
            >
              Collapse all
            </button>
          </div>
        </div>
        {planGroupKeys.map((cat) => {
          const rows = planGrouped[cat] || [];
          const hasState = Object.prototype.hasOwnProperty.call(planExpanded, cat);
          const open = hasState ? !!planExpanded[cat] : false;
          return (
            <div key={cat} style={{ marginBottom: 8, position: "relative", zIndex: 20, isolation: "isolate", pointerEvents: "auto" }}>
              <button
                type="button"
                onClick={() => setPlanExpanded((prev) => ({ ...prev, [cat]: !open }))}
                style={{ width: "100%", border: "none", background: "transparent", padding: "6px 0", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", position: "relative", zIndex: 21, pointerEvents: "auto" }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>
                  {CAT_ICON[cat]} {cat} ({rows.length})
                </span>
                <span style={{ fontSize: 12, color: c.muted, fontWeight: 800 }}>{open ? "▲" : "▼"}</span>
              </button>
              {open && !isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "26px 1.2fr 120px 120px 120px 140px", gap: 8, alignItems: "center", padding: "6px 0 8px", borderBottom: `1px solid ${c.border}` }}>
                  <div />
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Debt</div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Balance</div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>APR</div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Min Due</div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Debt-Specific Extra</div>
                </div>
              )}
              {open && rows.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "22px 1fr" : "26px 1.2fr 120px 120px 120px 140px", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: e.target.checked, extra_payment: prev[String(r.id)]?.extra_payment ?? "0" } }))}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <ProviderMark bank={r.bank} name={r.name} size={16} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <span style={{ padding: "3px 7px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 10, fontWeight: 700, color: c.tx2 }}>
                        {r.include ? "Included" : "Excluded"}
                      </span>
                      {recommendedTarget?.id === r.id && (
                        <span style={{ padding: "3px 7px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 10, fontWeight: 700, color: c.ac }}>
                          Current target
                        </span>
                      )}
                      {r.promoActive && (
                        <span style={{ padding: "3px 7px", borderRadius: 999, background: c.waD || c.surf2, border: `1px solid ${c.wa}44`, fontSize: 10, fontWeight: 700, color: c.wa }}>
                          Promo ends {r.promoUntil}
                        </span>
                      )}
                    </div>
                    {isMobile && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6, fontSize: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>APR</div>
                          <div style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{pct(r.effectiveApr ?? getEffectiveApr(r))}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>Min Due</div>
                          <div style={{ fontFamily: "'DM Mono',monospace" }}>{fx(r.min_due_v)}</div>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>Balance</div>
                          <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac }}>{fx(r.cur_bal || 0)}</div>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ ...lblStyle, marginBottom: 4 }}>Extra payment ($)</div>
                          <input
                            type="number"
                            style={inputStyle}
                            value={r.extra}
                            onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: e.target.value } }))}
                            onBlur={async (e) => {
                              const normalized = String(Number(e.target.value || 0));
                              if (normalized !== e.target.value) {
                                setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: normalized } }));
                              }
                              await savePlan(planId, { silent: true });
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac }}>{fx(r.cur_bal || 0)}</div>}
                  {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{pct(r.effectiveApr ?? getEffectiveApr(r))}</div>}
                  {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace" }}>{fx(r.min_due_v)}</div>}
                  {!isMobile && (
                    <input
                      type="number"
                      style={inputStyle}
                      value={r.extra}
                      onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: e.target.value } }))}
                      onBlur={async (e) => {
                        const normalized = String(Number(e.target.value || 0));
                        if (normalized !== e.target.value) {
                          setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: normalized } }));
                        }
                        await savePlan(planId, { silent: true });
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

    </div>
  );
}
