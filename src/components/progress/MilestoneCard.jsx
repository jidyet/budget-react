const TONE_META = {
  success: { emoji: "🏆", label: "Cleared" },
  accent:  { emoji: "⭐", label: "Progress" },
  default: { emoji: "✓",  label: "Nice work" },
};

export default function MilestoneCard({ palette, milestones = [], reducedMotion = false, isMobile = false, activity = [] }) {
  const c = palette;
  const animate = !reducedMotion;

  const getActor = (milestone) => {
    const match = (activity || []).find((a) =>
      a?.title && milestone?.body &&
      a.title.toLowerCase().includes(milestone.body.toLowerCase().split(" ")[0])
    );
    return match?.title || null;
  };

  const toneColor = (tone) =>
    tone === "success" ? c.go : tone === "accent" ? c.ac : c.tx;

  const toneBg = (tone) =>
    tone === "success" ? `${c.go}12` : tone === "accent" ? `${c.ac}12` : c.surf2;

  const toneBorder = (tone) =>
    tone === "success" ? `${c.go}55` : tone === "accent" ? `${c.ac}44` : c.border;

  const toneGlow = (tone) =>
    tone === "success" ? `0 4px 22px ${c.go}24` : tone === "accent" ? `0 4px 20px ${c.ac}18` : "none";

  return (
    <div style={{
      padding: isMobile ? "14px 14px" : "18px 18px",
      borderRadius: 20,
      background: `linear-gradient(160deg, ${c.go}08, ${c.surf} 30%, ${c.surf2})`,
      border: `1px solid ${c.go}30`,
      display: "grid",
      gap: isMobile ? 8 : 10,
      boxShadow: `0 12px 28px ${c.go}14`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
        Milestones
      </div>

      {!milestones.length ? (
        <div style={{ fontSize: 12, color: c.tx2 }}>Small wins will show up here.</div>
      ) : (
        milestones.map((milestone, i) => {
          const meta = TONE_META[milestone.tone] || TONE_META.default;
          const color = toneColor(milestone.tone);
          return (
            <div
              key={milestone.id}
              style={{
                position: "relative",
                padding: isMobile ? "11px 12px" : "13px 14px",
                borderRadius: 16,
                background: toneBg(milestone.tone),
                border: `1.5px solid ${toneBorder(milestone.tone)}`,
                boxShadow: toneGlow(milestone.tone),
                animation: animate
                  ? `milestonePop 380ms cubic-bezier(.22,.8,.36,1) ${i * 80}ms both`
                  : "none",
                overflow: "hidden",
              }}
            >
              {/* Shimmer sweep on cleared */}
              {animate && milestone.tone === "success" && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(105deg, transparent 30%, ${c.go}20 50%, transparent 70%)`,
                  animation: "shimmerSweep 2.4s ease-in-out 0.3s infinite",
                  pointerEvents: "none",
                  borderRadius: 16,
                }} />
              )}

              {/* Left accent bar */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, bottom: 0,
                width: 3,
                borderRadius: "16px 0 0 16px",
                background: color,
              }} />

              <div style={{ paddingLeft: isMobile ? 8 : 10 }}>
                {/* Emoji + type label */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                  <span style={{
                    fontSize: isMobile ? 14 : 16,
                    lineHeight: 1,
                    animation: animate && milestone.tone === "success"
                      ? "sparkle 1.8s ease-in-out infinite"
                      : "none",
                  }}>
                    {meta.emoji}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color,
                    opacity: 0.9,
                  }}>
                    {meta.label}
                  </span>
                </div>

                {/* Body as headline */}
                <div style={{
                  fontSize: isMobile ? 14 : 16,
                  fontWeight: 900,
                  color,
                  marginBottom: 2,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}>
                  {milestone.body || milestone.title}
                </div>

                {/* Title as supporting line */}
                {milestone.body && milestone.title && (
                  <div style={{ fontSize: 11, color: c.tx2, lineHeight: 1.4 }}>
                    {milestone.title}
                  </div>
                )}

                {/* Activity attribution */}
                {(() => {
                  const actor = getActor(milestone);
                  return actor ? (
                    <div style={{
                      marginTop: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: `${c.surf}CC`,
                      border: `1px solid ${c.border}`,
                      fontSize: 10,
                      fontWeight: 700,
                      color: c.muted,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      {actor}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
