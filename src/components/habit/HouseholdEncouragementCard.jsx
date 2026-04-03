export default function HouseholdEncouragementCard({ palette, activity = [], memberCount = 0, momentum }) {
  const c = palette;
  const items = activity
    .filter(Boolean)
    .reduce((list, item) => {
      const key = `${item.title}|${item.detail}`;
      if (list.some((entry) => `${entry.title}|${entry.detail}` === key)) return list;
      return [...list, item];
    }, [])
    .slice(0, 2);
  const latest = items[0];

  return (
    <div style={{
      background: `linear-gradient(135deg, ${c.in}18, ${c.surf} 40%, ${c.surf2})`,
      border: `1.5px solid ${c.in}40`,
      borderRadius: 20,
      padding: "16px 18px",
      display: "grid",
      gap: 10,
      boxShadow: `0 12px 28px ${c.in}14`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.in }}>Progress</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>
        {latest?.title || (memberCount > 1 ? "You're both moving" : "You're synced")}
      </div>
      <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
        {latest?.detail || (momentum?.weeklyHandled > 0 ? "Someone updated this week." : "One small check-in keeps the week alive.")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ padding: "6px 9px", borderRadius: 999, background: `${c.in}12`, border: `1px solid ${c.in}33`, fontSize: 11, fontWeight: 800, color: c.in }}>
          {latest ? "One update today" : "Shared progress"}
        </span>
        <span style={{ padding: "6px 9px", borderRadius: 999, background: `${c.surf}CC`, border: `1px solid ${c.border}`, fontSize: 11, fontWeight: 800, color: c.tx2 }}>
          {momentum?.weeklyHandled || 0} moved this week
        </span>
      </div>
      {items.length > 1 && (
        <div style={{ display: "grid", gap: 6 }}>
          {items.slice(1).map((item) => (
            <div key={`${item.id || item.title}-${item.detail || ""}`} style={{ fontSize: 12, color: c.tx2, lineHeight: 1.4 }}>
              {item.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
