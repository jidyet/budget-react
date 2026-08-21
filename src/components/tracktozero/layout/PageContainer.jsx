import React from "react";
import { ttzGutter } from "../theme.js";
import { useHasMobileBottomNav, useIsMobile, useIsTablet } from "../useViewport.js";

// One max-width/padding contract for page content (UX-1 Part 21) - stops
// each screen from re-declaring its own maxWidth/margin/padding.
export default function PageContainer({ children, style }) {
  const isMobile = useIsMobile();
  const hasMobileBottomNav = useHasMobileBottomNav();
  const gutter = ttzGutter({ isMobile, isTablet: useIsTablet() });
  return (
    <div
      className="ttz-page-container"
      style={{
        minWidth: 0,
        maxWidth: "var(--ttz-container-max, 1180px)",
        margin: "0 auto",
        padding: isMobile
          ? `var(--ttz-space-4, 16px) ${gutter} ${hasMobileBottomNav ? "calc(var(--ttz-space-6, 32px) + env(safe-area-inset-bottom, 0px))" : "var(--ttz-space-6, 32px)"}`
          : `calc(var(--ttz-space-5, 24px) + 4px) ${gutter} calc(var(--ttz-space-8, 48px) + 8px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
