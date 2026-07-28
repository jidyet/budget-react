import { BILL_FILTER_OPTIONS } from "../../services/billModel";

const chipStyle = (active, c) => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? c.ac : c.border2}`,
  background: active ? `${c.ac}14` : c.surf,
  color: active ? c.ac : c.tx2,
  fontSize: 12,
  fontWeight: active ? 900 : 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
});

export default function BillFilterBar({
  c,
  filterKey = "all",
  setFilterKey = () => {},
  ownerFilter = "All",
  setOwnerFilter = () => {},
  ownerOptions = [],
  showOwnerFilters = true,
  compact = false,
}) {
  const filterChips = BILL_FILTER_OPTIONS;
  const owners = ["All", ...(ownerOptions || []).filter((option) => option && option !== "All")];

  return (
    <div style={{ display: "grid", gap: compact ? 8 : 10 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "thin" }}>
        {filterChips.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilterKey(option.key)}
            style={chipStyle(filterKey === option.key, c)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {showOwnerFilters && owners.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "thin" }}>
          {owners.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setOwnerFilter(option)}
              style={chipStyle(ownerFilter === option, c)}
            >
              {option === "All" ? "By person" : option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
