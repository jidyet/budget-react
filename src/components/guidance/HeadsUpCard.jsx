export default function HeadsUpCard({ palette, item }) {
  const c = palette;
  const toneColor = item?.tone === "warn" ? c.wa : item?.tone === "good" ? c.go : c.ac;

  return (
    <div style={{ minWidth:165, padding:"14px 14px", borderRadius:18, background:`linear-gradient(135deg, ${toneColor}14, ${c.surf} 55%, ${c.surf2})`, border:`1px solid ${c.border}`, display:"grid", gap:6 }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", color:toneColor }}>{item?.label || "Heads up"}</div>
      <div style={{ fontSize:15, fontWeight:900, color:c.tx, lineHeight:1.2 }}>{item?.title || "Keep going"}</div>
      <div style={{ fontSize:12, color:c.tx2, lineHeight:1.45 }}>{item?.detail || "You’re on track."}</div>
    </div>
  );
}

