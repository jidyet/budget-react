export default function UpgradeCard({
  palette,
  title = "Unlock shared progress",
  detail = "Go further together",
  cta = "See plans",
  onClick,
  compact = false,
  disabled = false,
}) {
  const c = palette;

  return (
    <div style={{ background:`linear-gradient(135deg, ${c.ac}14, ${c.surf} 38%, ${c.surf2} 85%, ${c.wa}10)`, border:`1px solid ${c.border}`, borderRadius:20, padding:compact ? "14px 15px" : "18px 18px", display:"grid", gap:10, boxShadow:`0 14px 30px ${c.ac}10` }}>
      <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted }}>Go further together</div>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight:900, color:c.tx }}>{title}</div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>{detail}</div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          width:"fit-content",
          padding:"10px 14px",
          borderRadius:999,
          border:`1px solid ${c.border2}`,
          background:disabled ? c.surf2 : `${c.surf}D8`,
          color:disabled ? c.tx2 : c.tx,
          fontSize:12,
          fontWeight:900,
          cursor:disabled ? "not-allowed" : "pointer",
          opacity:disabled ? 0.72 : 1,
        }}
      >
        {cta}
      </button>
    </div>
  );
}
