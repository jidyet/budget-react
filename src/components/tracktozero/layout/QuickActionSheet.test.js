import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QuickActionSheet from "./QuickActionSheet.jsx";

const render = (props) => renderToStaticMarkup(h(QuickActionSheet, {
  open: true,
  onClose: () => {},
  onSelectAction: () => {},
  canManage: true,
  canObserve: true,
  ...props,
}));

describe("UX-8: QuickActionSheet", () => {
  it("renders nothing when closed", () => {
    expect(render({ open: false })).toBe("");
  });

  it("has correct dialog semantics when open", () => {
    const markup = render({});
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="ttz-quick-actions-title"');
  });

  it("the icon-only close button has a real accessible name, not just a glyph", () => {
    const markup = render({});
    expect(markup).toContain('aria-label="Close"');
  });

  it("shows observe-gated actions (record payment, update balance) when canObserve is true", () => {
    const markup = render({ canObserve: true, canManage: false });
    expect(markup).toContain("Record payment");
    expect(markup).toContain("Update balance");
  });

  it("hides observe-gated actions when canObserve is false", () => {
    const markup = render({ canObserve: false, canManage: true });
    expect(markup).not.toContain("Record payment");
    expect(markup).not.toContain("Update balance");
  });

  it("shows manage-gated actions (add debt, import statement) when canManage is true", () => {
    const markup = render({ canManage: true, canObserve: false });
    expect(markup).toContain("Add debt");
    expect(markup).toContain("Import statement");
  });

  it("hides manage-gated actions when canManage is false", () => {
    const markup = render({ canManage: false, canObserve: true });
    expect(markup).not.toContain("Add debt");
    expect(markup).not.toContain("Import statement");
  });

  it("shows a read-only explanation, never a blank sheet, for a Viewer with neither permission", () => {
    const markup = render({ canManage: false, canObserve: false });
    expect(markup).toContain("read-only");
    expect(markup).not.toContain("Record payment");
    expect(markup).not.toContain("Add debt");
  });
});
