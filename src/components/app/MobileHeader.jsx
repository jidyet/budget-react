import { BRAND_WORDMARK } from "../../config/brand";

// ── Icon helpers ─────────────────────────────────────────────────────────────

const IcoSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const IcoMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const IcoDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IcoBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// ── Icon action button ────────────────────────────────────────────────────────

function ActionBtn({ onClick, title, active = false, c, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: `1.5px solid ${active ? c.ac : c.border}`,
        background: active ? c.acD : c.surf2,
        color: active ? c.ac : c.tx2,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

// ── MobileHeader ──────────────────────────────────────────────────────────────

/**
 * MobileHeader — full-width sticky header for mobile.
 *
 * Props:
 *   palette           – app colour palette
 *   safeTop           – CSS env() string for notch/status bar
 *   today             – Date object
 *   isOnline          – bool
 *   hasPendingSync    – bool
 *   isLocalUser       – bool
 *   hasAuthenticatedUser – bool
 *   theme             – "dark" | "light"
 *   onToggleTheme     – () => void
 *   onExportData      – () => void   ← real export handler
 *   onOpenNotifications – () => void
 *   onOpenMenu        – () => void   ← opens MoreDrawer
 *   onSignOut         – () => void
 *   signedInInitial   – string  e.g. "J"
 *   signedInColor     – string  e.g. "#3b82f6"
 *   signedInLabel     – string  e.g. "Jane"
 */
export default function MobileHeader({
  palette,
  safeTop = "env(safe-area-inset-top, 0px)",
  fixed = true,
  hasAuthenticatedUser,
  theme,
  onToggleTheme,
  onExportData,
  onOpenNotifications,
  signedInInitial = "?",
  signedInColor = "#3b82f6",
  signedInLabel = "",
}) {
  const c = palette;

  return (
    <div
      style={{
        position: fixed ? "fixed" : "relative",
        top: fixed ? 0 : "auto",
        left: fixed ? 0 : "auto",
        right: fixed ? 0 : "auto",
        zIndex: 40,
        width: "100%",
        boxSizing: "border-box",
        background: `${c.bg}F5`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid ${c.border}`,
        paddingTop: `calc(${safeTop} + 20px)`,
        paddingBottom: 20,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {/* Single row: logo left · icons right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 1,
            display: "flex",
            alignItems: "baseline",
          }}
        >
          {BRAND_WORDMARK.map((part) => (
            <span key={part.text} style={{ color: part.color }}>
              {part.text}
            </span>
          ))}
        </div>

        {/* Icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <ActionBtn
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            c={c}
          >
            {theme === "dark" ? <IcoSun /> : <IcoMoon />}
          </ActionBtn>

          <ActionBtn onClick={onExportData} title="Export data" c={c}>
            <IcoDownload />
          </ActionBtn>

          {hasAuthenticatedUser && (
            <ActionBtn onClick={onOpenNotifications} title="Notifications" c={c}>
              <IcoBell />
            </ActionBtn>
          )}

          {hasAuthenticatedUser && (
            <div
              title={signedInLabel}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: signedInColor,
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                fontWeight: 800,
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              {signedInInitial}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
