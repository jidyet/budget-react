import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { applyTheme } from "./theme.js";
import { ThemeContext } from "./ThemeContext.js";
import { resolveInitialTheme, THEME_STORAGE_KEY } from "./themeStorage.js";

// GATE-10B.1C: the FIRST React Context in this codebase (confirmed via a
// repo-wide search for createContext before this file was written) - every
// other cross-cutting concern here is prop-drilled. A Context is the right
// tool specifically because only the theme TOGGLE control needs to know
// "what is the current theme" reactively; every other component keeps
// reading the mutated ttzPalette singleton directly (see theme.js's own
// comment on applyTheme) and re-renders for free as a side effect of this
// provider's own state change cascading down a non-memoized tree.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => resolveInitialTheme());

  // GATE-10B.1C: mutates the shared ttzPalette object SYNCHRONOUSLY during
  // render, not inside an effect. Descendants read ttzPalette.xxx directly
  // during their OWN render (not via a hook/context), and they render as
  // part of this same top-down pass triggered by this component's state
  // change. An effect (even useLayoutEffect) only runs AFTER this render
  // already committed - by then every descendant already rendered once
  // with the STALE palette, and nothing forces a second pass afterward, so
  // the mutation would land one render cycle too late (reproduced live:
  // data-theme flipped correctly, but colors stayed on the old theme until
  // some unrelated re-render happened to occur). applyTheme is idempotent
  // (same theme in -> same values out, cheap) and touches no React state,
  // so doing it here is deliberate and safe despite being a side effect
  // during render - its target is intentionally external to React.
  applyTheme(theme);

  // useLayoutEffect (not useEffect) so the DOM attribute lands before the
  // browser paints this render - avoids a visible flash on toggle. The
  // initial mount's flash (page load) is separately handled by index.html's
  // own inline script, which runs before the React bundle even starts.
  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const persist = (next) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistence is a nice-to-have, not a requirement for the toggle to work this session.
    }
  };

  const setTheme = useCallback((next) => {
    if (next !== "light" && next !== "dark") return;
    setThemeState(next);
    persist(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  // GATE-10B.1C: `children` as a FUNCTION (render-prop), not a plain
  // element, is what actually makes the ~60-file "mutate ttzPalette and
  // let everything re-render for free" strategy work. If the caller passed
  // a plain <Element/> built once by an ancestor that never re-renders
  // (e.g. TrackToZeroV2App's own top-level render, which only ever runs
  // once), that SAME element reference would be handed to this component
  // on every one of ITS re-renders - React bails out of re-rendering an
  // unchanged element reference, so only actual useTheme() CONSUMERS (the
  // toggle button) would ever re-render; everything else reading
  // ttzPalette directly would stay stuck on stale colors (reproduced live:
  // the toggle button itself re-themed correctly, the rest of the page did
  // not). Calling `children(value)` here, inside THIS component's own
  // render, constructs a genuinely NEW element tree every render instead -
  // see TrackToZeroV2App.jsx's call site. A plain element is still
  // accepted (equivalent to today's behavior) for one-shot,
  // never-re-rendered usage such as shell.test.js's renderToStaticMarkup
  // calls, where this distinction is moot.
  return (
    <ThemeContext.Provider value={value}>
      {typeof children === "function" ? children(value) : children}
    </ThemeContext.Provider>
  );
}
