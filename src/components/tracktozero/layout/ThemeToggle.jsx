import React from "react";
import { Moon, Sun } from "lucide-react";
import { ttzPalette } from "../theme.js";
import { useTheme } from "../useTheme.js";

// GATE-10B.1C: compact sun/moon icon button - desktop placement is TopBar's
// right-hand cluster next to UserMenu (the avatar); the mobile/tablet
// equivalent is a menu item inside UserMenu's own dropdown (see
// UserMenu.jsx), matching this codebase's established convention that
// low-frequency controls live in the account menu on narrow viewports,
// not the bottom nav (MobileBottomNav.jsx's own doc comment).
export default function ThemeToggle({ size = 36 }) {
  const { theme, toggleTheme } = useTheme();
  const palette = ttzPalette;
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="ttz-focus-ring"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: `1px solid ${palette.border2}`,
        background: palette.surf2,
        color: palette.tx,
        cursor: "pointer",
      }}
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
