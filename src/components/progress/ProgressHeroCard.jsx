export default function ProgressHeroCard({ palette, progress, workspaceMode }) {
  const c = palette;
  const heroTone = workspaceMode === "household" ? "Shared progress" : "You're getting closer";
  const subcopy = workspaceMode === "household"
    ? "You're moving this forward together."
    : "You moved forward. Keep it simple.";
  const ratioPct = Math.max(6, Math.round((progress?.overallRatio || 0) * 100));

  return (
    <div style={{ background:`linear-gradient(135deg, ${c.ac}30 0%, ${c.surf} 32%, ${c.surf2} 70%, ${c.wa}22 100%)`, border:`1.5px solid ${c.ac}44`, borderRadius:24, padding:"22px 22px", marginBottom:16, boxShadow:`0 18px 48px ${c.ac}22`, overflow:"hidden", position:"relative" }}>
      <div style={{ position:"absolute", inset:"auto -40px -70px auto", width:200, height:200, borderRadius:"50%", background:`radial-gradient(circle, ${c.ac}30, transparent 70%)`, pointerEvents:"none" }} />
      <div style={{ display:"flex", justifyContent:"space-between", gap:16, alignItems:"flex-start", flexWrap:"wrap", position:"relative" }}>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}` }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:c.ac, boxShadow:`0 0 0 5px ${c.ac}20` }} />
            <span style={{ fontSize:10, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.tx2 }}>{heroTone}</span>
          </div>
          <div style={{ fontSize:30, fontWeight:900, color:c.tx, lineHeight:1.02, margin:"12px 0 8px" }}>{progress.totalDebtLeftLabel} left</div>
          <div style={{ fontSize:14, color:c.tx2, lineHeight:1.55, maxWidth:500 }}>{subcopy}</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:16 }}>
            <div style={{ padding:"9px 12px", borderRadius:14, background:`${c.surf}D9`, border:`1px solid ${c.border}` }}>
              <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Paid this month</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:c.go }}>{progress.paidThisMonthLabel}</div>
            </div>
            <div style={{ padding:"9px 12px", borderRadius:14, background:`${c.surf}D9`, border:`1px solid ${c.border}` }}>
              <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>One step better</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:c.ac }}>{progress.totalReductionLabel}</div>
            </div>
          </div>
        </div>
        <div style={{ minWidth:210, display:"grid", gap:10 }}>
          <div style={{ padding:"12px 14px", borderRadius:18, background:`linear-gradient(180deg, ${c.surf}F5, ${c.surf2})`, border:`1px solid ${c.border}`, boxShadow:`inset 0 1px 0 rgba(255,255,255,0.12)` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted }}>This month</div>
              <div style={{ fontSize:12, fontWeight:800, color:c.tx2 }}>{ratioPct}% better</div>
            </div>
            <div style={{ height:12, borderRadius:999, background:`linear-gradient(90deg, ${c.border2}, ${c.border})`, overflow:"hidden", marginBottom:10 }}>
              <div style={{ width:`${ratioPct}%`, height:"100%", borderRadius:999, background:`linear-gradient(90deg, ${c.ac}, ${c.go}, ${c.wa})`, boxShadow:`0 0 16px ${c.ac}55` }} />
            </div>
            <div style={{ fontSize:12, color:c.tx2, lineHeight:1.45 }}>The path is getting shorter. Keep stacking small wins.</div>
          </div>
          <div style={{ padding:"10px 14px", borderRadius:18, background:`${c.surf}D9`, border:`1px solid ${c.border}` }}>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Sooner</div>
            <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>{progress.monthsSooner > 0 ? progress.monthsSoonerLabel : "Nice work"}</div>
            <div style={{ fontSize:12, color:c.tx2, marginTop:4 }}>
              {progress.monthsSooner > 0 ? `Projected finish ${progress.projectedPayoffDate}` : "The plan is moving in the right direction."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
