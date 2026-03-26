export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function buildTransition(duration = 180, easing = "ease") {
  if (prefersReducedMotion()) return "none";
  return `all ${duration}ms ${easing}`;
}

export function buildEntranceMotion(kind = "rise") {
  if (prefersReducedMotion()) {
    return { animation: "none", transform: "none" };
  }

  if (kind === "glow") {
    return { animation: "softGlow 700ms ease both" };
  }

  return { animation: "riseFade 240ms ease both" };
}

