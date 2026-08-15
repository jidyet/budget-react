// UX-4.1: pure routing helpers for the Plan section's seven standalone
// destinations. Kept in their own module (not exported alongside
// PlanSection's default component export) so Fast Refresh can still treat
// PlanSection.jsx as a component-only file.

export const PLAN_DESTINATIONS = [
  { key: "my-plan", label: "My Plan" },
  { key: "snowball", label: "Snowball" },
  { key: "avalanche", label: "Avalanche" },
  { key: "compare", label: "Compare" },
  { key: "what-if", label: "What If?" },
  { key: "finish-by", label: "Finish By" },
  { key: "scenarios", label: "Saved" },
];

export const resolvePlanDestination = (pathname = typeof window !== "undefined" ? window.location.pathname : "/") => {
  const clean = String(pathname || "/").replace(/\/+$/, "");
  if (!clean || clean === "/plan") return "my-plan";
  const slug = clean.replace(/^\/plan\/?/, "");
  return PLAN_DESTINATIONS.some((item) => item.key === slug) ? slug : "my-plan";
};

export const buildPlanPath = (destination = "my-plan") => {
  const safe = PLAN_DESTINATIONS.some((item) => item.key === destination) ? destination : "my-plan";
  return `/plan/${safe}`;
};

// Pure navigation (never a plan mutation) between the seven Plan
// destinations - pushes a real history entry so Back/Forward and refresh
// stay correct, then notifies PlanSection's own popstate listener.
export const navigateToPlanDestination = (destination) => {
  if (typeof window === "undefined") return;
  const nextPath = buildPlanPath(destination);
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
};
