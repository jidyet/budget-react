import ProviderMark from "../components/ProviderMark";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import { fx, pct } from "../utils/budgetUtils";

export default function PayoffPage(props) {
  const {
    mounted, c, isMobile, isTablet, allAccts, planOwner, setPlanOwner, planItems, setPlanItems, planMonthlyExtra, setPlanMonthlyExtra, whatIfExtra, setWhatIfExtra, planStrategy, setPlanStrategy, payoffSimulate, getEffectiveApr, setPlanId, setPlanName, planId, plans, planName, setShowStrategyCompare, showStrategyCompare, lblStyle, selStyle, inputStyle, savePlan, saveBtnStyle, buildDefaultPlanItems, selMonth, selYear, setPlanExpanded, planExpanded, whatIfExtraTimerRef, goalDate, setGoalDate, goalRequiredExtra, setGoalRequiredExtra, showAllSimRows, setShowAllSimRows, MAX_SIMULATION_MONTHS, SIM_DISPLAY_ROWS, createPlanDraft, removePlan
  } = props;
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
      const runSim = (strategy, overrideExtra) => payoffSimulate(
        included,
        strategy,
        overrideExtra !== undefined ? Number(overrideExtra) : Number(planMonthlyExtra || 0) + Number(whatIfExtra || 0),
        extraMap
      );
      const simRows = runSim(planStrategy);
      const payoffMonths = simRows.length;
      const payoffEnd = simRows[simRows.length - 1]?.month || "n/a";
      const totalInterest = simRows.reduce((s, r) => s + (r.total_interest || 0), 0);
      const baselineRows = payoffSimulate(included, planStrategy, 0, {});
      const baselineMonths = baselineRows.length;
      const baselineInterest = baselineRows.reduce((s, r) => s + (r.total_interest || 0), 0);
      const interestSaved = Math.max(0, baselineInterest - totalInterest);
      const monthsSaved = Math.max(0, baselineMonths - payoffMonths);
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
        <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position:"relative", zIndex:10, isolation:"isolate", pointerEvents:"auto" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.15fr 1fr 1fr", gap:10, marginBottom:12 }}>
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
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
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

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
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

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
            {/* What-If Hero */}
            <div style={{ background: c.surf, border:`1.5px solid ${c.border}`, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>What if I add more?</div>
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:c.tx2 }}>Extra monthly payment:</span>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:c.surf2, borderRadius:8, padding:"4px 10px", border:`1.5px solid ${c.ac}` }}>
                  <span style={{ color:c.tx2, fontSize:14, fontWeight:600 }}>$</span>
                  <input
                    type="number" min="0" step="50"
                    defaultValue={whatIfExtra}
                    onChange={e => { clearTimeout(whatIfExtraTimerRef.current); whatIfExtraTimerRef.current = setTimeout(() => setWhatIfExtra(e.target.value), 300); }}
                    style={{ width:90, padding:"6px 4px", border:"none", background:"transparent", color:c.tx, fontSize:16, fontWeight:700, fontFamily:"'DM Mono',monospace", outline:"none" }}
                  />
                </div>
                {Number(whatIfExtra) > 0 && (
                  <div style={{ background:c.acD, border:`1px solid ${c.ac}40`, borderRadius:8, padding:"6px 14px", fontSize:13, color:c.ac, fontWeight:700 }}>
                    +${Number(whatIfExtra).toLocaleString()}/mo applied
                  </div>
                )}
              </div>
            </div>
            {/* Goal-First Planner */}
            <div style={{ background:c.surf, border:`1.5px solid ${c.border}`, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Finish by</div>
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:c.tx2 }}>I want to be debt-free by:</span>
                <input type="month"
                  value={goalDate}
                  min={`${selYear}-${String(selMonth).padStart(2,"0")}`}
                  onChange={e => {
                    setGoalDate(e.target.value);
                    if (!e.target.value) { setGoalRequiredExtra(null); return; }
                    const [gy, gm] = e.target.value.split("-").map(Number);
                    const targetMonths = (gy - selYear) * 12 + (gm - selMonth);
                    if (targetMonths <= 0) { setGoalRequiredExtra(null); return; }
                    let lo = 0, hi = 50000, result = null;
                    for (let iter = 0; iter < 30; iter++) {
                      const mid = (lo + hi) / 2;
                      const rows = runSim(planStrategy, Number(planMonthlyExtra || 0) + mid);
                      if (rows.length <= targetMonths) {
                        result = mid;
                        hi = mid;
                      } else {
                        lo = mid;
                      }
                    }
                    setGoalRequiredExtra(result !== null ? Math.ceil(result) : null);
                  }}
                  style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:13, outline:"none" }}
                />
                {goalRequiredExtra !== null && (
                  <div style={{ background:c.acD, border:`1px solid ${c.ac}40`, borderRadius:8, padding:"8px 16px", fontSize:13, color:c.ac, fontWeight:700 }}>
                    Requires <span style={{ fontFamily:"'DM Mono',monospace" }}>{fx(goalRequiredExtra)}</span>/mo extra
                  </div>
                )}
                {goalDate && goalRequiredExtra === null && (
                  <div style={{ fontSize:12, color:c.muted }}>Computing...</div>
                )}
              </div>
              {goalDate && goalRequiredExtra !== null && (
                <div style={{ marginTop:10, fontSize:12, color:c.tx2 }}>
                  Set your extra monthly payment to <span style={{ color:c.ac, fontWeight:700 }}>{fx(goalRequiredExtra)}/mo</span> to pay off all selected debts by <span style={{ fontWeight:700, color:c.tx }}>{new Date(goalDate+"-01").toLocaleString("default",{month:"long",year:"numeric"})}</span>.
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Debts Included</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>{included.length}</div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Time To Finish</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>{payoffMonths ? `${payoffMonths} mo` : "n/a"}</div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Projected Finish</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>{payoffEnd}</div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>Total Interest</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 22 }}>{fx(totalInterest)}</div>
              </div>
            </div>
            {showStrategyCompare && (() => {
              const avaRows = runSim("avalanche");
              const snoRows = runSim("snowball");
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
            {simRows && simRows.length > 1 && (() => {
              const chartRows = simRows.slice(0, Math.min(simRows.length, MAX_SIMULATION_MONTHS));
              const W = 460, H = 180, PAD = { t:16, r:16, b:32, l:56 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const maxBal = Math.max(...chartRows.map(r=>r.remaining_debt||0), 1);
              const pts = chartRows.map((r,i)=>`${PAD.l+(i/(chartRows.length-1))*cW},${PAD.t+cH-((r.remaining_debt||0)/maxBal)*cH}`).join(" ");
              const areaPath = `M${PAD.l},${PAD.t+cH} ` + chartRows.map((r,i)=>`L${PAD.l+(i/(chartRows.length-1))*cW},${PAD.t+cH-((r.remaining_debt||0)/maxBal)*cH}`).join(" ") + ` L${PAD.l+(chartRows.length-1)/(chartRows.length-1)*cW},${PAD.t+cH} Z`;
              const xLabels = chartRows.reduce((acc,r,i)=>{ if(i===0||i===chartRows.length-1||(i+1)%12===0) acc.push({i,label:`M${i+1}`}); return acc; },[]);
              return (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Payoff Projection</div>
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
                    <polyline points={pts} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {xLabels.map(({i,label})=>{
                      const x = PAD.l+(i/(chartRows.length-1))*cW;
                      return <text key={i} x={x} y={H-6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{label}</text>;
                    })}
                  </svg>
                </div>
              );
            })()}
            <div style={{ maxHeight: 260, overflowY: "auto", borderTop: `1px solid ${c.border}`, paddingTop: 8 }}>
              {(showAllSimRows ? simRows : simRows.slice(0, SIM_DISPLAY_ROWS)).map((r, i) => (
                <div key={`${r.month}-${i}`} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr 1fr", gap: 8, padding: "6px 0", borderBottom: `1px dashed ${c.border}` }}>
                  <span>{r.month}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{isMobile ? `Remaining: ${fx(r.remaining_debt)}` : fx(r.remaining_debt)}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{isMobile ? `Interest: ${fx(r.total_interest)}` : fx(r.total_interest)}</span>
                </div>
              ))}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                {simRows.length > SIM_DISPLAY_ROWS && !showAllSimRows && (
                  <button type="button" onClick={() => setShowAllSimRows(true)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif" }}>
                    Show all {simRows.length} months
                  </button>
                )}
                {showAllSimRows && simRows.length > SIM_DISPLAY_ROWS && (
                  <button type="button" onClick={() => setShowAllSimRows(false)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif" }}>
                    Show less
                  </button>
                )}
                {simRows.length > 0 && (
                  <button type="button" onClick={() => {
                    const rows = simRows || [];
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
              {simRows.length === 0 && <div style={{ color: c.muted }}>No balances selected for simulation.</div>}
            </div>
          </div>
        </div>
      );
}
