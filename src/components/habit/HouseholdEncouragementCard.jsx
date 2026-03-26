export default function HouseholdEncouragementCard({ palette, activity = [], memberCount = 0, momentum }) {
  const c = palette;
  const latest = activity[0];

  return (
    <div style={{ background:`linear-gradient(135deg, ${c.go}10, ${c.surf} 40%, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:20, padding:"16px 18px", display:"grid", gap:10, boxShadow:`0 12px 28px ${c.go}10` }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Shared progress</div>
      <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>
        {memberCount > 1 ? "You're both moving" : "You're synced"}
      </div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>
        {latest?.title || (momentum?.weeklyHandled > 0 ? "Someone updated this week." : "One small check-in keeps the week alive.")}
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <span style={{ padding:"6px 9px", borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}`, fontSize:11, fontWeight:800, color:c.go }}>
          {latest ? "One update today" : "Shared progress"}
        </span>
        <span style={{ padding:"6px 9px", borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}`, fontSize:11, fontWeight:800, color:c.tx2 }}>
          {momentum?.weeklyHandled || 0} moved this week
        </span>
      </div>
    </div>
  );
}
