export default function MoreDrawer({
  open,
  page,
  palette,
  isMobile,
  safeTop = "env(safe-area-inset-top, 0px)",
  currentUserLabel = "",
  userProfile = {},
  workspaceMode = "solo",
  householdProfile = {},
  onClose,
  navigateTo,
  founderOpsEnabled = false,
  adminEnabled = false,
  onSignOut,
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

  // Admin section items — only shown when adminEnabled is true.
  // Founder ops is an extra gate within the admin section.
  const adminItems = [
    { id: "admin", label: "Admin", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.25" /><path d="M1 12c0-2.21 1.79-4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="10" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.25" /><path d="M10 8v1.5l1 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    founderOpsEnabled
      ? { id: "founder", label: "Founder ops", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M2 11.5h10M3 11.5V4.5l2 1.2 2-2.2 2 2.2 2-1.2v7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 11.5V8.5h4v3" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /></svg> }
      : null,
    { id: "beta", label: "Beta help", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5 2v3.25c0 2.9-2.08 4.94-5 5.75-2.92-.81-5-2.85-5-5.75V3.5l5-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /><path d="M5.7 6.9l.9.9 1.9-2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  ].filter(Boolean);

  const sections = [
    adminEnabled
      ? { label: "Admin Tools", items: adminItems }
      : null,
    {
      label: "Account",
      items: [
        { id: "settings", label: "Settings", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
        { id: "household", label: "Household", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M1.5 7.5L7 2.5l5.5 5v4.5h-3.5v-3h-4v3H1.5V7.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /></svg> },
        { id: "notifications", label: "Notifications", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5a2.5 2.5 0 00-2.5 2.5v1.1c0 .52-.18 1.03-.52 1.43L3 8v.75h8V8l-1-.47a2.24 2.24 0 01-.5-1.43V4A2.5 2.5 0 007 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M5.5 10.25a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg> },
        { id: "privacy", label: "Privacy", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5 2v2.75c0 3.05-2.04 5.04-5 6.25-2.96-1.21-5-3.2-5-6.25V3.5l5-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /></svg> },
      ],
    },
    {
      label: "Tools",
      items: [
        { id: "upload", label: "Import", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 4l3-3 3 3M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> },
        { id: "history", label: "History", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
      ],
    },
    {
      label: "Support",
      items: [
        { id: "support", label: "Help & FAQ", icon: <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" /><path d="M5.8 5.55a1.3 1.3 0 112.12 1.02c-.5.41-.92.68-.92 1.43" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="7" cy="10.15" r=".7" fill="currentColor" /></svg> },
      ],
    },
  ].filter(Boolean);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", transform: "translateZ(0)" }} />
      <div
        style={isMobile
          ? {
              position: "fixed",
              left: 12,
              right: 12,
              top: `calc(${safeTop} + 18px)`,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 178px)",
              zIndex: 201,
              borderRadius: 22,
              background: `${c.surf}F6`,
              backdropFilter: "blur(18px)",
              boxShadow: "0 18px 42px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              padding: "18px 18px 12px",
              transform: "translateZ(0)",
              border: `1px solid ${c.border}`,
              maxHeight: `calc(100dvh - ${safeTop} - env(safe-area-inset-bottom, 0px) - 206px)`,
              overflowY: "auto",
            }
          : {
              position: "fixed",
              top: 0,
              right: 0,
              height: "100%",
              width: 320,
              background: c.surf,
              zIndex: 201,
              boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              padding: "24px 24px 16px",
              transform: "translateZ(0)",
              overflowY: "auto",
            }}
      >
        {isMobile && <div style={{ width: 40, height: 4, borderRadius: 999, background: c.border2, margin: "2px auto 10px" }} />}

        {/* Identity header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
              Signed in
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {signedInTitle}
            </div>
            {!!signedInMeta && (
              <div style={{ fontSize: 12, color: c.tx2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {signedInMeta}
              </div>
            )}
            {workspaceMode === "household" && householdProfile?.activeHousehold?.name && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "3px 9px", borderRadius: 999, background: `${c.ac}18`, border: `1px solid ${c.ac}44` }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M1.5 7.5L7 2.5l5.5 5v4.5h-3.5v-3h-4v3H1.5V7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" style={{ color: c.ac }} /></svg>
                <span style={{ fontSize: 11, fontWeight: 800, color: c.ac }}>{householdProfile.activeHousehold.name}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: c.tx2, fontSize: 22, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
          {sections.map((section, si) => (
            <div key={section.label}>
              <div style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: c.muted,
                paddingLeft: 6,
                marginBottom: 6,
              }}>
                {section.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { navigateTo(item.id); onClose(); }}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: page === item.id ? c.acD : "transparent",
                      color: page === item.id ? c.ac : c.tx,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      transition: "background 0.12s",
                    }}
                  >
                    <span style={{ color: page === item.id ? c.ac : c.tx2, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ))}
              </div>
              {si < sections.length - 1 && (
                <div style={{ height: 1, background: c.border, marginTop: 16 }} />
              )}
            </div>
          ))}
        </div>

        {/* Sign out */}
        {onSignOut && (
          <>
            <div style={{ height: 1, background: palette.border, marginTop: 8 }} />
            <button
              type="button"
              onClick={() => { onSignOut(); onClose(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "12px 14px",
                background: "none",
                border: "none",
                borderRadius: 12,
                color: palette.wa,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Instrument Sans',sans-serif",
                cursor: "pointer",
                textAlign: "left",
                marginTop: 4,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Sign out
            </button>
          </>
        )}
      </div>
    </>
  );
}
