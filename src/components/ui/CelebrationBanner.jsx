const CONFETTI_DOTS = [
  { left: "8%",  delay: "0s",    dur: "1.4s", color: "#f9e952", size: 7 },
  { left: "22%", delay: "0.18s", dur: "1.7s", color: "#ff6eb4", size: 5 },
  { left: "38%", delay: "0.06s", dur: "1.5s", color: "#60eaff", size: 6 },
  { left: "54%", delay: "0.3s",  dur: "1.6s", color: "#a78bfa", size: 5 },
  { left: "68%", delay: "0.12s", dur: "1.8s", color: "#34d399", size: 7 },
  { left: "82%", delay: "0.24s", dur: "1.5s", color: "#fbbf24", size: 5 },
  { left: "92%", delay: "0.08s", dur: "1.7s", color: "#f87171", size: 6 },
];

export default function CelebrationBanner({
  palette,
  celebration,
  reducedMotion = false,
  isMobile = false,
  stats = [],
  actionLabel,
  onAction,
}) {
  if (!celebration) return null;
  const c = palette;
  const tone = celebration.tone === "calm" ? c.ac : c.go;
  const animate = !reducedMotion;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${tone}22 0%, ${c.surf} 42%, ${tone}10 100%)`,
        border: `1.5px solid ${tone}55`,
        borderRadius: 20,
        padding: isMobile ? "14px 14px 12px" : "16px 20px 14px",
        marginBottom: 14,
        animation: animate
          ? "riseFade 320ms cubic-bezier(.22,.8,.36,1) both, celebPulse 2.8s ease-in-out 0.4s infinite"
          : "none",
      }}
    >
      {animate && CONFETTI_DOTS.map((dot, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 8,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            borderRadius: "50%",
            background: dot.color,
            animation: `confettiDrift ${dot.dur} ${dot.delay} ease-out forwards`,
            pointerEvents: "none",
          }}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, position: "relative", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Hero title — no decorative label, content speaks */}
          <div style={{
            fontSize: isMobile ? 20 : 24,
            fontWeight: 900,
            color: c.tx,
            lineHeight: 1.2,
            marginBottom: stats.length ? 8 : 4,
            letterSpacing: "-0.01em",
          }}>
            {celebration.title}
          </div>

          {/* Specific stats row */}
          {stats.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              {stats.map((stat, i) => (
                <span
                  key={i}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: `${tone}18`,
                    border: `1px solid ${tone}33`,
                    fontSize: 12,
                    fontWeight: 800,
                    color: tone,
                  }}
                >
                  {stat}
                </span>
              ))}
            </div>
          )}

          <div style={{ fontSize: isMobile ? 12 : 13, color: c.tx2, lineHeight: 1.5 }}>
            {celebration.detail}
          </div>
        </div>

        {/* Contextual CTA */}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            style={{
              padding: "9px 14px",
              borderRadius: 10,
              border: `1px solid ${tone}44`,
              background: `${tone}16`,
              color: tone,
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {/* Bottom accent stripe */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        borderRadius: "0 0 20px 20px",
        background: `linear-gradient(90deg, ${tone}00, ${tone}AA 40%, ${tone}AA 60%, ${tone}00)`,
      }} />
    </div>
  );
}
