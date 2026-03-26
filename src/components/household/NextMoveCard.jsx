export default function NextMoveCard({ palette, nextMove }) {
  const c = palette;
  const move = nextMove || {
    title: 'Next move',
    body: 'Keep the month moving forward.',
    meta: 'One thing left: open the app and clear the next step.',
  };

  return (
    <div style={{ background:`linear-gradient(145deg, ${c.acD}, ${c.surf})`, border:`1px solid ${c.ac}33`, borderRadius:18, padding:'16px 18px', display:'grid', gap:10 }}>
      <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:c.ac }}>{move.title || 'Next move'}</div>
      <div style={{ fontSize:18, fontWeight:800, color:c.tx, lineHeight:1.2 }}>{move.body}</div>
      <div style={{ fontSize:12, color:c.tx2, lineHeight:1.5 }}>{move.meta}</div>
    </div>
  );
}
