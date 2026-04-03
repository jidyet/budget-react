import HeadsUpCard from "./HeadsUpCard";

// Renders as a compact chip/card strip — no full card wrapper competing with NextMove
export default function HeadsUpList({ palette, items = [] }) {
  if (!items.length) return null;

  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
      {items.map((item) => <HeadsUpCard key={item.id} palette={palette} item={item} />)}
    </div>
  );
}
