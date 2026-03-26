export default function MonthsSoonerCard({ palette, label, detail }) {
  const c = palette;
  return (
    <div style={{ padding:"14px 16px", borderRadius:16, background:c.surf, border:`1px solid ${c.border}`, display:"grid", gap:6 }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted }}>Progress</div>
      <div style={{ fontSize:20, fontWeight:800, color:c.tx }}>{label}</div>
      <div style={{ fontSize:12, color:c.tx2 }}>{detail}</div>
    </div>
  );
}
