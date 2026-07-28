import EmptyState from "../components/feedback/EmptyState";
import { fx } from "../utils/budgetUtils";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import { isBillSettledThisCycle } from "../services/billModel";

export default function DueNextPage(props) {
  const {
    mounted,
    c,
    isMobile,
    setDueNextWeekOffset,
    weekAnchor,
    weekEnd,
    dueNextBills,
    dueNextGroups,
    dueNextExpanded,
    setDueNextExpanded,
    selMonth,
    selYear,
    dueNextItemRefs,
    dueNextTargetId,
    markPaid,
  } = props;

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr .9fr", gap: 12, marginBottom: 14 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Due Next</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setDueNextWeekOffset((value) => value - 1)}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setDueNextWeekOffset(0)}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setDueNextWeekOffset((value) => value + 1)}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Next
              </button>
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.tx, marginBottom: 6 }}>
            {weekAnchor.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
          <div style={{ fontSize: 13, color: c.muted }}>
            Weekly view runs Sunday through Saturday, and you can move backward or forward one full week at a time.
          </div>
        </div>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Week Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 700, color: c.ac }}>{dueNextBills.length}</div>
              <div style={{ fontSize: 12, color: c.muted }}>Bills due</div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 700, color: c.tx }}>{fx(dueNextBills.reduce((sum, item) => sum + Number(item.min_due_v || 0), 0))}</div>
              <div style={{ fontSize: 12, color: c.muted }}>Total minimum due</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: c.muted }}>
          Grouped by due date, then category. Checking a bill here updates Home automatically.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              const next = {};
              Object.entries(dueNextGroups).forEach(([dateKey, group]) => {
                next[dateKey] = true;
                Object.keys(group.categories).forEach((category) => {
                  next[`${dateKey}::${category}`] = true;
                });
              });
              setDueNextExpanded(next);
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={() => {
              const next = {};
              Object.entries(dueNextGroups).forEach(([dateKey, group]) => {
                next[dateKey] = false;
                Object.keys(group.categories).forEach((category) => {
                  next[`${dateKey}::${category}`] = false;
                });
              });
              setDueNextExpanded(next);
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Collapse All
          </button>
        </div>
      </div>
      {!dueNextBills.length && (
        <EmptyState
          palette={c}
          title="Nothing due this week"
          message={`No unpaid bills are due in this week for ${MONTHS[selMonth - 1]} ${selYear}.`}
        />
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(dueNextGroups).map(([key, group]) => (
          <div key={key} style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10, cursor: "pointer" }}
              onClick={() => setDueNextExpanded((state) => ({ ...state, [key]: !(state[key] ?? true) }))}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>{group.label}</div>
              <div style={{ fontSize: 12, color: c.muted }}>
                {group.items.length} bill{group.items.length === 1 ? "" : "s"} • {(dueNextExpanded[key] ?? true) ? "Collapse" : "Expand"}
              </div>
            </div>
            {(dueNextExpanded[key] ?? true) && (
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(group.categories).map(([category, items]) => {
                  const categoryKey = `${key}::${category}`;
                  return (
                    <div key={categoryKey} style={{ padding: "10px 12px", borderRadius: 10, background: c.surf2, border: `1px solid ${c.border}` }}>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: (dueNextExpanded[categoryKey] ?? true) ? 10 : 0, cursor: "pointer" }}
                        onClick={() => setDueNextExpanded((state) => ({ ...state, [categoryKey]: !(state[categoryKey] ?? true) }))}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{CAT_ICON[category] || "•"} {category}</div>
                        <div style={{ fontSize: 12, color: c.muted }}>
                          {items.length} item{items.length === 1 ? "" : "s"} • {(dueNextExpanded[categoryKey] ?? true) ? "Collapse" : "Expand"}
                        </div>
                      </div>
                      {(dueNextExpanded[categoryKey] ?? true) && (
                        <div style={{ display: "grid", gap: 8 }}>
                          {items.map((account) => (
                            <label
                              key={account.id}
                              ref={(node) => {
                                if (node) dueNextItemRefs.current[account.id] = node;
                                else delete dueNextItemRefs.current[account.id];
                              }}
                              style={{
                                display: "grid",
                                gridTemplateColumns: isMobile ? "24px 1fr" : "24px 1.2fr .7fr",
                                alignItems: "center",
                                gap: 10,
                                padding: "8px 10px",
                                borderTop: `1px solid ${c.border}`,
                                borderRadius: 10,
                                background: String(dueNextTargetId) === String(account.id) ? `${c.ac}12` : "transparent",
                                boxShadow: String(dueNextTargetId) === String(account.id) ? `inset 0 0 0 1px ${c.ac}40` : "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isBillSettledThisCycle(account)}
                                onChange={() => markPaid(account)}
                                style={{ width: 18, height: 18, accentColor: c.ac, cursor: "pointer" }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{account.name}</div>
                                <div style={{ fontSize: 12, color: c.muted }}>
                                  {account.daysUntilDue === 0 ? "Due today" : `${account.daysUntilDue} day${account.daysUntilDue === 1 ? "" : "s"} left`}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fx(account.min_due_v || 0)}</div>
                                <div style={{ fontSize: 12, color: c.muted }}>{isBillSettledThisCycle(account) ? "Handled" : "Min due"}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
