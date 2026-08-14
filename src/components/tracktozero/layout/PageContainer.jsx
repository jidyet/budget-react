import React from "react";

// One max-width/padding contract for page content (UX-1 Part 21) - stops
// each screen from re-declaring its own maxWidth/margin/padding.
export default function PageContainer({ children, style }) {
  return (
    <div
      style={{
        maxWidth: "var(--ttz-container-max, 1180px)",
        margin: "0 auto",
        padding: "var(--ttz-space-5, 24px) var(--ttz-space-4, 16px) var(--ttz-space-8, 48px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
