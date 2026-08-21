import React from "react";
import { TYPE_SCALE, chartColor, ttzPalette } from "../../theme.js";
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
  const colorFor = (token) => chartColor(token, "base", palette);
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
            // Anchor the copy to the actual donut center. This avoids any
            // perceived left-drift from full-box centering and keeps both
            // lines visually locked to the ring hole.
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 88,
                minHeight: 72,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 2,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            >
              {centerLabel ? (
                <div
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontFamily: "var(--ttz-font-body)",
                    fontWeight: 800,
                    fontSize: 13,
                    lineHeight: 1.05,
                    letterSpacing: "-0.01em",
                    color: palette.tx,
                    whiteSpace: "nowrap",
                  }}
                >
                  {centerLabel}
                </div>
              ) : null}
              {centerSupporting ? (
                <div
                  style={{
                    ...TYPE_SCALE.caption,
                    color: palette.tx2,
                    textAlign: "center",
                    lineHeight: 1.1,
                    width: "100%",
                  }}
                >
                  {centerSupporting}
                </div>
              ) : null}
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
