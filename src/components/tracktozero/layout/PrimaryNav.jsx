import React from "react";
import Badge from "../ui/Badge.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// The current destinations (UX-1 Part 24, REVIEW-1B Part 3). Deliberately
// not a raw <button> group with form-button styling - real <nav> landmark,
// aria-current for the active tab, keyboard-focusable, no icon library
// dependency added. Review sits right after Home since it directly affects
// how much the Debts/Plan numbers can be trusted. "Activity" is a known
// future destination - not added here since it has no screen yet (Part 5:
// don't build components with no consumer).
const ITEMS = [
  { key: "home", label: "Home" },
  { key: "review", label: "Review" },
  { key: "debts", label: "Debts" },
  { key: "plan", label: "Plan" },
  { key: "settings", label: "Settings" },
];

export default function PrimaryNav({ activeTab, onSelect, orientation = "horizontal", badges = {} }) {
  const palette = ttzPalette;
  return (
    <nav aria-label="Primary" style={{ display: "flex", flexDirection: orientation === "vertical" ? "column" : "row", gap: 4 }}>
      {ITEMS.map((item) => {
        const active = activeTab === item.key;
        const count = badges[item.key] || 0;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.key)}
            style={{
              ...TYPE_SCALE.supporting,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: "var(--ttz-radius-sm, 8px)",
              border: "1px solid transparent",
              background: active ? palette.acS || palette.surf2 : "transparent",
              color: active ? palette.ac : palette.tx2,
              cursor: "pointer",
              textAlign: orientation === "vertical" ? "left" : "center",
            }}
          >
            {item.label}
            {/* Open review count only - never an alarming red/danger badge for
                ordinary review work (REVIEW-1B Part 3). */}
            {count > 0 ? <Badge tone="warning">{count}</Badge> : null}
          </button>
        );
      })}
    </nav>
  );
}
