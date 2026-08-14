import { TRACKTOZERO_V2_REPOSITORY_MODES } from "../../../services/tracktozero/repositoryRuntime.js";

// The ONE place environment copy is decided (UX-1 Part 28) - replaces the
// old scattered "TrackToZero 2.0 - Local beta workspace (emulator)" /
// "Interactive seed workspace" strings that used to dominate the header.
// Production never mentions emulator/test terminology; every non-production
// mode gets a small, honest, non-alarming label instead.
export function getEnvironmentBadge(repositoryMode, snapshotMode) {
  if (repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction) return null;
  if (repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta) {
    return { label: "LOCAL BETA", tone: "info" };
  }
  if (repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) {
    return { label: "QA HARNESS", tone: "warning" };
  }
  if (snapshotMode === "legacy_preview") {
    return { label: "READ-ONLY PREVIEW", tone: "warning" };
  }
  return { label: "TEST WORKSPACE", tone: "neutral" };
}
