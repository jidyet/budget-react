// GATE-10B.1E: pure math for TrendChart's opt-in Balance/Interest/
// Cumulative-interest mode toggle - split into its own file (not exported
// alongside the TrendChart component) so Vite Fast Refresh stays happy
// (react-refresh/only-export-components forbids a component file from also
// exporting plain functions/constants) and so it can be unit-tested
// directly without simulating a click through a renderToStaticMarkup-only
// test setup, which has no interactive DOM.
//
// A display-only transform of each point's already-computed `interest`
// field (payoffEngine's per-month total_interest, already summed elsewhere
// for estimatedInterest) - never a new engine computation. Cumulative is a
// running sum within each series, computed once per render so it always
// reflects the current windowed range, not the full unwindowed series.
export const withCumulativeInterest = (points) => {
  let running = 0;
  return points.map((point) => {
    running += Number(point.interest || 0);
    return { ...point, cumulativeInterest: running };
  });
};

export const valueForMode = (point, mode) => {
  if (mode === "Interest") return Number(point.interest || 0);
  if (mode === "Cumulative interest") return Number(point.cumulativeInterest || 0);
  return Number(point.balance || 0);
};
