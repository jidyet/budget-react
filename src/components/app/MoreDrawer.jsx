export default function MoreDrawer({
  open,
  page,
  palette,
  isMobile,
  safeTop = "env(safe-area-inset-top, 0px)",
  currentUserLabel = "",
  userProfile = {},
  onClose,
  navigateTo,
  founderOpsEnabled = false,
  adminEnabled = false,
}) {
  if (!open) return null;
  const c = palette;
  const signedInTitle = String(
    currentUserLabel
    || userProfile?.displayName
    || userProfile?.email
    || "Signed in"
  ).trim();
  const signedInMeta = String(userProfile?.email || "").trim();
  const items = [
    { id: 'beta', label: 'Beta help', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5 2v3.25c0 2.9-2.08 4.94-5 5.75-2.92-.81-5-2.85-5-5.75V3.5l5-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /><path d="M5.7 6.9l.9.9 1.9-2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: 'founder', label: 'Founder ops', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M2 11.5h10M3 11.5V4.5l2 1.2 2-2.2 2 2.2 2-1.2v7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 11.5V8.5h4v3" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /></svg> },
    { id: 'admin', label: 'Admin', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.25" /><path d="M1 12c0-2.21 1.79-4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="10" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.25" /><path d="M10 8v1.5l1 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: 'privacy', label: 'Privacy', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5 2v2.75c0 3.05-2.04 5.04-5 6.25-2.96-1.21-5-3.2-5-6.25V3.5l5-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /></svg> },
    { id: 'support', label: 'Help & FAQ', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" /><path d="M5.8 5.55a1.3 1.3 0 112.12 1.02c-.5.41-.92.68-.92 1.43" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="7" cy="10.15" r=".7" fill="currentColor" /></svg> },
    { id: 'billing', label: 'Billing', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M3 3.5h8A1.5 1.5 0 0112.5 5v4A1.5 1.5 0 0111 10.5H3A1.5 1.5 0 011.5 9V5A1.5 1.5 0 013 3.5z" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 6.5h11" stroke="currentColor" strokeWidth="1.4" /><circle cx="10.25" cy="8.5" r=".75" fill="currentColor" /></svg> },
    { id: 'notifications', label: 'Notifications', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5a2.5 2.5 0 00-2.5 2.5v1.1c0 .52-.18 1.03-.52 1.43L3 8v.75h8V8l-1-.47a2.24 2.24 0 01-.5-1.43V4A2.5 2.5 0 007 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M5.5 10.25a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg> },
    { id: 'upload', label: 'Import', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 4l3-3 3 3M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: 'history', label: 'History', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
    { id: 'settings', label: 'Settings', icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
  ].filter((item) => {
    if (item.id === "founder") return founderOpsEnabled;
    if (item.id === "admin") return adminEnabled;
    return true;
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', transform: 'translateZ(0)' }} />
      <div
        style={isMobile
          ? {
              position: 'fixed',
              left: 12,
              right: 12,
              top: `calc(${safeTop} + 18px)`,
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 178px)',
              zIndex: 201,
              borderRadius: 22,
              background: `${c.surf}F6`,
              backdropFilter: 'blur(18px)',
              boxShadow: '0 18px 42px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              padding: 18,
              gap: 8,
              transform: 'translateZ(0)',
              border: `1px solid ${c.border}`,
              maxHeight: `calc(100dvh - ${safeTop} - env(safe-area-inset-bottom, 0px) - 206px)`,
              overflowY: 'auto',
            }
          : {
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100%',
              width: 320,
              background: c.surf,
              zIndex: 201,
              boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              padding: 24,
              gap: 8,
              transform: 'translateZ(0)',
            }}
      >
        {isMobile && <div style={{ width: 40, height: 4, borderRadius: 999, background: c.border2, margin: '2px auto 6px' }} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              Signed in
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {signedInTitle}
            </div>
            {!!signedInMeta && (
              <div style={{ fontSize: 12, color: c.tx2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {signedInMeta}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.tx2, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>x</button>
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              navigateTo(item.id);
              onClose();
            }}
            style={{ padding: '16px 18px', borderRadius: 14, border: 'none', background: page === item.id ? c.acD : c.surf2, color: page === item.id ? c.ac : c.tx, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', transition: 'background 0.15s' }}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>
    </>
  );
}
