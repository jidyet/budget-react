import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StatusBadge from "./StatusBadge.jsx";
import { toneColors } from "../theme.js";

// react-dom/server's renderToStaticMarkup works in plain Node (no jsdom
// needed) - this repo has no jsdom/testing-library environment configured
// for vitest, so React.createElement (not JSX syntax) keeps this a real
// component-rendering test without requiring any shared vitest config
// changes that would affect every other test file.
const renderHtml = (status) => renderToStaticMarkup(createElement(StatusBadge, { status }));

describe("StatusBadge: THE truthful status-to-color contract (UX-0 Part 9-10 / UX-1 Part 5)", () => {
  it("NON-NEGOTIABLE: a critical plan-health status never renders success/green", () => {
    const html = renderHtml({ code: "critical", label: "Plan needs attention" });
    const dangerColor = toneColors().danger.fg;
    const successColor = toneColors().success.fg;
    expect(html).toContain(dangerColor);
    expect(html).not.toContain(successColor);
  });

  it("ahead/on_track render success (green)", () => {
    for (const code of ["ahead", "on_track"]) {
      const html = renderHtml({ code, label: "x" });
      expect(html).toContain(toneColors().success.fg);
    }
  });

  it("needs_review/slightly_behind render warning (amber), never success", () => {
    for (const code of ["needs_review", "slightly_behind"]) {
      const html = renderHtml({ code, label: "x" });
      expect(html).toContain(toneColors().warning.fg);
      expect(html).not.toContain(toneColors().success.fg);
    }
  });

  it("insufficient_data/needs_balance_update render neutral info, never success or danger", () => {
    for (const code of ["insufficient_data", "needs_balance_update"]) {
      const html = renderHtml({ code, label: "x" });
      expect(html).toContain(toneColors().info.fg);
      expect(html).not.toContain(toneColors().success.fg);
      expect(html).not.toContain(toneColors().danger.fg);
    }
  });

  it("renders the real status label text, and falls back to 'Unknown' only when no status is given", () => {
    expect(renderHtml({ code: "ahead", label: "Ahead of plan" })).toContain("Ahead of plan");
    expect(renderHtml(null)).toContain("Unknown");
  });
});
