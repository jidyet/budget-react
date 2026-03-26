import ProgressRing from "./ProgressRing";

export default function ProgressDebtList({ palette, debts = [] }) {
  const c = palette;
  const visibleDebts = debts.slice(0, 4);

  return (
    <div style={{ padding:"18px 18px", borderRadius:20, background:`linear-gradient(180deg, ${c.surf}, ${c.surf2})`, border:`1px solid ${c.border}`, display:"grid", gap:16, boxShadow:`0 12px 28px rgba(0,0,0,0.06)` }}>
      <div>
        <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Progress by debt</div>
        <div style={{ fontSize:12, color:c.tx2 }}>Quick rings for the debts closest to a win.</div>
      </div>
      {!visibleDebts.length ? (
        <div style={{ fontSize:12, color:c.tx2 }}>Add a debt to start seeing progress here.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))", gap:12 }}>
          {visibleDebts.map((debt) => (
            <div key={debt.id} style={{ padding:"12px 10px", borderRadius:18, background:`linear-gradient(180deg, ${c.surf}F2, ${c.surf2})`, border:`1px solid ${c.border}`, boxShadow:`0 10px 24px ${debt.almostDone ? c.go : c.ac}12` }}>
              <ProgressRing
                palette={c}
                ratio={debt.ratio}
                label={debt.name}
                value={debt.currentBalanceLabel}
                tone={debt.almostDone ? c.go : c.ac}
                size={88}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
