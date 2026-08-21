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

// A landscape phone can be 800px wide while only 390px tall. Treat it as a
// mobile layout too; otherwise desktop grids and navigation leak into the
// viewport even though there is no usable vertical room.
export const MOBILE_VIEWPORT_QUERY = `(max-width: ${BREAKPOINTS.mobile}px), (max-height: 560px) and (orientation: landscape)`;

export const useIsMobile = () => useMediaQuery(MOBILE_VIEWPORT_QUERY);
export const useIsTablet = () => useMediaQuery(`(max-width: ${BREAKPOINTS.tablet}px)`);
