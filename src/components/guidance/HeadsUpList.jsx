import HeadsUpCard from "./HeadsUpCard";

export default function HeadsUpList({ palette, items = [] }) {
  const c = palette;

  return (
    <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:20, padding:"16px 16px", display:"grid", gap:10 }}>
      <div>
        <div style={{ fontSize:10, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Heads up</div>
        <div style={{ fontSize:13, color:c.tx2 }}>A quick look at what needs your eyes.</div>
      </div>
      {items.length ? (
        <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
          {items.map((item) => <HeadsUpCard key={item.id} palette={palette} item={item} />)}
        </div>
      ) : (
        <div style={{ fontSize:13, color:c.tx2 }}>Nothing heavy right now. You’re in a good spot.</div>
      )}
    </div>
  );
}

