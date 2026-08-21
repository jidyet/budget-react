import React from "react";
import { ttzGutter } from "../theme.js";
import { useIsMobile, useIsTablet } from "../useViewport.js";

// One max-width/padding contract for page content (UX-1 Part 21) - stops
// each screen from re-declaring its own maxWidth/margin/padding.
export default function PageContainer({ children, style }) {
  const gutter = ttzGutter({ isMobile: useIsMobile(), isTablet: useIsTablet() });
  return (
    <div
      style={{
        maxWidth: "var(--ttz-container-max, 1180px)",
        margin: "0 auto",
        padding: `calc(var(--ttz-space-5, 24px) + 4px) ${gutter} calc(var(--ttz-space-8, 48px) + 8px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
