import React, { useId } from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// The one label/help/validation wrapper for form inputs (UX-1 Part 19).
// Clones its single child input to wire id/aria-describedby/aria-invalid so
// every field gets consistent accessible labeling without each input
// reimplementing it. Financial value handling stays entirely in the child
// input (MoneyInput/DateInput/etc.) - this component is presentation only.
export default function Field({ label, help, error, required, children }) {
  const palette = ttzPalette;
  const autoId = useId();
  const inputId = children?.props?.id || autoId;
  const helpId = help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: inputId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label ? (
        <label htmlFor={inputId} style={{ ...TYPE_SCALE.supporting, color: palette.tx, fontWeight: 700 }}>
          {label}
          {required ? <span style={{ color: palette.da }}> *</span> : null}
        </label>
      ) : null}
      {child}
      {help && !error ? (
        <div id={helpId} style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
          {help}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} role="alert" style={{ ...TYPE_SCALE.caption, color: palette.da }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
