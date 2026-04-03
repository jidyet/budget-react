export default function PaidThisMonthCard({ palette, value, detail }) {
  const c = palette;
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 16,
      background: `linear-gradient(135deg, ${c.go}22 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${c.go}50`,
      display: "grid",
      gap: 6,
      boxShadow: `0 4px 18px ${c.go}14`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.go }}>Paid this month</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 700, color: c.go }}>{value}</div>
      <div style={{ fontSize: 12, color: c.tx2 }}>{detail}</div>
    </div>
  );
}
