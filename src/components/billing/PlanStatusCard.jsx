export default function PlanStatusCard({ palette, subscription, onManageBilling, onUpgrade, billingReady = true }) {
  const c = palette;
  const testerUnlocked = subscription?.testerMode && subscription?.premiumUnlockedForTesters;
  const billingComingSoon = !subscription?.billingEnabled;

  return (
    <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:20, padding:"18px 18px", display:"grid", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Plan</div>
          <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>{subscription?.premium ? "Premium" : "Free"}</div>
        </div>
        <div style={{ padding:"7px 10px", borderRadius:999, background:subscription?.premium ? c.acD : c.surf2, border:`1px solid ${subscription?.premium ? c.ac : c.border}`, color:subscription?.premium ? c.ac : c.tx2, fontSize:11, fontWeight:900 }}>
          {testerUnlocked ? "Tester access on" : (subscription?.premium ? "Momentum unlocked" : "Core plan")}
        </div>
      </div>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>
        {testerUnlocked
          ? "Early testers have full access right now. Billing stays out of the way until launch."
          : subscription?.premium
          ? (subscription?.cancelAtPeriodEnd
            ? `Your plan stays active through ${subscription?.renewalDate || "the end of this period"}.`
            : `Renews ${subscription?.renewalDate || "automatically"}.`)
          : "Keep the core flow free, then upgrade when you want more shared momentum."}
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {billingComingSoon ? (
          <button type="button" disabled style={{ padding:"10px 14px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf2, color:c.tx2, fontSize:12, fontWeight:900, cursor:"not-allowed", opacity:0.8 }}>
            Coming soon
          </button>
        ) : subscription?.premium ? (
          <button type="button" onClick={onManageBilling} style={{ padding:"10px 14px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf2, color:c.tx, fontSize:12, fontWeight:900, cursor:"pointer" }}>
            Manage billing
          </button>
        ) : (
          <button
            type="button"
            onClick={onUpgrade}
            disabled={!billingReady}
            style={{
              padding:"10px 14px",
              borderRadius:999,
              border:`1px solid ${c.border2}`,
              background:billingReady ? c.acD : c.surf2,
              color:billingReady ? c.ac : c.tx2,
              fontSize:12,
              fontWeight:900,
              cursor:billingReady ? "pointer" : "not-allowed",
              opacity:billingReady ? 1 : 0.72,
            }}
          >
            {billingReady ? "Unlock shared progress" : "Billing setup soon"}
          </button>
        )}
      </div>
    </div>
  );
}
