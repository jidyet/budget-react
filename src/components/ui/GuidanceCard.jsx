export default function GuidanceCard({
  palette,
  title,
  instruction,
  result,
  action = null,
  icon = null,
}) {
  const c = palette;

  return (
    <div
      style={{
        background: c.surf2,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: "14px 16px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {icon ? (
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: c.acD,
              color: c.ac,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.tx, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55 }}>
            <strong style={{ color: c.tx }}>Go here:</strong> {instruction}
          </div>
          <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55 }}>
            <strong style={{ color: c.tx }}>What happens:</strong> {result}
          </div>
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
