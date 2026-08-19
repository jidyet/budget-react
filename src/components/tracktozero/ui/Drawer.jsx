import React, { useEffect, useRef } from "react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { useDialogFocus } from "./useDialogFocus.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { useIsTablet } from "../useViewport.js";

// GATE-10B.1C: on mobile/tablet this renders as a bottom sheet (rounded top
// corners, safe-area-aware bottom padding) instead of a fixed side panel -
// previously the only responsive behavior was the side panel collapsing to
// full-width, which on a short phone screen pinned the drawer's header off
// the top of the viewport for a tall form. Reuses the exact shell
// conventions layout/FilterSheet.jsx already established (overlay
// align-items: flex-end, rounded-top Card, env(safe-area-inset-bottom)) so
// there's one bottom-sheet visual language across the app, not two. Desktop
// keeps the original fixed side panel (side="left"|"right") unchanged.
export default function Drawer({ open, title, children, onClose, side = "right" }) {
  const palette = ttzPalette;
  const containerRef = useRef(null);
  const isTablet = useIsTablet();

  useDialogFocus({ open, containerRef, initialFocusRef: null });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  if (isTablet) {
    return (
      <div
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: "var(--ttz-z-modal, 50)",
          background: "rgba(7,19,31,0.36)",
          display: "flex",
          alignItems: "flex-end",
        }}
        onClick={onClose}
      >
        <Card
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ttz-drawer-title"
          variant="elevated"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "100%",
            maxHeight: "min(85vh, 720px)",
            overflowY: "auto",
            borderRadius: "var(--ttz-radius-lg, 16px) var(--ttz-radius-lg, 16px) 0 0",
            paddingBottom: "max(var(--ttz-space-5, 24px), env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 id="ttz-drawer-title" style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>{title}</h2>
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
          <div style={{ marginTop: 16 }}>{children}</div>
        </Card>
      </div>
    );
  }

  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: "var(--ttz-z-modal, 50)", background: "rgba(7,19,31,0.36)" }}>
      <Card
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ttz-drawer-title"
        variant="elevated"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [side]: 0,
          width: "min(420px, 100vw)",
          borderRadius: 0,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 id="ttz-drawer-title" style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </Card>
    </div>
  );
}
