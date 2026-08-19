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
        /* GATE-10B.1C: a shared hover "pop + glow" for interactive card
           surfaces (Top Lenders rows, category tiles, Home summary cards) -
           one class, injected once here (AppShell wraps every screen) since
           inline React styles can't express :hover. The lift/scale is
           skipped under prefers-reduced-motion; the glow (a color-based, not
           motion-based, cue) still applies either way. Every declaration
           here needs !important: some targets (TopLendersCard/CategoryTile's
           accessible-button pattern) use inline all:unset, and an
           inline style always beats an external stylesheet rule of any
           specificity UNLESS that rule is !important - confirmed live (only
           the one declaration marked !important was actually taking effect
           on hover before this fix; box-shadow/transform were silently lost
           to the inline reset). */
        .ttz-card-hover {
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease !important;
        }
        .ttz-card-hover:hover, .ttz-card-hover:focus-visible {
          box-shadow: 0 0 0 3px var(--ttz-ac-soft, ${palette.acS}), 0 12px 28px rgba(10, 34, 54, 0.16) !important;
          border-color: var(--ttz-ac, ${palette.ac}) !important;
        }
        @media (prefers-reduced-motion: no-preference) {
          .ttz-card-hover:hover, .ttz-card-hover:focus-visible {
            transform: translateY(-3px) scale(1.012) !important;
          }
        }
      `}</style>
      <TopBar {...topBarProps} />
      <div style={{ paddingBottom: isMobile ? 76 : 0 }}>{children}</div>
      <MobileBottomNav {...mobileBottomNavProps} />
      <QuickActionSheet {...quickActionSheetProps} />
    </div>
  );
}
