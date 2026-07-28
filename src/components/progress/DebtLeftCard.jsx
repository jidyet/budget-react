/**
 * DebtLeftCard — Phase 6 update
 * Primary card: largest number, context line showing lifetime % cleared.
 */
export default function DebtLeftCard({ palette, value, context }) {
  const c = palette;
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 18,
      background: `linear-gradient(135deg, ${c.wa}20 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${c.wa}50`,
      display: "grid",
      gap: 6,
      boxShadow: `0 6px 22px ${c.wa}14`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.wa }}>
        Still to go
      </div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 700, color: c.tx, lineHeight: 1.1 }}>
        {value}
      </div>
      {context ? (
        <div style={{ fontSize: 11, color: c.muted, lineHeight: 1.4 }}>{context}</div>
      ) : (
        <div style={{ fontSize: 11, color: c.muted }}>total remaining</div>
      )}
    </div>
  );
}
