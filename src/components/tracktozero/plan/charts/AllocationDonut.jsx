import React from "react";
import { TYPE_SCALE, ttzPalette } from "../../theme.js";
import { formatMoney as money } from "../../formatting.js";

// GATE-10B.1D: hand-rolled stroke-dasharray donut, same dependency-free
// style as TrendChart.jsx. Colors resolved from ttzPalette inside the
// render body (never a module-level constant).
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// formatPercent (formatting.js) is APR-specific (always appends " APR") -
// this is a generic share-of-total percentage, so it gets its own tiny
// formatter rather than reusing formatPercent for a value it was never
// meant to describe.
const percent = (ratio) => `${Math.round(Number(ratio || 0) * 100)}%`;

/**
 * segments: Array<{ id, label, value: number, colorToken }>
 */
export default function AllocationDonut({ segments = [], title, subtitle, centerLabel, centerSupporting, emptyState = null }) {
  const palette = ttzPalette;
  const colorFor = (token) => palette[token] || palette.ac;
  // Zero-value segments are skipped entirely - never drawn as a sliver, and
  // never inflate a color-blind-unfriendly "everything is one color" ring.
  const visible = segments.filter((s) => Number(s.value) > 0);
  const total = visible.reduce((sum, s) => sum + Number(s.value), 0);

  if (!visible.length || total <= 0) {
    return emptyState || <div style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Nothing to break down yet.</div>;
  }

  const summary = visible.map((s) => `${s.label}: ${money(s.value)} (${percent(Number(s.value) / total)})`).join(", ");

  const arcs = visible.reduce((acc, s) => {
    const fraction = Number(s.value) / total;
    const dash = fraction * CIRCUMFERENCE;
    const priorOffset = acc.length ? acc.at(-1).offset + acc.at(-1).dash : 0;
    acc.push({ ...s, dash, gap: CIRCUMFERENCE - dash, offset: priorOffset });
    return acc;
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {(title || subtitle) ? (
        <div>
          {title ? <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{title}</div> : null}
          {subtitle ? <div style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 4 }}>{subtitle}</div> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div role="img" aria-label={summary} style={{ width: 148, height: 148, position: "relative", flexShrink: 0 }}>
          <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
            <circle cx="74" cy="74" r={RADIUS} fill="none" stroke={palette.border} strokeWidth="16" />
            {arcs.map((arc) => (
              <circle
                key={arc.id}
                cx="74" cy="74" r={RADIUS}
                fill="none"
                stroke={colorFor(arc.colorToken)}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 74 74)"
              />
            ))}
          </svg>
          {(centerLabel || centerSupporting) ? (
            // A wide dollar figure (e.g. "$15,647.00") doesn't fit the ring's
            // inner hole at cardTitle size on one line - constrained width +
            // a smaller size that's allowed to wrap onto two lines instead
            // of overflowing past the ring, which is what happened before
            // this fix (found live on Avalanche's debt-composition donut).
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", justifyItems: "center", gap: 2 }}>
              {centerLabel ? (
                <div style={{ maxWidth: 92, textAlign: "center", fontFamily: "var(--ttz-font-body)", fontWeight: 800, fontSize: 15, lineHeight: 1.15, color: palette.tx, overflowWrap: "anywhere" }}>
                  {centerLabel}
                </div>
              ) : null}
              {centerSupporting ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{centerSupporting}</div> : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          {visible.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: colorFor(s.colorToken), flexShrink: 0 }} />
              <span style={{ ...TYPE_SCALE.body, color: palette.tx }}>{s.label}</span>
              <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{money(s.value)} · {percent(Number(s.value) / total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
