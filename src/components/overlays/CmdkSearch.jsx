/**
 * CmdkSearch — Ctrl+K command palette overlay.
 */
export default function CmdkSearch({
  c,
  isMobile,
  cmdkQuery, setCmdkQuery,
  cmdkResults,
  cmdkInputRef,
  founderOpsVisible,
  navigateTo,
  onClose,
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,0.5)" }}
      />
      <div style={{ position:"fixed", top:"18%", left:"50%", transform:"translateX(-50%)", zIndex:501, width: isMobile ? "92vw" : 520, background:c.surf, borderRadius:18, boxShadow:"0 16px 64px rgba(0,0,0,0.35)", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px", borderBottom:`1px solid ${c.border}` }}>
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke={c.muted} strokeWidth="1.5"/>
            <path d="M9.5 9.5l3 3" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={cmdkInputRef}
            value={cmdkQuery}
            onChange={(e) => setCmdkQuery(e.target.value)}
            placeholder="Search accounts, pages..."
            style={{ flex:1, background:"transparent", border:"none", outline:"none", fontSize:15, color:c.tx, fontFamily:"'Instrument Sans',sans-serif" }}
          />
          <kbd style={{ fontSize:11, color:c.muted, background:c.surf2, border:`1px solid ${c.border}`, borderRadius:5, padding:"2px 6px" }}>ESC</kbd>
        </div>

        {cmdkResults.length === 0 && cmdkQuery.trim().length > 0 && (
          <div style={{ padding:"24px 18px", textAlign:"center", color:c.muted, fontSize:13 }}>
            No results for &ldquo;{cmdkQuery}&rdquo;
          </div>
        )}

        {cmdkResults.length === 0 && cmdkQuery.trim().length === 0 && (
          <div style={{ padding:"16px 18px", color:c.muted, fontSize:12 }}>
            <div style={{ marginBottom:8, fontWeight:700 }}>Quick Navigate</div>
            {[
              "Overview","Bills","Payoff Planner","Trends","Beta help",
              ...(founderOpsVisible ? ["Founder ops"] : []),
              "Privacy","Help & FAQ","Billing",
            ].map((label) => (
              <div
                key={label}
                style={{ padding:"6px 0", fontSize:13, color:c.tx2, cursor:"pointer" }}
                onClick={() => {
                  navigateTo(
                    label === "Payoff Planner" ? "payoff"
                    : label === "Trends" ? "insights"
                    : label === "Beta help" ? "beta"
                    : label === "Founder ops" ? "founder"
                    : label === "Help & FAQ" ? "support"
                    : label.toLowerCase()
                  );
                  onClose();
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}

        {cmdkResults.length > 0 && (
          <div style={{ maxHeight:320, overflowY:"auto" }}>
            {cmdkResults.map((r, i) => (
              <div
                key={i}
                onClick={r.action}
                style={{ padding:"11px 18px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", borderBottom:`1px solid ${c.border}` }}
                onMouseEnter={(e) => e.currentTarget.style.background = c.surf2}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width:32, height:32, borderRadius:8, background:c.acD, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>
                  {r.type === "page" ? r.icon : "$"}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:c.tx, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.label}</div>
                  <div style={{ fontSize:11, color:c.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.sub}</div>
                </div>
                {r.type === "account" && (
                  <div style={{ marginLeft:"auto", fontSize:11, color:c.muted, flexShrink:0 }}>Bills</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding:"8px 18px", borderTop:`1px solid ${c.border}`, display:"flex", gap:16, fontSize:11, color:c.muted }}>
          <span>Arrow keys</span><span>Enter select</span><span>ESC close</span>
          <span style={{ marginLeft:"auto" }}>Ctrl+K to toggle</span>
        </div>
      </div>
    </>
  );
}
