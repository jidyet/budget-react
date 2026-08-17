import { describe, expect, it } from "vitest";
import { ttzPalette, toneColors } from "./theme.js";

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
