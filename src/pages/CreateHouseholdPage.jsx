export default function CreateHouseholdPage({
  palette,
  isMobile,
  form,
  setForm,
  loading,
  lblStyle,
  inputStyle,
  selStyle,
  onCreate,
}) {
  const c = palette;
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.6 }}>
        Start a shared home from the budget you already trust. Your current numbers stay intact. The household just makes them visible together.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:10 }}>
        <div>
          <div style={lblStyle}>Household name</div>
          <input style={inputStyle} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder='The Smith household' />
        </div>
        <div>
          <div style={lblStyle}>Join mode</div>
          <select style={selStyle} value={form.joinMode} onChange={(event) => update('joinMode', event.target.value)}>
            <option value='approval'>Approval required</option>
            <option value='open'>Open join</option>
          </select>
        </div>
      </div>
      <div>
        <div style={lblStyle}>Short note</div>
        <textarea style={{ ...inputStyle, minHeight:88, resize:'vertical' }} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder='A shared place for payoff progress, bills, and wins.' />
      </div>
      <div style={{ display:'grid', gap:10, background:c.surf2, border:`1px solid ${c.border}`, borderRadius:14, padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:c.muted }}>What happens next</div>
        <div style={{ fontSize:13, color:c.tx2, lineHeight:1.6 }}>
          You become the owner, get a join code and share link, and keep your current budget as the starting point for the household.
        </div>
      </div>
      <button type='button' disabled={loading} onClick={onCreate} style={{ padding:'13px 16px', borderRadius:12, border:'none', background:c.ac, color:'#001014', fontSize:14, fontWeight:800, cursor:'pointer', opacity:loading ? 0.72 : 1 }}>
        {loading ? 'Creating household...' : 'Create household'}
      </button>
    </div>
  );
}
