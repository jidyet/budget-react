import React from "react";
import TopBar from "./TopBar.jsx";
import MobileBottomNav from "./MobileBottomNav.jsx";
import QuickActionSheet from "./QuickActionSheet.jsx";
import { ttzPalette, ttzCssVars } from "../theme.js";
import { useIsMobile } from "../useViewport.js";

// AppShell -> PageContainer -> PageHeader -> content sections (UX-1 Part
// 21). AppShell owns the header/nav chrome and the --ttz-* custom
// properties; it does not know about workspace/plan/debt content - callers
// render their existing screen (Home/Debts/Plan/Settings) as `children`
// unchanged.
//
// UX-8: also owns the mobile bottom nav + quick-action sheet chrome, mirroring
// how it already owns TopBar - both are just rendered alongside `children`,
// driven entirely by props the caller (TrackToZeroV2App.jsx) already has
// (the same activeTab/onSelectTab/badges TopBar's PrimaryNav uses, plus the
// quick-action sheet's open/close/permission state). AppShell adds
// bottom padding to `children` on mobile so the fixed bottom nav never
// covers the last bit of page content.
export default function AppShell({ topBarProps, mobileBottomNavProps, quickActionSheetProps, children }) {
  const palette = ttzPalette;
  const isMobile = useIsMobile();
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
      {/* UX-8: a real, visible focus ring for custom controls that use
          `all: "unset"` (CategoryTile/QueueRow/CandidateRow), which strips
          even the browser's default outline with nothing to replace it.
          Inline React styles can't express :focus-visible - one small
          <style> tag, injected once here (AppShell wraps every screen),
          matches the exact precedent ui/LoadingState.jsx already uses for
          its @keyframes. `!important` is required here specifically
          because `all: "unset"` is an INLINE style, which normal-cascade
          CSS (even from a later stylesheet) cannot outrank any other way -
          this is the one legitimate case for it, not a general habit. */}
      <style>{`
        .ttz-focus-ring:focus-visible {
          outline: 2px solid var(--ttz-info, ${palette.info}) !important;
          outline-offset: 2px !important;
          border-radius: var(--ttz-radius-sm, 8px) !important;
        }
      `}</style>
      <TopBar {...topBarProps} />
      <div style={{ paddingBottom: isMobile ? 76 : 0 }}>{children}</div>
      <MobileBottomNav {...mobileBottomNavProps} />
      <QuickActionSheet {...quickActionSheetProps} />
    </div>
  );
}
