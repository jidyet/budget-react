import { afterEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Target } from "lucide-react";
import IconBadge from "./IconBadge.jsx";
import { applyTheme, ttzPalette } from "../../theme.js";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1E: IconBadge", () => {
  afterEach(() => applyTheme("light"));

  it("renders the given icon", () => {
    const html = render(h(IconBadge, { icon: Target }));
    expect(html).toContain("<svg");
  });

  it("renders nothing inside when no icon is given, without throwing", () => {
    expect(() => render(h(IconBadge, {}))).not.toThrow();
  });

  it("resolves tone colors from ttzPalette fresh at render, following a theme change", () => {
    applyTheme("light");
    const lightHtml = render(h(IconBadge, { icon: Target, tone: "go" }));
    const lightGo = ttzPalette.go;
    applyTheme("dark");
    const darkHtml = render(h(IconBadge, { icon: Target, tone: "go" }));
    const darkGo = ttzPalette.go;
    expect(darkGo).not.toBe(lightGo);
    expect(lightHtml).toContain(lightGo);
    expect(darkHtml).toContain(darkGo);
  });

  it("falls back to the accent tone for an unrecognized tone value", () => {
    const html = render(h(IconBadge, { icon: Target, tone: "not-a-real-tone" }));
    expect(html).toContain(ttzPalette.ac);
  });
});
