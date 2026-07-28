export default function ProgressScoreCard({ palette, score }) {
  const c = palette;
  const toneColor = score?.tone === "warn" ? c.wa : score?.tone === "good" ? c.go : c.ac;

  return (
    <div style={{
      background: c.surf,
      border: `1px solid ${c.border}`,
      borderRadius: 20,
      padding: "16px 18px",
      display: "grid",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Score</div>
        <div style={{
          minWidth: 46,
          height: 46,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: `${toneColor}14`,
          border: `2px solid ${toneColor}`,
          color: toneColor,
          fontSize: 20,
          fontWeight: 900,
        }}>
          {score?.score ?? 0}
        </div>
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, color: c.tx, lineHeight: 1.2 }}>{score?.label || "Keep going"}</div>
      <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.45 }}>{score?.reason || "One move at a time."}</div>
      {score?.nextStep && (
        <div style={{
          marginTop: 6,
          position: "relative",
          overflow: "hidden",
          padding: "12px 14px 12px 18px",
          borderRadius: 14,
          background: `${toneColor}16`,
          border: `1.5px solid ${toneColor}66`,
          color: toneColor,
          animation: "pulseGlow 2.2s ease-in-out infinite",
          display: "grid",
          gap: 4,
        }}>
          {/* shimmer sweep */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(105deg, transparent 30%, ${toneColor}22 50%, transparent 70%)`,
            animation: "shimmerSweep 3s ease-in-out 0.6s infinite",
            pointerEvents: "none",
            borderRadius: 14,
          }} />
          {/* left accent bar */}
          <div style={{
            position: "absolute",
            top: 0, left: 0, bottom: 0,
            width: 4,
            borderRadius: "14px 0 0 14px",
            background: toneColor,
          }} />
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: toneColor, opacity: 0.75 }}>
            Focus next
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: toneColor, lineHeight: 1.3 }}>
              {score.nextStep.replace(/^Next:\s*/i, "").replace(/^focus on\s*/i, "")}
            </div>
            <span style={{ fontSize: 16, fontWeight: 900, color: toneColor, flexShrink: 0 }}>→</span>
          </div>
        </div>
      )}
    </div>
  );
}
