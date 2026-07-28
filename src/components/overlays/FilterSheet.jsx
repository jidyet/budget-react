/**
 * FilterSheet — mobile bottom-sheet for owner / category / status filters.
 */
export default function FilterSheet({
  c,
  allAccts,
  ownerF, setOwnerF,
  catF, setCatF,
  filt, setFilt,
  FILTERS,
  onClose,
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position:"fixed", inset:0, zIndex:190, background:"rgba(0,0,0,0.4)", transform:"translateZ(0)" }}
      />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:191, background:c.surf, borderRadius:"18px 18px 0 0", padding:"20px 20px 36px", boxShadow:"0 -4px 32px rgba(0,0,0,0.18)", transform:"translateZ(0)" }}>
        <div style={{ width:36, height:4, borderRadius:2, background:c.border2, margin:"0 auto 20px" }} />
        <div style={{ fontSize:15, fontWeight:800, color:c.tx, marginBottom:18 }}>Filters</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Owner</div>
            <select
              value={ownerF}
              onChange={(e) => setOwnerF(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}
            >
              <option value="All">All</option>
              {[...new Set(allAccts.map((a) => a.owner))].filter(Boolean).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Category</div>
            <select
              value={catF}
              onChange={(e) => setCatF(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}
            >
              <option value="All">All</option>
              {[...new Set(allAccts.map((a) => a.category))].filter(Boolean).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Status</div>
            <select
              value={filt}
              onChange={(e) => setFilt(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}
            >
              {(FILTERS || ["All","Unpaid","Paid","Overdue"]).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width:"100%", marginTop:20, padding:"13px", borderRadius:10, border:"none", background:c.ac, color:"#000", fontSize:15, fontWeight:700, cursor:"pointer" }}
        >
          Apply Filters
        </button>
      </div>
    </>
  );
}
