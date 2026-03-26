import { useMemo, useState } from "react";
import EmptyState from "../feedback/EmptyState";

export default function HouseholdActivityFeed({ palette, activity = [], loading }) {
  const c = palette;
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => {
    const seen = new Set();
    return activity.filter((item) => {
      const key = `${item.title}|${item.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activity]);
  const visibleItems = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;
  return (
    <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:18, padding:"16px 18px", display:"grid", gap:12 }}>
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:c.muted, marginBottom:4 }}>Recent updates</div>
        <div style={{ fontSize:13, color:c.tx2 }}>What changed since the last time you checked.</div>
      </div>
      {loading ? (
        <div style={{ fontSize:13, color:c.muted }}>Loading updates...</div>
      ) : !items.length ? (
        <EmptyState palette={c} title="No updates yet" message="The shared journey starts with the next small move." />
      ) : (
        <div style={{ display:"grid", gap:8 }}>
          {visibleItems.map((item) => (
            <div key={item.id} style={{ padding:"12px 14px", borderRadius:14, background:c.surf2, border:`1px solid ${c.border}` }}>
              <div style={{ fontSize:13, fontWeight:700, color:c.tx, marginBottom:4 }}>{item.title}</div>
              <div style={{ fontSize:12, color:c.tx2, marginBottom:4 }}>{item.detail}</div>
              <div style={{ fontSize:11, color:c.muted }}>{item.timestamp}</div>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              style={{ justifySelf:"start", padding:"8px 12px", borderRadius:999, border:`1px solid ${c.border2}`, background:c.surf2, color:c.tx, fontSize:12, fontWeight:800, cursor:"pointer" }}
            >
              {expanded ? "Show less" : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
