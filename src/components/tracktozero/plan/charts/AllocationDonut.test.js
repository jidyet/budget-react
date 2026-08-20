import { afterEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AllocationDonut from "./AllocationDonut.jsx";
import { applyTheme, ttzPalette } from "../../theme.js";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1D: AllocationDonut", () => {
  afterEach(() => applyTheme("light"));

  it("renders an empty state rather than a fabricated full circle when there are no segments", () => {
    const html = render(h(AllocationDonut, { segments: [] }));
    expect(html).toContain("Nothing to break down yet");
    expect(html).not.toContain("<svg");
  });

  it("renders an empty state when every segment is zero-value", () => {
    const html = render(h(AllocationDonut, { segments: [{ id: "a", label: "Minimums", value: 0, colorToken: "ac" }] }));
    expect(html).toContain("Nothing to break down yet");
  });

  it("skips a zero-value segment entirely rather than drawing a zero-width slice", () => {
    const html = render(h(AllocationDonut, {
      segments: [
        { id: "minimums", label: "Minimums", value: 500, colorToken: "info" },
        { id: "extra", label: "Extra to target", value: 0, colorToken: "go" },
      ],
    }));
    expect(html).toContain("Minimums");
    expect(html).not.toContain("Extra to target");
  });

  it("renders one arc per non-zero segment plus the label/legend with a percentage breakdown", () => {
    const html = render(h(AllocationDonut, {
      segments: [
        { id: "minimums", label: "Minimums", value: 600, colorToken: "info" },
        { id: "extra", label: "Extra to target", value: 400, colorToken: "go" },
      ],
    }));
    expect(html).toContain("Minimums");
    expect(html).toContain("Extra to target");
    expect(html).toMatch(/60%/);
    expect(html).toMatch(/40%/);
    expect(html).not.toContain("APR");
    expect((html.match(/<circle/g) || []).length).toBeGreaterThanOrEqual(3); // 1 track + 2 arcs
  });

  it("shows a center label/supporting text when provided", () => {
    const html = render(h(AllocationDonut, {
      segments: [{ id: "a", label: "Minimums", value: 500, colorToken: "info" }],
      centerLabel: "$500",
      centerSupporting: "monthly",
    }));
    expect(html).toContain("$500");
    expect(html).toContain("monthly");
  });

  it("PLAN-THEME-08: resolves arc colors from ttzPalette fresh at render, following a theme change", () => {
    applyTheme("light");
    const lightHtml = render(h(AllocationDonut, { segments: [{ id: "a", label: "Minimums", value: 500, colorToken: "info" }] }));
    const lightInfo = ttzPalette.info;
    applyTheme("dark");
    const darkHtml = render(h(AllocationDonut, { segments: [{ id: "a", label: "Minimums", value: 500, colorToken: "info" }] }));
    const darkInfo = ttzPalette.info;
    expect(darkInfo).not.toBe(lightInfo);
    expect(lightHtml).toContain(lightInfo);
    expect(darkHtml).toContain(darkInfo);
  });
});
