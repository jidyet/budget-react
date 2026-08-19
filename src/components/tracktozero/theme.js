import { buildPalette } from "../../config/palette.js";
import { BRAND_COLORS } from "../../config/brand.js";

// V2's single source of design truth. Wraps the SAME palette/brand system
// already powering the V1 app (src/config/palette.js, src/config/brand.js,
// introduced in commit c282b13 and used throughout src/components/app/*) -
// V2 simply never adopted it before this phase, and had drifted into its
// own scattered hex values instead. There is one brand, not two.
export const TTZ_THEMES = Object.freeze(["light", "dark"]);
const DEFAULT_THEME = "light";

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
//
// GATE-10B.1C: this tuning was measured against LIGHT-theme backgrounds
// only. Applying it to dark mode too would stomp buildPalette("dark")'s own
// already-distinct dark values with these light-tuned hexes (info/ac would
// both go DARKER, the wrong direction on a dark background). Scoped to
// light only; dark mode uses buildPalette("dark")'s own values unmodified -
// a deliberate, documented scope limit for this phase (see the theme
// architecture note on applyTheme below), not an oversight.
const contrastSafeOverrides = (theme) => (theme === "light" ? {
  go: "#2a7c32",
  wa: "#a85b12",
  info: "#11759e",
  ac: "#11759e",
  da: "#cc2626",
} : {});

// GATE-10B.1C: ttzPalette used to be a value frozen once at module load,
// hardcoded to "light" - every one of the ~60 V2 component files that
// `import { ttzPalette }` reads its properties directly as inline style
// values (`palette.bg`, `palette.tx`, ...), not through a hook or CSS
// variable. Rewriting all of those call sites to consume a theme-aware
// hook/CSS-var instead is out of proportion to this phase. Instead,
// ttzPalette stays a plain (non-frozen) object at the SAME reference for
// the app's whole lifetime, and applyTheme mutates its properties in
// place. Every component keeps importing/reading `ttzPalette.xxx` exactly
// as before; ThemeProvider (ThemeProvider.jsx) is the only thing that ever
// calls applyTheme, and because nothing in this tree uses React.memo, a
// theme-state change in ThemeProvider re-renders the whole subtree
// top-down, so every component's next render picks up the freshly-mutated
// values - including hand-rolled SVG (TrajectoryChart) that reads
// ttzPalette.xxx directly as paint attributes, with no extra work needed.
export const ttzPalette = { ...buildPalette(DEFAULT_THEME), ...contrastSafeOverrides(DEFAULT_THEME) };

export function applyTheme(theme) {
  const resolved = TTZ_THEMES.includes(theme) ? theme : DEFAULT_THEME;
  const next = { ...buildPalette(resolved), ...contrastSafeOverrides(resolved) };
  Object.keys(ttzPalette).forEach((key) => {
    if (!(key in next)) delete ttzPalette[key];
  });
  Object.assign(ttzPalette, next);
  return resolved;
}

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
  // GATE-10B.1: large monetary totals (e.g. $12,345,678.90) were bleeding
  // outside their card containers on mobile - these two tiers had no
  // shrink/wrap escape hatch, unlike Home's own money styles (UX-8.1's
  // responsiveMetricValueStyle/responsiveHeroValueStyle in
  // HomeCommandCenter.jsx). clamp() lets the digits shrink at narrow
  // widths instead of overflowing; overflowWrap is a last-resort backstop.
  // Font-family/weight are unchanged - this is purely a containment fix.
  metric: { fontFamily: "var(--ttz-font-mono)", fontWeight: 700, fontSize: "clamp(1.15rem, 0.85rem + 1.3vw, 1.75rem)", lineHeight: 1.1, overflowWrap: "anywhere" },
  metricSm: { fontFamily: "var(--ttz-font-mono)", fontWeight: 600, fontSize: "clamp(0.95rem, 0.8rem + 0.6vw, 1.125rem)", lineHeight: 1.2, overflowWrap: "anywhere" },
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
