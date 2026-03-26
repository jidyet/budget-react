export default function TesterToolsCard({
  palette,
  versionLabel,
  userId,
  workspaceMode,
  launchSummary,
  onCopyVersion,
  onCopyUserId,
}) {
  const c = palette;

  return (
    <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
          Tester tools
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
          Quick help for testing
        </div>
        <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
          Copy your version and account id when you report a bug so fixes are faster.
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>Version</span>
          <span style={{ fontSize: 12, color: c.tx, fontWeight: 800 }}>{versionLabel}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>Mode</span>
          <span style={{ fontSize: 12, color: c.tx, fontWeight: 800 }}>{workspaceMode === "household" ? "Household" : "Solo"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>User id</span>
          <span style={{ fontSize: 12, color: c.tx2, fontFamily: "'DM Mono',monospace", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userId || "Signed out"}
          </span>
        </div>
        {launchSummary && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
            <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>Launch pulse</span>
            <span style={{ fontSize: 12, color: c.tx, fontWeight: 800 }}>{launchSummary}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCopyVersion}
          style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
        >
          Copy version
        </button>
        <button
          type="button"
          onClick={onCopyUserId}
          disabled={!userId}
          style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: userId ? c.tx : c.muted, fontSize: 12, fontWeight: 800, cursor: userId ? "pointer" : "default", opacity: userId ? 1 : 0.65 }}
        >
          Copy user id
        </button>
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 12, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
        Testing checklist:
        <div>Open Overview, Bills, Payoff, Trends, and More.</div>
        <div>Try one add, one edit, one import, and one feedback note.</div>
        <div>If something feels off, copy your version first.</div>
      </div>
    </div>
  );
}
