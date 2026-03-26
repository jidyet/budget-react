export default function ProgressNoteCard({ palette, note }) {
  const c = palette;
  const toneColor = note?.tone === "good" ? c.go : note?.tone === "accent" ? c.ac : c.tx;

  return (
    <div style={{ background:`linear-gradient(135deg, ${toneColor}14, ${c.surf} 48%, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:20, padding:"16px 16px", display:"grid", gap:8 }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Nice work</div>
      <div style={{ fontSize:20, fontWeight:900, color:toneColor, lineHeight:1.2 }}>{note?.title || "Keep going"}</div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>{note?.detail || "You moved forward."}</div>
    </div>
  );
}

