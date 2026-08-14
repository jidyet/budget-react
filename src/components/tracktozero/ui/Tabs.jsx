import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function Tabs({ items = [], activeKey, onChange, label = "Tabs" }) {
  const palette = ttzPalette;
  return (
    <div role="tablist" aria-label={label} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
              borderRadius: "var(--ttz-radius-sm, 8px)",
              border: `1px solid ${active ? palette.ac : palette.border}`,
              background: active ? palette.acS : palette.surf,
              color: active ? palette.ac : palette.tx2,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
