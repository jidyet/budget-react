export default function ErrorState({ title = "Something went wrong", message, palette, action }) {
  const c = palette;
  return (
    <div style={{ background: c.daD, border: `1px solid ${c.da}`, borderRadius: 12, padding: "18px 20px", color: c.tx, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: c.da }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{message}</div>}
      {action || null}
    </div>
  );
}
