export default function SyncStatusBar({ palette, isOnline, hasPendingSync, isLocalUser, offlineReady }) {
  const c = palette;
  const state = !isOnline
    ? { label: "Offline right now", detail: "Your next save will sync when you reconnect.", tone: c.wa }
    : hasPendingSync
      ? { label: "Syncing your latest changes", detail: "You are almost caught up.", tone: c.ac }
      : isLocalUser
        ? { label: "Local preview", detail: "This device is saving here for now.", tone: c.muted }
        : { label: "You're synced", detail: offlineReady ? "Ready to reopen fast and keep going." : "Everything is up to date.", tone: c.go };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${state.tone}40`,
        background: `${state.tone}12`,
        marginBottom: 12,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: state.tone, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: state.tone }}>{state.label}</div>
        <div style={{ fontSize: 12, color: c.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.detail}</div>
      </div>
    </div>
  );
}

