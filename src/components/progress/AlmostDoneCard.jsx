export default function AlmostDoneCard({ palette, debt }) {
  const c = palette;
  return (
    <div style={{ padding:"14px 16px", borderRadius:16, background:c.surf, border:`1px solid ${c.border}`, display:"grid", gap:6 }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted }}>Almost done</div>
      <div style={{ fontSize:20, fontWeight:800, color:c.tx }}>{debt ? debt.name : "Keep going"}</div>
      <div style={{ fontSize:12, color:debt ? c.ac : c.tx2 }}>{debt ? `${debt.currentBalanceLabel || ""} left` : "The next win is getting closer."}</div>
    </div>
  );
}
