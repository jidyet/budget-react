import { useMemo, useState } from "react";
import ProviderMark from "../components/ProviderMark";
import EditPanel from "../components/EditPanel";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import GuidanceCard from "../components/ui/GuidanceCard";
import BillFilterBar from "../components/bills/BillFilterBar";
import AICoachCard from "../components/ai/AICoachCard";
import { CAT_ICON } from "../data/mockAccounts";
import { fx, pct, accountViewModel } from "../utils/budgetUtils";
import {
  BILL_FILTER_OPTIONS,
  getBillBadges,
  getBillBalance,
  getBillDisplayStatus,
  isBillOpenThisCycle,
  isBillOverdue,
  isBillSettledThisCycle,
  matchesBillFilter,
  isMonthlyBill,
} from "../services/billModel";
import {
  buildCoachHouseholdSummary,
  buildCoachMonthKey,
  buildCoachState,
  summarizeCoachAccounts,
  summarizeCoachBillMix,
  summarizeLargestBalances,
} from "../services/aiCoachPayload";
import { canAccessAICoach } from "../config/launchFlags";
import { getDisplayPlannedPayment } from "../services/calc/planPaymentDerivation";

export default function AccountsPage(props) {
  const {
    mounted = false,
    c = {},
    isMobile = false,
    allAccts = [],
    plans = [],
    planId = "",
    acctOwnerF = "All",
    setAcctOwnerF = () => {},
    acctCatF = "All",
    setAcctCatF = () => {},
    acctStatusF = "all",
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
    setEditId = () => {},
    editId = null,
    getPrevRecord = () => null,
    getEffectiveApr = () => 0,
    openEdit = () => {},
    setPage = () => {},
    markPaid = () => {},
    launchFlags = {},
    founderAccount = false,
    workspaceMode = "solo",
    householdMembers = [],
    selMonth = new Date().getMonth() + 1,
    selYear = new Date().getFullYear(),
  } = props || {};
      const [hoveredId, setHoveredId] = useState(null);
      const [expandedBreakdown, setExpandedBreakdown] = useState(() => new Set());
      const resolvePlannedPayment = (account) => getDisplayPlannedPayment({ plans, planId, account });
      const statusToneStyles = {
        success: { background: `${c.go}18`, border: `1px solid ${c.go}40`, color: c.go, fontWeight: 900 },
        warning: { background: `${c.wa}12`, border: `1px solid ${c.wa}45`, color: c.wa, fontWeight: 900 },
        danger: { background: `${c.da}14`, border: `1px solid ${c.da}50`, color: c.da, fontWeight: 900 },
        default: { background: c.surf2, border: `1px solid ${c.border}`, color: c.muted, fontWeight: 800 },
      };
      const renderStatusChip = (account, extraStyle = {}) => {
        const status = getBillDisplayStatus(account);
        const toneStyle = statusToneStyles[status.tone] || statusToneStyles.default;
        return (
          <span
            style={{
              padding: "4px 9px",
              borderRadius: 999,
              fontSize: 11,
              flexShrink: 0,
              ...toneStyle,
              ...extraStyle,
            }}
          >
            {status.label}
          </span>
        );
      };

      const filtered = useMemo(() => allAccts.filter((a) => {
        if (acctOwnerF !== "All" && a.owner !== acctOwnerF) return false;
        if (acctCatF !== "All" && a.category !== acctCatF) return false;
        if (!matchesBillFilter(a, acctStatusF, "All")) return false;
        if (acctSearch && !`${a.displayName || a.name} ${a.bank} ${a.owner} ${a.category}`.toLowerCase().includes(acctSearch.toLowerCase())) return false;
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
        // Sort by urgency tier: overdue groups first, due-soon second, clear/paid last.
        // Within each tier, original category order is preserved.
        const urgencyTier = (name) => {
          const rows = g[name] || [];
          if (rows.some((a) => isBillOverdue(a))) return 0;
          if (rows.some((a) => isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7)) return 1;
          return 2;
        };
        const urgencySorted = [...ordered].sort((a, b) => urgencyTier(a) - urgencyTier(b));
        return { grouped: g, orderedGroups: urgencySorted };
      }, [filtered, acctGroupBy, allCategories]);

      const { totalDebt, dueTotal, paidTotal, filteredUnpaid, filteredOverdue, filteredDueThisWeek } = useMemo(() => ({
        totalDebt:           filtered.filter((a) => !isMonthlyBill(a)).reduce((s, a) => s + getBillBalance(a), 0),
        dueTotal:            filtered.reduce((s, a) => s + (a.min_due_v || 0), 0),
        paidTotal:           filtered.reduce((s, a) => s + (a.paid_v || 0), 0),
        filteredUnpaid:      filtered.filter((a) => isBillOpenThisCycle(a)),
        filteredOverdue:     filtered.filter((a) => isBillOverdue(a)),
        filteredDueThisWeek: filtered.filter((a) => isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7),
      }), [filtered]);
      const leftToPay = Math.max(dueTotal - paidTotal, 0);

      const billFilterLabel = BILL_FILTER_OPTIONS.find((option) => option.key === acctStatusF)?.label || "All";
      const hasActiveFilters = acctOwnerF !== "All" || acctCatF !== "All" || acctStatusF !== "all" || acctGroupBy !== "category" || !!acctSearch.trim();
      const activeFilters = [
        acctSearch.trim() ? `Search: ${acctSearch.trim()}` : null,
        acctOwnerF !== "All" ? `Owner: ${acctOwnerF}` : null,
        acctCatF !== "All" ? `Category: ${acctCatF}` : null,
        acctStatusF !== "all" ? `Filter: ${billFilterLabel}` : null,
        acctGroupBy !== "category" ? "Grouped by bank" : null,
      ].filter(Boolean);
      const completionPct = filtered.length ? Math.round(((filtered.length - filteredUnpaid.length) / filtered.length) * 100) : 0;
      const urgentCount = filteredDueThisWeek.length + filteredOverdue.length;
      const aiCoachPayload = allAccts.length ? {
        askType: "bills",
        monthKey: buildCoachMonthKey(selMonth, selYear),
        workspaceMode,
        householdSummary: buildCoachHouseholdSummary({ workspaceMode, householdMembers }),
        accounts: summarizeCoachAccounts(filtered, 8),
        largestBalances: summarizeLargestBalances(filtered, 3),
        billMix: summarizeCoachBillMix(filtered.length ? filtered : allAccts),
        billsSummary: {
          visibleCount: filtered.length,
          unpaidCount: filteredUnpaid.length,
          dueSoonCount: filteredDueThisWeek.length,
          overdueCount: filteredOverdue.length,
          paidCount: filtered.filter((a) => isBillSettledThisCycle(a)).length,
          activeOwnerFilter: acctOwnerF,
          activeCategoryFilter: acctCatF,
          activeStatusFilter: acctStatusF,
        },
        coachState: buildCoachState({
          askType: "bills",
          accounts: filtered.length ? filtered : allAccts,
        }),
      } : null;
      const aiCoachVisible = canAccessAICoach({ founderAccount });
      const resetFilters = () => {
        setAcctSearch("");
        setAcctOwnerF("All");
        setAcctCatF("All");
        setAcctStatusF("all");
        setAcctGroupBy("category");
      };

      if (isMobile) {
        return (
          <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position: "relative", zIndex: 10, isolation: "isolate", pointerEvents: "auto" }}>
            {!allAccts.length && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 10 }}>
                  <GuidanceCard
                    palette={c}
                    icon="→"
                    title="Add your first bill"
                    instruction="Go to Settings → Bills & Budget, or use Import or upload."
                    result="Your bills will appear here with due dates, balances, and what needs attention next."
                  />
                </div>
                <EmptyStateCard
                  palette={c}
                  title="No bills yet"
                  message="Start with one bill or upload a statement. Your progress will show here as soon as you add something."
                  action={
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.sessionStorage.setItem("__tracktozero_open_add_bill__", "1");
                          }
                          setPage?.("settings");
                        }}
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
                    { label: "Showing", value: String(filtered.length), tone: c.tx },
                    { label: "Open bills", value: String(filteredUnpaid.length), tone: c.wa },
                    { label: filteredDueThisWeek.length === 0 ? "All clear" : "Due soon", value: filteredDueThisWeek.length === 0 ? "✓" : String(filteredDueThisWeek.length), tone: filteredDueThisWeek.length === 0 ? c.go : c.ac },
                    { label: filteredOverdue.length === 0 ? "Nothing overdue" : "Past due", value: filteredOverdue.length === 0 ? "✓" : String(filteredOverdue.length), tone: filteredOverdue.length === 0 ? c.go : c.da },
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
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 10 }}>Narrow your view</div>
                <div style={{ marginBottom: 10 }}>
                  <BillFilterBar
                    c={c}
                    filterKey={acctStatusF}
                    setFilterKey={setAcctStatusF}
                    ownerFilter={acctOwnerF}
                    setOwnerFilter={setAcctOwnerF}
                    ownerOptions={allOwners.filter((owner) => owner !== "All")}
                    compact
                  />
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, width: "100%", paddingRight: acctSearch ? 30 : undefined }}
                      placeholder="Search bill, bank, or person..."
                      value={acctSearch}
                      onChange={(e) => setAcctSearch(e.target.value)}
                    />
                    {acctSearch && (
                      <button
                        type="button"
                        onClick={() => setAcctSearch("")}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: c.muted, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}
                      >×</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={selStyle} value={acctOwnerF} onChange={(e) => setAcctOwnerF(e.target.value)}>
                      {allOwners.map((o) => <option key={o} value={o}>{o === "All" ? "All owners" : o}</option>)}
                    </select>
                    <select style={selStyle} value={acctCatF} onChange={(e) => setAcctCatF(e.target.value)}>
                      {["All", ...allCategories].map((o) => <option key={o} value={o}>{o === "All" ? "All categories" : o}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={selStyle} value={acctStatusF} onChange={(e) => setAcctStatusF(e.target.value)}>
                      {BILL_FILTER_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                    <select style={selStyle} value={acctGroupBy} onChange={(e) => setAcctGroupBy(e.target.value)}>
                      <option value="category">Group by type</option>
                      <option value="organization">Group by bank</option>
                    </select>
                  </div>
                </div>
                {activeFilters.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: c.muted, fontWeight: 700 }}>Active filters:</span>
                    {activeFilters.map((filterLabel) => (
                      <span key={filterLabel} style={{ padding: "4px 10px", borderRadius: 999, background: `${c.ac}12`, border: `1px solid ${c.ac}35`, color: c.ac, fontSize: 11, fontWeight: 800 }}>
                        {filterLabel}
                      </span>
                    ))}
                    <button type="button" onClick={resetFilters} style={{ background: "none", border: "none", color: c.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}>Clear all</button>
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

              <AICoachCard
                palette={c}
                isMobile={isMobile}
                requestPayload={aiCoachPayload}
                featureEnabled={launchFlags?.aiCoachEnabled}
                accessAllowed={aiCoachVisible}
                scopeLabel="your current bills view"
                testerOnly={launchFlags?.aiCoachTesterOnly}
                quickPrompts={[
                  { key: "bills_attention", label: "Which bills need attention?" },
                  { key: "bills_due_soon", label: "What is due soon?" },
                  { key: "bills_monthly_coverage", label: "Which monthly bills are covered?" },
                ]}
              />

              {orderedGroups.map((groupName) => {
                const rows = grouped[groupName] || [];
                const open = !!acctExpanded[groupName];
                const grpBal = rows.reduce((s, a) => s + getBillBalance(a), 0);
                const grpDue = rows.reduce((s, a) => s + (a.min_due_v || 0), 0);
                const grpOverdue = rows.filter((a) => isBillOverdue(a)).length;
                const grpDueSoon = rows.filter((a) => isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7).length;
                const grpAllPaid = rows.length > 0 && rows.every((a) => isBillSettledThisCycle(a));
                const focusRowId = (() => {
                  const unpaid = rows.filter((a) => isBillOpenThisCycle(a));
                  if (!unpaid.length) return null;
                  const sorted = [...unpaid].sort((a, b) => {
                    const aOv = a.d_left != null && a.d_left < 0;
                    const bOv = b.d_left != null && b.d_left < 0;
                    if (aOv && !bOv) return -1;
                    if (!aOv && bOv) return 1;
                    if (aOv && bOv) return (a.d_left ?? 0) - (b.d_left ?? 0);
                    if (a.d_left != null && b.d_left != null) return a.d_left - b.d_left;
                    if (a.d_left != null) return -1;
                    if (b.d_left != null) return 1;
                    return (b.apr_v ?? 0) - (a.apr_v ?? 0);
                  });
                  return sorted[0]?.id ?? null;
                })();

                return (
                  <div key={groupName} style={{ border: `1px solid ${grpOverdue > 0 ? c.da + "40" : grpDueSoon > 0 ? c.wa + "35" : c.border}`, borderRadius: 16, background: c.surf, overflow: "hidden", boxShadow: `0 8px 20px ${c.border}18`, opacity: grpAllPaid ? 0.72 : 1, transition: "opacity 0.15s" }}>
                    <button
                      type="button"
                      onClick={() => setAcctExpanded((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                      style={{ width: "100%", border: "none", background: grpAllPaid ? c.surf : `linear-gradient(135deg, ${c.surf2}, ${c.surf})`, padding: "14px 14px 12px", display: "grid", gap: 8, textAlign: "left" }}
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
                        {grpOverdue > 0 && (
                          <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.da}14`, border: `1px solid ${c.da}45`, color: c.da, fontSize: 11, fontWeight: 900 }}>{grpOverdue} overdue</span>
                        )}
                        {grpOverdue === 0 && grpDueSoon > 0 && (
                          <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}40`, color: c.wa, fontSize: 11, fontWeight: 900 }}>{grpDueSoon} due this week</span>
                        )}
                        {grpAllPaid && (
                          <span style={{ padding: "4px 9px", borderRadius: 999, background: `${c.go}12`, border: `1px solid ${c.go}40`, color: c.go, fontSize: 11, fontWeight: 800 }}>all good ✓</span>
                        )}
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
                          const isFocus = a.id === focusRowId;

                          return (
                            <div key={a.id} style={{ border: `1px solid ${isFocus ? c.ac + "40" : c.border}`, borderLeft: isFocus ? `3px solid ${c.ac}` : `1px solid ${c.border}`, borderRadius: 14, background: isFocus ? `${c.ac}06` : c.surf2, padding: "12px 12px 10px", display: "grid", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    markPaid(a);
                                  }}
                                  title={isBillSettledThisCycle(a) ? "Mark unpaid" : "Mark paid"}
                                  style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${isBillSettledThisCycle(a) ? c.go : c.border2}`, background: isBillSettledThisCycle(a) ? c.go : "transparent", color: isBillSettledThisCycle(a) ? "#fff" : c.muted, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                >
                                  {isBillSettledThisCycle(a) ? "✓" : ""}
                                </button>
                                <ProviderMark bank={a.bank} name={a.name} size={24} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 900, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vm.title}</div>
                                    {isFocus && isBillOpenThisCycle(a) && !(a.d_left != null && a.d_left <= 0) && (
                                      <span style={{ padding: "2px 7px", borderRadius: 999, background: `${c.ac}14`, border: `1px solid ${c.ac}40`, color: c.ac, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>Focus</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vm.subtitle}</div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                    {getBillBadges(a).slice(0, 3).map((badge) => (
                                      <span key={badge.key} style={{ padding: "2px 7px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 10, fontWeight: 800 }}>
                                        {badge.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {renderStatusChip(a)}
                              </div>

                              {(() => {
                                const aprDec = a.apr_v ?? (Number(a.apr ?? 0) > 1 ? Number(a.apr) / 100 : Number(a.apr ?? 0));
                                const bal = Number(a.cur_bal || 0);
                                const monthlyInterest = bal > 0 && aprDec > 0 ? (aprDec / 12) * bal : 0;
                                const planned = resolvePlannedPayment(a);
                                const actualPaid = Number(a.paid_v || 0);
                                const effectivePayment = planned > 0 ? planned : actualPaid > 0 ? actualPaid : Number(a.min_due_v || 0);
                                const principalApplied = effectivePayment > 0 ? Math.max(0, effectivePayment - monthlyInterest) : 0;
                                const interestApplied = effectivePayment > 0 ? Math.min(effectivePayment, monthlyInterest) : monthlyInterest;
                                const dangerMode = monthlyInterest > 0 && effectivePayment <= monthlyInterest;
                                const showBreakdown = expandedBreakdown.has(a.id);
                                const toggleBreakdown = () => setExpandedBreakdown(prev => {
                                  const next = new Set(prev);
                                  next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                                  return next;
                                });
                                const hasBreakdownData = aprDec > 0 || planned > 0 || actualPaid > 0;
                                return (
                                  <div style={{ display: "grid", gap: 6 }}>
                                    {/* Row 1: Balance | Min Due — always visible */}
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

                                    {/* Toggle — only shown when there is breakdown data */}
                                    {hasBreakdownData && (
                                      <button
                                        type="button"
                                        onClick={toggleBreakdown}
                                        style={{ background: "none", border: "none", color: c.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: "2px 0", display: "flex", alignItems: "center", gap: 4 }}
                                      >
                                        {showBreakdown ? "Hide breakdown ▴" : "Show breakdown ▾"}
                                        {!showBreakdown && dangerMode && (
                                          <span style={{ padding: "1px 6px", borderRadius: 999, background: `${c.da}14`, border: `1px solid ${c.da}40`, color: c.da, fontSize: 9, fontWeight: 900 }}>!</span>
                                        )}
                                        {!showBreakdown && aprDec > 0.20 && !dangerMode && (
                                          <span style={{ padding: "1px 6px", borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}40`, color: c.wa, fontSize: 9, fontWeight: 900 }}>High APR</span>
                                        )}
                                      </button>
                                    )}

                                    {/* Rows 2 & 3 — behind the toggle */}
                                    {showBreakdown && (
                                      <>
                                        {/* Row 2: Planned | Actual */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                          <div style={{ borderRadius: 10, border: `1px solid ${c.ac}30`, background: `${c.ac}08`, padding: "9px 10px" }}>
                                            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Planned</div>
                                            <div style={{ fontSize: 15, fontWeight: 900, color: planned > 0 ? c.ac : c.muted, fontFamily: "'DM Mono',monospace" }}>{fx(planned)}</div>
                                          </div>
                                          <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf, padding: "9px 10px" }}>
                                            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>Actual paid</div>
                                            <div style={{ fontSize: 15, fontWeight: 900, color: actualPaid > 0 ? c.go : c.muted, fontFamily: "'DM Mono',monospace" }}>{fx(actualPaid)}</div>
                                          </div>
                                        </div>
                                        {/* Row 3: Interest / Principal + APR */}
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
                                              <div style={{ fontSize: 13, fontWeight: 900, color: aprDec > 0.20 ? c.wa : c.tx, fontFamily: "'DM Mono',monospace" }}>{apr}</div>
                                              {aprDec > 0.20 && (
                                                <span style={{ padding: "2px 6px", borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}40`, color: c.wa, fontSize: 9, fontWeight: 900, display: "inline-block", marginTop: 3 }}>High APR</span>
                                              )}
                                            </div>
                                          </div>
                                          {dangerMode && (
                                            <div style={{ fontSize: 10, color: c.da, fontWeight: 800, marginTop: 4 }}>Min due doesn't cover interest</div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7 && (
                                  <button
                                    type="button"
                                    onClick={() => openDueNextView(a.id)}
                                    style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "10px 12px", borderRadius: 12, border: `1px solid ${c.ac}40`, background: `${c.ac}12`, color: c.ac, fontSize: 12, fontWeight: 900 }}
                                  >
                                    View in Due Next
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

      // UI Improvement 1: section split helpers
      const isMonthlyGroup = (name) => (grouped[name] || []).every(a => isMonthlyBill(a));
      const debtGroupNames    = orderedGroups.filter(n => !isMonthlyGroup(n));
      const monthlyGroupNames = orderedGroups.filter(n =>  isMonthlyGroup(n));

      return (
        <div style={{opacity:mounted?1:0,transition:"opacity .3s",marginTop:16,overflowX:"auto",position:"relative",zIndex:10,isolation:"isolate",pointerEvents:"auto"}}>
          {!allAccts.length && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 10 }}>
                <GuidanceCard
                  palette={c}
                  icon="→"
                  title="Add your first bill"
                  instruction="Go to Settings → Bills & Budget, or use Import or upload."
                  result="Your bills will appear here with due dates, balances, and what needs attention next."
                />
              </div>
              <EmptyStateCard
                palette={c}
                title="No bills yet"
                message="Start with one bill or upload a statement. Your progress will show here as soon as you add something."
                action={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.sessionStorage.setItem("__tracktozero_open_add_bill__", "1");
                        }
                        setPage?.("settings");
                      }}
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
                    <div style={{ fontSize:isMobile ? 28 : 34, fontWeight:900, color:c.tx, lineHeight:1 }}>See what needs attention today</div>
                    <div style={{ fontSize:13, color:c.tx2, lineHeight:1.55, marginTop:8, maxWidth:600 }}>
                      Your bills, sorted by urgency. Mark things paid, check what's due, and stay on top of every account.
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button
                      type="button"
                      onClick={() => openDueNextView()}
                      style={{ padding:"10px 14px", borderRadius:999, border:`1px solid ${c.ac}55`, background:`${c.ac}14`, color:c.ac, fontSize:12, fontWeight:900, cursor:"pointer" }}
                    >
                      View what's due
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
                    { label:"Showing", value: filtered.length, tone:c.tx, sub:"Bills in this view" },
                    { label:"Paid this month", value:`${completionPct}%`, tone:c.go, sub:`${filtered.length - filteredUnpaid.length} marked done` },
                    { label: urgentCount === 0 ? "All clear" : "Act on", value: urgentCount === 0 ? "✓" : urgentCount, tone: urgentCount === 0 ? c.go : filteredOverdue.length ? c.da : c.wa, sub: urgentCount === 0 ? "Nothing urgent right now" : filteredOverdue.length ? `${filteredOverdue.length} overdue` : `${filteredDueThisWeek.length} due this week` },
                    { label:"Left to pay", value: fx(leftToPay), tone:c.ac, sub:"Unpaid this month" },
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
              <div style={{ border:`1px solid ${c.border}`, borderRadius:18, background:c.surf, padding:"16px 16px 14px", boxShadow:`0 12px 28px ${c.border}22`, display:"grid", gap:8, alignContent:"start" }}>
                {[
                  { label:"Total debt balance", value:fx(totalDebt), tone:c.ac },
                  { label:"Paid this month", value:fx(paidTotal), tone:c.go },
                ].map((item) => (
                  <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:12, background:c.surf2, border:`1px solid ${c.border}` }}>
                    <span style={{ fontSize:12, color:c.tx2, fontWeight:700 }}>{item.label}</span>
                    <span style={{ fontSize:15, color:item.tone, fontWeight:900, fontFamily:"'DM Mono',monospace" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom:14, border:`1px solid ${c.border}`, borderRadius:18, background:`linear-gradient(180deg, ${c.surf}, ${c.surf2})`, padding:isMobile ? "14px 12px" : "16px 16px 14px", position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", boxShadow:`0 10px 24px ${c.border}22` }}>
            <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.muted, marginBottom:10 }}>Narrow your view</div>
            <div style={{ marginBottom: 10 }}>
              <BillFilterBar
                c={c}
                filterKey={acctStatusF}
                setFilterKey={setAcctStatusF}
                ownerFilter={acctOwnerF}
                setOwnerFilter={setAcctOwnerF}
                ownerOptions={allOwners.filter((owner) => owner !== "All")}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.45fr 1fr 1fr 1fr 1fr", gap: 8, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto" }}>
              <div style={{ position:"relative" }}>
                <input
                  style={{...inputStyle, width:"100%", paddingRight: acctSearch ? 30 : undefined, position:"relative", zIndex:7, pointerEvents:"auto"}}
                  placeholder="Search bill, bank, or person..."
                  value={acctSearch}
                  onChange={(e) => setAcctSearch(e.target.value)}
                />
                {acctSearch && (
                  <button
                    type="button"
                    onClick={() => setAcctSearch("")}
                    style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:c.muted, fontSize:14, cursor:"pointer", lineHeight:1, padding:"2px 4px" }}
                  >×</button>
                )}
              </div>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctStatusF} onChange={(e) => setAcctStatusF(e.target.value)}>
                {BILL_FILTER_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctOwnerF} onChange={(e) => setAcctOwnerF(e.target.value)}>
                {allOwners.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctCatF} onChange={(e) => setAcctCatF(e.target.value)}>
                {["All", ...allCategories].map((o) => <option key={o}>{o}</option>)}
              </select>
              <select style={{...selStyle, position:"relative", zIndex:7, pointerEvents:"auto"}} value={acctGroupBy} onChange={(e) => setAcctGroupBy(e.target.value)}>
                <option value="category">Group by type</option>
                <option value="organization">Group by bank</option>
              </select>
            </div>
            {activeFilters.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10, alignItems:"center" }}>
                <span style={{ fontSize:11, color:c.muted, fontWeight:700, marginRight:2 }}>Active filters:</span>
                {activeFilters.map((filterLabel) => (
                  <span key={filterLabel} style={{ padding:"4px 10px", borderRadius:999, background:`${c.ac}12`, border:`1px solid ${c.ac}40`, color:c.ac, fontSize:11, fontWeight:800 }}>
                    {filterLabel}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={resetFilters}
                  style={{ background:"none", border:"none", color:c.muted, fontSize:11, fontWeight:700, cursor:"pointer", textDecoration:"underline", textDecorationStyle:"dotted", marginLeft:4 }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10, position:"relative", zIndex:30, isolation:"isolate", pointerEvents:"auto", flexWrap:"wrap"}}>
            <div style={{ fontSize:12, color:c.tx2, fontWeight:700 }}>
              {orderedGroups.length} group{orderedGroups.length === 1 ? "" : "s"} · {acctGroupBy === "organization" ? "by provider" : "by category"}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button
                type="button"
                onClick={() => { const next = {}; orderedGroups.forEach((g) => { next[g] = true; }); setAcctExpanded(next); }}
                style={{ background:"none", border:"none", color:c.muted, fontSize:12, fontWeight:700, cursor:"pointer", textDecoration:"underline", textDecorationStyle:"dotted", position:"relative", zIndex:7, pointerEvents:"auto" }}
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setAcctExpanded({})}
                style={{ background:"none", border:"none", color:c.muted, fontSize:12, fontWeight:700, cursor:"pointer", textDecoration:"underline", textDecorationStyle:"dotted", position:"relative", zIndex:7, pointerEvents:"auto" }}
              >
                Collapse all
              </button>
            </div>
          </div>

          {[
            debtGroupNames.length > 0 && (
              <div key="__debt_section_header__" style={{ fontSize:10, fontWeight:500, letterSpacing:"0.07em", textTransform:"uppercase", color:c.muted, padding:"12px 0 6px" }}>
                Debt accounts · {debtGroupNames.length} group{debtGroupNames.length !== 1 ? "s" : ""}
              </div>
            ),
            ...debtGroupNames.map(n => ({ groupName: n, section: "debt" })),
            monthlyGroupNames.length > 0 && (
              <div key="__monthly_section_header__" style={{ fontSize:10, fontWeight:500, letterSpacing:"0.07em", textTransform:"uppercase", color:c.muted, padding:"12px 0 6px" }}>
                Monthly bills · {monthlyGroupNames.length} group{monthlyGroupNames.length !== 1 ? "s" : ""}
              </div>
            ),
            ...monthlyGroupNames.map(n => ({ groupName: n, section: "monthly" })),
          ].filter(Boolean).map((item) => {
            if (!item.groupName) return item; // section header divs
            const { groupName, section } = item;
            const rows = grouped[groupName] || [];
            const open = !!acctExpanded[groupName];
            const grpBal = rows.reduce((s, a) => s + getBillBalance(a), 0);
            const grpDue = rows.reduce((s, a) => s + (a.min_due_v || 0), 0);
            const grpOverdue = rows.filter((a) => isBillOverdue(a)).length;
            const grpDueSoon = rows.filter((a) => isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7).length;
            const grpAllPaid = rows.length > 0 && rows.every((a) => isBillSettledThisCycle(a));
            // UI Imp 3: paid progress
            const grpPaidCount = rows.filter((a) => isBillSettledThisCycle(a)).length;
            const grpPaidPct = rows.length > 0 ? (grpPaidCount / rows.length) * 100 : 0;
            const isMonthly = section === "monthly";
            const focusRowId = (() => {
              const unpaid = rows.filter((a) => isBillOpenThisCycle(a));
              if (!unpaid.length) return null;
              const sorted = [...unpaid].sort((a, b) => {
                const aOv = a.d_left != null && a.d_left < 0;
                const bOv = b.d_left != null && b.d_left < 0;
                if (aOv && !bOv) return -1;
                if (!aOv && bOv) return 1;
                if (aOv && bOv) return (a.d_left ?? 0) - (b.d_left ?? 0);
                if (a.d_left != null && b.d_left != null) return a.d_left - b.d_left;
                if (a.d_left != null) return -1;
                if (b.d_left != null) return 1;
                return (b.apr_v ?? 0) - (a.apr_v ?? 0);
              });
              return sorted[0]?.id ?? null;
            })();
            return (
            // UI Imp 4: entire row clickable
            <div key={groupName} onClick={() => setAcctExpanded((prev) => ({ ...prev, [groupName]: !prev[groupName] }))} style={{ marginBottom: 14, border:`1px solid ${grpOverdue > 0 ? c.da + "40" : grpDueSoon > 0 ? c.wa + "35" : grpAllPaid ? c.border + "88" : c.border}`, borderRadius:14, background:c.surf, overflow:"hidden", position:"relative", zIndex:20, isolation:"isolate", pointerEvents:"auto", opacity: grpAllPaid ? 0.72 : 1, transition:"opacity 0.15s", cursor:"pointer" }}>
              <div
                style={{width:"100%",background: grpAllPaid ? c.surf : `linear-gradient(135deg, ${c.surf2}, ${c.surf})`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:open?`1px solid ${c.border}`:"none",position:"relative",zIndex:21,pointerEvents:"auto"}}
              >
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:1}}>
                  {acctGroupBy === "organization"
                    ? <ProviderMark bank={groupName} name={groupName} size={24} />
                    : <span style={{fontSize:16, opacity: grpAllPaid ? 0.5 : 1}}>{CAT_ICON[groupName] || "•"}</span>
                  }
                  <span style={{fontSize:12,fontWeight:900,letterSpacing:"0.08em",textTransform:"uppercase",color: grpAllPaid ? c.muted : c.tx}}>
                    {groupName}
                  </span>
                  <span style={{fontSize:11,fontWeight:700,color:c.muted,background:c.surf,border:`1px solid ${c.border}`,padding:"1px 7px",borderRadius:999,flexShrink:0}}>{rows.length}</span>
                  {/* UI Imp 5: large group flag */}
                  {rows.length > 7 && (
                    <span style={{fontSize:11,color:c.in || c.ac,marginLeft:2,flexShrink:0}}>large group</span>
                  )}
                  {grpOverdue > 0 && (
                    <span style={{fontSize:10,fontWeight:900,color:c.da,flexShrink:0}}>· {grpOverdue} overdue</span>
                  )}
                  {grpOverdue === 0 && grpDueSoon > 0 && (
                    <span style={{fontSize:10,fontWeight:900,color:c.wa,flexShrink:0}}>· {grpDueSoon} due this week</span>
                  )}
                  {grpAllPaid && (
                    <span style={{fontSize:10,fontWeight:800,color:c.go,flexShrink:0}}>· all good ✓</span>
                  )}
                  {/* UI Imp 3: paid progress bar */}
                  <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:4,flexShrink:0}}>
                    <div style={{width:48,height:4,background:`${c.border}`,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${grpPaidPct}%`,height:"100%",background:c.go,borderRadius:2,minWidth:grpPaidPct>0?3:0}} />
                    </div>
                    <span style={{fontSize:11,color:c.muted}}>{grpPaidCount} of {rows.length} paid</span>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:c.tx2,background:c.surf2,border:`1px solid ${c.border}`,padding:"3px 9px",borderRadius:999}}>Due {fx(grpDue)}</span>
                  {/* UI Imp 2: Monthly pill vs Bal pill */}
                  {isMonthly ? (
                    <span style={{fontSize:11,padding:"3px 9px",borderRadius:999,background:c.surf2,color:c.muted,border:`0.5px solid ${c.border}`}}>Monthly</span>
                  ) : (
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:800,color:c.ac,background:`${c.ac}10`,border:`1px solid ${c.ac}44`,padding:"3px 9px",borderRadius:999}}>Bal {fx(grpBal)}</span>
                  )}
                  <span style={{color:c.muted,fontSize:12,fontWeight:900,marginLeft:4}}>{open ? "▲" : "▼"}</span>
                </div>
              </div>
              {open && <div onClick={e => e.stopPropagation()}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <colgroup>
                  <col style={{width: acctGroupBy === "organization" ? "40%" : "48%"}} />
                  <col style={{width:"10%"}} />
                  {acctGroupBy === "organization" && <col style={{width:"12%"}} />}
                  <col style={{width:"8%"}} />
                  <col style={{width:"14%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"8%"}} />
                </colgroup>
                <thead>
                  <tr style={{borderBottom:`2px solid ${c.border}`,background:c.surf2}}>
                    {["Account","Owner", ...(acctGroupBy === "organization" ? ["Category"] : []), "APR","Balance","Min Due","Status"].map(h=>(
                      (h === "APR" && isMobile) ? null :
                      <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:900,letterSpacing:"0.12em",textTransform:"uppercase",color:c.tx2,fontFamily:"'Instrument Sans',sans-serif"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(a=>{
                    const vm = accountViewModel(a);
                    const isFocus = a.id === focusRowId;
                    return (
                    <tr key={a.id} style={{borderBottom:`1px solid ${c.border}`, borderLeft: isFocus ? `3px solid ${c.ac}` : "3px solid transparent", background: hoveredId === a.id ? c.surf2 : isFocus ? `${c.ac}07` : "transparent", transition:"background 0.12s"}}
                      onMouseEnter={() => setHoveredId(a.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onTouchStart={isMobile ? (e => setSwipeState(s => ({ ...s, [a.id]: e.touches[0].clientX }))) : undefined}
                      onTouchEnd={isMobile ? (e => {
                        const startX = swipeState[a.id];
                        if (startX == null) return;
                        const dx = e.changedTouches[0].clientX - startX;
                        setSwipeState(s => { const n = {...s}; delete n[a.id]; return n; });
                        if (Math.abs(dx) < 10) return; // tap — let click handlers fire normally
                        if (dx > 60 && isBillOpenThisCycle(a)) {
                          markPaid(a);
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
                            onClick={e => { e.stopPropagation(); markPaid(a); }}
                            title={isBillSettledThisCycle(a) ? "Mark unpaid" : "Mark paid"}
                            style={{ width:26, height:26, borderRadius:"50%", border:`2px solid ${isBillSettledThisCycle(a) ? c.go : c.border2}`, background: isBillSettledThisCycle(a) ? c.go : "transparent", color: isBillSettledThisCycle(a) ? "#fff" : c.muted, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                            {isBillSettledThisCycle(a) ? "✓" : ""}
                          </button>
                          <ProviderMark bank={a.bank} name={a.name} size={24} />
                          <div style={{minWidth:0}}>
                            <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:800,fontSize:15}}>{vm.title}</div>
                            <div style={{fontSize:11,color:c.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{vm.subtitle}</div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:5 }}>
                              {getBillBadges(a).slice(0, 3).map((badge) => (
                                <span key={badge.key} style={{ padding:"2px 7px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf2, color:c.tx2, fontSize:10, fontWeight:800 }}>
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                            {isFocus && isBillOpenThisCycle(a) && !(a.d_left != null && a.d_left <= 0) && (
                              <span style={{display:"inline-block",marginTop:4,padding:"2px 8px",borderRadius:999,background:`${c.ac}14`,border:`1px solid ${c.ac}40`,color:c.ac,fontSize:10,fontWeight:900,letterSpacing:"0.05em"}}>Focus</span>
                            )}
                            {isBillOpenThisCycle(a) && a.d_left != null && a.d_left >= 0 && a.d_left <= 7 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openDueNextView(a.id); }}
                                style={{marginTop:5,padding:"4px 8px",borderRadius:999,border:`1px solid ${c.ac}55`,background:`${c.ac}12`,color:c.ac,fontSize:10,fontWeight:800,cursor:"pointer"}}
                              >
                                View in Due Next
                              </button>
                            )}
                            {isMobile && isBillOpenThisCycle(a) && (
                              <div style={{ fontSize:9, color:c.muted, marginTop:2 }}>swipe → pay · ← edit</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"9px 10px",color:c.tx2}}>{a.owner}</td>
                      {acctGroupBy === "organization" && <td style={{padding:"9px 10px",color:c.tx2}}>{a.category}</td>}
                      {!isMobile && (
                        <td style={{padding:"9px 10px",fontFamily:"'DM Mono',monospace"}}>
                          {a.apr_v ? (
                            <>
                              <span style={{color: a.apr_v > 0.20 ? c.wa : c.muted, fontWeight: a.apr_v > 0.20 ? 800 : 700}}>{pct(a.apr_v)}</span>
                              {a.apr_v > 0.20 && (
                                <div style={{marginTop:3}}>
                                  <span style={{padding:"2px 6px",borderRadius:999,background:`${c.wa}12`,border:`1px solid ${c.wa}40`,color:c.wa,fontSize:9,fontWeight:900,letterSpacing:"0.04em"}}>High APR</span>
                                </div>
                              )}
                            </>
                          ) : <span style={{color:c.muted}}>—</span>}
                        </td>
                      )}
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
                          const planned = resolvePlannedPayment(a);
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
                        {resolvePlannedPayment(a) > 0 && resolvePlannedPayment(a) !== Number(a.min_due_v || 0) && (
                          <div style={{ fontSize: 10, color: c.ac, fontWeight: 800, marginTop: 1 }}>Plan {fx(resolvePlannedPayment(a))}</div>
                        )}
                      </td>
                      <td style={{padding:"9px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {renderStatusChip(a, { padding:"3px 10px", whiteSpace:"nowrap" })}
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
              </table></div>
              }
            </div>
          )})}

          <div style={{ borderTop: `2px solid ${c.border}`, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 20 }}>
            <div style={{ color: c.muted, fontSize: 12, fontWeight: 700 }}>{filtered.length} bill{filtered.length === 1 ? "" : "s"} in view</div>
            <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac, fontWeight: 700 }}>Total debt balance {fx(totalDebt)}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>Left to pay {fx(leftToPay)}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", color: c.go, fontWeight: 700 }}>Paid this month {fx(paidTotal)}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <AICoachCard
              palette={c}
              isMobile={isMobile}
              requestPayload={aiCoachPayload}
              featureEnabled={launchFlags?.aiCoachEnabled}
              accessAllowed={aiCoachVisible}
              scopeLabel="your current bills view"
              testerOnly={launchFlags?.aiCoachTesterOnly}
              quickPrompts={[
                { key: "bills_attention", label: "Which bills need attention?" },
                { key: "bills_due_soon", label: "What is due soon?" },
                { key: "bills_monthly_coverage", label: "Which monthly bills are covered?" },
              ]}
            />
          </div>
        </div>
          );
        };
