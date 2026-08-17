import React from "react";
import BrandMark from "./BrandMark.jsx";
import WorkspaceIdentity from "./WorkspaceIdentity.jsx";
import PrimaryNav from "./PrimaryNav.jsx";
import EnvironmentBadge from "./EnvironmentBadge.jsx";
import UserMenu from "./UserMenu.jsx";
import { ttzPalette, ttzGutter } from "../theme.js";
import { useIsMobile, useIsTablet } from "../useViewport.js";

// The new app shell header (UX-1 Part 22-23) - replaces the old WorkspaceBar,
// which put "TrackToZero 2.0 - Local beta workspace (emulator)", a raw
// workspace <select>, a role <select>, "Current role: X", and a Sign out
// button all in one dominant, QA-harness-feeling block. Layout only: every
// value below (workspace type, role, environment) still comes from the
// same authoritative snapshot/runtime state the caller already derived -
// nothing here re-detects or recomputes it.
export default function TopBar({ workspace, repositoryMode, snapshotMode, activeTab, onSelectTab, navBadges, userName, userEmail, userRole, onGoToSettings, onSignOut }) {
  const palette = ttzPalette;
  // Five nav items (Home/Review/Debts/Plan/Settings) no longer fit a single
  // desktop-style row at tablet widths - switching this to the tablet
  // breakpoint (not just mobile) keeps the brand wordmark from being
  // squeezed into wrapping across multiple lines (REVIEW-1B QA finding).
  const isMobile = useIsMobile();
  const isCompact = useIsTablet();
  const gutter = ttzGutter({ isMobile, isTablet: isCompact });

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: palette.surf,
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <div
        style={{
          maxWidth: "var(--ttz-container-max, 1180px)",
          margin: "0 auto",
          padding: `10px ${gutter}`,
          display: "flex",
          flexDirection: isCompact ? "column" : "row",
          alignItems: isCompact ? "stretch" : "center",
          gap: isCompact ? 10 : 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <BrandMark size={isCompact ? "sm" : "md"} />
            {!isCompact ? <WorkspaceIdentity workspace={workspace} /> : null}
          </div>
          {isCompact ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <EnvironmentBadge repositoryMode={repositoryMode} snapshotMode={snapshotMode} />
              <UserMenu name={userName} email={userEmail} role={userRole} onGoToSettings={onGoToSettings} onSignOut={onSignOut} />
            </div>
          ) : null}
        </div>

        {/* UX-8: below the mobile breakpoint, layout/MobileBottomNav.jsx
            takes over primary navigation - rendering PrimaryNav here too
            would put two landmarks both announced as "Primary" on the page
            at once, and duplicate every focusable nav control. */}
        {!isMobile ? (
          <div style={{ flex: 1, display: "flex", justifyContent: isCompact ? "flex-start" : "center", overflowX: isCompact ? "auto" : "visible" }}>
            <PrimaryNav activeTab={activeTab} onSelect={onSelectTab} badges={navBadges} />
          </div>
        ) : null}

        {!isCompact ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <EnvironmentBadge repositoryMode={repositoryMode} snapshotMode={snapshotMode} />
            <UserMenu name={userName} email={userEmail} role={userRole} onGoToSettings={onGoToSettings} onSignOut={onSignOut} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
