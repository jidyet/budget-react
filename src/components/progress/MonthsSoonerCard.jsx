/**
 * MonthsSoonerCard — Phase 6 update
 * Fourth card: reward framing. "Finishing X months early" is the headline reward.
 */
export default function MonthsSoonerCard({ palette, label, detail, monthsSooner }) {
  const c = palette;
  const isAhead = Number(monthsSooner) > 0;
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 18,
      background: `linear-gradient(135deg, ${c.in}18 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${c.in}38`,
      display: "grid",
      gap: 6,
      boxShadow: `0 4px 18px ${c.in}12`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.in }}>
        {isAhead ? "Finishing early" : "On track"}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: c.in, lineHeight: 1.2 }}>
        {isAhead ? `${monthsSooner} month${Number(monthsSooner) === 1 ? "" : "s"} sooner` : label}
      </div>
      <div style={{ fontSize: 11, color: c.muted }}>
        {detail}
      </div>
    </div>
  );
}
