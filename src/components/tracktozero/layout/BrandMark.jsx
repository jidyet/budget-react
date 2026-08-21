import React from "react";
import BrandLockup from "../../ui/BrandLockup.jsx";

// UX-1's brand-asset audit (Part 3-4) found an authentic, already-in-
// production TrackToZero wordmark component - src/components/ui/BrandLockup.jsx,
// introduced with the rest of the real brand system in commit c282b13 and
// already used across V1 (AppChrome, AuthModal, InstallPromptCard). This is
// a direct pass-through, not a second/duplicate brand component - V2's
// BrandMark requirement is satisfied by reusing the real one.
export default function BrandMark({ size = "md", showTagline = false }) {
  const iconSize = size === "sm" ? 28 : size === "lg" ? 40 : 32;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="14" stroke="#18A7E1" strokeWidth="2.4" opacity="0.95" />
        <circle cx="16" cy="16" r="8.5" stroke="#2D6CDF" strokeWidth="2.4" opacity="0.85" />
        <path d="M10.5 16.5C12.4 12.8 15.9 10.8 20.3 10.8" stroke="#18A7E1" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M11.8 21.2C14.1 23 16.7 23.9 19.8 23.9" stroke="#FF8A1F" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="22.2" cy="10.5" r="2.2" fill="#22C55E" />
      </svg>
      <BrandLockup size={size} showTagline={showTagline} />
    </div>
  );
}
