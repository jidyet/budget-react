import React, { useEffect, useRef } from "react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { useDialogFocus } from "./useDialogFocus.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function Drawer({ open, title, children, onClose, side = "right" }) {
  const palette = ttzPalette;
  const containerRef = useRef(null);

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
