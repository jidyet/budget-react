import React from "react";
import BrandLockup from "../../ui/BrandLockup.jsx";

// UX-1's brand-asset audit (Part 3-4) found an authentic, already-in-
// production TrackToZero wordmark component - src/components/ui/BrandLockup.jsx,
// introduced with the rest of the real brand system in commit c282b13 and
// already used across V1 (AppChrome, AuthModal, InstallPromptCard). This is
// a direct pass-through, not a second/duplicate brand component - V2's
// BrandMark requirement is satisfied by reusing the real one.
export default function BrandMark({ size = "md", showTagline = false }) {
  return <BrandLockup size={size} showTagline={showTagline} />;
}
