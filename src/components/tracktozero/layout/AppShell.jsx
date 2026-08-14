import React from "react";
import TopBar from "./TopBar.jsx";
import { ttzPalette, ttzCssVars } from "../theme.js";

// AppShell -> PageContainer -> PageHeader -> content sections (UX-1 Part
// 21). AppShell owns the header/nav chrome and the --ttz-* custom
// properties; it does not know about workspace/plan/debt content - callers
// render their existing screen (Home/Debts/Plan/Settings) as `children`
// unchanged.
export default function AppShell({ topBarProps, children }) {
  const palette = ttzPalette;
  return (
    <div
      style={{
        ...ttzCssVars(palette),
        minHeight: "100vh",
        background: palette.bg,
        color: palette.tx,
        fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
      }}
    >
      <TopBar {...topBarProps} />
      {children}
    </div>
  );
}
