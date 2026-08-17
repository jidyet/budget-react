import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileBottomNavContent } from "./MobileBottomNav.jsx";

const render = (props) => renderToStaticMarkup(h(MobileBottomNavContent, {
  activeTab: "home",
  onSelectTab: () => {},
  onOpenQuickActions: () => {},
  ...props,
}));

describe("UX-8: MobileBottomNav", () => {
  it("renders all 4 destinations with real text labels, not icon-only", () => {
    const markup = render({});
    expect(markup).toContain("Home");
    expect(markup).toContain("Debts");
    expect(markup).toContain("Plan");
    expect(markup).toContain("Activity");
  });

  it("marks the active tab with aria-current=\"page\" and no other tab", () => {
    const markup = render({ activeTab: "plan" });
    // Exactly one nav button carries aria-current="page".
    expect((markup.match(/aria-current="page"/g) || []).length).toBe(1);
  });

  it("marks no tab as current when activeTab matches none of the 4 (e.g. Review/Settings)", () => {
    const markup = render({ activeTab: "review" });
    expect(markup).not.toContain('aria-current="page"');
  });

  it("renders a badge count when a tab has one, and omits it when zero", () => {
    const withBadge = render({ badges: { debts: 3 } });
    expect(withBadge).toContain(">3<");
    const withoutBadge = render({ badges: {} });
    expect(withoutBadge).not.toMatch(/>\d+</);
  });

  it("caps a large badge count display at \"9+\" rather than an unbounded number", () => {
    const markup = render({ badges: { home: 42 } });
    expect(markup).toContain("9+");
  });

  it("renders one accessible center quick-actions trigger", () => {
    const markup = render({});
    expect(markup).toContain('aria-label="Quick actions"');
  });
});
