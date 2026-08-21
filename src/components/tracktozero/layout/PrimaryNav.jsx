import React from "react";
import Badge from "../ui/Badge.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// The current destinations (UX-1 Part 24, REVIEW-1B Part 3). Deliberately
// not a raw <button> group with form-button styling - real <nav> landmark,
// aria-current for the active tab, keyboard-focusable, no icon library
// dependency added. Review sits right after Home since it directly affects
// how much the Debts/Plan numbers can be trusted. Activity (UX-7) sits after
// Plan, before Settings - a history/trust-building surface, not part of the
// primary Home -> Review -> Debts -> Plan action flow.
const ITEMS = [
  { key: "home", label: "Home" },
  { key: "review", label: "Review" },
  { key: "debts", label: "Debts" },
  { key: "plan", label: "Plan" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
];

export default function PrimaryNav({ activeTab, onSelect, orientation = "horizontal", badges = {} }) {
  const palette = ttzPalette;
  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        flexDirection: orientation === "vertical" ? "column" : "row",
        gap: 6,
        padding: orientation === "vertical" ? 0 : 4,
        borderRadius: "var(--ttz-radius-lg, 16px)",
        background: palette.bg === "#08111d" ? "rgba(13,23,38,0.74)" : "rgba(255,255,255,0.62)",
        border: `1px solid ${palette.border}`,
        boxShadow: "var(--ttz-shadow-sm)",
        backdropFilter: "blur(12px)",
      }}
    >
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
              padding: "10px 14px",
              borderRadius: "var(--ttz-radius-md, 12px)",
              border: "1px solid transparent",
              background: active ? (palette.bg === "#08111d" ? "rgba(24,167,225,0.12)" : "rgba(24,167,225,0.08)") : "transparent",
              color: active ? palette.tx : palette.tx2,
              cursor: "pointer",
              textAlign: orientation === "vertical" ? "left" : "center",
              position: "relative",
            }}
          >
            {item.label}
            {/* Open review count only - never an alarming red/danger badge for
                ordinary review work (REVIEW-1B Part 3). */}
            {count > 0 ? <Badge tone="info">{count}</Badge> : null}
            {active ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  bottom: -5,
                  height: 3,
                  borderRadius: 999,
                  background: palette.ac,
                }}
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
