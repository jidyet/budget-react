export default function PaidThisMonthCard({ palette, value, detail }) {
  const c = palette;
  return (
    <div style={{ padding:"14px 16px", borderRadius:16, background:c.surf, border:`1px solid ${c.border}`, display:"grid", gap:6 }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted }}>Paid this month</div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:24, fontWeight:700, color:c.go }}>{value}</div>
      <div style={{ fontSize:12, color:c.tx2 }}>{detail}</div>
    </div>
  );
}
