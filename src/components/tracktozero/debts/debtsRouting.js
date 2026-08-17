// UX-6.1: pure routing helpers for the Debts section's category
// destinations, mirroring plan/planRouting.js's exact shape (same three
// functions, same pushState + manual popstate-dispatch pattern) rather than
// introducing a router dependency - this repo's entire V2 routing need is a
// handful of tab/sub-destination paths, which the existing precedent already
// serves correctly (Back/Forward and refresh all resolve).
import { CATEGORY_CONFIG } from "./debtCategoryConfig.js";

export const DEBTS_DESTINATIONS = [
  { key: "all", label: "All debts" },
  ...CATEGORY_CONFIG.map((entry) => ({ key: entry.routeSlug, label: entry.label })),
];

export const resolveDebtsDestination = (pathname = typeof window !== "undefined" ? window.location.pathname : "/") => {
  const clean = String(pathname || "/").replace(/\/+$/, "");
  if (!clean || clean === "/debts") return "all";
  const slug = clean.replace(/^\/debts\/?/, "");
  return DEBTS_DESTINATIONS.some((item) => item.key === slug) ? slug : "all";
};

export const buildDebtsPath = (destination = "all") => {
  const safe = DEBTS_DESTINATIONS.some((item) => item.key === destination) ? destination : "all";
  return safe === "all" ? "/debts" : `/debts/${safe}`;
};

// Pure navigation (never a data mutation) between Debts destinations -
// pushes a real history entry so Back/Forward and refresh stay correct,
// then notifies DebtsCenter's own popstate listener.
export const navigateToDebtsDestination = (destination) => {
  if (typeof window === "undefined") return;
  const nextPath = buildDebtsPath(destination);
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
};
