import { useState } from "react";
import ProviderMark from "../components/ProviderMark";
import EditPanel from "../components/EditPanel";
import { CAT_ICON } from "../data/mockAccounts";
import { fx, pct, accountViewModel } from "../utils/budgetUtils";

export default function AccountsPage(props) {
  const {
    mounted, c, isMobile, allAccts, acctOwnerF, setAcctOwnerF, acctCatF, setAcctCatF, acctStatusF, setAcctStatusF, acctSearch, setAcctSearch, acctGroupBy, setAcctGroupBy, allOwners, allCategories, inputStyle, selStyle, bulkMode, setBulkMode, bulkSelected, setBulkSelected, openDueNextView, acctExpanded, setAcctExpanded, swipeState, setSwipeState, updateRecord, showToast, showUndoToast, setEditId, editId, getPrevRecord, getEffectiveApr, markPaid, openEdit, theme, buildAutoBalanceUpdates
  } = props;
      const [hoveredId, setHoveredId] = useState(null);
      const matches = (a) => {
        if (acctOwnerF !== "All" && a.owner !== acctOwnerF) return false;
        if (acctCatF !== "All" && a.category !== acctCatF) return false;
        if (acctStatusF === "Paid" && !a.is_paid) return false;
        if (acctStatusF === "Unpaid" && a.is_paid) return false;
        if (acctSearch && !`${a.name} ${a.bank} ${a.owner} ${a.category}`.toLowerCase().includes(acctSearch.toLowerCase())) return false;
        return true;
      };
      const filtered = allAccts.filter(matches);
      const grouped = {};
      filtered.forEach((a) => {
        const key = acctGroupBy === "organization" ? accountViewModel(a).org : a.category;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
      });
      const orderedGroups = acctGroupBy === "organization"
        ? Object.keys(grouped).sort((a, b) => a.localeCompare(b))
        : allCategories.filter((cat) => grouped[cat]);
      const totalDebt = filtered.reduce((s, a) => s + (a.cur_bal || 0), 0);
      const dueTotal = filtered.reduce((s, a) => s + (a.min_due_v || 0), 0);
      const paidTotal = filtered.reduce((s, a) => s + (a.paid_v || 0), 0);
      const filteredUnpaid = filtered.filter((a) => !a.is_paid);
      const filteredOverdue = filtered.filter((a) => !a.is_paid && a.d_left != null && a.d_left < 0);
      const filteredDueThisWeek = filtered.filter((a) => !a.is_paid && a.d_left != null && a.d_left >= 0 && a.d_left <= 7);

      return (
        <div style={{opacity:mounted?1:0,transition:"opacity .3s",marginTop:16,overflowX:"auto",position:"relative",zIndex:10,isolation:"isolate",pointerEvents:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,minmax(0,1fr))",gap:10,marginBottom:14}}>
            {[
              { label:"In View", value: filtered.length, tone:c.tx, sub:"Bills in this list" },
              { label:"Still Open", value: filteredUnpaid.length, tone:c.wa, sub:"Not marked paid yet" },
              { label:"Due Soon", value: filteredDueThisWeek.length, tone:c.ac, sub:"Open Home to clear the next ones", action: () => openDueNextView() },
              { label:"Past Due", value: filteredOverdue.length, tone:c.da, sub:"Handle these first" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                style={{textAlign:"left",padding:"12px 14px",borderRadius:12,border:`1px solid ${item.tone}35`,background:item.action ? `${item.tone}10` : c.surf,cursor:item.action ? "pointer" : "default"}}
              >
                <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>{item.label}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:700,color:item.tone,marginBottom:4}}>{item.value}</div>
                <div style={{fontSize:11,color:c.tx2}}>{item.sub}</div>
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"stretch", position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.35fr 1fr 1fr 1fr 1fr", gap: 8, flex:1, minWidth:0, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
              <input
                style={{...inputStyle, position:"relative", zIndex:7, pointerEvents:"auto"}}
                placeholder="Search bill, bank, or person..."
                value={acctSearch}
                onChange={(e) => setAcctSearch(e.target.value)}
              />
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctOwnerF} onChange={(e) => setAcctOwnerF(e.target.value)}>
                {allOwners.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctCatF} onChange={(e) => setAcctCatF(e.target.value)}>
                {["All", ...allCategories].map((o) => <option key={o}>{o}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctStatusF} onChange={(e) => setAcctStatusF(e.target.value)}>
                {["All", "Paid", "Unpaid"].map((o) => <option key={o}>{o}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctGroupBy} onChange={(e) => setAcctGroupBy(e.target.value)}>
                <option value="category">Group by type</option>
                <option value="organization">Group by bank</option>
              </select>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto"}}>
            <button
              type="button"
              onClick={() => {
                const next = {};
                orderedGroups.forEach((g) => { next[g] = true; });
                setAcctExpanded(next);
              }}
              style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer", position:"relative", zIndex:7, pointerEvents:"auto"}}
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setAcctExpanded({})}
              style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer", position:"relative", zIndex:7, pointerEvents:"auto"}}
            >
              Collapse all
            </button>
          </div>

          {orderedGroups.map((groupName) => {
            const rows = grouped[groupName] || [];
            const open = !!acctExpanded[groupName];
            const grpBal = rows.reduce((s, a) => s + (a.cur_bal || 0), 0);
            const grpDue = rows.reduce((s, a) => s + (a.min_due_v || 0), 0);
            return (
            <div key={groupName} style={{ marginBottom: 14, border:`1px solid ${c.border}`, borderRadius:10, background:c.surf, position:"relative", zIndex:20, isolation:"isolate", pointerEvents:"auto" }}>
              <button
                type="button"
                onClick={() => setAcctExpanded((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                style={{width:"100%",border:"none",background:"transparent",padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:open?`1px solid ${c.border}`:"none",position:"relative",zIndex:21,pointerEvents:"auto"}}
              >
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {acctGroupBy === "organization"
                    ? <ProviderMark bank={groupName} name={groupName} size={22} />
                    : <span style={{fontSize:14}}>{CAT_ICON[groupName] || "•"}</span>
                  }
                  <span style={{fontSize:12,fontWeight:900,letterSpacing:"0.06em",textTransform:"uppercase",color:c.tx2}}>
                    {groupName}
                  </span>
                  <span style={{fontSize:12,color:c.muted}}>({rows.length})</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:c.tx2}}>Due {fx(grpDue)}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:c.ac}}>Bal {fx(grpBal)}</span>
                  <span style={{color:c.muted,fontSize:13,fontWeight:800}}>{open ? "▲" : "▼"}</span>
                </div>
              </button>
              {open && <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <colgroup>
                  <col style={{width: acctGroupBy === "organization" ? "36%" : "42%"}} />
                  <col style={{width:"10%"}} />
                  {acctGroupBy === "organization" && <col style={{width:"12%"}} />}
                  <col style={{width:"8%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"11%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"6%"}} />
                </colgroup>
                <thead>
                  <tr style={{borderBottom:`2px solid ${c.border}`}}>
                    {["Account","Owner", ...(acctGroupBy === "organization" ? ["Category"] : []), "APR","Balance","Min Due","Paid","Status"].map(h=>(
                      (h === "APR" && isMobile) ? null :
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,fontFamily:"'Instrument Sans',sans-serif"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(a=>{
                    const vm = accountViewModel(a);
                    return (
                    <tr key={a.id} style={{borderBottom:`1px solid ${c.border}`}}
                      onMouseEnter={e=>{ e.currentTarget.style.background=c.surf2; setHoveredId(a.id); }}
                      onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; setHoveredId(null); }}
                      onTouchStart={isMobile ? (e => setSwipeState(s => ({ ...s, [a.id]: e.touches[0].clientX }))) : undefined}
                      onTouchEnd={isMobile ? (e => {
                        const startX = swipeState[a.id];
                        if (startX == null) return;
                        const dx = e.changedTouches[0].clientX - startX;
                        setSwipeState(s => { const n = {...s}; delete n[a.id]; return n; });
                        if (Math.abs(dx) < 10) return; // tap — let click handlers fire normally
                        if (dx > 60 && !a.is_paid) {
                          const prevPaid = a.is_paid;
                          updateRecord(a.id, { is_paid: true });
                          showToast(`${a.name} marked paid`);
                          showUndoToast(`${a.name} marked paid`, () => updateRecord(a.id, { is_paid: prevPaid }));
                        } else if (dx < -60) {
                          setEditId(a.id === editId ? null : a.id);
                        }
                      }) : undefined}
                    >
                      {bulkMode && (
                        <td style={{padding:"9px 10px",width:32}}>
                          <input type="checkbox" checked={bulkSelected.has(a.id)}
                            onChange={e => {
                              setBulkSelected(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(a.id) : next.delete(a.id);
                                return next;
                              });
                            }}
                            style={{ width:16, height:16, accentColor:c.ac, cursor:"pointer", flexShrink:0 }}
                          />
                        </td>
                      )}
                      <td style={{padding:"9px 10px",fontWeight:600,fontFamily:"'Instrument Sans',sans-serif",color:c.tx}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                          <button
                            onClick={e => { e.stopPropagation(); const prevPaid = a.is_paid; updateRecord(a.id, { is_paid: !a.is_paid }); showToast(a.is_paid ? `${a.name} unpaid` : `${a.name} marked paid`); showUndoToast(a.is_paid ? `${a.name} marked unpaid` : `${a.name} marked paid`, () => updateRecord(a.id, { is_paid: prevPaid })); }}
                            title={a.is_paid ? "Mark unpaid" : "Mark paid"}
                            style={{ width:26, height:26, borderRadius:"50%", border:`2px solid ${a.is_paid ? c.go : c.border2}`, background: a.is_paid ? c.go : "transparent", color: a.is_paid ? "#fff" : c.muted, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                            {a.is_paid ? "✓" : ""}
                          </button>
                          <ProviderMark bank={a.bank} name={a.name} size={24} />
                          <div style={{minWidth:0}}>
                            <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:800,fontSize:15}}>{vm.title}</div>
                            <div style={{fontSize:11,color:c.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{vm.subtitle}</div>
                            {!a.is_paid && a.d_left != null && a.d_left >= 0 && a.d_left <= 7 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openDueNextView(a.id); }}
                                style={{marginTop:5,padding:"4px 8px",borderRadius:999,border:`1px solid ${c.ac}55`,background:`${c.ac}12`,color:c.ac,fontSize:10,fontWeight:800,cursor:"pointer"}}
                              >
                                Open on Home
                              </button>
                            )}
                            {isMobile && !a.is_paid && (
                              <div style={{ fontSize:9, color:c.muted, marginTop:2 }}>swipe → pay · ← edit</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"9px 10px",color:c.tx2}}>{a.owner}</td>
                      {acctGroupBy === "organization" && <td style={{padding:"9px 10px",color:c.tx2}}>{a.category}</td>}
                      {!isMobile && <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace",color:c.muted}}>{a.apr_v?pct(a.apr_v):"-"}</td>}
                      <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace",color:c.ac}}>
                        {fx(a.cur_bal)}
                        {(() => {
                          const prev = getPrevRecord(a.id);
                          if (!prev) return null;
                          const prevBal = Number(prev.cur_bal) || Number(prev.base_bal_v) || 0;
                          const currBal = Number(a.cur_bal) || 0;
                          const delta = currBal - prevBal;
                          if (Math.abs(delta) < 0.01) return null;
                          const isDown = delta < 0;
                          return (
                            <span style={{ fontSize:10, fontWeight:700, color: isDown ? c.go : c.da, fontFamily:"'DM Mono',monospace", marginLeft:5 }}>
                              {isDown ? "▼" : "▲"} {fx(Math.abs(delta))}
                            </span>
                          );
                        })()}
                        {(() => {
                          const apr = a.effectiveApr ?? getEffectiveApr(a);
                          const bal = Number(a.cur_bal || 0);
                          const minDue = Number(a.min_due_v || a.budgeted_min || 0);
                          const paymentBasis = Number(a.paid_v || 0) > 0 ? Number(a.paid_v || 0) : minDue;
                          if (apr <= 0 || bal <= 0 || paymentBasis <= 0) return null;
                          const monthlyInterest = (apr / 12) * bal;
                          const interestApplied = Math.min(paymentBasis, monthlyInterest);
                          const principalApplied = Math.max(0, paymentBasis - interestApplied);
                          const interestPct = Math.min(100, Math.round((interestApplied / paymentBasis) * 100));
                          const principalPct = 100 - interestPct;
                          const dangerMode = monthlyInterest >= paymentBasis;
                          return (
                            <div style={{ marginTop:4 }}>
                              <div style={{ height:3, borderRadius:2, overflow:"hidden", background:c.border, display:"flex", minWidth:60 }}>
                                <div style={{ width:`${principalPct}%`, background: dangerMode ? "transparent" : c.go, transition:"width 0.4s" }}/>
                                <div style={{ width:`${interestPct}%`, background: dangerMode ? c.da : c.wa, transition:"width 0.4s" }}/>
                              </div>
                              <div style={{ fontSize:9, color: interestPct > 70 ? c.da : c.muted, fontFamily:"'DM Mono',monospace", marginTop:1 }}>Interest {fx(interestApplied)} • Principal {fx(principalApplied)}</div>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace"}}>{fx(a.min_due_v)}</td>
                      <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace",color:c.go}}>{fx(a.paid_v)}</td>
                      <td style={{padding:"9px 10px"}}>
                        {hoveredId === a.id ? (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); openEdit(a); }}
                            style={{ padding:"4px 12px", borderRadius:6, border:`1.5px solid ${c.ac}`, background:"transparent", color:c.ac, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
                          >
                            Edit
                          </button>
                        ) : (
                          <span style={{color:a.is_paid?c.go:c.muted,fontWeight:a.is_paid?700:400}}>{a.is_paid?"Paid":"—"}</span>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
              }
            </div>
          )})}

          <div style={{ borderTop: `2px solid ${c.border}`, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 20 }}>
            <div style={{ color: c.muted, fontSize: 12, fontWeight: 700 }}>This view ({filtered.length} accounts)</div>
            <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac, fontWeight: 700 }}>Left {fx(totalDebt)}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>Due {fx(dueTotal)}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", color: c.go, fontWeight: 700 }}>Paid {fx(paidTotal)}</div>
          </div>
        </div>
      );
    };
    const Trends = () => {
      const bycat = {};
      allAccts.forEach((a) => { bycat[a.category] = (bycat[a.category] || 0) + (a.cur_bal || 0); });
      const catRows = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
      const _maxCatV = catRows[0]?.[1] || 1;
      const ownerRows = allOwners
        .filter((o) => o !== "All")
        .map((owner) => ({
          owner,
          bal: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.cur_bal || 0), 0),
        }))
        .sort((a, b) => b.bal - a.bal);
      const _maxOwnerV = ownerRows[0]?.bal || 1;
      const CHART_COLORS = [c.ac, c.go, c.wa, c.da, "#6366f1"];
      const _colors = CHART_COLORS;

      const totalCatDebt = catRows.reduce((s, [, v]) => s + v, 0) || 1;
      let accPct = 0;
      const donutStops = catRows.slice(0, 5).map(([, v], i) => {
        const from = accPct;
        const pctV = (v / totalCatDebt) * 100;
        accPct += pctV;
        return `${CHART_COLORS[i % CHART_COLORS.length]} ${from}% ${accPct}%`;
      });
      const donutBg = donutStops.length
        ? `conic-gradient(${donutStops.join(", ")})`
        : `conic-gradient(${c.border2} 0% 100%)`;

      const monthStart = new Date(selYear, selMonth - 1, 1);
      const monthEnd = new Date(selYear, selMonth, 0);
      const dueBands = [];
      const cursor = getStartOfWeek(monthStart);
      while (cursor <= monthEnd) {
        const start = new Date(cursor);
        const end = new Date(cursor);
        end.setDate(end.getDate() + 6);
        const visibleStart = start < monthStart ? monthStart : start;
        const visibleEnd = end > monthEnd ? monthEnd : end;
        dueBands.push({
          start: new Date(start),
          end: new Date(end),
          label: `${visibleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}-${visibleEnd.toLocaleDateString("en-US", { day: "numeric" })}`,
        });
        cursor.setDate(cursor.getDate() + 7);
      }
      const dueSeries = dueBands.map((band) => ({
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
      const maxDueSeries = Math.max(1, ...dueSeries.map((d) => d.val));
      return (
        <div style={{opacity:mounted?1:0,transition:"opacity .3s",marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1.2fr",gap:12,marginBottom:12}}>
            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:10}}>Category Share (Donut)</div>
              <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",gap:14,flexDirection:isMobile?"column":"row"}}>
                <div
                  style={{width:170,height:170,borderRadius:"50%",background:donutBg,display:"grid",placeItems:"center",cursor:"pointer",transition:"opacity 0.2s"}}
                  onClick={() => { setCatF("All"); navigateTo("bills"); }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <div style={{width:108,height:108,borderRadius:"50%",background:c.surf,display:"grid",placeItems:"center",border:`1px solid ${c.border}`}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:c.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>Debt</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700}}>{fx(totalCatDebt)}</div>
                    </div>
                  </div>
                </div>
                <div style={{flex:1,width:isMobile?"100%":"auto"}}>
                  {catRows.slice(0, 5).map(([cat, val], i) => (
                    <div
                      key={cat}
                      style={{display:"grid",gridTemplateColumns:"14px 1fr auto",gap:8,alignItems:"center",marginBottom:6,fontSize:12,cursor:"pointer"}}
                      onClick={() => { setCatF(cat); navigateTo("bills"); }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    >
                      <span style={{width:10,height:10,borderRadius:99,background:CHART_COLORS[i % CHART_COLORS.length],display:"inline-block",flexShrink:0}} />
                      <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{CAT_ICON[cat] || "•"} {cat}</span>
                      <span style={{fontFamily:"'DM Mono',monospace"}}>{Math.round((val / totalCatDebt) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              {(() => {
                const ownerColors = [c.ac, "#6366f1", c.wa, c.go, c.da];
                const ownerTotals = ownerRows.map((o, i) => ({ owner: o.owner, total: o.bal, color: ownerColors[i % ownerColors.length] })).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);
                const grandTotal = ownerTotals.reduce((s,d)=>s+d.total,0) || 1;
                return (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Debt by Owner</div>
                    <div style={{ height:28, borderRadius:8, overflow:"hidden", display:"flex", marginBottom:12 }}>
                      {ownerTotals.map((d)=>(
                        <div key={d.owner} title={`${d.owner}: ${fx(d.total)}`}
                          style={{ width:`${(d.total/grandTotal)*100}%`, background:d.color, transition:"width 0.5s" }}/>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 20px" }}>
                      {ownerTotals.map((d)=>(
                        <div key={d.owner} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                          <div style={{ width:10, height:10, borderRadius:3, background:d.color, flexShrink:0 }}/>
                          <span style={{ color:c.tx2 }}>{d.owner}</span>
                          <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(d.total)}</span>
                          <span style={{ color:c.muted }}>({pct(d.total/grandTotal)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.1fr 1fr",gap:12}}>
            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              {(() => {
                // Build last 6 months of total balance data
                // records is only for the current selected month (keyed by account id)
                // For the current month use allAccts; for prior months fall back to starting_bal
                const curMk = getMonthKey(selMonth, selYear);
                const last6Months = [];
                for (let i = 5; i >= 0; i--) {
                  const d = new Date(selYear, selMonth - 1 - i, 1);
                  const mk = getMonthKey(d.getMonth()+1, d.getFullYear());
                  const monthLabel = d.toLocaleString("default", { month: "short" });
                  let total;
                  if (mk === curMk) {
                    total = allAccts.reduce((sum, a) => sum + (Number(a.cur_bal) || 0), 0);
                  } else {
                    total = allAccts.reduce((sum, a) => sum + (Number(a.starting_bal) || 0), 0);
                  }
                  last6Months.push({ label: monthLabel, total });
                }
                const W = 400, H = 160, PAD = { t:16, r:16, b:32, l:56 };
                const cW = W - PAD.l - PAD.r;
                const cH = H - PAD.t - PAD.b;
                const maxV = Math.max(...last6Months.map(d=>d.total), 1);
                const minV = Math.min(...last6Months.map(d=>d.total), 0);
                const range = maxV - minV || 1;
                const pts = last6Months.map((d,idx) => ({
                  x: PAD.l + (idx/(last6Months.length-1||1))*cW,
                  y: PAD.t + cH - ((d.total - minV)/range)*cH,
                  val: d.total, label: d.label
                }));
                const polyline = pts.map(p=>`${p.x},${p.y}`).join(" ");
                const areaPath = `M${pts[0].x},${PAD.t+cH} ` + pts.map(p=>`L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${PAD.t+cH} Z`;
                return (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Total Debt Over Time</div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.ac} stopOpacity="0.25"/>
                          <stop offset="100%" stopColor={c.ac} stopOpacity="0.02"/>
                        </linearGradient>
                      </defs>
                      {[0,0.5,1].map((f,gi)=>(
                        <line key={gi} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                      ))}
                      {[0,0.5,1].map((f,gi)=>(
                        <text key={gi} x={PAD.l-6} y={PAD.t+cH*f+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                          {fx(minV+(1-f)*range)}
                        </text>
                      ))}
                      <path d={areaPath} fill="url(#areaGrad)"/>
                      <polyline points={polyline} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      {pts.map((p,pi)=>(
                        <g key={pi}>
                          <circle cx={p.x} cy={p.y} r="4" fill={c.ac} stroke={c.surf} strokeWidth="2"/>
                          <text x={p.x} y={H-6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                );
              })()}
              {(() => {
                // Cash Flow grouped bar chart
                const cfData = [];
                const curMk = getMonthKey(selMonth, selYear);
                for (let i = 5; i >= 0; i--) {
                  const d = new Date(selYear, selMonth - 1 - i, 1);
                  const mk = getMonthKey(d.getMonth()+1, d.getFullYear());
                  const monthLabel = d.toLocaleString("default", { month: "short" });
                  let totalBills;
                  if (mk === curMk) {
                    totalBills = allAccts.reduce((sum, a) => sum + (Number(a.min_due_v)||0), 0);
                  } else {
                    totalBills = allAccts.reduce((sum, a) => sum + (Number(a.budgeted_min)||0), 0);
                  }
                  const incomeAmt = mk === curMk ? income.reduce((s,e)=>s+(Number(e.amt)||0),0) : 0;
                  cfData.push({ label: monthLabel, bills: totalBills, income: incomeAmt });
                }
                const maxCF = Math.max(...cfData.flatMap(d=>[d.bills, d.income]), 1);
                const W = 440, H = 180, PAD = { t:16, r:16, b:32, l:56 };
                const cW = W - PAD.l - PAD.r;
                const cH = H - PAD.t - PAD.b;
                const barGroupW = cW / cfData.length;
                const barW = Math.min(barGroupW * 0.35, 22);
                return (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Monthly Cash Flow</div>
                    <div style={{ display:"flex", gap:16, alignItems:"center", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:c.tx2 }}><div style={{ width:10,height:10,borderRadius:3,background:c.go }}/> Income</div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:c.tx2 }}><div style={{ width:10,height:10,borderRadius:3,background:c.da }}/> Bills</div>
                    </div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                      {[0,0.5,1].map((f,gi)=>(
                        <line key={gi} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                      ))}
                      {cfData.map((d,ci)=>{
                        const cx = PAD.l + (ci+0.5)*barGroupW;
                        const incomeH = (d.income/maxCF)*cH;
                        const billsH = (d.bills/maxCF)*cH;
                        return (
                          <g key={ci}>
                            <rect x={cx-barW-2} y={PAD.t+cH-incomeH} width={barW} height={incomeH} rx="3" fill={c.go} opacity="0.85"/>
                            <rect x={cx+2} y={PAD.t+cH-billsH} width={barW} height={billsH} rx="3" fill={c.da} opacity="0.85"/>
                            <text x={cx} y={H-6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{d.label}</text>
                          </g>
                        );
                      })}
                      {[0,0.5,1].map((f,gi)=>(
                        <text key={gi} x={PAD.l-6} y={PAD.t+cH*f+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                          {fx(maxCF*(1-f))}
                        </text>
                      ))}
                    </svg>
                  </div>
                );
              })()}
            </div>

            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Min Due by Week (Sun-Sat)</div>
              <div style={{fontSize:11,color:c.muted,marginBottom:10}}>Centered weekly view for the selected month, grouped by true Sunday-to-Saturday windows.</div>
              {(() => {
                const W = 520;
                const H = 220;
                const PAD = { t: 28, r: 26, b: 58, l: 48 };
                const cW = W - PAD.l - PAD.r;
                const cH = H - PAD.t - PAD.b;
                const weekStep = dueSeries.length > 1 ? cW / (dueSeries.length - 1) : 0;
                const chartPts = dueSeries.map((d, i) => ({
                  x: PAD.l + (i * weekStep),
                  y: PAD.t + cH - ((d.val / maxDueSeries) * cH),
                  val: d.val,
                  label: d.label,
                }));
                const chartLine = chartPts.map((p) => `${p.x},${p.y}`).join(" ");
                const areaPath = chartPts.length
                  ? `M${chartPts[0].x},${PAD.t + cH} ` + chartPts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${chartPts[chartPts.length - 1].x},${PAD.t + cH} Z`
                  : "";
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={isMobile ? "210" : "220"} role="img" aria-label="Min due line chart" style={{display:"block"}}>
                    <defs>
                      <linearGradient id="weeklyDueArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.ac} stopOpacity="0.18"/>
                        <stop offset="100%" stopColor={c.ac} stopOpacity="0.02"/>
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

          {/* Net Worth Bar */}
          {assets > 0 && (() => {
            const totalDebt = allAccts.reduce((s,a) => s+(Number(a.cur_bal)||0),0);
            const netWorth = assets - totalDebt;
            const total = assets + totalDebt || 1;
            const nwColor = netWorth >= 0 ? c.go : c.da;
            return (
              <div style={{ marginTop:12, background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Net Worth Snapshot</div>
                <div style={{ height:28, borderRadius:8, overflow:"hidden", display:"flex", marginBottom:10 }}>
                  <div title={`Assets: ${fx(assets)}`} style={{ width:`${(assets/total)*100}%`, background:c.go, transition:"width 0.5s", minWidth:2 }}/>
                  <div title={`Debt: ${fx(totalDebt)}`} style={{ width:`${(totalDebt/total)*100}%`, background:c.da, transition:"width 0.5s", minWidth:2 }}/>
                </div>
                <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                    <div style={{ width:10,height:10,borderRadius:3,background:c.go }}/>
                    <span style={{ color:c.tx2 }}>Assets</span>
                    <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(assets)}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                    <div style={{ width:10,height:10,borderRadius:3,background:c.da }}/>
                    <span style={{ color:c.tx2 }}>Debt</span>
                    <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(totalDebt)}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                    <div style={{ width:10,height:10,borderRadius:3,background:nwColor }}/>
                    <span style={{ color:c.tx2 }}>Net Worth</span>
                    <span style={{ color:nwColor, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{netWorth>=0?"":"-"}{fx(Math.abs(netWorth))}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* APR Bubble Chart */}
          {(() => {
            const bubbleAccts = allAccts.filter(a => (a.effectiveApr ?? getEffectiveApr(a)) > 0 && Number(a.cur_bal||0) > 0);
            if (bubbleAccts.length === 0) return null;
            const maxBal = Math.max(...bubbleAccts.map(a => Number(a.cur_bal||0)), 1);
            const maxApr = Math.max(...bubbleAccts.map(a => a.effectiveApr ?? getEffectiveApr(a)), 0.01);
            const maxMin = Math.max(...bubbleAccts.map(a => Number(a.min_due_v||a.budgeted_min||0)), 1);
            const W = 480, H = 250, PAD = { t:24, r:30, b:52, l:64 };
            const cW = W - PAD.l - PAD.r;
            const cH = H - PAD.t - PAD.b;
            return (
              <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>APR vs Balance (bubble = min payment)</div>
                <div style={{ fontSize:11, color:c.muted, marginBottom:8 }}>Bigger bubble = higher minimum payment. Top-right = most expensive debt.</div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                  {[0,0.25,0.5,0.75,1].map((f,i) => (
                    <line key={i} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                  ))}
                  {[0,0.5,1].map((f,i) => (
                    <text key={i} x={PAD.l-6} y={PAD.t+cH*(1-f)+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                      {Math.round(maxApr * f * 100)}%
                    </text>
                  ))}
                  {[0,0.5,1].map((f,i) => (
                    <text key={i} x={PAD.l+cW*f} y={H-6} textAnchor="middle" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                      {fx(maxBal*f)}
                    </text>
                  ))}
                  <text x={PAD.l+cW/2} y={H-1} textAnchor="middle" fontSize="9" fill={c.muted}>Balance →</text>
                  <text x={10} y={PAD.t+cH/2} textAnchor="middle" fontSize="9" fill={c.muted} transform={`rotate(-90,10,${PAD.t+cH/2})`}>APR →</text>
                  {bubbleAccts.map((a) => {
                    const apr = a.effectiveApr ?? getEffectiveApr(a);
                    const bal = Number(a.cur_bal||0);
                    const minDue = Number(a.min_due_v||a.budgeted_min||0);
                    const cx = PAD.l + (bal/maxBal)*cW;
                    const cy = PAD.t + cH - (apr/maxApr)*cH;
                    const r = Math.max(7, Math.min(22, 8 + (minDue/maxMin)*16));
                    const color = apr > 0.20 ? c.da : apr > 0.12 ? c.wa : c.go;
                    return (
                      <g key={a.id}>
                        <circle cx={cx} cy={cy} r={r} fill={color} opacity="0.7" stroke={color} strokeWidth="1.5"/>
                        {r > 10 && (
                          <text x={cx} y={cy+4} textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" fontFamily="'DM Mono',monospace">
                            {Math.round(apr*100)}%
                          </text>
                        )}
                        <title>{a.name} | APR: {Math.round(apr*100)}% | Bal: {fx(bal)} | Min: {fx(minDue)}</title>
                      </g>
                    );
                  })}
                </svg>
                <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginTop:6 }}>
                  {[{label:">20% APR",color:c.da},{label:"12-20%",color:c.wa},{label:"<12%",color:c.go}].map(({label,color})=>(
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:c.tx2 }}>
                      <div style={{ width:10,height:10,borderRadius:"50%",background:color,opacity:0.7 }}/>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      );
}
