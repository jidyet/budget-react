export default function NudgeRow({ palette, nudges = [] }) {
  const c = palette;
  if (!nudges.length) return null;

  const toneColor = (tone) => tone === "success" ? c.go : c.ac;
  const toneBg = (tone) => tone === "success" ? `${c.go}12` : `${c.ac}12`;

  return (
    <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
      {nudges.map((nudge) => (
        <div key={nudge.id} style={{ minWidth:160, padding:"12px 13px", borderRadius:16, background:toneBg(nudge.tone), border:`1px solid ${c.border}`, boxShadow:`0 10px 22px ${toneColor(nudge.tone)}10` }}>
          <div style={{ fontSize:12, fontWeight:900, color:toneColor(nudge.tone), marginBottom:5 }}>{nudge.label}</div>
          <div style={{ fontSize:12, color:c.tx2, lineHeight:1.45 }}>{nudge.detail}</div>
        </div>
      ))}
    </div>
  );
}
