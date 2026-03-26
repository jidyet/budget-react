export default function InstallPromptCard({ palette, visible, onInstall, onDismiss, offlineReady }) {
  if (!visible && !offlineReady) return null;
  const c = palette;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        zIndex: 170,
        padding: "14px 16px",
        borderRadius: 18,
        border: `1px solid ${offlineReady ? c.go : c.ac}`,
        background: offlineReady ? `${c.go}14` : `${c.ac}14`,
        backdropFilter: "blur(18px)",
        boxShadow: "0 16px 36px rgba(10,20,35,0.14)",
        display: "grid",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>
          {offlineReady ? "Offline mode ready" : "Install Household Budget"}
        </div>
        <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.45, marginTop: 4 }}>
          {offlineReady
            ? "The app can reopen from your home screen and keep core pages available when your connection drops."
            : "Add it to your home screen for a full-screen app feel, faster launch, and offline support."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {visible && (
          <button type="button" onClick={onInstall} style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Install App</button>
        )}
        <button type="button" onClick={onDismiss} style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Dismiss</button>
      </div>
    </div>
  );
}
