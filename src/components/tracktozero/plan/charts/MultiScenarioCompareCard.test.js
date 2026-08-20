import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MultiScenarioCompareCard from "./MultiScenarioCompareCard.jsx";

const render = (element) => renderToStaticMarkup(element);

const previewResult = (overrides = {}) => ({
  projectedZeroDate: "Jun 2028",
  monthsToZero: 24,
  estimatedInterest: 500,
  projection: [{ month: "Jan 2027", remaining_debt: 1000 }, { month: "Feb 2027", remaining_debt: 800 }],
  ...overrides,
});

describe("GATE-10B.1D: MultiScenarioCompareCard", () => {
  it("shows an honest placeholder rather than a chart with fewer than 2 usable entries", () => {
    const html = render(h(MultiScenarioCompareCard, { entries: [{ label: "Snowball", previewResult: previewResult() }] }));
    expect(html).toContain("Not enough scenarios to compare yet");
  });

  it("renders a chart and a metric tile for each of 2+ entries, labeling the first as the baseline", () => {
    const html = render(h(MultiScenarioCompareCard, {
      title: "Scenario Compare (+$100/month)",
      entries: [
        { label: "Snowball baseline", previewResult: previewResult({ projectedZeroDate: "Dec 2029" }) },
        { label: "Snowball + $100", previewResult: previewResult({ projectedZeroDate: "Jun 2028" }) },
      ],
    }));
    expect(html).toContain("Scenario Compare");
    expect(html).toContain("Snowball baseline");
    expect(html).toContain("Snowball + $100");
    expect(html).toContain("Baseline");
    expect(html).toContain("<svg");
  });
});
