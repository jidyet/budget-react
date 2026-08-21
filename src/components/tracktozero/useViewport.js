import { useEffect, useState } from "react";
import { BREAKPOINTS } from "./theme.js";

// Matches the matchMedia-listener pattern already established by
// src/hooks/useReducedMotion.js, scoped to TrackToZero V2's breakpoints.
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    if (typeof media.addListener === "function") {
      media.addListener(update);
      return () => media.removeListener(update);
    }
    return undefined;
  }, [query]);

  return matches;
};

// Keep "phone width" separate from "short landscape". Both need compact
// content layouts, but a fixed bottom navigation costs far too much vertical
// room on a 390px-tall landscape phone. Narrow phones get the bottom bar;
// short landscape phones retain the compact header/navigation instead.
export const NARROW_PHONE_QUERY = `(max-width: ${BREAKPOINTS.mobile}px)`;
export const SHORT_LANDSCAPE_QUERY = "(max-height: 560px) and (orientation: landscape)";
export const MOBILE_VIEWPORT_QUERY = `${NARROW_PHONE_QUERY}, ${SHORT_LANDSCAPE_QUERY}`;

export const useIsNarrowPhone = () => useMediaQuery(NARROW_PHONE_QUERY);
export const useIsShortLandscape = () => useMediaQuery(SHORT_LANDSCAPE_QUERY);
export const useIsMobile = () => useMediaQuery(MOBILE_VIEWPORT_QUERY);
export const useHasMobileBottomNav = () => useIsNarrowPhone();
export const useIsTablet = () => useMediaQuery(`(max-width: ${BREAKPOINTS.tablet}px)`);
