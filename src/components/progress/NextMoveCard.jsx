export default function NextMoveCard({ palette, move }) {
  const c = palette;
  const toneColor = move?.tone === "success" ? c.go : move?.tone === "accent" ? c.ac : c.tx;

  return (
    <div style={{ padding:"18px 18px", borderRadius:20, background:`linear-gradient(135deg, ${c.ac}12, ${c.surf} 42%, ${c.surf2})`, border:`1px solid ${c.border}`, display:"grid", gap:10, boxShadow:`0 14px 30px ${c.ac}10`, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:"auto -30px -34px auto", width:120, height:120, borderRadius:"50%", background:`radial-gradient(circle, ${c.ac}18, transparent 72%)`, pointerEvents:"none" }} />
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted, position:"relative" }}>{move?.title || "Next move"}</div>
      <div style={{ fontSize:22, fontWeight:900, color:toneColor, lineHeight:1.15, position:"relative" }}>{move?.body || "Keep going"}</div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5, position:"relative" }}>{move?.detail || "Open the app again tomorrow."}</div>
    </div>
  );
}
