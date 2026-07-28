import { useEffect, useState } from "react";

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => {
        if (typeof media.removeEventListener === "function") {
          media.removeEventListener("change", update);
        }
      };
    }
    if (typeof media.addListener === "function") {
      media.addListener(update);
      return () => {
        if (typeof media.removeListener === "function") {
          media.removeListener(update);
        }
      };
    }
    return undefined;
  }, []);

  return reduced;
}
