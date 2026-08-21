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
        background: "var(--ttz-shell-bg)",
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
        @media (max-width: 840px) {
          .ttz-finish-flow { grid-template-columns: 1fr !important; gap: 12px !important; }
          .ttz-finish-flow svg { display: none; }
          .ttz-finish-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ttz-finish-control-fields { grid-template-columns: 1fr !important; }
          .ttz-finish-controls, .ttz-finish-main-row, .ttz-finish-bottom-row { grid-template-columns: 1fr !important; }
          .ttz-saved-summary-ribbon { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ttz-saved-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ttz-saved-layout, .ttz-saved-board { grid-template-columns: 1fr !important; }
        }
        /* Phones in both portrait and landscape need a deliberately single-
           column plan flow. A landscape handset can exceed 640px wide, so
           this rule mirrors useIsMobile's short-landscape breakpoint. */
        @media (max-width: 640px), (max-height: 560px) and (orientation: landscape) {
          .ttz-plan-tab-strip {
            display: flex !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            padding: 4px !important;
          }
          .ttz-plan-tab-strip::-webkit-scrollbar { display: none; }
          .ttz-plan-tab-strip > button { flex: 0 0 auto !important; padding: 8px 10px !important; }
          .ttz-plan-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
          .ttz-plan-main-grid,
          .ttz-plan-payoff-target-grid,
          .ttz-plan-next-move-grid,
          .ttz-plan-secondary-grid,
          .ttz-strategy-hero-grid,
          .ttz-strategy-main-grid,
          .ttz-strategy-bottom-grid,
          .ttz-compare-hero-grid,
          .ttz-compare-main-grid,
          .ttz-compare-bottom-grid,
          .ttz-whatif-main-grid,
          .ttz-whatif-strategy-grid { grid-template-columns: 1fr !important; }
          .ttz-plan-health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ttz-plan-next-move-actions { grid-template-columns: 1fr !important; }
          .ttz-whatif-builder { position: static !important; grid-row: auto !important; }
          .ttz-whatif-summary { grid-column: auto !important; }
          .ttz-finish-metrics, .ttz-saved-summary-ribbon, .ttz-saved-metrics { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 390px) {
          .ttz-plan-metric-grid { grid-template-columns: 1fr !important; }
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
