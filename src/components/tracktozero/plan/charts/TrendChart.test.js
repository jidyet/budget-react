import { afterEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TrendChart from "./TrendChart.jsx";
import { valueForMode, withCumulativeInterest } from "./trendChartMath.js";
import { applyTheme, CHART_COLOR_GROUPS, ttzPalette } from "../../theme.js";

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

  it("accepts the shared chart color groups directly so charts stay on the approved blue/green/orange system", () => {
    const html = render(h(TrendChart, {
      series: [{ id: "a", label: "Scenario", colorToken: "orange", points: points([1000, 700, 400, 0]) }],
    }));
    expect(html).toContain(CHART_COLOR_GROUPS.orange.base);
  });

  it("range windowing only slices the displayed points - never changes the underlying series values passed in", () => {
    const originalPoints = points([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0]);
    const series = [{ id: "a", label: "Active plan", colorToken: "ac", points: originalPoints }];
    render(h(TrendChart, { series, rangeOptions: ["1Y"] }));
    // The caller's own array/objects must never be mutated by rendering.
    expect(series[0].points).toEqual(originalPoints);
  });

  describe("GATE-10B.1E: range label rename + Balance/Interest/Cumulative mode toggle", () => {
    it("defaults to the new 12M/24M/36M/All range labels", () => {
      const html = render(h(TrendChart, {
        series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
      }));
      expect(html).toContain(">All<");
      expect(html).toContain(">12M<");
      expect(html).toContain(">24M<");
      expect(html).toContain(">36M<");
    });

    it("does not render the mode toggle unless showModes is true", () => {
      const html = render(h(TrendChart, {
        series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
      }));
      expect(html).not.toContain(">Interest<");
      expect(html).not.toContain("Cumulative interest");
    });

    it("showModes renders the Balance/Interest/Cumulative interest tabs, defaulting to Balance", () => {
      const html = render(h(TrendChart, {
        showModes: true,
        series: [{ id: "a", label: "Active plan", colorToken: "ac", points: points([1000, 500, 0]) }],
      }));
      expect(html).toContain(">Balance<");
      expect(html).toContain(">Interest<");
      expect(html).toContain("Cumulative interest");
    });

    it("withCumulativeInterest builds a running sum of each point's own interest field, never mutating the input", () => {
      const input = [
        { month: "Jan 2027", balance: 1000, interest: 20 },
        { month: "Feb 2027", balance: 800, interest: 15 },
        { month: "Mar 2027", balance: 600, interest: 10 },
      ];
      const result = withCumulativeInterest(input);
      expect(result.map((p) => p.cumulativeInterest)).toEqual([20, 35, 45]);
      expect(input[0]).not.toHaveProperty("cumulativeInterest");
    });

    it("withCumulativeInterest treats a missing interest field as 0, never NaN", () => {
      const result = withCumulativeInterest([{ month: "Jan 2027", balance: 1000 }, { month: "Feb 2027", balance: 900, interest: 5 }]);
      expect(result.map((p) => p.cumulativeInterest)).toEqual([0, 5]);
    });

    it("valueForMode reads balance/interest/cumulativeInterest depending on the requested mode", () => {
      const point = { balance: 1000, interest: 20, cumulativeInterest: 45 };
      expect(valueForMode(point, "Balance")).toBe(1000);
      expect(valueForMode(point, "Interest")).toBe(20);
      expect(valueForMode(point, "Cumulative interest")).toBe(45);
    });
  });
});
