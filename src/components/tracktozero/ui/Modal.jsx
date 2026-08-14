import React, { useEffect, useRef } from "react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

export default function Modal({ open, title, children, onClose }) {
  const closeRef = useRef(null);
  const palette = ttzPalette;

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
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
        background: "rgba(7,19,31,0.44)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <Card role="dialog" aria-modal="true" aria-labelledby="ttz-modal-title" variant="elevated" style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <h2 id="ttz-modal-title" style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>{title}</h2>
          <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </Card>
    </div>
  );
}
