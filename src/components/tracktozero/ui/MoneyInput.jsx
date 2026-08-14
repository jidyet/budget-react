import React, { forwardRef } from "react";
import Input from "./Input.jsx";
import { ttzPalette } from "../theme.js";

// Currency entry field (UX-1 Part 19). Purely presentational - `value` is
// the raw numeric amount and `onChange` receives the raw string the browser
// gives back; this component does not parse/round/reformat the value
// itself, so it cannot silently alter financial data (UX-0 truth
// invariant). Formatting for DISPLAY-ONLY contexts is formatMoney in
// formatting.js, a separate concern from this editable field.
const MoneyInput = forwardRef(function MoneyInput({ style, ...rest }, ref) {
  const palette = ttzPalette;
  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: palette.tx2,
          fontFamily: "var(--ttz-font-mono, monospace)",
          fontSize: 14,
          pointerEvents: "none",
        }}
      >
        $
      </span>
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.01"
        style={{ paddingLeft: 24, fontFamily: "var(--ttz-font-mono, monospace)", ...style }}
        {...rest}
      />
    </div>
  );
});

export default MoneyInput;
