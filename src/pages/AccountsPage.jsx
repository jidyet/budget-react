import { useMemo, useState } from "react";
import ProviderMark from "../components/ProviderMark";
import EditPanel from "../components/EditPanel";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import { CAT_ICON } from "../data/mockAccounts";
import { fx, pct, accountViewModel } from "../utils/budgetUtils";

export default function AccountsPage(props) {
  const {
    mounted = false,
    c = {},
    isMobile = false,
    allAccts = [],
    acctOwnerF = "All",
    setAcctOwnerF = () => {},
    acctCatF = "All",
    setAcctCatF = () => {},
    acctStatusF = "All",
    setAcctStatusF = () => {},
    acctSearch = "",
    setAcctSearch = () => {},
    acctGroupBy = "category",
    setAcctGroupBy = () => {},
    allOwners = ["All"],
    allCategories = [],
    inputStyle = {},
    selStyle = {},
    bulkMode = false,
    bulkSelected = new Set(),
    setBulkSelected = () => {},
    openDueNextView = () => {},
    acctExpanded = {},
    setAcctExpanded = () => {},
    swipeState = {},
    setSwipeState = () => {},
    updateRecord = () => {},
    showToast = () => {},
    showUndoToast = () => {},
    setEditId = () => {},
    editId = null,
    getPrevRecord = () => null,
    getEffectiveApr = () => 0,
    openEdit = () => {},
    setPage = () => {},
  } = props || {};
      const [hoveredId, setHoveredId] = useState(null);

      const filtered = useMemo(() => allAccts.filter((a) => {
        if (acctOwnerF !== "All" && a.owner !== acctOwnerF) return false;
        if (acctCatF !== "All" && a.category !== acctCatF) return false;
        if (acctStatusF === "Paid" && !a.is_paid) return false;
        if (acctStatusF === "Unpaid" && a.is_paid) return false;
        if (acctSearch && !`${a.name} ${a.bank} ${a.owner} ${a.category}`.toLowerCase().includes(acctSearch.toLowerCase())) return false;
        return true;
      }), [allAccts, acctOwnerF, acctCatF, acctStatusF, acctSearch]);

      const { grouped, orderedGroups } = useMemo(() => {
        const g = {};
        filtered.forEach((a) => {
          const key = acctGroupBy === "organization" ? accountViewModel(a).org : a.category;
          if (!g[key]) g[key] = [];
          g[key].push(a);
        });
        const ordered = acctGroupBy === "organization"
          ? Object.keys(g).sort((a, b) => a.localeCompare(b))
          : allCategories.filter((cat) => g[cat]);
        return { grouped: g, orderedGroups: ordered };
      }, [filtered, acctGroupBy, allCategories]);

      const { totalDebt, dueTotal, paidTotal, filteredUnpaid, filteredOverdue, filteredDueThisWeek } = useMemo(() => ({
        totalDebt:           filtered.reduce((s, a) => s + (a.cur_bal || 0), 0),
        dueTotal:            filtered.reduce((s, a) => s + (a.min_due_v || 0), 0),
        paidTotal:           filtered.reduce((s, a) => s + (a.paid_v || 0), 0),
        filteredUnpaid:      filtered.filter((a) => !a.is_paid),
        filteredOverdue:     filtered.filter((a) => !a.is_paid && a.d_left != null && a.d_left < 0),
        filteredDueThisWeek: filtered.filter((a) => !a.is_paid && a.d_left != null && a.d_left >= 0 && a.d_left <= 7),
      }), [filtered]);

      const hasActiveFilters = acctOwnerF !== "All" || acctCatF !== "All" || acctStatusF !== "All" || acctGroupBy !== "category" || !!acctSearch.trim();
      const activeFilters = [
        acctSearch.trim() ? `Search: ${acctSearch.trim()}` : null,
        acctOwnerF !== "All" ? `Owner: ${acctOwnerF}` : null,
        acctCatF !== "All" ? `Category: ${acctCatF}` : null,
        acctStatusF !== "All" ? `Status: ${acctStatusF}` : null,
        acctGroupBy !== "category" ? "Grouped by bank" : null,
      ].filter(Boolean);
      const completionPct = filtered.length ? Math.round(((filtered.length - filteredUnpaid.length) / filtered.length) * 100) : 0;
      const urgentCount = filteredDueThisWeek.length + filteredOverdue.length;
      const resetFilters = () => {
        setAcctSearch("");
        setAcctOwnerF("All");
        setAcctCatF("All");
        setAcctStatusF("All");
        setAcctGroupBy("category");
      };

      if (isMobile) {
        return (
          <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position: "relative", zIndex: 10, isolation: "isolate", pointerEvents: "auto" }}>
            {!allAccts.length && (
              <div style={{ marginBottom: 14 }}>
                <EmptyStateCard
                  palette={c}
                  title="No bills yet"
                  message="Start with one bill, import a sheet, or upload a statement. Your progress will show here as soon as you add something."
                  action={
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setPage?.("settings")}
                        style={{ padding: "9px 14px", borderRadius: 999, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                      >
                        Add your first bill
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage?.("upload")}
                        style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                      >
                        Import or upload
                      </button>
                    </div>
                  }
                />
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 18, background: c.surf, padding: "16px 14px", boxShadow: `0 12px 28px ${c.border}22` }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Bills</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: c.tx, lineHeight: 1.05, marginBottom: 6 }}>Quick mobile view</div>
                <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5, marginBottom: 14 }}>
                  Search, filter, and update bills without leaving your place.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "In view", value: String(filtered.length), tone: c.tx },
                    { label: "Open", value: String(filteredUnpaid.length), tone: c.wa },
                    { label: "Due soon", value: String(filteredDueThisWeek.length), tone: c.ac },
                    { label: "Past due", value: String(filteredOverdue.length), tone: c.da },
                  ].map((item) => (
                    <div key={item.label} style={{ borderRadius: 14, border: `1px solid ${item.tone}26`, background: `${item.tone}0D`, padding: "12px 12px 10px" }}>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 5 }}>{item.label}</div>
                      <div style={{ fontSize: 21, fontWeight: 900, color: item.tone, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <div style={{ borderRadius: 14, border: `1px solid ${c.border}`, background: c.surf2, padding: "12px 12px 10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 5 }}>Balance left</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: c.ac, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fx(totalDebt)}</div>
                  </div>
                  <div style={{ borderRadius: 14, border: `1px solid ${c.border}`, background: c.surf2, padding: "12px 12px 10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 5 }}>Paid this cycle</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: c.go, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fx(paidTotal)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={openDueNextView}
                    style={{ flex: 1, minWidth: 0, minHeight: 42, padding: "10px 12px", borderRadius: 999, border: `1px solid ${c.ac}45`, background: `${c.ac}14`, color: c.ac, fontSize: 12, fontWeight: 900 }}
                  >
                    Open Due Soon
                  </button>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      style={{ flex: 1, minWidth: 0, minHeight: 42, padding: "10px 12px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800 }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div style={{ border: `1px solid ${c.border}`, borderRadius: 18, background: c.surf, padding: "14px 12px", boxShadow: `0 10px 24px ${c.border}22` }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 10 }}>Filter Bills</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    style={{ ...inputStyle, width: "100%" }}
                    placeholder="Search bill, bank, or person..."
                    value={acctSearch}
                    onChange={(e) => setAcctSearch(e.target.value)}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={selStyle} value={acctOwnerF} onChange={(e) => setAcctOwnerF(e.target.value)}>
                      {allOwners.map((o) => <option key={o} value={o}>{o === "All" ? "All owners" : o}</option>)}
                    </select>
                    <select style={selStyle} value={acctCatF} onChange={(e) => setAcctCatF(e.target.value)}>
                      {["All", ...allCategories].map((o) => <option key={o} value={o}>{o === "All" ? "All bill types" : o}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={selStyle} value={acctStatusF} onChange={(e) => setAcctStatusF(e.target.value)}>
                      {["All", "Paid", "Unpaid"].map((o) => <option key={o} value={o}>{o === "All" ? "Any status" : o}</option>)}
                    </select>
                    <select style={selStyle} value={acctGroupBy} onChange={(e) => setAcctGroupBy(e.target.value)}>
                      <option value="category">Group by type</option>
                      <option value="organization">Group by bank</option>
                    </select>
                  </div>
                </div>
                {activeFilters.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {activeFilters.map((filterLabel) => (
                      <span key={filterLabel} style={{ padding: "6px 10px", borderRadius: 999, background: `${c.ac}12`, border: `1px solid ${c.ac}35`, color: c.ac, fontSize: 11, fontWeight: 800 }}>
                        {filterLabel}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "0 2px" }}>
                <div style={{ fontSize: 12, color: c.tx2, fontWeight: 700 }}>
                  {orderedGroups.length} group{orderedGroups.length === 1 ? "" : "s"} in view
                </div>
                <div style={{ fontSize: 11, color: c.muted }}>
                  {completionPct}% complete
                </div>
              </div>

              {orderedGroups.map((groupName) => {
                const rows = grouped[groupName] || [];
                const open = !!acctExpanded[groupName];
                const grpBal = rows.reduce((s, a) => s + (a.cur_bal || 0), 0);
                const grpDue = rows.reduce((s, a) => s + (a.min_due_v || 0), 0);

                return (
                  <div key={groupName} style={{ border: `1px solid ${c.border}`, borderRadius: 16, background: c.surf, overflow: "hidden", boxShadow: `0 8px 20px ${c.border}18` }}>
                    <button
                      type="button"
                      onClick={() => setAcctExpanded((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                      style={{ width: "100%", border: "none", background: `linear-gradient(135deg, ${c.surf2}, ${c.surf})`, padding: "14px 14px 12px", display: "grid", gap: 8, textAlign: "left" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          {acctGroupBy === "organization"
                            ? <ProviderMark bank={groupName} name={groupName} size={22} />
                            : <span style={{ fontSize: 15 }}>{CAT_ICON[groupName] || "•"}</span>
                          }
                          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.tx, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {groupName}
                          </span>
                        </div>
                        <span style={{ color: c.muted, fontSize: 12, fontWeight: 900 }}>{open ? "▲" : "▼"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "4px 9px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border}`, color: c.tx2, fontSize: 11, fontWeight: 800 }}>{rows.length} account{rows.length === 1 ? "" : "s"}</span>
                        <span style={{ padding: "4px 9px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border}`, color: c.tx2, fontSize: 11, fontWeight: 800 }}>Due {fx(grpDue)}</span>
                        <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.ac}10`, border: `1px solid ${c.ac}35`, color: c.ac, fontSize: 11, fontWeight: 900 }}>Bal {fx(grpBal)}</span>
                      </div>
                    </button>
                    {open && (
                      <div style={{ padding: "10px", display: "grid", gap: 10 }}>
                        {rows.map((a) => {
                          const vm = accountViewModel(a);
                          const prev = getPrevRecord(a.id);
                          const prevBal = prev ? (Number(prev.cur_bal) || Number(prev.base_bal_v) || 0) : null;
                          const currBal = Number(a.cur_bal) || 0;
                          const delta = prevBal == null ? 0 : currBal - prevBal;
                          const apr = a.apr_v ? pct(a.apr_v) : "-";

                          return (
                            <div key={a.id} style={{ border: `1px solid ${c.border}`, borderRadius: 14, background: c.surf2, padding: "12px 12px 10px", display: "grid", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prevPaid = a.is_paid;
                                    updateRecord(a.id, { is_paid: !a.is_paid });
                                    showToast(a.is_paid ? `${a.name} unpaid` : `${a.name} marked paid`);
                                    showUndoToast(a.is_paid ? `${a.name} marked unpaid` : `${a.name} marked paid`, () => updateRecord(a.id, { is_paid: prevPaid }));
                                  }}
                                  title={a.is_paid ? "Mark unpaid" : "Mark paid"}
                                  style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${a.is_paid ? c.go : c.border2}`, background: a.is_paid ? c.go : "transparent", color: a.is_paid ? "#fff" : c.muted, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                >
                                  {a.is_paid ? "✓" : ""}
                                </button>
                                <ProviderMark bank={a.bank} name={a.name} size={24} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 15, fontWeight: 900, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vm.title}</div>
                                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vm.subtitle}</div>
                                </div>
                                {a.is_paid ? (
                                  <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.go}18`, border: `1px solid ${c.go}40`, color: c.go, fontSize: 11, fontWeight: 900, flexShrink: 0 }}>Paid</span>
                                ) : (
                                  <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.wa}14`, border: `1px solid ${c.wa}35`, color: c.wa, fontSize: 11, fontWeight: 900, flexShrink: 0 }}>
                                    {a.d_left == null ? "Open" : a.d_left < 0 ? `${Math.abs(a.d_left)}d overdue` : a.d_left === 0 ? "Due today" : a.d_left === 1 ? "Due tomorrow" : `${a.d_left}d left`}
                                  </span>
                                )}
                              </div>

                              {(() => {
                                const aprDec = a.apr_v ?? (Number(a.apr ?? 0) > 1 ? Number(a.apr) / 100 : Number(a.apr ?? 0));
                                const bal = Number(a.cur_bal || 0);
                                const monthlyInterest = bal > 0 && aprDec > 0 ? (aprDec / 12) * bal : 0;
                                const planned = Number(a.planned_v || 0);
                                const actualPaid = Number(a.paid_v || 0);
                                const effectivePayment = planned > 0 ? planned : actualPaid > 0 ? actualPaid : Number(a.min_due_v || 0);
                                const principalApplied = effectivePayment > 0 ? Math.max(0, effectivePayment - monthlyInterest) : 0;
                                const interestApplied = effectivePayment > 0 ? Math.min(effectivePayment, monthlyInterest) : monthlyInterest;
                                const dangerMode = monthlyInterest > 0 && effectivePayment <= monthlyInterest;
                                const showPaymentRow = true;
                                const showBreakdownRow = true;
                                return (
                                  <div style={{ display: "grid", gap: 6 }}>
                                    {/* Row 1: Balance | Min Due */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                      <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf, padding: "9px 10px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Balance</div>
                                        <div style={{ fontSize: 15, fontWeight: 900, color: c.ac, fontFamily: "'DM Mono',monospace" }}>{fx(a.cur_bal)}</div>
                                        {Math.abs(delta) >= 0.01 && (
                                          <div style={{ fontSize: 10, color: delta < 0 ? c.go : c.da, fontWeight: 800, marginTop: 2 }}>
                                            {delta < 0 ? "▼" : "▲"} {fx(Math.abs(delta))}
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf, padding: "9px 10px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Min Due</div>
                                        <div style={{ fontSize: 15, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>{fx(a.min_due_v)}</div>
                                      </div>
                                    </div>
                                    {/* Row 2: Planned | Actual */}
                                    {showPaymentRow && (
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                        <div style={{ borderRadius: 10, border: `1px solid ${c.ac}30`, background: `${c.ac}08`, padding: "9px 10px" }}>
                                          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Planned</div>
                                          <div style={{ fontSize: 15, fontWeight: 900, color: planned > 0 ? c.ac : c.muted, fontFamily: "'DM Mono',monospace" }}>{fx(planned)}</div>
                                        </div>
                                        <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf, padding: "9px 10px" }}>
                                          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Actual</div>
                                          <div style={{ fontSize: 15, fontWeight: 900, color: actualPaid > 0 ? c.go : c.muted, fontFamily: "'DM Mono',monospace" }}>{fx(actualPaid)}</div>
                                        </div>
                                      </div>
                                    )}
                                    {/* Row 3: Interest / Principal */}
                                    {showBreakdownRow && (
                                      <div style={{ borderRadius: 10, border: `1px solid ${dangerMode ? c.da + "55" : c.border}`, background: dangerMode ? `${c.da}08` : c.surf, padding: "9px 10px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 5 }}>Interest / Principal</div>
                                            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
                                              <div>
                                                <span style={{ fontSize: 14, fontWeight: 900, color: dangerMode ? c.da : c.wa, fontFamily: "'DM Mono',monospace" }}>{fx(interestApplied)}</span>
                                                <span style={{ fontSize: 10, color: c.muted, marginLeft: 3 }}>int</span>
                                              </div>
                                              <div>
                                                <span style={{ fontSize: 14, fontWeight: 900, color: principalApplied > 0 ? c.go : c.muted, fontFamily: "'DM Mono',monospace" }}>{fx(principalApplied)}</span>
                                                <span style={{ fontSize: 10, color: c.muted, marginLeft: 3 }}>principal</span>
                                              </div>
                                            </div>
                                            {effectivePayment > 0 && (
                                              <div style={{ marginTop: 6, height: 4, borderRadius: 2, overflow: "hidden", background: c.border, display: "flex" }}>
                                                <div style={{ width: `${Math.round((principalApplied / effectivePayment) * 100)}%`, background: principalApplied > 0 ? c.go : "transparent" }} />
                                                <div style={{ width: `${Math.round((interestApplied / effectivePayment) * 100)}%`, background: dangerMode ? c.da : c.wa }} />
                                              </div>
                                            )}
                                          </div>
                                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>APR</div>
                                            <div style={{ fontSize: 13, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>{apr}</div>
                                          </div>
                                        </div>
                                        {dangerMode && (
                                          <div style={{ fontSize: 10, color: c.da, fontWeight: 800, marginTop: 4 }}>Min due doesn't cover interest</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {!a.is_paid && a.d_left != null && a.d_left >= 0 && a.d_left <= 7 && (
                                  <button
                                    type="button"
                                    onClick={() => openDueNextView(a.id)}
                                    style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "10px 12px", borderRadius: 12, border: `1px solid ${c.ac}40`, background: `${c.ac}12`, color: c.ac, fontSize: 12, fontWeight: 900 }}
                                  >
                                    Open on Home
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEdit(a)}
                                  style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "10px 12px", borderRadius: 12, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800 }}
                                >
                                  Edit Bill
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div style={{opacity:mounted?1:0,transition:"opacity .3s",marginTop:16,overflowX:"auto",position:"relative",zIndex:10,isolation:"isolate",pointerEvents:"auto"}}>
          {!allAccts.length && (
            <div style={{ marginBottom: 14 }}>
              <EmptyStateCard
                palette={c}
                title="No bills yet"
                message="Start with one bill, import a sheet, or upload a statement. Your progress will show here as soon as you add something."
                action={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setPage?.("settings")}
                      style={{ padding: "9px 14px", borderRadius: 999, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                    >
                      Add your first bill
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage?.("upload")}
                      style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Import or upload
                    </button>
                  </div>
                }
              />
            </div>
          )}
          <div style={{ marginBottom:14, border:`1px solid ${c.border}`, borderRadius:20, overflow:"hidden", background:`linear-gradient(135deg, ${c.surf2}, ${c.surf} 58%, ${c.ac}08)` }}>
            <div style={{ padding:isMobile ? "18px 16px" : "22px 22px 18px", display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.3fr .9fr", gap:16, alignItems:"stretch" }}>
              <div style={{ display:"grid", gap:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.14em", textTransform:"uppercase", color:c.muted, marginBottom:8 }}>Bills Workspace</div>
                    <div style={{ fontSize:isMobile ? 28 : 34, fontWeight:900, color:c.tx, lineHeight:1 }}>Track every bill in one pass</div>
                    <div style={{ fontSize:13, color:c.tx2, lineHeight:1.55, marginTop:8, maxWidth:600 }}>
                      Search, filter, group, and update bills without losing your place. Swipe on mobile still works, and every edit keeps the existing live record flow.
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button
                      type="button"
                      onClick={() => openDueNextView()}
                      style={{ padding:"10px 14px", borderRadius:999, border:`1px solid ${c.ac}55`, background:`${c.ac}14`, color:c.ac, fontSize:12, fontWeight:900, cursor:"pointer" }}
                    >
                      Open Due Soon
                    </button>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          resetFilters();
                        }}
                        style={{ padding:"10px 14px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:12, fontWeight:800, cursor:"pointer" }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap:10 }}>
                  {[
                    { label:"In view", value: filtered.length, tone:c.tx, sub:"Filtered bills" },
                    { label:"Complete", value:`${completionPct}%`, tone:c.go, sub:`${filtered.length - filteredUnpaid.length} marked paid` },
                    { label:"Needs focus", value: urgentCount, tone:filteredOverdue.length ? c.da : c.wa, sub:filteredOverdue.length ? `${filteredOverdue.length} overdue` : `${filteredDueThisWeek.length} due this week` },
                    { label:"Still owed", value: fx(dueTotal), tone:c.ac, sub:"Current minimums in view" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        position:"relative",
                        border:`1px solid ${item.tone}26`,
                        background:`linear-gradient(180deg, ${c.surf}, ${item.tone}0D)`,
                        borderRadius:16,
                        padding:"14px 14px 13px",
                        boxShadow:`0 10px 24px ${item.tone}10`,
                      }}
                    >
                      <div style={{ width:34, height:4, borderRadius:999, background:item.tone, marginBottom:12, opacity:0.9 }} />
                      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.muted, marginBottom:6 }}>{item.label}</div>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:isMobile ? 22 : 24, fontWeight:900, color:item.tone, lineHeight:1.05, marginBottom:5 }}>{item.value}</div>
                      <div style={{ fontSize:11, color:c.tx2, lineHeight:1.45 }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ border:`1px solid ${c.border}`, borderRadius:18, background:c.surf, padding:"16px 16px 14px", boxShadow:`0 12px 28px ${c.border}22`, display:"grid", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.muted, marginBottom:8 }}>View totals</div>
                  <div style={{ display:"grid", gap:8 }}>
                    {[
                      { label:"Balance left", value:fx(totalDebt), tone:c.ac },
                      { label:"Paid this cycle", value:fx(paidTotal), tone:c.go },
                      { label:"Unpaid accounts", value:String(filteredUnpaid.length), tone:c.wa },
                    ].map((item) => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:12, background:c.surf2, border:`1px solid ${c.border}` }}>
                        <span style={{ fontSize:12, color:c.tx2, fontWeight:700 }}>{item.label}</span>
                        <span style={{ fontSize:13, color:item.tone, fontWeight:900, fontFamily:"'DM Mono',monospace" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.muted, marginBottom:8 }}>Current lens</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {(activeFilters.length ? activeFilters : ["All bills", "All owners", "All categories", "All statuses"]).map((label) => (
                      <span key={label} style={{ padding:"7px 10px", borderRadius:999, border:`1px solid ${c.border2}`, background:activeFilters.length ? `${c.ac}10` : c.surf2, color:activeFilters.length ? c.ac : c.tx2, fontSize:11, fontWeight:800 }}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginBottom:14, border:`1px solid ${c.border}`, borderRadius:18, background:`linear-gradient(180deg, ${c.surf}, ${c.surf2})`, padding:isMobile ? "14px 12px" : "16px 16px 14px", position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", boxShadow:`0 10px 24px ${c.border}22` }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Filter Bills</div>
                <div style={{ fontSize:13, color:c.tx2 }}>All controls below keep the existing search, owner, category, status, and grouping behavior.</div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = {};
                    orderedGroups.forEach((g) => { next[g] = true; });
                    setAcctExpanded(next);
                  }}
                  style={{padding:"8px 12px",borderRadius:999,border:`1px solid ${c.border2}`,background:c.surf,color:c.tx,fontSize:12,fontWeight:800,cursor:"pointer", position:"relative", zIndex:7, pointerEvents:"auto"}}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={() => setAcctExpanded({})}
                  style={{padding:"8px 12px",borderRadius:999,border:`1px solid ${c.border2}`,background:c.surf,color:c.tx,fontSize:12,fontWeight:800,cursor:"pointer", position:"relative", zIndex:7, pointerEvents:"auto"}}
                >
                  Collapse all
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.45fr 1fr 1fr 1fr 1fr", gap: 8, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
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
            {activeFilters.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
                {activeFilters.map((filterLabel) => (
                  <span key={filterLabel} style={{ padding:"6px 10px", borderRadius:999, background:`${c.ac}12`, border:`1px solid ${c.ac}40`, color:c.ac, fontSize:11, fontWeight:800 }}>
                    {filterLabel}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", flexWrap:"wrap"}}>
            <div style={{ fontSize:12, color:c.tx2, fontWeight:700 }}>
              {orderedGroups.length} group{orderedGroups.length === 1 ? "" : "s"} in view
            </div>
            <div style={{ fontSize:12, color:c.muted }}>
              {acctGroupBy === "organization" ? "Organized by provider" : "Organized by category"}
            </div>
          </div>

          {orderedGroups.map((groupName) => {
            const rows = grouped[groupName] || [];
            const open = !!acctExpanded[groupName];
            const grpBal = rows.reduce((s, a) => s + (a.cur_bal || 0), 0);
            const grpDue = rows.reduce((s, a) => s + (a.min_due_v || 0), 0);
            return (
            <div key={groupName} style={{ marginBottom: 14, border:`1px solid ${c.border}`, borderRadius:14, background:c.surf, overflow:"hidden", position:"relative", zIndex:20, isolation:"isolate", pointerEvents:"auto" }}>
              <button
                type="button"
                onClick={() => setAcctExpanded((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                style={{width:"100%",border:"none",background:`linear-gradient(135deg, ${c.surf2}, ${c.surf})`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:open?`1px solid ${c.border}`:"none",position:"relative",zIndex:21,pointerEvents:"auto"}}
              >
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {acctGroupBy === "organization"
                    ? <ProviderMark bank={groupName} name={groupName} size={24} />
                    : <span style={{fontSize:16}}>{CAT_ICON[groupName] || "•"}</span>
                  }
                  <span style={{fontSize:12,fontWeight:900,letterSpacing:"0.08em",textTransform:"uppercase",color:c.tx}}>
                    {groupName}
                  </span>
                  <span style={{fontSize:11,fontWeight:700,color:c.muted,background:c.surf,border:`1px solid ${c.border}`,padding:"1px 7px",borderRadius:999}}>{rows.length}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:c.tx2,background:c.surf2,border:`1px solid ${c.border}`,padding:"3px 9px",borderRadius:999}}>Due {fx(grpDue)}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:800,color:c.ac,background:`${c.ac}10`,border:`1px solid ${c.ac}44`,padding:"3px 9px",borderRadius:999}}>Bal {fx(grpBal)}</span>
                  <span style={{color:c.muted,fontSize:12,fontWeight:900,marginLeft:4}}>{open ? "▲" : "▼"}</span>
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
                  <tr style={{borderBottom:`2px solid ${c.border}`,background:c.surf2}}>
                    {["Account","Owner", ...(acctGroupBy === "organization" ? ["Category"] : []), "APR","Balance","Min Due","Paid","Status"].map(h=>(
                      (h === "APR" && isMobile) ? null :
                      <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:900,letterSpacing:"0.12em",textTransform:"uppercase",color:c.tx2,fontFamily:"'Instrument Sans',sans-serif"}}>{h}</th>
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
                          const planned = Number(a.planned_v || 0);
                          const paymentBasis = planned > 0 ? planned : Number(a.paid_v || 0) > 0 ? Number(a.paid_v || 0) : minDue;
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
                      <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace"}}>
                        {fx(a.min_due_v)}
                        {Number(a.planned_v || 0) > 0 && Number(a.planned_v) !== Number(a.min_due_v || 0) && (
                          <div style={{ fontSize: 10, color: c.ac, fontWeight: 800, marginTop: 1 }}>Plan {fx(a.planned_v)}</div>
                        )}
                      </td>
                      <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace",color:c.go}}>{fx(a.paid_v)}</td>
                      <td style={{padding:"9px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {a.is_paid
                            ? <span style={{padding:"3px 10px",borderRadius:999,background:`${c.go}18`,border:`1px solid ${c.go}55`,color:c.go,fontSize:11,fontWeight:900}}>Paid</span>
                            : <span style={{color:c.muted,fontSize:13}}>—</span>
                          }
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); openEdit(a); }}
                            style={{ padding:"3px 10px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf2, color:c.tx2, fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", opacity: hoveredId === a.id ? 1 : 0, transition:"opacity 0.15s" }}
                          >
                            Edit
                          </button>
                        </div>
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
