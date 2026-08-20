import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectionCard from "./SectionCard.jsx";

const render = (element) => renderToStaticMarkup(element);

describe("GATE-10B.1E: SectionCard", () => {
  it("renders the numbered badge, title, subtitle, and children", () => {
    const html = render(h(SectionCard, { number: 3, title: "Current first target", subtitle: "Where extra money goes next" }, h("div", null, "child content")));
    expect(html).toContain(">3<");
    expect(html).toContain("Current first target");
    expect(html).toContain("Where extra money goes next");
    expect(html).toContain("child content");
  });

  it("omits the numbered badge when number is not given", () => {
    const html = render(h(SectionCard, { title: "No number here" }, h("div", null, "x")));
    expect(html).toContain("No number here");
  });

  it("renders actions in the header row", () => {
    const html = render(h(SectionCard, { title: "With actions", actions: h("button", null, "Do thing") }, h("div", null, "x")));
    expect(html).toContain("Do thing");
  });
});
