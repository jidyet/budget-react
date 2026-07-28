/**
 * PaidThisMonthCard — Phase 6 update
 * Secondary card: active-voice label, medium number, supporting context.
 */
export default function PaidThisMonthCard({ palette, value, context }) {
  const c = palette;
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 18,
      background: `linear-gradient(135deg, ${c.go}20 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${c.go}50`,
      display: "grid",
      gap: 6,
      boxShadow: `0 4px 18px ${c.go}14`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.go }}>
        You've paid down
      </div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 700, color: c.go, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: c.muted }}>
        {context || "this month"}
      </div>
    </div>
  );
}
