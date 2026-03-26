export default function DailyCheckInCard({ palette, checkIn, onAction }) {
  const c = palette;
  const accent = checkIn?.tone === "success" ? c.go : c.ac;
  const actionLabel = checkIn?.action === "due-next" ? "Open due next" : checkIn?.action === "payoff" ? "Open payoff" : "Open bills";

  return (
    <div style={{ background:`linear-gradient(135deg, ${accent}14, ${c.surf} 38%, ${c.surf2})`, border:`1px solid ${accent}30`, borderRadius:22, padding:"18px 18px", display:"grid", gap:12, boxShadow:`0 16px 34px ${accent}12` }}>
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, width:"fit-content", padding:"6px 10px", borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}` }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:accent, boxShadow:`0 0 0 5px ${accent}20` }} />
        <span style={{ fontSize:10, fontWeight:900, letterSpacing:"0.12em", textTransform:"uppercase", color:c.tx2 }}>{checkIn?.eyebrow || "Today's focus"}</span>
      </div>
      <div style={{ fontSize:24, fontWeight:900, color:c.tx, lineHeight:1.06 }}>{checkIn?.title || "Keep going"}</div>
      <div style={{ fontSize:15, fontWeight:800, color:accent, lineHeight:1.3 }}>{checkIn?.body || "One small action today."}</div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>{checkIn?.detail || "You only need one move today."}</div>
      <button type="button" onClick={onAction} style={{ width:"fit-content", padding:"10px 14px", borderRadius:999, border:`1px solid ${c.border2}`, background:`${c.surf}D8`, color:c.tx, fontSize:12, fontWeight:900, cursor:"pointer" }}>
        {actionLabel}
      </button>
    </div>
  );
}
