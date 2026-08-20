import React, { useState } from "react";
import { TYPE_SCALE, ttzPalette } from "../../theme.js";
import { formatMoney as money } from "../../formatting.js";
import { valueForMode, withCumulativeInterest } from "./trendChartMath.js";

// GATE-10B.1D: same dependency-free hand-rolled-SVG style as Home's
// TrajectoryChart (HomeCommandCenter.jsx) - no chart library exists in this
// project and the TrackToZero V2 bundle budget is already tight. Colors are
// resolved from ttzPalette INSIDE this render function, never hoisted to a
// module-level constant - GATE-10B.1C found and fixed exactly that bug once
// already in Home (a stale color baked in at import time never followed a
// later theme change); this file must not reintroduce it.
const parseMonthLabelToTime = (label) => {
  const date = new Date(`1 ${label}`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

// GATE-10B.1E: renamed from 1Y/3Y/5Y/All to 12M/24M/36M/All to match every
// reference design's own labels - same slicing logic/months, cosmetic only.
const RANGE_MONTHS = { "12M": 12, "24M": 24, "36M": 36, All: Infinity };

const DEFAULT_RANGE_OPTIONS = ["All", "12M", "24M", "36M"];

const CHART_MODES = ["Balance", "Interest", "Cumulative interest"];

// series[i].points is windowed for DISPLAY ONLY (a leading slice - this is a
// forward projection, not historical, so "1Y" means "the next 12 months
// from the start of this projection," not a trailing window) - the
// underlying numbers this chart was built from are never recomputed by
// changing the range.
const applyRangeWindow = (series, range) => {
  const rangeMonths = RANGE_MONTHS[range] ?? Infinity;
  if (!Number.isFinite(rangeMonths)) return series;
  return series.map((s) => ({ ...s, points: s.points.slice(0, rangeMonths + 1) }));
};

function AccessibleSummaryTable({ series }) {
  return (
    <table
      style={{
        position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
        clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
      }}
    >
      <caption>Chart data table</caption>
      <thead>
        <tr><th scope="col">Series</th><th scope="col">Starting balance</th><th scope="col">Latest shown balance</th><th scope="col">Payoff month</th></tr>
      </thead>
      <tbody>
        {series.map((s) => (
          <tr key={s.id}>
            <td>{s.label}</td>
            <td>{money(s.points[0]?.balance || 0)}</td>
            <td>{money(s.points.at(-1)?.balance || 0)}</td>
            <td>{s.payoffMonth || "Not reached in this window"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * series: Array<{
 *   id, label,
 *   colorToken: keyof ttzPalette ("ac"|"info"|"go"|"wa"|"muted"|...),
 *   points: Array<{ month: string, balance: number }>,
 *   dashed?: boolean,      // hypothetical/scenario lines
 *   payoffMonth?: string,  // draws a distinct (non-color-only) marker
 * }>
 */
// GATE-10B.1E: an opt-in Balance/Interest/Cumulative-interest tab row (My
// Plan, Snowball references) - see trendChartMath.js for the underlying
// per-mode value/cumulative-sum math (kept in its own file so this
// component file can stay component-only for Fast Refresh, and so that math
// can be unit-tested directly).
export default function TrendChart({ series = [], rangeOptions = DEFAULT_RANGE_OPTIONS, title, subtitle, emptyState = null, showModes = false }) {
  const palette = ttzPalette;
  const [range, setRange] = useState(rangeOptions[0] || "All");
  const [mode, setMode] = useState(CHART_MODES[0]);
  const activeMode = showModes ? mode : "Balance";

  const usableSeries = series.filter((s) => Array.isArray(s.points) && s.points.length > 1);
  const windowedRaw = applyRangeWindow(usableSeries, range);
  const windowed = activeMode === "Balance" ? windowedRaw : windowedRaw.map((s) => ({ ...s, points: withCumulativeInterest(s.points) }));
  const allPoints = windowed.flatMap((s) => s.points);

  if (!usableSeries.length || !allPoints.length) {
    return emptyState || (
      <div style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Not enough data yet to chart.</div>
    );
  }

  const width = 780;
  const height = 260;
  const pad = 28;
  const times = allPoints.map((p) => parseMonthLabelToTime(p.month)).filter((t) => t != null);
  const minX = Math.min(...times);
  const maxX = Math.max(...times);
  const maxY = Math.max(...allPoints.map((p) => valueForMode(p, activeMode)), 1);
  const scaleX = (point) => {
    const t = parseMonthLabelToTime(point.month);
    if (t == null || maxX === minX) return pad;
    return pad + ((t - minX) / (maxX - minX)) * (width - pad * 2);
  };
  const scaleY = (point) => height - pad - (valueForMode(point, activeMode) / maxY) * (height - pad * 2);
  const drawPath = (points) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(point)} ${scaleY(point)}`).join(" ");

  const summary = windowed
    .map((s) => `${s.label}: starts at ${money(s.points[0]?.balance || 0)}${s.payoffMonth ? `, reaches $0 in ${s.payoffMonth}` : ""}.`)
    .join(" ");

  const colorFor = (token) => palette[token] || palette.ac;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {(title || subtitle || rangeOptions.length > 1) ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            {title ? <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{title}</div> : null}
            {subtitle ? <div style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          {rangeOptions.length > 1 ? (
            <div role="group" aria-label="Chart time range" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRange(option)}
                  aria-pressed={range === option}
                  className="ttz-focus-ring"
                  style={{
                    border: `1px solid ${range === option ? palette.ac : palette.border2}`,
                    background: range === option ? palette.acS : "transparent",
                    color: range === option ? palette.ac : palette.tx2,
                    borderRadius: 999,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showModes ? (
        <div role="group" aria-label="Chart value" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHART_MODES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className="ttz-focus-ring"
              style={{
                border: `1px solid ${mode === option ? palette.ac : palette.border2}`,
                background: mode === option ? palette.acS : "transparent",
                color: mode === option ? palette.ac : palette.tx2,
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      <div role="img" aria-label={summary} style={{ position: "relative" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={palette.border2} strokeWidth="1" />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke={palette.border2} strokeWidth="1" />

          {windowed.map((s) => (
            <path
              key={s.id}
              d={drawPath(s.points)}
              fill="none"
              stroke={colorFor(s.colorToken)}
              strokeWidth={s.dashed ? 3 : 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "8 8" : undefined}
            />
          ))}

          {windowed.map((s) => {
            const payoffPoint = s.payoffMonth ? s.points.find((p) => p.month === s.payoffMonth) : null;
            if (!payoffPoint) return null;
            const cx = scaleX(payoffPoint);
            const cy = scaleY(payoffPoint);
            // A distinct rotated-square (diamond) marker - never color-only,
            // so a color-blind viewer can still spot a payoff event.
            return (
              <rect
                key={`${s.id}-payoff`}
                x={cx - 5} y={cy - 5} width={10} height={10}
                fill={palette.surf}
                stroke={colorFor(s.colorToken)}
                strokeWidth="2.5"
                transform={`rotate(45 ${cx} ${cy})`}
              />
            );
          })}
        </svg>
        <AccessibleSummaryTable series={windowed} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {windowed.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 18, height: 0, borderTop: `${s.dashed ? "3px dashed" : "4px solid"} ${colorFor(s.colorToken)}` }} />
            <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
