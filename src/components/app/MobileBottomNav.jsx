export default function MobileBottomNav({ navItems, page, palette, showMoreDrawer, setShowMoreDrawer, navigateTo, safeBottom }) {
  const c = palette;

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: `calc(${safeBottom} + 10px)`,
        zIndex: 165,
        display: "grid",
        gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
        gap: 8,
        padding: "10px",
        borderRadius: 22,
        border: `1px solid ${c.border}`,
        background: `${c.bg}F2`,
        backdropFilter: "blur(18px)",
        boxShadow: "0 18px 40px rgba(10,20,35,0.18)",
      }}
    >
      {navItems.map(({ id, label, icon, isMore }) => {
        const morePageActive = ["upload", "history", "settings"].includes(page);
        const active = isMore ? (showMoreDrawer || morePageActive) : page === id;
        return (
          <button
            key={id}
            type="button"
            onClick={isMore ? () => setShowMoreDrawer((value) => !value) : () => navigateTo(id)}
            style={{
              minHeight: 58,
              border: "none",
              borderRadius: 16,
              background: active ? `${c.ac}18` : "transparent",
              color: active ? c.ac : c.tx2,
              display: "grid",
              justifyItems: "center",
              alignContent: "center",
              gap: 4,
              cursor: "pointer",
              fontFamily: "'Instrument Sans',sans-serif",
              fontSize: 11,
              fontWeight: active ? 800 : 700,
              boxShadow: active ? `inset 0 0 0 1px ${c.ac}40` : "none",
              transition: "transform .18s, background .18s, color .18s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26 }}>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
