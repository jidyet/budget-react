export default function LaunchSupportCard({
  palette,
  prompt,
  onPrimary,
  onSecondary,
}) {
  if (!prompt) return null;
  const c = palette;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.ac}12, ${c.surf} 34%, ${c.surf2} 82%, ${c.wa}10)`,
        border: `1px solid ${c.border}`,
        borderRadius: 20,
        padding: "16px 18px",
        display: "grid",
        gap: 10,
        boxShadow: `0 14px 30px ${c.ac}10`,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
          Soft launch
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
          {prompt.title}
        </div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55 }}>
          {prompt.detail}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onPrimary}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "none",
            background: c.ac,
            color: "#001014",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {prompt.primaryLabel}
        </button>
        {prompt.secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: `1px solid ${c.border2}`,
              background: c.surf,
              color: c.tx,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {prompt.secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
