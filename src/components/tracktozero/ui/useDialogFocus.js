import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Pure trap-boundary logic, factored out of the DOM-event plumbing below so
// it can be unit-tested without a real DOM/jsdom (this repo has no
// component-rendering test infrastructure - see useDialogFocus.test.js).
// Returns the element Tab/Shift+Tab should move focus to when it would
// otherwise escape the dialog, or null when no wrap is needed.
export const getTrapFocusTarget = ({ focusableElements, activeElement, shiftKey }) => {
  if (!focusableElements.length) return null;
  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
};

// Shared focus management for any role="dialog" aria-modal="true" surface
// (Modal, Drawer, and the mobile QuickActionSheet all consume this) - moves
// focus into the dialog on open, traps Tab/Shift+Tab inside it while open,
// and restores focus to whatever triggered it once it closes. Escape-to-
// close stays owned by each caller (Modal/Drawer already have a working
// Escape listener) - this hook only ever touches focus, never closing.
//
// `containerRef`/`initialFocusRef` must be refs created with useRef by the
// caller (stable identity across renders) - an inline object literal would
// re-run this effect, and thus re-capture "what was focused before opening,"
// on every render.
export const useDialogFocus = ({ open, containerRef, initialFocusRef }) => {
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;

    const container = containerRef.current;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      container?.querySelector(FOCUSABLE_SELECTOR)?.focus();
    }

    const onKeyDown = (event) => {
      if (event.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      const target = getTrapFocusTarget({ focusableElements: focusable, activeElement: document.activeElement, shiftKey: event.shiftKey });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, containerRef, initialFocusRef]);
};
