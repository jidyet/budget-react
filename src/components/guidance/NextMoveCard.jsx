export default function NextMoveCard({ palette, move }) {
  const c = palette;
  const toneColor = move?.tone === "warn" ? c.wa : move?.tone === "success" ? c.go : move?.tone === "accent" ? c.ac : c.tx;

  return (
    <div style={{
      padding: "20px 22px",
      borderRadius: 20,
      background: `linear-gradient(135deg, ${toneColor}14, ${c.surf} 38%, ${c.surf2})`,
      border: `1.5px solid ${toneColor}33`,
      display: "grid",
      gap: 8,
      boxShadow: `0 16px 36px ${toneColor}14`,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{ position: "absolute", inset: "auto -40px -44px auto", width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${toneColor}20, transparent 68%)`, pointerEvents: "none" }} />

      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: toneColor, opacity: 0.85, position: "relative" }}>
        {move?.title || "Next move"}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: toneColor, lineHeight: 1.1, position: "relative", letterSpacing: "-0.01em" }}>
        {move?.body || "Keep going"}
      </div>
      <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5, position: "relative" }}>
        {move?.detail || "Open the app again tomorrow."}
      </div>
    </div>
  );
}
