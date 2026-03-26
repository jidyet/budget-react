export default function LoadingState({ palette, label = "Loading..." }) {
  const c = palette;
  return (
    <div
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
        padding: "24px 18px",
        borderRadius: 18,
        border: `1px solid ${c.border}`,
        background: `linear-gradient(135deg, ${c.ac}10, ${c.surf})`,
      }}
    >
      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", border: `3px solid ${c.border2}`, borderTopColor: c.ac, animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 13, color: c.tx2, fontWeight: 700 }}>{label}</div>
      </div>
    </div>
  );
}

