import { afterEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Trophy } from "lucide-react";
import InsightBanner from "./InsightBanner.jsx";
import { applyTheme, ttzPalette } from "../../theme.js";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1E: InsightBanner", () => {
  afterEach(() => applyTheme("light"));

  it("renders headline, detail, and chips exactly as given (never computing its own numbers)", () => {
    const html = render(h(InsightBanner, {
      icon: Trophy,
      tone: "go",
      headline: "Avalanche is the better fit right now",
      detail: "You'll save more on interest and become debt-free 3 months sooner.",
      chips: [{ label: "Less interest", value: "2.8%" }, { label: "Months faster", value: "3" }],
    }));
    expect(html).toContain("Avalanche is the better fit right now");
    expect(html).toContain("3 months sooner");
    expect(html).toContain("Less interest");
    expect(html).toContain("2.8%");
  });

  it("renders with no chips/actions without throwing", () => {
    expect(() => render(h(InsightBanner, { headline: "Just a headline" }))).not.toThrow();
  });

  it("resolves tone colors from ttzPalette fresh at render, following a theme change", () => {
    applyTheme("light");
    const lightHtml = render(h(InsightBanner, { tone: "go", headline: "x" }));
    const lightGo = ttzPalette.go;
    applyTheme("dark");
    const darkHtml = render(h(InsightBanner, { tone: "go", headline: "x" }));
    const darkGo = ttzPalette.go;
    expect(darkGo).not.toBe(lightGo);
    expect(lightHtml).toContain(lightGo);
    expect(darkHtml).toContain(darkGo);
  });
});
