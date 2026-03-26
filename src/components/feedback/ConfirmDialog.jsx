export default function ConfirmDialog({ state, palette, isMobile, onClose }) {
  if (!state) return null;
  const c = palette;

  return (
    <>
      <div onClick={() => onClose(false)} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 211, width: isMobile ? '92vw' : 420, background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, boxShadow: '0 18px 64px rgba(0,0,0,0.3)', padding: isMobile ? '20px 18px' : '24px 22px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, marginBottom: 8 }}>{state.title}</div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55, marginBottom: 18 }}>{state.message}</div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={() => onClose(false)} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onClose(true)} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: 'none', background: state.tone === 'danger' ? c.da : c.ac, color: state.tone === 'danger' ? '#fff' : '#001014', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
