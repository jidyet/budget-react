export default function Toast({ toast, palette }) {
  if (!toast) return null;
  const c = palette;

  return (
    <div
      className="toast-wrap"
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        background: toast.type === 'error' ? `linear-gradient(135deg, ${c.da}, ${c.da}cc)` : `linear-gradient(135deg, ${c.go}, ${c.ac})`,
        color: '#fff',
        padding: '11px 22px 11px 16px',
        borderRadius: 14,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: '0 8px 32px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.16)',
        zIndex: 1200,
        fontFamily: "'Instrument Sans',sans-serif",
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.2)',
      }}
    >
      {toast.type === 'error' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {toast.msg}
    </div>
  );
}
