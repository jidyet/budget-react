export default function UndoToast({ undoStack, palette, isMobile, onUndo, onDismiss }) {
  if (!undoStack) return null;
  const c = palette;

  return (
    <div style={{ position: 'fixed', bottom: isMobile ? 80 : 24, left: '50%', transform: 'translateX(-50%) translateZ(0)', zIndex: 9999, background: c.surf, border: `1.5px solid ${c.border2}`, borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', minWidth: 260, animation: 'slideUp 0.25s ease' }}>
      <span style={{ fontSize: 13, color: c.tx, flex: 1 }}>{undoStack.label}</span>
      <button onClick={onUndo} style={{ padding: '5px 14px', borderRadius: 7, border: `1.5px solid ${c.ac}`, background: 'transparent', color: c.ac, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
        Undo
      </button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: c.muted, fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>
        x
      </button>
    </div>
  );
}
