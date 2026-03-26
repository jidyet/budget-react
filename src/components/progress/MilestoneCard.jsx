export default function MilestoneCard({ palette, milestones = [] }) {
  const c = palette;
  const toneColor = (tone) => tone === "success" ? c.go : tone === "accent" ? c.ac : c.tx;
  const toneBackground = (tone) => tone === "success" ? `${c.go}10` : tone === "accent" ? `${c.ac}12` : c.surf2;

  return (
    <div style={{ padding:"18px 18px", borderRadius:20, background:`linear-gradient(180deg, ${c.surf}, ${c.surf2})`, border:`1px solid ${c.border}`, display:"grid", gap:12, boxShadow:`0 12px 28px rgba(0,0,0,0.06)` }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Milestones</div>
      {!milestones.length ? (
        <div style={{ fontSize:12, color:c.tx2 }}>Small wins will show up here.</div>
      ) : (
        milestones.map((milestone) => (
          <div key={milestone.id} style={{ padding:"12px 13px", borderRadius:16, background:toneBackground(milestone.tone), border:`1px solid ${c.border}`, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize:15, fontWeight:900, color:toneColor(milestone.tone), marginBottom:3 }}>{milestone.title}</div>
            <div style={{ fontSize:12, color:c.tx2 }}>{milestone.body}</div>
          </div>
        ))
      )}
    </div>
  );
}
