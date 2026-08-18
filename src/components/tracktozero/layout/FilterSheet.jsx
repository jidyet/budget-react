import React, { useRef } from "react";
import { X } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import { useDialogFocus } from "../ui/useDialogFocus.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import useReducedMotion from "../../../hooks/useReducedMotion.js";

// UX-8.4: a generic bottom sheet for filter/sort/group controls on mobile -
// copies QuickActionSheet.jsx's exact bottom-anchored-overlay shell (safe
// area padding, rounded top corners, useDialogFocus + Escape-to-close), but
// is children-driven (like ui/Drawer.jsx) instead of hardcoding a fixed
// action list, since it needs to hold whatever Field/Select controls the
// caller already built for desktop - never a second, duplicate filter
// implementation. Used by both the Debt Explorer and Activity Explorer.
export default function FilterSheet({ open, onClose, title = "Filters", children }) {
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  const containerRef = useRef(null);
  const closeRef = useRef(null);

  useDialogFocus({ open, containerRef, initialFocusRef: closeRef });

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

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
        aria-labelledby="ttz-filter-sheet-title"
        variant="elevated"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "min(80vh, 720px)",
          overflowY: "auto",
          borderRadius: "var(--ttz-radius-lg, 16px) var(--ttz-radius-lg, 16px) 0 0",
          paddingBottom: "max(var(--ttz-space-5, 24px), env(safe-area-inset-bottom, 0px))",
          transition: reducedMotion ? "none" : "transform 180ms ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h2 id="ttz-filter-sheet-title" style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>{title}</h2>
          <IconButton ref={closeRef} label="Close" variant="ghost" size="sm" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div style={{ display: "grid", gap: 14 }}>{children}</div>
      </Card>
    </div>
  );
}
