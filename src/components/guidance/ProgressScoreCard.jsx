export default function ProgressScoreCard({ palette, score }) {
  const c = palette;
  const toneColor = score?.tone === "warn" ? c.wa : score?.tone === "good" ? c.go : c.ac;
  const toneBg = `${toneColor}14`;

  return (
    <div style={{ background:`linear-gradient(135deg, ${toneBg}, ${c.surf} 40%, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:20, padding:"18px 18px", display:"grid", gap:10, boxShadow:`0 14px 30px ${toneColor}12` }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
        <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Progress Score</div>
        <div style={{ minWidth:54, height:54, borderRadius:"50%", display:"grid", placeItems:"center", background:c.surf, border:`2px solid ${toneColor}`, color:toneColor, fontSize:22, fontWeight:900 }}>
          {score?.score ?? 0}
        </div>
      </div>
      <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>{score?.label || "Keep going"}</div>
      <div style={{ fontSize:13, color:c.tx2 }}>{score?.reason || "One move at a time."}</div>
      <div style={{ fontSize:12, fontWeight:800, color:toneColor }}>{score?.nextStep || "Next: keep going"}</div>
    </div>
  );
}

