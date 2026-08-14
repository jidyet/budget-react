import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// The four current destinations (UX-1 Part 24). Deliberately not a raw
// <button> group with form-button styling - real <nav> landmark, aria-current
// for the active tab, keyboard-focusable, no icon library dependency added.
// "Activity" is a known future destination (Part 24) - not added here since
// it has no screen yet (Part 5: don't build components with no consumer).
const ITEMS = [
  { key: "home", label: "Home" },
  { key: "debts", label: "Debts" },
  { key: "plan", label: "Plan" },
  { key: "settings", label: "Settings" },
];

export default function PrimaryNav({ activeTab, onSelect, orientation = "horizontal" }) {
  const palette = ttzPalette;
  return (
    <nav aria-label="Primary" style={{ display: "flex", flexDirection: orientation === "vertical" ? "column" : "row", gap: 4 }}>
      {ITEMS.map((item) => {
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.key)}
            style={{
              ...TYPE_SCALE.supporting,
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
          </button>
        );
      })}
    </nav>
  );
}
