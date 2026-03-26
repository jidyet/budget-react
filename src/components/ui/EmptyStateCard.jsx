export default function EmptyStateCard({ palette, title = "Nothing here yet", message, action }) {
  const c = palette;
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.ac}10, ${c.surf} 40%, ${c.surf2})`,
        border: `1px solid ${c.border}`,
        borderRadius: 18,
        padding: "18px 18px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: c.tx }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{message}</div>}
      {action || null}
    </div>
  );
}

