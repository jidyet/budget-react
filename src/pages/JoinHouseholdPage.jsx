import EmptyState from '../components/feedback/EmptyState';

export default function JoinHouseholdPage({
  palette,
  isMobile,
  form,
  setForm,
  results,
  searchLoading,
  actionLoading,
  inputStyle,
  onSearch,
  onJoin,
}) {
  const c = palette;
  const updateSearch = (value) => setForm((prev) => ({ ...prev, search: value }));

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div style={{ fontSize:13, color:c.tx2, lineHeight:1.6 }}>
        Search by code or name. Open households let you in right away. Approval households send a quick request.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr auto', gap:10 }}>
        <input style={inputStyle} value={form.search} onChange={(event) => updateSearch(event.target.value)} placeholder='Enter a join code or name' />
        <button type='button' onClick={onSearch} disabled={searchLoading} style={{ padding:'12px 16px', borderRadius:12, border:'none', background:c.ac, color:'#001014', fontSize:14, fontWeight:800, cursor:'pointer', opacity:searchLoading ? 0.72 : 1 }}>
          {searchLoading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {searchLoading ? (
        <div style={{ fontSize:13, color:c.muted }}>Looking for your household...</div>
      ) : results.length ? (
        <div style={{ display:'grid', gap:10 }}>
          {results.map((result) => (
            <div key={result.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:16, background:c.surf2, border:`1px solid ${c.border}`, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:220 }}>
                <div style={{ fontSize:15, fontWeight:800, color:c.tx, marginBottom:4 }}>{result.name}</div>
                <div style={{ fontSize:12, color:c.tx2, marginBottom:4 }}>{result.description || 'Shared progress, bills, and payoff goals in one place.'}</div>
                <div style={{ fontSize:11, color:c.muted }}>
                  {result.joinMode === 'open' ? 'Open join' : 'Approval required'} • code {result.joinCode}
                </div>
              </div>
              <button type='button' onClick={() => onJoin(result)} disabled={actionLoading} style={{ padding:'10px 14px', borderRadius:10, border:'none', background:c.ac, color:'#001014', fontSize:12, fontWeight:800, cursor:'pointer', opacity:actionLoading ? 0.72 : 1 }}>
                {result.joinMode === 'open' ? 'Join now' : 'Request access'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState palette={c} title='Nothing yet' message='Try the exact household name, join code, or the share link.' />
      )}
    </div>
  );
}
