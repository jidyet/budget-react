export default function HouseholdHeroCard({ palette, householdName, totalDebtLeft, paidThisMonth, memberCount }) {
  const c = palette;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.ac}18 0%, ${c.surf} 32%, ${c.surf2} 74%, ${c.wa}15 100%)`,
        border: `1px solid ${c.border}`,
        borderRadius: 24,
        padding: "22px 22px",
        display: "grid",
        gap: 16,
        boxShadow: `0 18px 44px ${c.ac}14`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-28px auto auto -40px",
          width: 170,
          height: 170,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c.wa}18, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", position: "relative" }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: `${c.surf}CC`, border: `1px solid ${c.border}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.ac, boxShadow: `0 0 0 5px ${c.ac}20` }} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.tx2 }}>Shared progress</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: c.tx, margin: "12px 0 4px" }}>{householdName || "Your household"}</div>
          <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.55 }}>You&apos;re doing this together. Keep it simple. Keep it moving.</div>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 999, background: `${c.surf}CC`, border: `1px solid ${c.ac}30`, color: c.ac, fontSize: 12, fontWeight: 900, boxShadow: `0 8px 20px ${c.ac}18` }}>
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, position: "relative" }}>
        <div style={{ padding: "14px 16px", borderRadius: 18, background: `${c.surf}D9`, border: `1px solid ${c.border}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Debt left</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 26, fontWeight: 700, color: c.tx }}>{totalDebtLeft}</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 18, background: `linear-gradient(180deg, ${c.surf}D9, ${c.surf2})`, border: `1px solid ${c.border}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Paid this month</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 26, fontWeight: 700, color: c.go }}>{paidThisMonth}</div>
        </div>
      </div>
    </div>
  );
}
