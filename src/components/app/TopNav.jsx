import { hasPremiumAccess } from "../../utils/planLimits";

export default function TopNav({ navItems, page, palette, isMobile, showMoreDrawer, setShowMoreDrawer, navigateTo, subscription, onOpenBilling }) {
  const c = palette;
  const isPremium = hasPremiumAccess(subscription);

  return (
    <div className="top-nav" style={{ display: 'flex', gap: 4, padding: '10px 0 0', borderBottom: `2px solid ${c.ac}55`, overflowX: 'auto', whiteSpace: 'nowrap' }}>
      {navItems.map(({ id, label, sub, icon, isMore }) => {
        const morePageActive = ['upload', 'history', 'settings'].includes(page);
        const active = isMore ? (showMoreDrawer || morePageActive) : page === id;
        const hasMoreDot = isMore && morePageActive && !showMoreDrawer;

        return (
          <button
            key={id}
            className={`nav-btn${active ? ' active' : ''}`}
            onClick={isMore ? () => setShowMoreDrawer((current) => !current) : () => navigateTo(id)}
            title={sub}
            style={{
              padding: isMobile ? '7px 11px' : '8px 16px',
              borderRadius: '10px 10px 0 0',
              border: `1.5px solid ${active ? c.ac : c.border}`,
              borderBottom: active ? `2px solid ${c.surf}` : `1.5px solid ${c.border}`,
              cursor: 'pointer',
              fontFamily: "'Instrument Sans',sans-serif",
              fontWeight: active ? 800 : 600,
              fontSize: isMobile ? 11 : 12,
              background: active ? `linear-gradient(180deg, ${c.ac}18, ${c.surf})` : c.surf2,
              color: active ? c.ac : c.tx2,
              boxShadow: active ? `0 -6px 20px ${c.acD}` : 'none',
              marginBottom: active ? '-1.5px' : 0,
              position: 'relative',
              zIndex: active ? 2 : 1,
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ opacity: active ? 1 : 0.7, display: 'flex', alignItems: 'center' }}>{icon}</span>
            <span>{label}</span>
            {hasMoreDot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.ac, display: 'inline-block', marginLeft: 2, flexShrink: 0 }} />}
          </button>
        );
      })}
      {!isPremium && onOpenBilling && (
        <button
          onClick={onOpenBilling}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${c.ac}55`,
            background: `${c.ac}14`,
            color: c.ac,
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: "'Instrument Sans',sans-serif",
            letterSpacing: '0.04em',
            alignSelf: 'center',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          See plans
        </button>
      )}
    </div>
  );
}
