import { useEffect, useState } from "react";
import ProviderMark from "../components/ProviderMark";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import { fx, pct } from "../utils/budgetUtils";

export default function PayoffPage(props) {
  const {
    mounted, c, isMobile, isTablet, allAccts, planOwner, setPlanOwner, planItems, setPlanItems, planMonthlyExtra, setPlanMonthlyExtra, whatIfExtra, setWhatIfExtra, planStrategy, setPlanStrategy, payoffSimulate, getEffectiveApr, setPlanId, setPlanName, planId, plans, planName, setShowStrategyCompare, showStrategyCompare, lblStyle, selStyle, inputStyle, savePlan, saveBtnStyle, buildDefaultPlanItems, selMonth, selYear, setPlanExpanded, planExpanded, goalDate, setGoalDate, goalRequiredExtra, setGoalRequiredExtra, showAllSimRows, setShowAllSimRows, MAX_SIMULATION_MONTHS, SIM_DISPLAY_ROWS, createPlanDraft, removePlan
  } = props;
      const [whatIfDraft, setWhatIfDraft] = useState(String(whatIfExtra || 0));
      const [goalDateDraft, setGoalDateDraft] = useState(goalDate || "");
      const [scenarioAccountId, setScenarioAccountId] = useState("");
      useEffect(() => {
        setWhatIfDraft(String(whatIfExtra || 0));
      }, [whatIfExtra]);
      useEffect(() => {
        setGoalDateDraft(goalDate || "");
      }, [goalDate]);
      const owners = ["All", ...Array.from(new Set(allAccts.map((a) => a.owner))).filter(Boolean)];
      const scopedAccounts = planOwner === "All" ? allAccts : allAccts.filter((a) => a.owner === planOwner);
      const visibleRows = scopedAccounts.map((a) => {
        const key = String(a.id);
        return {
          ...a,
          include: !!planItems[key]?.include,
          extra: String(planItems[key]?.extra_payment ?? "0"),
        };
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
      useEffect(() => {
        if (!scenarioAccounts.length) {
          if (scenarioAccountId) setScenarioAccountId("");
          return;
        }
        const stillExists = scenarioAccounts.some((a) => String(a.id) === String(scenarioAccountId));
        if (!stillExists) setScenarioAccountId(String(scenarioAccounts[0].id));
      }, [scenarioAccounts, scenarioAccountId]);
      const scenarioSelectedDebt = scenarioAccounts.find((a) => String(a.id) === String(scenarioAccountId)) || null;
      const scenarioCurrentPayment = scenarioSelectedDebt
        ? Math.max(0, Number(scenarioSelectedDebt.paid_v || 0)) > 0
          ? Math.max(0, Number(scenarioSelectedDebt.paid_v || 0))
          : Math.max(0, Number(scenarioSelectedDebt.min_due_v || 0))
        : 0;
      const scenarioBaselineRows = scenarioSelectedDebt
        ? payoffSimulate([scenarioSelectedDebt], "avalanche", 0, {}, selMonth, selYear)
        : [];
      const scenarioRows = scenarioSelectedDebt
        ? payoffSimulate([scenarioSelectedDebt], "avalanche", Number(whatIfExtra || 0), {}, selMonth, selYear)
        : [];
      const scenarioMonthsCurrent = scenarioBaselineRows.length;
      const scenarioMonthsNew = scenarioRows.length;
      const scenarioFinishCurrent = scenarioBaselineRows[scenarioBaselineRows.length - 1]?.month || "n/a";
      const scenarioFinishNew = scenarioRows[scenarioRows.length - 1]?.month || "n/a";
      const scenarioInterestCurrent = scenarioBaselineRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
      const scenarioInterestNew = scenarioRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
      const scenarioMonthsSaved = Math.max(0, scenarioMonthsCurrent - scenarioMonthsNew);
      const scenarioInterestSaved = Math.max(0, scenarioInterestCurrent - scenarioInterestNew);
      const scenarioComparisonRows = (() => {
        const totalRows = Math.max(scenarioBaselineRows.length, scenarioRows.length);
        return Array.from({ length: totalRows }, (_, index) => {
          const currentRow = scenarioBaselineRows[index];
          const newRow = scenarioRows[index];
          return {
            month: currentRow?.month || newRow?.month || `Month ${index + 1}`,
            currentBalance: Number(currentRow?.remaining_debt || 0),
            newBalance: Number(newRow?.remaining_debt || 0),
            currentInterest: Number(currentRow?.total_interest || 0),
            newInterest: Number(newRow?.total_interest || 0),
          };
        });
      })();
      const runSim = (strategy, monthlyExtra, perAccountExtra = extraMap) => payoffSimulate(
        included,
        strategy,
        Number(monthlyExtra || 0),
        perAccountExtra,
        selMonth,
        selYear
      );
      const currentPlanRows = runSim(planStrategy, Number(planMonthlyExtra || 0), extraMap);
      const scenarioExtraMap = scenarioSelectedDebt
        ? { ...extraMap, [scenarioSelectedDebt.id]: Number(extraMap[scenarioSelectedDebt.id] || 0) + Number(whatIfExtra || 0) }
        : extraMap;
      const simRows = Number(whatIfExtra || 0) > 0 && scenarioSelectedDebt
        ? runSim(planStrategy, Number(planMonthlyExtra || 0), scenarioExtraMap)
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
        const paid = Math.max(0, Number(acct?.paid_v || 0));
        const minimum = Math.max(0, Number(acct?.min_due_v || 0));
        return sum + (paid > 0 ? paid : minimum);
      }, 0);
      const totalPlannedPerAccountExtra = included.reduce((sum, acct) => {
        return sum + Math.max(0, Number(extraMap[acct.id] || 0));
      }, 0);
      const scenarioAppliedExtra = scenarioSelectedDebt ? Math.max(0, Number(whatIfExtra || 0)) : 0;
      const configuredMonthlyDebtPayment = totalScheduledDebtPayment
        + totalPlannedPerAccountExtra
        + Math.max(0, Number(planMonthlyExtra || 0))
        + scenarioAppliedExtra;
      const formatGoalMonth = (value) => {
        if (!value) return "";
        const parsed = new Date(`${value}-01T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
      };
      const goalPlanner = (() => {
        if (!goalDate) return null;
        const [goalYearRaw, goalMonthRaw] = goalDate.split("-");
        const goalYearNum = Number(goalYearRaw);
        const goalMonthNum = Number(goalMonthRaw);
        if (!Number.isFinite(goalYearNum) || !Number.isFinite(goalMonthNum)) {
          return { valid:false, reason:"invalid" };
        }
        const targetRowCount = ((goalYearNum - selYear) * 12) + (goalMonthNum - selMonth) + 1;
        if (targetRowCount <= 0) {
          return { valid:false, reason:"past" };
        }
        const targetLabel = formatGoalMonth(goalDate);
        const whatIfApplied = Number(whatIfExtra || 0) > 0 && !!scenarioSelectedDebt;
        const baselineProjectionRow = currentPlanRows[targetRowCount - 1] || currentPlanRows[currentPlanRows.length - 1] || null;
        const baselineFinishesOnTime = currentPlanRows.length > 0 && currentPlanRows.length <= targetRowCount;
        const baselineRemainingAtGoal = baselineFinishesOnTime ? 0 : Math.max(0, Number(baselineProjectionRow?.remaining_debt || 0));
        const configuredRows = simRows;
        const configuredFinishesOnTime = configuredRows.length > 0 && configuredRows.length <= targetRowCount;
        const configuredProjectionRow = configuredRows[targetRowCount - 1] || configuredRows[configuredRows.length - 1] || null;
        const configuredRemainingAtGoal = configuredFinishesOnTime
          ? 0
          : Math.max(0, Number(configuredProjectionRow?.remaining_debt || 0));
        const configuredFinishMonth = configuredRows[configuredRows.length - 1]?.month || "n/a";
        const simulateGoalPlan = (additionalMonthlyExtra) => {
          const nextMonthlyExtra = Math.max(0, Number(planMonthlyExtra || 0) + Number(additionalMonthlyExtra || 0));
          const perAccountPlan = whatIfApplied ? scenarioExtraMap : extraMap;
          return runSim(planStrategy, nextMonthlyExtra, perAccountPlan);
        };
        let additionalNeeded = 0;
        if (!configuredFinishesOnTime) {
          let lo = 0;
          let hi = 250;
          let result = null;
          const finishesByTarget = (rows) => rows.length > 0 && rows.length <= targetRowCount;
          while (hi < 100000 && !finishesByTarget(simulateGoalPlan(hi))) {
            hi *= 2;
          }
          if (finishesByTarget(simulateGoalPlan(hi))) {
            for (let iter = 0; iter < 30; iter += 1) {
              const mid = (lo + hi) / 2;
              if (finishesByTarget(simulateGoalPlan(mid))) {
                result = mid;
                hi = mid;
              } else {
                lo = mid;
              }
            }
          }
          additionalNeeded = result === null ? null : Math.ceil(result);
        }
        const proposedRows = additionalNeeded === null ? [] : simulateGoalPlan(additionalNeeded);
        const proposedFinishMonth = proposedRows[proposedRows.length - 1]?.month || configuredFinishMonth;
        return {
          valid:true,
          targetLabel,
          targetRowCount,
          whatIfApplied,
          baselineFinishesOnTime,
          baselineRemainingAtGoal,
          configuredFinishesOnTime,
          configuredRemainingAtGoal,
          configuredFinishMonth,
          additionalNeeded,
          proposedFinishMonth,
          proposedTotalMonthlyPayment: additionalNeeded === null
            ? null
            : configuredMonthlyDebtPayment + additionalNeeded,
        };
      })();
      useEffect(() => {
        if (!goalPlanner?.valid) {
          setGoalRequiredExtra(null);
          return;
        }
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
        ? (planStrategy === "snowball"
          ? "smallest balance"
          : recommendedTarget.promoActive
            ? `promo deadline in ${recommendedTarget.promoUntil}`
            : "highest effective APR")
        : "";

      return (
        <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position:"relative", zIndex:10, isolation:"isolate", pointerEvents:"auto", display:"flex", flexDirection:"column" }}>
          <div style={{ background:`linear-gradient(135deg, ${c.surf}, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:16, padding:isMobile ? "16px 18px" : "18px 22px", marginBottom:12 }}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:isMobile?"flex-start":"center",flexDirection:isMobile?"column":"row"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Payoff plan</div>
                <div style={{fontSize:isMobile?18:20,fontWeight:800,color:c.tx,marginBottom:6}}>Choose your next focus and see how much sooner you can finish.</div>
                <div style={{fontSize:13,color:c.tx2,lineHeight:1.5}}>
                  Pick a focus, leave in the debts you want to work on, and add any extra you can put toward them this month.
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,minmax(0,1fr))",gap:8,minWidth:isMobile?"100%":360}}>
                <div style={{padding:"10px 12px",borderRadius:12,background:c.surf,border:`1px solid ${c.border}`}}>
                  <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:4}}>Plan Focus</div>
                  <div style={{fontSize:14,fontWeight:800,color:c.tx}}>{planOwner === "All" ? "All Owners" : planOwner}</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:12,background:c.surf,border:`1px solid ${c.border}`}}>
                  <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:4}}>Strategy</div>
                  <div style={{fontSize:14,fontWeight:800,color:c.tx}}>{planStrategy === "avalanche" ? "Highest APR first" : "Smallest balance first"}</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:12,background:c.surf,border:`1px solid ${c.border}`}}>
                  <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:4}}>Monthly Extra</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:c.ac}}>{fx(Number(planMonthlyExtra || 0) + Number(whatIfExtra || 0))}</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.15fr 1fr 1fr", gap:10, marginBottom:12, order:3 }}>
            <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Current Target</div>
              {recommendedTarget ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,minWidth:0}}>
                    <ProviderMark bank={recommendedTarget.bank} name={recommendedTarget.name} size={18} />
                    <div style={{fontSize:16,fontWeight:800,color:c.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{recommendedTarget.name}</div>
                  </div>
                  <div style={{fontSize:12,color:c.tx2,lineHeight:1.5,marginBottom:8}}>
                    This is the debt your <strong>{planStrategy === "snowball" ? "snowball" : "avalanche"}</strong> path would hit next because it has the {targetReason}.
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span style={{padding:"5px 8px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:11,fontWeight:700,color:c.tx2}}>Bal {fx(recommendedTarget.cur_bal || 0)}</span>
                    <span style={{padding:"5px 8px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:11,fontWeight:700,color:c.tx2}}>APR {pct(recommendedTarget.effectiveApr ?? getEffectiveApr(recommendedTarget))}</span>
                    <span style={{padding:"5px 8px",borderRadius:999,background:c.acD,border:`1px solid ${c.ac}44`,fontSize:11,fontWeight:700,color:c.ac}}>Targeted extra {fx(targetExtra)}</span>
                  </div>
                </>
              ) : (
                <div style={{fontSize:13,color:c.muted}}>Select at least one debt to see the next recommended target.</div>
              )}
            </div>
            <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Plan Impact</div>
              <div style={{fontSize:24,fontWeight:800,color:c.tx,marginBottom:2}}>{payoffMonths ? `${payoffMonths} mo` : "n/a"}</div>
              <div style={{fontSize:12,color:c.tx2,marginBottom:10}}>How long this setup would take.</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{padding:"5px 8px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:11,fontWeight:700,color:c.tx2}}>Finish {payoffEnd}</span>
                <span style={{padding:"5px 8px",borderRadius:999,background:c.acD,border:`1px solid ${c.ac}44`,fontSize:11,fontWeight:700,color:c.ac}}>{monthsSaved} mo faster</span>
              </div>
            </div>
            <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Interest Outcome</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:800,color:c.tx,marginBottom:2}}>{fx(totalInterest)}</div>
              <div style={{fontSize:12,color:c.tx2,marginBottom:10}}>Interest you would pay on the debts in this plan.</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{padding:"5px 8px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:11,fontWeight:700,color:c.tx2}}>Baseline {fx(baselineInterest)}</span>
                <span style={{padding:"5px 8px",borderRadius:999,background:c.acD,border:`1px solid ${c.ac}44`,fontSize:11,fontWeight:700,color:c.ac}}>Save {fx(interestSaved)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", order:4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: isMobile ? "stretch" : "center", marginBottom: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Saved plans</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", position:"relative", zIndex:31, pointerEvents:"auto" }}>
                <button type="button" onClick={createPlanDraft} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, cursor: "pointer", position:"relative", zIndex:32, pointerEvents:"auto" }}>New draft</button>
                {!!planId && (
                  <button type="button" onClick={() => removePlan(planId)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.da}`, background: c.daD, color: c.da, cursor: "pointer", fontWeight:700, position:"relative", zIndex:32, pointerEvents:"auto" }}>Delete plan</button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1.3fr 1fr 1fr 1fr 1fr", gap: 8, position:"relative", zIndex:31, isolation:"isolate", pointerEvents:"auto" }}>
              <div>
                <div style={lblStyle}>Saved plan</div>
                <select
                  style={{ ...selStyle, position:"relative", zIndex:32, pointerEvents:"auto" }}
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">Draft / unsaved</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.owner}</option>)}
                </select>
              </div>
              <div>
                <div style={lblStyle}>Name</div>
                <input style={{ ...inputStyle, position:"relative", zIndex:32, pointerEvents:"auto" }} value={planName} onChange={(e) => setPlanName(e.target.value)} />
              </div>
              <div>
                <div style={lblStyle}>Owner</div>
                <select
                  style={{ ...selStyle, position:"relative", zIndex:32, pointerEvents:"auto" }}
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
                <select style={{ ...selStyle, position:"relative", zIndex:32, pointerEvents:"auto" }} value={planStrategy} onChange={(e) => setPlanStrategy(e.target.value)}>
                  <option value="avalanche">Avalanche (APR)</option>
                  <option value="snowball">Snowball (Balance)</option>
                </select>
                <button onClick={() => setShowStrategyCompare(s => !s)}
                  style={{ marginTop:6, padding:"7px 14px", borderRadius:7, border:`1.5px solid ${c.border2}`, background: showStrategyCompare ? c.acD : "transparent", color: showStrategyCompare ? c.ac : c.tx2, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", width:"100%", position:"relative", zIndex:32, pointerEvents:"auto" }}>
                  {showStrategyCompare ? "▲ Hide" : "⇄ Compare Strategies"}
                </button>
              </div>
              <div>
                <div style={lblStyle}>Monthly extra ($)</div>
                <input type="number" style={{ ...inputStyle, position:"relative", zIndex:32, pointerEvents:"auto" }} value={planMonthlyExtra} onChange={(e) => setPlanMonthlyExtra(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: isMobile ? "stretch" : "flex-end", marginTop: 10 }}>
              <button type="button" onClick={() => savePlan(planId)} style={{ ...saveBtnStyle, width: isMobile ? "100%" : "auto", position:"relative", zIndex:32, pointerEvents:"auto" }}>{planId ? "Save changes" : "Save draft"}</button>
            </div>
          </div>

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", order:5 }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:isMobile?"stretch":"center",marginBottom:8,gap:10,flexWrap:isMobile?"wrap":"nowrap"}}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom:4 }}>Pick what goes in</div>
                <div style={{fontSize:13,color:c.tx2}}>Checked debts stay in the plan. Use the extra field to push a little more to one debt if you want.</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:isMobile?"wrap":"nowrap",width:isMobile?"100%":"auto",position:"relative",zIndex:31,pointerEvents:"auto"}}>
                <button
                  type="button"
                  onClick={() => {
                    const next = {};
                    visibleRows.forEach((r) => {
                      next[String(r.id)] = { include: true, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" };
                    });
                    setPlanItems(next);
                  }}
                  style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer",position:"relative",zIndex:32,pointerEvents:"auto"}}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = {};
                    visibleRows.forEach((r) => {
                      next[String(r.id)] = { include: false, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" };
                    });
                    setPlanItems(next);
                  }}
                  style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer",position:"relative",zIndex:32,pointerEvents:"auto"}}
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
                  style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer",position:"relative",zIndex:32,pointerEvents:"auto"}}
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
                  style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer",position:"relative",zIndex:32,pointerEvents:"auto"}}
                >
                  Collapse all
                </button>
              </div>
            </div>
            {planGroupKeys.map((cat) => {
              const rows = planGrouped[cat] || [];
              const hasState = Object.prototype.hasOwnProperty.call(planExpanded, cat);
              const open = hasState ? !!planExpanded[cat] : true;
              return (
              <div key={cat} style={{ marginBottom: 8, position:"relative", zIndex:20, isolation:"isolate", pointerEvents:"auto" }}>
                <button
                  type="button"
                  onClick={() => setPlanExpanded((prev) => ({ ...prev, [cat]: !open }))}
                  style={{width:"100%",border:"none",background:"transparent",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",position:"relative",zIndex:21,pointerEvents:"auto"}}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>
                    {CAT_ICON[cat]} {cat} ({rows.length})
                  </span>
                  <span style={{fontSize:12,color:c.muted,fontWeight:800}}>{open ? "▲" : "▼"}</span>
                </button>
                {open && !isMobile && (
                  <div style={{ display:"grid", gridTemplateColumns:"26px 1.2fr 120px 120px 120px 140px", gap:8, alignItems:"center", padding:"6px 0 8px", borderBottom:`1px solid ${c.border}` }}>
                    <div />
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted}}>Debt</div>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted}}>Balance</div>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted}}>APR</div>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted}}>Min Due</div>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted}}>Debt-Specific Extra</div>
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
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                        <span style={{padding:"3px 7px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:10,fontWeight:700,color:c.tx2}}>
                          {r.include ? "Included" : "Excluded"}
                        </span>
                        {recommendedTarget?.id === r.id && (
                          <span style={{padding:"3px 7px",borderRadius:999,background:c.acD,border:`1px solid ${c.ac}44`,fontSize:10,fontWeight:700,color:c.ac}}>
                            Current target
                          </span>
                        )}
                        {r.promoActive && (
                          <span style={{padding:"3px 7px",borderRadius:999,background:c.waD || c.surf2,border:`1px solid ${c.wa}44`,fontSize:10,fontWeight:700,color:c.wa}}>
                            Promo ends {r.promoUntil}
                          </span>
                        )}
                      </div>
                      {isMobile && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6, fontSize: 12 }}>
                          <div>
                            <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:2}}>APR</div>
                            <div style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{pct(r.effectiveApr ?? getEffectiveApr(r))}</div>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:2}}>Min Due</div>
                            <div style={{ fontFamily: "'DM Mono',monospace" }}>{fx(r.min_due_v)}</div>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:2}}>Balance</div>
                            <div style={{ fontFamily: "'DM Mono',monospace", color:c.ac }}>{fx(r.cur_bal || 0)}</div>
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
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
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
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )})}
          </div>

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", order:2 }}>
            {/* What-If Hero */}
            <div style={{ background: c.surf, border:`1.5px solid ${c.border}`, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>What if I add more?</div>
              <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "minmax(0,auto) minmax(280px,1fr)", gap:12, alignItems:"start" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:c.tx2 }}>Extra monthly payment:</span>
                  <div style={{ display:"flex", alignItems:"center", gap:6, background:c.surf2, borderRadius:8, padding:"4px 10px", border:`1.5px solid ${c.ac}` }}>
                    <span style={{ color:c.tx2, fontSize:14, fontWeight:600 }}>$</span>
                    <input
                      type="number" min="0" step="50"
                      value={whatIfDraft}
                      onChange={e => setWhatIfDraft(e.target.value)}
                      style={{ width:90, padding:"6px 4px", border:"none", background:"transparent", color:c.tx, fontSize:16, fontWeight:700, fontFamily:"'DM Mono',monospace", outline:"none" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setWhatIfExtra(String(Number(whatIfDraft || 0)))}
                    style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${c.ac}`, background:c.ac, color:"#062532", fontSize:12, fontWeight:800, cursor:"pointer" }}
                  >
                    Generate
                  </button>
                  {Number(whatIfExtra) > 0 && (
                    <div style={{ background:c.acD, border:`1px solid ${c.ac}40`, borderRadius:8, padding:"6px 14px", fontSize:13, color:c.ac, fontWeight:700 }}>
                      +${Number(whatIfExtra).toLocaleString()}/mo applied
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ ...lblStyle, marginBottom:6 }}>Run this scenario on</div>
                  <select
                    style={{ ...selStyle, width:"100%" }}
                    value={scenarioAccountId}
                    onChange={(e) => setScenarioAccountId(e.target.value)}
                  >
                    {scenarioAccounts.length === 0 && <option value="">No debts available</option>}
                    {scenarioAccounts.map((acct) => (
                      <option key={acct.id} value={String(acct.id)}>
                        {`${acct.bank} (${acct.name})${acct.owner ? ` (${acct.owner})` : ""} | ${fx(acct.cur_bal || 0)}`}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop:6, fontSize:12, color:c.tx2 }}>
                    {scenarioSelectedDebt
                      ? `The extra scenario payment is applied to ${scenarioSelectedDebt.bank} ${scenarioSelectedDebt.name}.`
                      : "Pick a debt to see how the extra payment changes that debt's payoff path."}
                  </div>
                </div>
              </div>
            </div>
            {/* Goal-First Planner */}
            <div style={{ background:c.surf, border:`1.5px solid ${c.border}`, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Finish by</div>
              <div style={{ fontSize:13, color:c.tx2, marginBottom:14, lineHeight:1.5 }}>
                Pick a target date and we'll calculate exactly how much you need to pay each month to get there — no extra payment needed upfront. You can also combine it with a what-if extra above to see what's still left to cover.
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:13, color:c.tx2, whiteSpace:"nowrap" }}>I want to be debt-free by:</span>
                <input type="month"
                  value={goalDateDraft}
                  min={`${selYear}-${String(selMonth).padStart(2,"0")}`}
                  onChange={e => setGoalDateDraft(e.target.value)}
                  style={{ width:isMobile ? "100%" : 200, padding:"10px 12px", borderRadius:9, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:13, outline:"none" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setGoalDate(goalDateDraft);
                    if (!goalDateDraft) setGoalRequiredExtra(null);
                  }}
                  style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${c.ac}`, background:c.ac, color:"#062532", fontSize:12, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" }}
                >
                  Calculate
                </button>
                {goalDate && (
                  <button
                    type="button"
                    onClick={() => { setGoalDate(""); setGoalDateDraft(""); setGoalRequiredExtra(null); }}
                    style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${c.border2}`, background:"transparent", color:c.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}
                  >
                    Clear
                  </button>
                )}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", flex:1, justifyContent:isMobile ? "flex-start" : "flex-end" }}>
                  {goalPlanner?.valid && goalPlanner.additionalNeeded !== null && (
                    <div style={{ background:goalPlanner.additionalNeeded > 0 ? c.acD : c.surf2, border:`1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}40` : c.border2}`, borderRadius:8, padding:"8px 14px", fontSize:13, color:goalPlanner.additionalNeeded > 0 ? c.ac : c.tx2, fontWeight:700 }}>
                      {goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}/mo needed` : "✓ On track"}
                    </div>
                  )}
                  {goalPlanner?.valid && goalPlanner.proposedTotalMonthlyPayment !== null && (
                    <div style={{ background:c.surf2, border:`1px solid ${c.border2}`, borderRadius:8, padding:"8px 14px", fontSize:13, color:c.tx2, fontWeight:700 }}>
                      Total <span style={{ fontFamily:"'DM Mono',monospace", color:c.tx }}>{fx(goalPlanner.proposedTotalMonthlyPayment)}</span>/mo
                    </div>
                  )}
                </div>
              </div>
              {goalDate && !goalPlanner?.valid && (
                <div style={{ marginTop:10, fontSize:12, color:c.muted }}>
                  Pick a month from {MONTHS[selMonth - 1]} {selYear} onward to run the payoff projection.
                </div>
              )}
              {goalPlanner?.valid && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : goalPlanner.whatIfApplied ? "repeat(4, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap:10, marginTop:12 }}>
                    {goalPlanner.whatIfApplied ? (
                      <>
                        <div style={{ background:c.surf2, border:`1px solid ${c.border}`, borderRadius:10, padding:12 }}>
                          <div style={lblStyle}>Without extra</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:800, color:goalPlanner.baselineFinishesOnTime ? c.ac : c.da, lineHeight:1.1 }}>
                            {goalPlanner.baselineFinishesOnTime ? "On time" : fx(goalPlanner.baselineRemainingAtGoal)}
                          </div>
                          <div style={{ fontSize:12, color:c.tx2, marginTop:6 }}>
                            {goalPlanner.baselineFinishesOnTime
                              ? `Your base plan already finishes by ${goalPlanner.targetLabel}.`
                              : `Still owed by ${goalPlanner.targetLabel} without the extra payment.`}
                          </div>
                        </div>
                        <div style={{ background:c.surf2, border:`1.5px solid ${c.ac}44`, borderRadius:10, padding:12 }}>
                          <div style={lblStyle}>With +{fx(Number(whatIfExtra))} extra</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:800, color:goalPlanner.configuredFinishesOnTime ? c.ac : c.da, lineHeight:1.1 }}>
                            {goalPlanner.configuredFinishesOnTime ? "On time" : fx(goalPlanner.configuredRemainingAtGoal)}
                          </div>
                          <div style={{ fontSize:12, color:c.tx2, marginTop:6 }}>
                            {goalPlanner.configuredFinishesOnTime
                              ? `The extra payment gets you there by ${goalPlanner.targetLabel}.`
                              : `Still owed at your goal date even with the extra.`}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ background:c.surf2, border:`1px solid ${c.border}`, borderRadius:10, padding:12 }}>
                        <div style={lblStyle}>At goal date</div>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:800, color:goalPlanner.configuredFinishesOnTime ? c.ac : c.da, lineHeight:1.1 }}>
                          {goalPlanner.configuredFinishesOnTime ? "On time" : fx(goalPlanner.configuredRemainingAtGoal)}
                        </div>
                        <div style={{ fontSize:12, color:c.tx2, marginTop:6 }}>
                          {goalPlanner.configuredFinishesOnTime
                            ? `Your current plan finishes by ${goalPlanner.targetLabel}.`
                            : `Still left by ${goalPlanner.targetLabel} on your current plan.`}
                        </div>
                      </div>
                    )}
                    <div style={{ background:c.surf2, border:`1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}44` : c.border}`, borderRadius:10, padding:12 }}>
                      <div style={lblStyle}>{goalPlanner.whatIfApplied ? "Still needed on top" : "Monthly needed"}</div>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:800, color:goalPlanner.additionalNeeded > 0 ? c.ac : c.tx }}>
                        {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}` : "Nothing more"}
                      </div>
                      <div style={{ fontSize:12, color:c.tx2, marginTop:6 }}>
                        {goalPlanner.additionalNeeded === null
                          ? "Cannot compute — try a later date."
                          : goalPlanner.additionalNeeded > 0
                            ? `Add this per month${goalPlanner.whatIfApplied ? " on top of your extra payment" : ""} to hit ${goalPlanner.targetLabel}.`
                            : `No increase needed${goalPlanner.whatIfApplied ? " beyond your extra payment" : ""} to finish on time.`}
                      </div>
                    </div>
                    <div style={{ background:c.surf2, border:`1px solid ${c.border}`, borderRadius:10, padding:12 }}>
                      <div style={lblStyle}>Will finish</div>
                      <div style={{ fontSize:20, fontWeight:800, color:c.tx, lineHeight:1.1 }}>
                        {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? goalPlanner.proposedFinishMonth : goalPlanner.configuredFinishMonth}
                      </div>
                      <div style={{ fontSize:12, color:c.tx2, marginTop:6 }}>
                        {goalPlanner.additionalNeeded > 0
                          ? `With the suggested +${fx(goalPlanner.additionalNeeded)}/mo — total ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo.`
                          : `Your current plan finishes here.`}
                      </div>
                    </div>
                  </div>
                  {goalPlanner.additionalNeeded > 0 && (
                    <div style={{ marginTop:10, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                      <button
                        type="button"
                        onClick={() => setPlanMonthlyExtra(String(Number(planMonthlyExtra || 0) + goalPlanner.additionalNeeded))}
                        style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${c.ac}`, background:c.ac, color:"#062532", fontSize:12, fontWeight:800, cursor:"pointer" }}
                      >
                        Apply +{fx(goalPlanner.additionalNeeded)}/mo to plan
                      </button>
                      <span style={{ fontSize:12, color:c.tx2 }}>
                        Sets monthly extra to {fx(Number(planMonthlyExtra || 0) + goalPlanner.additionalNeeded)}/mo
                      </span>
                    </div>
                  )}
                  {goalPlanner.additionalNeeded !== null && (
                    <div style={{ marginTop:10, fontSize:12, color:c.tx2, lineHeight:1.6 }}>
                      {goalPlanner.additionalNeeded > 0
                        ? goalPlanner.whatIfApplied
                          ? `Even with your ${fx(Number(whatIfExtra))}/mo extra payment, you would still have ${fx(goalPlanner.configuredRemainingAtGoal)} left by ${goalPlanner.targetLabel}. Add ${fx(goalPlanner.additionalNeeded)}/mo more (bringing the plan to ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo) to finish on time.`
                          : `On your current plan you would still have ${fx(goalPlanner.configuredRemainingAtGoal)} left by ${goalPlanner.targetLabel}. Add ${fx(goalPlanner.additionalNeeded)}/mo to bring total debt payments to ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo and finish by that date.`
                        : goalPlanner.whatIfApplied
                          ? `Your ${fx(Number(whatIfExtra))}/mo extra payment is already enough to finish by ${goalPlanner.targetLabel}.`
                          : `Your current plan is already on track to finish by ${goalPlanner.targetLabel}.`}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Current Balance</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>
                  {scenarioSelectedDebt ? fx(scenarioSelectedDebt.cur_bal || 0) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Current Payment</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>
                  {scenarioSelectedDebt ? fx(scenarioCurrentPayment) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>New Payment</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>
                  {scenarioSelectedDebt ? fx(scenarioCurrentPayment + Number(whatIfExtra || 0)) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Effect Of Change</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>
                  {scenarioSelectedDebt ? `${scenarioMonthsSaved} mo faster` : "n/a"}
                </div>
              </div>
            </div>
            {showStrategyCompare && (() => {
              const compareExtraMap = Number(whatIfExtra || 0) > 0 && scenarioSelectedDebt ? scenarioExtraMap : extraMap;
              const avaRows = runSim("avalanche", Number(planMonthlyExtra || 0), compareExtraMap);
              const snoRows = runSim("snowball", Number(planMonthlyExtra || 0), compareExtraMap);
              const avaMonths = avaRows.length;
              const snoMonths = snoRows.length;
              const avaInterest = avaRows.reduce((s,r) => s + (Number(r.total_interest)||0), 0);
              const snoInterest = snoRows.reduce((s,r) => s + (Number(r.total_interest)||0), 0);
              const better = avaInterest <= snoInterest ? "avalanche" : "snowball";
              return (
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:20 }}>
                  {[
                    { key:"avalanche", label:"Avalanche", desc:"Highest APR first", months:avaMonths, interest:avaInterest },
                    { key:"snowball", label:"Snowball", desc:"Smallest balance first", months:snoMonths, interest:snoInterest },
                  ].map(s => (
                    <div key={s.key} onClick={() => setPlanStrategy(s.key)}
                      style={{ background:c.surf, border:`2px solid ${s.key===better ? c.ac : s.key===planStrategy ? c.in : c.border}`, borderRadius:14, padding:"16px 18px", cursor:"pointer", transition:"border-color 0.2s" }}>
                      {s.key === better && (
                        <div style={{ fontSize:11, fontWeight:800, color:c.ac, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>★ Saves More</div>
                      )}
                      <div style={{ fontSize:16, fontWeight:800, color:c.tx, marginBottom:2 }}>{s.label}</div>
                      <div style={{ fontSize:11, color:c.muted, marginBottom:14 }}>{s.desc}</div>
                      <div style={{ fontSize:24, fontWeight:800, color:c.tx, fontFamily:"'DM Mono',monospace", marginBottom:4, lineHeight:1 }}>
                        {s.months} <span style={{ fontSize:13, fontWeight:500, color:c.tx2 }}>mo</span>
                      </div>
                      <div style={{ fontSize:12, color:c.tx2 }}>
                        Interest: <span style={{ color:c.da, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(s.interest)}</span>
                      </div>
                      {s.key === planStrategy && (
                        <div style={{ marginTop:10, fontSize:11, color:c.ac, fontWeight:600 }}>✓ Currently selected</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            {scenarioSelectedDebt && scenarioComparisonRows.length > 1 && (() => {
              const currentChartRows = scenarioBaselineRows.slice(0, Math.min(scenarioBaselineRows.length, MAX_SIMULATION_MONTHS));
              const newChartRows = scenarioRows.slice(0, Math.min(scenarioRows.length, MAX_SIMULATION_MONTHS));
              const W = 460, H = 180, PAD = { t:16, r:16, b:isMobile ? 40 : 32, l:56 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const maxBal = Math.max(
                ...currentChartRows.map((r) => r.remaining_debt || 0),
                ...newChartRows.map((r) => r.remaining_debt || 0),
                1
              );
              const buildPoints = (rows) => rows.map((r, i) => {
                const x = PAD.l + ((rows.length === 1 ? 0 : i / (rows.length - 1)) * cW);
                const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
                return `${x},${y}`;
              }).join(" ");
              const newPts = buildPoints(newChartRows);
              const currentPts = buildPoints(currentChartRows);
              const areaPath = `M${PAD.l},${PAD.t + cH} ` + newChartRows.map((r, i) => {
                const x = PAD.l + ((newChartRows.length === 1 ? 0 : i / (newChartRows.length - 1)) * cW);
                const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
                return `L${x},${y}`;
              }).join(" ") + ` L${W - PAD.r},${PAD.t + cH} Z`;
              const xLabelIndexes = Array.from(new Set([
                0,
                Math.max(0, Math.floor((scenarioComparisonRows.length - 1) / 2)),
                Math.max(0, scenarioComparisonRows.length - 1),
              ])).sort((a, b) => a - b);
              const xLabels = xLabelIndexes.map((i) => ({ i, label: scenarioComparisonRows[i]?.month || `Month ${i + 1}` }));
              return (
                <div style={{ marginBottom:18 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:isMobile ? "flex-start" : "center", gap:10, marginBottom:8, flexDirection:isMobile ? "column" : "row" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Balance Path</div>
                      <div style={{ fontSize:13, color:c.tx2 }}>
                        See how {scenarioSelectedDebt.bank} {scenarioSelectedDebt.name} falls with its current payment versus adding {fx(Number(whatIfExtra || 0))}/mo.
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span style={{padding:"5px 8px",borderRadius:999,background:c.surf2,border:`1px solid ${c.border2}`,fontSize:11,fontWeight:700,color:c.tx2}}>Current payment</span>
                      <span style={{padding:"5px 8px",borderRadius:999,background:c.acD,border:`1px solid ${c.ac}44`,fontSize:11,fontWeight:700,color:c.ac}}>With extra</span>
                    </div>
                  </div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                    <defs>
                      <linearGradient id="payoffGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.ac} stopOpacity="0.2"/>
                        <stop offset="100%" stopColor={c.ac} stopOpacity="0.01"/>
                      </linearGradient>
                    </defs>
                    {[0,0.5,1].map((f,gi)=>(
                      <line key={gi} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                    ))}
                    {[0,0.5,1].map((f,gi)=>(
                      <text key={gi} x={PAD.l-6} y={PAD.t+cH*f+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">{fx(maxBal*(1-f))}</text>
                    ))}
                    <path d={areaPath} fill="url(#payoffGrad)"/>
                    <polyline points={currentPts} fill="none" stroke={c.tx} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                    <polyline points={newPts} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {xLabels.map(({i,label})=>{
                      const x = PAD.l + ((scenarioComparisonRows.length === 1 ? 0 : i / (scenarioComparisonRows.length - 1)) * cW);
                      const isFirst = i === xLabelIndexes[0];
                      const isLast = i === xLabelIndexes[xLabelIndexes.length - 1];
                      return <text key={i} x={x} y={H-8} textAnchor={isFirst ? "start" : isLast ? "end" : "middle"} fontSize={isMobile ? "8" : "9"} fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{label}</text>;
                    })}
                  </svg>
                </div>
              );
            })()}
            <div style={{ maxHeight: 260, overflowY: "auto", borderTop: `1px solid ${c.border}`, paddingTop: 8 }}>
              <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "160px 1fr 1fr 1fr", gap:8, padding:"0 0 8px", borderBottom:`1px solid ${c.border}` }}>
                <span style={lblStyle}>Month</span>
                <span style={lblStyle}>Current Balance</span>
                <span style={lblStyle}>New Balance</span>
                <span style={lblStyle}>Effect Of Change</span>
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
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                {scenarioComparisonRows.length > SIM_DISPLAY_ROWS && !showAllSimRows && (
                  <button type="button" onClick={() => setShowAllSimRows(true)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif" }}>
                    Show all {scenarioComparisonRows.length} months
                  </button>
                )}
                {showAllSimRows && scenarioComparisonRows.length > SIM_DISPLAY_ROWS && (
                  <button type="button" onClick={() => setShowAllSimRows(false)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif" }}>
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
                        <thead><tr><th>#</th><th>Month</th><th>Remaining Debt</th><th>Interest Paid</th></tr></thead>
                        <tbody>
                          ${rows.map((r, i) => `<tr><td>${i+1}</td><td>${r.month || ""}</td><td class="money">$${(Number(r.remaining_debt)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td class="money">$${(Number(r.total_interest)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`).join("")}
                        </tbody>
                      </table>
                    </body></html>`;
                    win.document.write(html);
                    win.document.close();
                    win.print();
                  }} style={{ padding:"6px 12px", borderRadius:7, border:`1.5px solid ${c.border2}`, background:"transparent", color:c.tx2, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    🖨 Print
                  </button>
                )}
              </div>
              {scenarioComparisonRows.length === 0 && <div style={{ color: c.muted }}>Pick a debt above to generate the scenario result, slope, and month-by-month breakdown.</div>}
            </div>
          </div>
        </div>
      );
}
