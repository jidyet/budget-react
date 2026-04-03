export default function MomentumCard({ palette, momentum, reducedMotion = false, isMobile = false }) {
  const c = palette;
  const fill = Math.max(6, Math.min(100, (Number(momentum?.checkInCount || 1) / 7) * 100));
  const animate = !reducedMotion;
  const hasActivity = Number(momentum?.weeklyHandled || 0) > 0;
  const checkCount = Number(momentum?.checkInCount || 1);
  const isStreak = checkCount >= 5;

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      background: hasActivity
        ? `linear-gradient(145deg, ${c.ac}10 0%, ${c.surf} 40%, ${c.go}08 100%)`
        : `linear-gradient(180deg, ${c.surf}, ${c.surf2})`,
      border: `1px solid ${hasActivity ? c.ac + "44" : c.border}`,
      borderRadius: 20,
      padding: isMobile ? "14px 14px" : "16px 18px",
      display: "grid",
      gap: isMobile ? 8 : 10,
      boxShadow: hasActivity
        ? `0 12px 32px ${c.ac}12`
        : "0 12px 28px rgba(0,0,0,0.06)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: c.muted,
        }}>
          Momentum
        </div>
        {isStreak && (
          <span style={{
            padding: "3px 8px",
            borderRadius: 999,
            background: `${c.go}18`,
            border: `1px solid ${c.go}44`,
            fontSize: 10,
            fontWeight: 900,
            color: c.go,
            letterSpacing: "0.06em",
            animation: animate ? "sparkle 2s ease-in-out infinite" : "none",
            whiteSpace: "nowrap",
          }}>
            🔥 On a streak
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontSize: isMobile ? (hasActivity ? 22 : 20) : (hasActivity ? 26 : 22),
        fontWeight: 900,
        color: c.tx,
        lineHeight: 1.2,
        letterSpacing: "-0.01em",
      }}>
        {momentum?.title || "Keep going"}
      </div>

      {/* Detail */}
      <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
        {momentum?.detail || "One small move keeps the week alive."}
      </div>

      {/* Progress bar */}
      <div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 5,
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Weekly check-ins
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: fill > 50 ? c.go : c.ac }}>
            {checkCount}/7
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: c.border2, overflow: "hidden" }}>
          <div style={{
            width: `${fill}%`,
            height: "100%",
            borderRadius: 999,
            background: animate
              ? `linear-gradient(90deg, ${c.ac}, ${c.go}, ${c.ac})`
              : `linear-gradient(90deg, ${c.ac}, ${c.go})`,
            backgroundSize: animate ? "200% 100%" : "100% 100%",
            animation: animate ? "shimmer 2.2s linear infinite" : "none",
            transition: "width 600ms cubic-bezier(.34,1.56,.64,1)",
          }} />
        </div>
      </div>

      {/* Stats row — 3 equal columns, compact on mobile */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isMobile ? 6 : 8 }}>
        {/* This week */}
        <div style={{
          padding: isMobile ? "8px 6px" : "10px 10px",
          borderRadius: 14,
          background: c.surf,
          border: `1px solid ${c.border}`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>
            This week
          </div>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 900, color: c.tx }}>
            {momentum?.weeklyHandled || 0}
          </div>
        </div>

        {/* Paid down — hero metric */}
        <div style={{
          padding: isMobile ? "8px 6px" : "10px 10px",
          borderRadius: 14,
          background: hasActivity ? `${c.go}10` : c.surf,
          border: `1px solid ${hasActivity ? c.go + "55" : c.border}`,
          textAlign: "center",
          boxShadow: hasActivity ? `0 2px 12px ${c.go}18` : "none",
          animation: animate && hasActivity ? "milestonePop 420ms cubic-bezier(.22,.8,.36,1) both" : "none",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>
            Paid down
          </div>
          <div style={{
            fontSize: isMobile ? 14 : 18,
            fontWeight: 900,
            color: c.go,
            lineHeight: 1.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {momentum?.weeklyReductionLabel || "$0"}
          </div>
        </div>

        {/* Checks */}
        <div style={{
          padding: isMobile ? "8px 6px" : "10px 10px",
          borderRadius: 14,
          background: c.surf,
          border: `1px solid ${c.border}`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: c.muted, marginBottom: 3 }}>
            Checks
          </div>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 900, color: c.ac }}>
            {checkCount}/7
          </div>
        </div>
      </div>
    </div>
  );
}
