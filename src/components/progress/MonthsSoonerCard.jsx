export default function MonthsSoonerCard({ palette, label, detail }) {
  const c = palette;
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 16,
      background: `linear-gradient(135deg, ${c.in}22 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${c.in}44`,
      display: "grid",
      gap: 6,
      boxShadow: `0 4px 18px ${c.in}16`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.in }}>Progress</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c.in }}>{label}</div>
      <div style={{ fontSize: 12, color: c.tx2 }}>{detail}</div>
    </div>
  );
}
