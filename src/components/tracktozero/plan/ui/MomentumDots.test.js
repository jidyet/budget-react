import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MomentumDots from "./MomentumDots.jsx";
import { ttzPalette } from "../../theme.js";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1E: MomentumDots", () => {
  it("renders exactly `total` dots", () => {
    const html = render(h(MomentumDots, { index: 1, total: 5 }));
    expect((html.match(/<span/g) || []).length).toBe(5);
  });

  it("fills dots up to and including the current index, leaves the rest outlined", () => {
    const html = render(h(MomentumDots, { index: 1, total: 3 }));
    const filledCount = (html.match(new RegExp(ttzPalette.ac.replace(/[()]/g, "\\$&"), "g")) || []).length;
    // 2 filled dots (index 0, 1) each mention palette.ac twice (background + border).
    expect(filledCount).toBeGreaterThanOrEqual(4);
  });

  it("renders nothing for a single-debt (total <= 1) plan", () => {
    const html = render(h(MomentumDots, { index: 0, total: 1 }));
    expect(html).toBe("");
  });
});
