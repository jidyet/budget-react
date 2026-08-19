// GATE-10B.1C: pure theme-resolution logic, split out of ThemeProvider.jsx
// so that file can stay component-only (react-refresh/only-export-
// components requires it). Exported so index.html's inline anti-flash
// script and ThemeProvider agree on the exact same resolution order:
// explicit saved choice first, then the OS preference, then light.
export const THEME_STORAGE_KEY = "ttz-theme";

// Never throws - a disabled/unavailable localStorage (private browsing,
// etc.) or matchMedia falls through safely to the light default.
export function resolveInitialTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable - fall through to system preference.
  }
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // matchMedia unavailable - fall through to the light default.
  }
  return "light";
}
