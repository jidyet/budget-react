export default function MobileActionBar({ palette, safeBottom, title, subtitle, actions = [], status }) {
  const c = palette;
  if (!title && !actions.length && !status) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: `calc(${safeBottom} + 96px)`,
        zIndex: 155,
        borderRadius: 20,
        border: `1px solid ${c.border}`,
        background: `${c.surf}F4`,
        backdropFilter: "blur(18px)",
        boxShadow: "0 18px 40px rgba(10,20,35,0.16)",
        padding: "14px 14px 12px",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {title && <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 12, color: c.muted, marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        {status ? <div style={{ flexShrink: 0 }}>{status}</div> : null}
      </div>
      {!!actions.length && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(actions.length, 2)}, minmax(0, 1fr))`, gap: 8 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              style={{
                minHeight: 44,
                padding: "10px 12px",
                borderRadius: 14,
                border: action.tone === "primary" ? "none" : `1px solid ${c.border2}`,
                background: action.tone === "primary" ? c.ac : c.surf2,
                color: action.tone === "primary" ? "#001014" : c.tx,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {action.icon || null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
