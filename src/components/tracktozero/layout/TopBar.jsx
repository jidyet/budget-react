import React from "react";
import BrandMark from "./BrandMark.jsx";
import WorkspaceIdentity from "./WorkspaceIdentity.jsx";
import PrimaryNav from "./PrimaryNav.jsx";
import EnvironmentBadge from "./EnvironmentBadge.jsx";
import UserMenu from "./UserMenu.jsx";
import { ttzPalette } from "../theme.js";
import { useIsTablet } from "../useViewport.js";

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
  const isCompact = useIsTablet();

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
          padding: isCompact ? "10px 14px" : "10px 20px",
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

        <div style={{ flex: 1, display: "flex", justifyContent: isCompact ? "flex-start" : "center", overflowX: isCompact ? "auto" : "visible" }}>
          <PrimaryNav activeTab={activeTab} onSelect={onSelectTab} badges={navBadges} />
        </div>

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
