export default function MomentumCard({ palette, momentum }) {
  const c = palette;
  const fill = Math.max(10, Math.min(100, (Number(momentum?.checkInCount || 1) / 7) * 100));

  return (
    <div style={{ background:`linear-gradient(180deg, ${c.surf}, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:20, padding:"16px 18px", display:"grid", gap:10, boxShadow:"0 12px 28px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Momentum</div>
      <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>{momentum?.title || "Keep going"}</div>
      <div style={{ fontSize:13, color:c.tx2 }}>{momentum?.detail || "One small move keeps the week alive."}</div>
      <div style={{ height:10, borderRadius:999, background:c.border2, overflow:"hidden" }}>
        <div style={{ width:`${fill}%`, height:"100%", borderRadius:999, background:`linear-gradient(90deg, ${c.ac}, ${c.go})` }} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:8 }}>
        <div style={{ padding:"9px 10px", borderRadius:14, background:c.surf, border:`1px solid ${c.border}` }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>This week</div>
          <div style={{ fontSize:18, fontWeight:900, color:c.tx }}>{momentum?.weeklyHandled || 0}</div>
        </div>
        <div style={{ padding:"9px 10px", borderRadius:14, background:c.surf, border:`1px solid ${c.border}` }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Paid down</div>
          <div style={{ fontSize:18, fontWeight:900, color:c.go }}>{momentum?.weeklyReductionLabel || "$0"}</div>
        </div>
        <div style={{ padding:"9px 10px", borderRadius:14, background:c.surf, border:`1px solid ${c.border}` }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Checks</div>
          <div style={{ fontSize:18, fontWeight:900, color:c.ac }}>{momentum?.checkInCount || 1}/7</div>
        </div>
      </div>
    </div>
  );
}
