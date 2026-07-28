export default function ProgressRing({ palette, ratio = 0, label, value, size = 92, tone, cleared = false }) {
  const c = palette;
  const bounded = Math.max(0, Math.min(1, Number(ratio) || 0));
  const stroke = cleared ? 10 : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * bounded;
  const ringColor = tone || c.ac;

  return (
    <div style={{ display:"grid", placeItems:"center", gap:10 }}>
      <div style={{ position:"relative", width:size, height:size, filter:`drop-shadow(0 ${cleared ? 12 : 8}px ${cleared ? 24 : 18}px ${ringColor}${cleared ? "44" : "22"})` }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={c.border2} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div style={{ position:"absolute", inset:12, borderRadius:"50%", background:`radial-gradient(circle at 50% 35%, ${c.surf}, ${c.surf2})`, border:`1px solid ${ringColor}18` }} />
        <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", textAlign:"center" }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:800, color:c.tx, textShadow:`0 1px 0 ${c.surf}` }}>{Math.round(bounded * 100)}%</div>
        </div>
      </div>
      <div style={{ textAlign:"center", display:"grid", gap:4 }}>
        <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", color:c.muted, lineHeight:1.4 }}>{label}</div>
        <div style={{ fontSize:12, color:c.tx2 }}>{value}</div>
      </div>
    </div>
  );
}
