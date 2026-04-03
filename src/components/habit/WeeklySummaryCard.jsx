export default function WeeklySummaryCard({ palette, summary }) {
  const c = palette;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${c.in}20, ${c.surf} 42%, ${c.surf2})`,
      border: `1.5px solid ${c.in}44`,
      borderRadius: 20,
      padding: "16px 18px",
      display: "grid",
      gap: 12,
      boxShadow: `0 12px 28px ${c.in}14`,
    }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.in, marginBottom: 4 }}>This week</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{summary?.title || "This week"}</div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{summary?.body || "One small move still counts."}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        {(summary?.chips || []).map((chip) => (
          <div key={chip.id} style={{ padding: "10px 12px", borderRadius: 14, background: `${c.in}0e`, border: `1px solid ${c.in}33` }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.in, marginBottom: 4 }}>{chip.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: c.tx }}>{chip.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
