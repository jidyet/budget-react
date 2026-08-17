import { buildPalette } from "../../config/palette.js";
import { BRAND_COLORS } from "../../config/brand.js";

// V2's single source of design truth. Wraps the SAME palette/brand system
// already powering the V1 app (src/config/palette.js, src/config/brand.js,
// introduced in commit c282b13 and used throughout src/components/app/*) -
// V2 simply never adopted it before this phase, and had drifted into its
// own scattered hex values instead. There is one brand, not two.
//
// V2 does not yet offer a theme toggle - buildPalette already supports
// "dark" for whenever that's built; this just fixes V2 to "light" for now.
export const TTZ_THEME = "light";

// UX-8 contrast fix, SCOPED TO V2 ONLY - go/wa/info/ac/da (measured via a
// throwaway WCAG relative-luminance script, not eyeballed) fail 4.5:1 text
// contrast against a Badge/StatusBadge's own tinted background - their REAL
// rendering context, which is a stricter, more honest test than checking
// against plain white alone (checking against white only found go/wa/info
// failing; checking against each tone's actual ~12%-tint background also
// surfaced a narrower danger shortfall: 4.27:1). These four are used
// pervasively as small Badge/StatusBadge/tone-strip TEXT (11-12px, nowhere
// near WCAG's ~18.66px-bold "large text" exception). Overridden here, in
// V2's own theme layer, rather than in shared src/config/palette.js|
// brand.js - those files also power the V1 app, out of scope for this
// phase and with no test coverage here to verify a shared-token change
// against. `ac` and `info` share one identical brand-blue value already
// (see palette.js) and are corrected to the same darkened value so text
// rendered in either still looks identical, as it does today.
// Decorative/background tints (acS/acD/goD/waD/infoD) are left untouched -
// darkening the foreground only improves its contrast against those
// already-light tints, and they aren't subject to the text-contrast rule
// themselves.
const CONTRAST_SAFE_OVERRIDES = {
  go: "#2a7c32", // was #39a844 (BRAND_COLORS.green) - 3.06:1 vs white / 2.71:1 vs own tint bg -> 5.21:1 / 4.63:1
  wa: "#a85b12", // was #ff8a1c (BRAND_COLORS.orange) - 2.36:1 vs white / 2.13:1 vs own tint bg -> 5.04:1 / 4.55:1
  info: "#11759e", // was #18a7e1 (BRAND_COLORS.blue) - 2.74:1 vs white / 2.46:1 vs own tint bg -> 5.17:1 / 4.58:1
  ac: "#11759e", // was #18a7e1, identical brand-blue value to `info` - kept in sync
  da: "#cc2626", // was #d42828 - already 5.08:1 vs white, but only 4.27:1 vs its own tint bg -> 4.56:1
};

export const ttzPalette = { ...buildPalette(TTZ_THEME), ...CONTRAST_SAFE_OVERRIDES };

// UX-0 established the truthful plan-health/status codes (derivePlanHealth,
// classifyPlanStatus - see services/tracktozero/projectionStatusService.js).
// This is the ONE place those codes map to a visual tone. Every status
// display (StatusBadge, callouts) must read from this map rather than
// re-deriving its own color logic - that is exactly how a critical plan
// could end up looking green by accident. "critical" only ever maps to
// danger, never success/warning.
export const STATUS_TONE = Object.freeze({
  ahead: "success",
  on_track: "success",
  slightly_behind: "warning",
  needs_review: "warning",
  needs_balance_update: "info",
  insufficient_data: "info",
  critical: "danger",
});

export const toneColors = (palette = ttzPalette) => ({
  success: { fg: palette.go, bg: palette.goD, border: palette.go },
  warning: { fg: palette.wa, bg: palette.waD, border: palette.wa },
  danger: { fg: palette.da, bg: palette.daD, border: palette.da },
  info: { fg: palette.info, bg: palette.infoD, border: palette.info },
  neutral: { fg: palette.muted, bg: palette.surf2, border: palette.border },
});

// Centralized --ttz-* custom properties, generated from the SAME palette -
// never hand-authored hex values scattered through components. Spread onto
// a wrapping element's style prop (see layout/AppShell.jsx) so descendants
// can use var(--ttz-*) in inline styles or future real CSS.
export const ttzCssVars = (palette = ttzPalette) => ({
  "--ttz-brand-primary": BRAND_COLORS.green,
  "--ttz-brand-primary-hover": "#2f8c39",
  "--ttz-brand-secondary": BRAND_COLORS.blue,
  "--ttz-brand-accent": BRAND_COLORS.orange,

  "--ttz-success": palette.go,
  "--ttz-warning": palette.wa,
  "--ttz-danger": palette.da,
  "--ttz-info": palette.info,

  "--ttz-bg-app": palette.bg,
  "--ttz-bg-surface": palette.surf,
  "--ttz-bg-subtle": palette.surf2,
  "--ttz-bg-elevated": palette.surf3,

  "--ttz-text-primary": palette.tx,
  "--ttz-text-secondary": palette.tx2,
  "--ttz-text-muted": palette.muted,
  "--ttz-text-inverse": "#ffffff",

  "--ttz-border-subtle": palette.border,
  "--ttz-border-strong": palette.border2,

  "--ttz-shadow-sm": "0 1px 2px rgba(10,34,54,0.06)",
  "--ttz-shadow-md": "0 8px 24px rgba(10,34,54,0.08)",
  "--ttz-shadow-lg": "0 18px 40px rgba(10,34,54,0.12)",

  "--ttz-radius-sm": "8px",
  "--ttz-radius-md": "12px",
  "--ttz-radius-lg": "16px",
  "--ttz-radius-xl": "22px",

  "--ttz-space-1": "4px",
  "--ttz-space-2": "8px",
  "--ttz-space-3": "12px",
  "--ttz-space-4": "16px",
  "--ttz-space-5": "24px",
  "--ttz-space-6": "32px",
  "--ttz-space-8": "48px",

  // UX-6.1: fluid width instead of a hard 1180px column - clamp() gives a
  // continuous scale between the old minimum and a wide-desktop ceiling with
  // no extra breakpoint tier, consistent with the clamp()-based fluid type
  // already used in HomeCommandCenter.jsx.
  "--ttz-container-max": "clamp(1180px, 92vw, 1600px)",

  "--ttz-z-sticky": "30",
  "--ttz-z-dropdown": "40",
  "--ttz-z-modal": "50",
  "--ttz-z-toast": "60",

  "--ttz-font-display": "'Syne', sans-serif",
  "--ttz-font-body": "'Instrument Sans', system-ui, sans-serif",
  "--ttz-font-mono": "'DM Mono', monospace",
});

// Type scale (Part 6). Kept as JS tokens (matching this codebase's existing
// inline-style convention, not a separate CSS file) so every text tier is
// defined once instead of re-guessed per component.
export const TYPE_SCALE = Object.freeze({
  display: { fontFamily: "var(--ttz-font-display)", fontWeight: 800, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.02em" },
  pageTitle: { fontFamily: "var(--ttz-font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.01em" },
  sectionTitle: { fontFamily: "var(--ttz-font-body)", fontWeight: 700, fontSize: 20, lineHeight: 1.2 },
  cardTitle: { fontFamily: "var(--ttz-font-body)", fontWeight: 700, fontSize: 16, lineHeight: 1.3 },
  metric: { fontFamily: "var(--ttz-font-mono)", fontWeight: 700, fontSize: 28, lineHeight: 1.1 },
  metricSm: { fontFamily: "var(--ttz-font-mono)", fontWeight: 600, fontSize: 18, lineHeight: 1.2 },
  body: { fontFamily: "var(--ttz-font-body)", fontWeight: 400, fontSize: 15, lineHeight: 1.5 },
  supporting: { fontFamily: "var(--ttz-font-body)", fontWeight: 500, fontSize: 13, lineHeight: 1.4 },
  caption: { fontFamily: "var(--ttz-font-body)", fontWeight: 500, fontSize: 12, lineHeight: 1.3 },
  overline: { fontFamily: "var(--ttz-font-body)", fontWeight: 800, fontSize: 11, lineHeight: 1.2, letterSpacing: "0.08em", textTransform: "uppercase" },
  badge: { fontFamily: "var(--ttz-font-body)", fontWeight: 700, fontSize: 12, lineHeight: 1 },
});

export const BREAKPOINTS = Object.freeze({ mobile: 640, tablet: 960 });

// UX-6.1: shared horizontal-gutter step so every shell piece (TopBar,
// PageContainer) scales its side padding identically instead of each
// picking its own numbers - matters more now that --ttz-container-max can
// grow up to 1600px, where a fixed small gutter would look cramped.
export const ttzGutter = ({ isMobile, isTablet }) => (isMobile ? "var(--ttz-space-4)" : isTablet ? "var(--ttz-space-5)" : "var(--ttz-space-6)");
