import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function Tabs({ items = [], activeKey, onChange, label = "Tabs" }) {
  const palette = ttzPalette;
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        padding: 6,
        borderRadius: 18,
        border: `1px solid ${palette.waD || palette.border2}`,
        background: palette.isDark
          ? "linear-gradient(180deg, rgba(255,180,77,0.10) 0%, rgba(13,23,38,0.92) 100%)"
          : "linear-gradient(180deg, rgba(242,153,74,0.12) 0%, rgba(255,255,255,0.96) 100%)",
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(item.key)}
            style={{
              ...TYPE_SCALE.supporting,
              minHeight: 36,
              padding: "0 14px",
              borderRadius: 12,
              border: `1px solid ${active ? palette.wa : "transparent"}`,
              background: active ? (palette.waD || palette.surf) : "transparent",
              color: active ? palette.wa : palette.tx2,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: active ? "var(--ttz-shadow-sm)" : "none",
              transition: "background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
