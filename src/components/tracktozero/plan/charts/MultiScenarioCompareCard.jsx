import React from "react";
import Card from "../../ui/Card.jsx";
import { TYPE_SCALE, ttzPalette } from "../../theme.js";
import { formatMoney as money } from "../../formatting.js";
import TrendChart from "./TrendChart.jsx";

// GATE-10B.1D: the one deliberate shared-component extraction beyond the
// two chart primitives - Compare's "Scenario Compare" section and Saved's
// "Compare Top 3" both need literally the same N-way (2-3 entries)
// comparison rendering, not a redesign of either page. Each entry's
// `previewResult` is expected to be a buildPlanPreviewFromDebts-shaped
// object (projectedZeroDate/monthsToZero/estimatedInterest/projection),
// already fetched by the caller - this component performs no simulation of
// its own.
const COLOR_TOKENS = ["ac", "go", "info", "wa"];

/**
 * entries: Array<{ label, previewResult }> (2-3 entries)
 */
export default function MultiScenarioCompareCard({ title, subtitle, entries = [] }) {
  const palette = ttzPalette;
  const usable = entries.filter((entry) => entry?.previewResult);
  if (usable.length < 2) {
    return (
      <Card variant="default" style={{ padding: 24 }}>
        <div style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>Not enough scenarios to compare yet.</div>
      </Card>
    );
  }

  const series = usable.map((entry, index) => ({
    id: `scenario-${index}`,
    label: entry.label,
    colorToken: COLOR_TOKENS[index % COLOR_TOKENS.length],
    points: entry.previewResult.projection.map((row) => ({ month: row.month, balance: row.remaining_debt })),
    dashed: index > 0,
    payoffMonth: entry.previewResult.projectedZeroDate || undefined,
  }));

  return (
    <Card variant="default" style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 16 }}>
        {(title || subtitle) ? (
          <div>
            {title ? <div style={{ ...TYPE_SCALE.overline, color: palette.muted }}>{title}</div> : null}
            {subtitle ? <div style={{ ...TYPE_SCALE.body, color: palette.tx2, marginTop: 4 }}>{subtitle}</div> : null}
          </div>
        ) : null}

        <TrendChart series={series} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {usable.map((entry, index) => (
            <div key={entry.label} style={{ padding: 12, borderRadius: 12, background: palette.surf2, border: `1px solid ${palette.border}` }}>
              <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{entry.label}</div>
              <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 700, marginTop: 4 }}>
                {entry.previewResult.projectedZeroDate || "Not reached"}
              </div>
              <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 2 }}>
                {money(entry.previewResult.estimatedInterest || 0)} interest · {entry.previewResult.monthsToZero || 0} months
              </div>
              {index === 0 ? <div style={{ ...TYPE_SCALE.caption, color: palette.muted, marginTop: 2 }}>Baseline</div> : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
