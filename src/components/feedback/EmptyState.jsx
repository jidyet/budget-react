export default function EmptyState({ title = "Nothing here yet", message, palette, action }) {
  const c = palette;
  return (
    <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px", color: c.muted, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{message}</div>}
      {action || null}
    </div>
  );
}
