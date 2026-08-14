import React from "react";
import BrandMark from "./BrandMark.jsx";
import WorkspaceIdentity from "./WorkspaceIdentity.jsx";
import PrimaryNav from "./PrimaryNav.jsx";
import EnvironmentBadge from "./EnvironmentBadge.jsx";
import UserMenu from "./UserMenu.jsx";
import { ttzPalette } from "../theme.js";
import { useIsMobile } from "../useViewport.js";

// The new app shell header (UX-1 Part 22-23) - replaces the old WorkspaceBar,
// which put "TrackToZero 2.0 - Local beta workspace (emulator)", a raw
// workspace <select>, a role <select>, "Current role: X", and a Sign out
// button all in one dominant, QA-harness-feeling block. Layout only: every
// value below (workspace type, role, environment) still comes from the
// same authoritative snapshot/runtime state the caller already derived -
// nothing here re-detects or recomputes it.
export default function TopBar({ workspace, repositoryMode, snapshotMode, activeTab, onSelectTab, userName, userEmail, userRole, onGoToSettings, onSignOut }) {
  const palette = ttzPalette;
  const isMobile = useIsMobile();

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
          padding: isMobile ? "10px 14px" : "10px 20px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          gap: isMobile ? 10 : 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <BrandMark size={isMobile ? "sm" : "md"} />
            {!isMobile ? <WorkspaceIdentity workspace={workspace} /> : null}
          </div>
          {isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <EnvironmentBadge repositoryMode={repositoryMode} snapshotMode={snapshotMode} />
              <UserMenu name={userName} email={userEmail} role={userRole} onGoToSettings={onGoToSettings} onSignOut={onSignOut} />
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: isMobile ? "flex-start" : "center", overflowX: isMobile ? "auto" : "visible" }}>
          <PrimaryNav activeTab={activeTab} onSelect={onSelectTab} />
        </div>

        {!isMobile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <EnvironmentBadge repositoryMode={repositoryMode} snapshotMode={snapshotMode} />
            <UserMenu name={userName} email={userEmail} role={userRole} onGoToSettings={onGoToSettings} onSignOut={onSignOut} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
