export default function CelebrationBanner({ palette, celebration, reducedMotion = false }) {
  if (!celebration) return null;
  const c = palette;
  const tone = celebration.tone === "calm" ? c.ac : c.go;
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${tone}18, ${c.surf} 38%, ${c.surf2})`,
        border: `1px solid ${tone}55`,
        borderRadius: 20,
        padding: "14px 16px",
        marginBottom: 14,
        boxShadow: `0 14px 30px ${tone}18`,
        animation: reducedMotion ? "none" : "riseFade 260ms ease both",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: tone, marginBottom: 6 }}>
        Big step
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{celebration.title}</div>
      <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{celebration.detail}</div>
    </div>
  );
}

