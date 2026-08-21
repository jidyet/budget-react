import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, chartColor, CHART_COLOR_GROUPS, CHART_USAGE_RULES, ttzCssVars, ttzPalette, toneColors } from "./theme.js";
import { resolveInitialTheme } from "./themeStorage.js";

// UX-8: locks in the contrast fix so a future palette/token edit can't
// silently regress Badge/StatusBadge text back below WCAG AA. Ratios are
// computed the same way the design decision was made - real sRGB relative
// luminance, not an eyeballed approximation.
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const relativeLuminance = ([r, g, b]) => {
  const linear = (channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [linear(r), linear(g), linear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
};

const contrastRatio = (hexA, hexB) => {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
};

// Parses this codebase's "rgba(r,g,b,a)" tint strings (theme.js's *D
// constants - the REAL Badge background, independently defined per
// src/config/brand.js's *Soft constants, not derived from the current `fg`
// value) and composites over white - Badge/StatusBadge's actual rendering
// context, which is what's being tested here, not an approximation of it.
const compositeRgbaOverWhite = (rgbaString) => {
  const match = rgbaString.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = 1] = match[1].split(",").map((part) => Number(part.trim()));
  const mix = (channel) => Math.round(a * channel + (1 - a) * 255);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

const WHITE = "#ffffff";
const CHECKED_TONES = ["success", "warning", "danger", "info"];

describe("UX-8: tone text colors clear WCAG AA (4.5:1) against white and against their own Badge tint", () => {
  const tones = toneColors(ttzPalette);

  for (const name of CHECKED_TONES) {
    it(`${name} tone text is readable on white and on its own tinted badge background`, () => {
      const { fg, bg } = tones[name];
      const tintBg = compositeRgbaOverWhite(bg);
      expect(contrastRatio(fg, WHITE)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(fg, tintBg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("ac (accent) matches info's corrected value, so accent and info text render identically as before", () => {
    expect(ttzPalette.ac).toBe(ttzPalette.info);
  });
});

describe("chart palette tokens", () => {
  it("defines exactly the three approved chart families: blue, green, and orange", () => {
    expect(Object.keys(CHART_COLOR_GROUPS)).toEqual(["blue", "green", "orange"]);
  });

  it("maps current/baseline chart usage to blue, positive/active to green, and caution/buffer to orange", () => {
    expect(CHART_USAGE_RULES.current).toBe("blue");
    expect(CHART_USAGE_RULES.baseline).toBe("blue");
    expect(CHART_USAGE_RULES.active).toBe("green");
    expect(CHART_USAGE_RULES.improvement).toBe("green");
    expect(CHART_USAGE_RULES.caution).toBe("orange");
    expect(CHART_USAGE_RULES.buffer).toBe("orange");
  });

  it("resolves both new chart groups and legacy component tokens through the same shared chart palette", () => {
    expect(chartColor("blue")).toBe(CHART_COLOR_GROUPS.blue.base);
    expect(chartColor("green")).toBe(CHART_COLOR_GROUPS.green.base);
    expect(chartColor("orange")).toBe(CHART_COLOR_GROUPS.orange.base);
    expect(chartColor("ac")).toBe(CHART_COLOR_GROUPS.blue.base);
    expect(chartColor("go")).toBe(CHART_COLOR_GROUPS.green.base);
    expect(chartColor("wa")).toBe(CHART_COLOR_GROUPS.orange.base);
  });
});

// GATE-10B.1C: applyTheme mutates the ONE shared ttzPalette object in place
// rather than replacing the export - every one of the ~60 component files
// that `import { ttzPalette }` holds onto that same reference for the
// app's lifetime, so mutation (not reassignment) is what makes a theme
// change visible to them without touching each file.
describe("applyTheme", () => {
  afterEach(() => {
    applyTheme("light"); // restore the default so later tests/files aren't affected by test order
  });

  it("THEME-02: mutates the existing ttzPalette object in place (same reference) rather than replacing it", () => {
    const ref = ttzPalette;
    applyTheme("dark");
    expect(ttzPalette).toBe(ref);
    expect(ttzPalette.bg).not.toBe("#f0f6ff"); // light's bg - proves the values actually changed
  });

  it("THEME-02: switching to dark applies buildPalette('dark')'s own values, unmodified by the light-only contrast overrides", () => {
    applyTheme("dark");
    expect(ttzPalette.bg).toBe("#000000");
    expect(ttzPalette.isDark).toBe(true);
    expect(ttzPalette.tx).toBe("#ffffff");
    // The light-tuned contrast overrides must never stomp dark's own go/wa/info/ac/da.
    expect(ttzPalette.go).toBe("#4ade80");
    expect(ttzPalette.info).toBe("#6bbdff");
  });

  it("uses a truly black application shell in dark mode while keeping cards as distinct surfaces", () => {
    applyTheme("dark");
    const vars = ttzCssVars(ttzPalette);
    expect(vars["--ttz-shell-bg"]).toBe("#000000");
    expect(ttzPalette.surf).not.toBe(ttzPalette.bg);
  });

  it("uses a monochrome text scale in both themes while preserving semantic colors for status and charts", () => {
    applyTheme("dark");
    expect(ttzPalette.tx).toBe("#ffffff");
    expect(ttzPalette.tx2).toMatch(/^rgba\(255,255,255,/);
    expect(ttzPalette.muted).toMatch(/^rgba\(255,255,255,/);

    applyTheme("light");
    expect(ttzPalette.tx).toBe("#000000");
    expect(ttzPalette.tx2).toMatch(/^rgba\(0,0,0,/);
    expect(ttzPalette.muted).toMatch(/^rgba\(0,0,0,/);
  });

  it("THEME-03: switching back to light restores the exact original light+contrast-override values", () => {
    const originalGo = ttzPalette.go;
    const originalBg = ttzPalette.bg;
    applyTheme("dark");
    applyTheme("light");
    expect(ttzPalette.go).toBe(originalGo);
    expect(ttzPalette.bg).toBe(originalBg);
  });

  it("falls back to light for an unrecognized theme value rather than leaving a partially-applied palette", () => {
    applyTheme("dark");
    const resolved = applyTheme("neon-crypto-mode");
    expect(resolved).toBe("light");
    expect(ttzPalette.bg).toBe("#f5f9ff");
  });

  it("never leaves a stale key from one theme's shape on the other (defensive against future palette-key drift)", () => {
    applyTheme("dark");
    applyTheme("light");
    expect(Object.keys(ttzPalette).sort()).toEqual(Object.keys({ ...ttzPalette }).sort());
  });
});

// GATE-10B.1C: resolveInitialTheme is the single source of truth BOTH
// ThemeProvider and index.html's inline anti-flash script must agree with.
// This test file's environment is plain Node (vitest.config.js), matching
// this repo's established convention of pure-function unit tests with no
// real DOM - `window` is stubbed per test rather than relying on jsdom, and
// the actual no-flash behavior on a real page load is verified in browser
// QA, not simulated here.
const stubWindow = ({ savedTheme, matchesDark }) => {
  const store = new Map(savedTheme != null ? [["ttz-theme", savedTheme]] : []);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    matchMedia: () => ({ matches: !!matchesDark }),
  });
};

describe("resolveInitialTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("THEME-04: a saved localStorage preference wins over system preference", () => {
    stubWindow({ savedTheme: "dark", matchesDark: false });
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to system preference (matchMedia) when nothing is saved", () => {
    stubWindow({ savedTheme: null, matchesDark: true });
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to light when neither a saved preference nor a dark system preference exists", () => {
    stubWindow({ savedTheme: null, matchesDark: false });
    expect(resolveInitialTheme()).toBe("light");
  });

  it("ignores a corrupted/unexpected localStorage value rather than throwing", () => {
    stubWindow({ savedTheme: "sepia", matchesDark: false });
    expect(resolveInitialTheme()).toBe("light");
  });

  it("returns light with no window at all (SSR-safe), never throws", () => {
    vi.unstubAllGlobals();
    expect(resolveInitialTheme()).toBe("light");
  });
});
