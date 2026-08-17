import { describe, expect, it } from "vitest";
import { getTrapFocusTarget } from "./useDialogFocus.js";

const el = (name) => ({ name });

describe("getTrapFocusTarget - dialog Tab-trap boundary logic", () => {
  it("wraps Shift+Tab from the first element to the last", () => {
    const first = el("first");
    const last = el("last");
    const target = getTrapFocusTarget({ focusableElements: [first, el("middle"), last], activeElement: first, shiftKey: true });
    expect(target).toBe(last);
  });

  it("wraps Tab from the last element to the first", () => {
    const first = el("first");
    const last = el("last");
    const target = getTrapFocusTarget({ focusableElements: [first, el("middle"), last], activeElement: last, shiftKey: false });
    expect(target).toBe(first);
  });

  it("does not intervene when focus is in the middle of the dialog", () => {
    const first = el("first");
    const middle = el("middle");
    const last = el("last");
    expect(getTrapFocusTarget({ focusableElements: [first, middle, last], activeElement: middle, shiftKey: false })).toBeNull();
    expect(getTrapFocusTarget({ focusableElements: [first, middle, last], activeElement: middle, shiftKey: true })).toBeNull();
  });

  it("does not intervene on Tab forward from the first element (not yet at the boundary)", () => {
    const first = el("first");
    const last = el("last");
    expect(getTrapFocusTarget({ focusableElements: [first, last], activeElement: first, shiftKey: false })).toBeNull();
  });

  it("wraps a single-focusable-element dialog back to itself in both directions", () => {
    const only = el("only");
    expect(getTrapFocusTarget({ focusableElements: [only], activeElement: only, shiftKey: false })).toBe(only);
    expect(getTrapFocusTarget({ focusableElements: [only], activeElement: only, shiftKey: true })).toBe(only);
  });

  it("returns null when the dialog has no focusable elements at all", () => {
    expect(getTrapFocusTarget({ focusableElements: [], activeElement: null, shiftKey: false })).toBeNull();
  });
});
