export default function DueSoonBanner({ visible, accounts, palette, onView, onClose }) {
  if (!visible) return null;
  const c = palette;
  const urgentBills = accounts.filter((account) => !account.is_paid && account.d_left !== null && account.d_left <= 2 && account.d_left >= 0);
  const overdueBills = accounts.filter((account) => !account.is_paid && account.d_left !== null && account.d_left < 0);
  const total = urgentBills.length + overdueBills.length;
  if (total === 0) return null;

  const msg = overdueBills.length > 0
    ? `${overdueBills.length} bill${overdueBills.length > 1 ? 's' : ''} overdue ${urgentBills.length > 0 ? `| ${urgentBills.length} due within 2 days` : ''}`
    : `${urgentBills.length} bill${urgentBills.length > 1 ? 's' : ''} due within 2 days`;

  return (
    <div style={{ background: `${overdueBills.length > 0 ? c.da : c.wa}18`, borderBottom: `1px solid ${overdueBills.length > 0 ? c.da : c.wa}40`, padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: overdueBills.length > 0 ? c.da : c.wa, fontWeight: 600, position: 'sticky', top: 0, zIndex: 100 }}>
      <span style={{ fontSize: 16 }}>{overdueBills.length > 0 ? '!' : 'o'}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onView} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: overdueBills.length > 0 ? c.da : c.wa, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>View</button>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'currentColor', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px', opacity: 0.7 }}>x</button>
    </div>
  );
}
