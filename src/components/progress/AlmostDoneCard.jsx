export default function AlmostDoneCard({ palette, debt }) {
  const c = palette;
  const hasDebt = !!debt;
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 16,
      background: hasDebt
        ? `linear-gradient(135deg, ${c.ac}22 0%, ${c.surf} 55%)`
        : `linear-gradient(135deg, ${c.acS} 0%, ${c.surf} 55%)`,
      border: `1.5px solid ${hasDebt ? c.ac + "55" : c.border}`,
      display: "grid",
      gap: 6,
      boxShadow: hasDebt ? `0 4px 18px ${c.ac}18` : "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: hasDebt ? c.ac : c.muted }}>Almost done</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: hasDebt ? c.ac : c.tx }}>{debt ? debt.name : "Keep going"}</div>
      <div style={{ fontSize: 12, color: hasDebt ? c.ac : c.tx2 }}>{debt ? `${debt.currentBalanceLabel || ""} left` : "The next win is getting closer."}</div>
    </div>
  );
}
