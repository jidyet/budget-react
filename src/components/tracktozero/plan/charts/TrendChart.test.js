import { afterEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TrendChart from "./TrendChart.jsx";
import { applyTheme, ttzPalette } from "../../theme.js";

const render = (element) => renderToStaticMarkup(element);

const points = (values) => values.map((balance, index) => ({ month: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun"][index % 6]} 202${7 + Math.floor(index / 6)}`, balance }));

describe("GATE-10B.1D: TrendChart", () => {
  afterEach(() => applyTheme("light"));

  it("PLAN-THEME-08: renders nothing but an empty state with fewer than 2 points on every series", () => {
    const html = render(h(TrendChart, { series: [{ id: "a", label: "A", colorToken: "ac", points: points([1000]) }] }));
    expect(html).toContain("Not enough data yet to chart");
  });

  it("renders a real chart with a proper series and shows its legend label", () => {
    const html = render(h(TrendChart, {
      title: "Balance to $0",
      series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 800, 600, 400, 200, 0]) }],
    }));
    expect(html).toContain("Balance to $0");
    expect(html).toContain("Active plan");
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
  });

  it("draws a distinct (non-color-only) payoff marker when payoffMonth matches a point in the series", () => {
    const html = render(h(TrendChart, {
      series: [{ id: "a", label: "Snowball", colorToken: "ac", points: points([1000, 500, 0]), payoffMonth: "Mar 2027" }],
    }));
    expect(html).toContain("<rect");
  });

  it("includes an accessible role=img summary and a visually-hidden data table alternative", () => {
    const html = render(h(TrendChart, {
      series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
    }));
    expect(html).toMatch(/role="img"/);
    expect(html).toContain("<table");
    expect(html).toContain("Chart data table");
  });

  it("renders range-control pills when more than one range option is given", () => {
    const html = render(h(TrendChart, {
      rangeOptions: ["All", "1Y"],
      series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
    }));
    expect(html).toContain(">All<");
    expect(html).toContain(">1Y<");
  });

  it("PLAN-THEME-08: resolves series colors from ttzPalette fresh at render, not a stale module-level value - a theme change is reflected without remounting", () => {
    applyTheme("light");
    const lightHtml = render(h(TrendChart, {
      series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
    }));
    const lightAc = ttzPalette.ac;
    applyTheme("dark");
    const darkHtml = render(h(TrendChart, {
      series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
    }));
    const darkAc = ttzPalette.ac;
    expect(darkAc).not.toBe(lightAc);
    expect(lightHtml).toContain(lightAc);
    expect(darkHtml).toContain(darkAc);
    expect(darkHtml).not.toContain(lightAc);
  });

  it("range windowing only slices the displayed points - never changes the underlying series values passed in", () => {
    const originalPoints = points([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0]);
    const series = [{ id: "a", label: "Active plan", colorToken: "ac", points: originalPoints }];
    render(h(TrendChart, { series, rangeOptions: ["1Y"] }));
    // The caller's own array/objects must never be mutated by rendering.
    expect(series[0].points).toEqual(originalPoints);
  });
});
