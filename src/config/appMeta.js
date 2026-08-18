/* global __APP_VERSION__, __APP_BUILD__, __APP_COMMIT__ */

const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const fallbackVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const fallbackBuild = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "";
const fallbackCommit = typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "";

export const APP_VERSION = String(env.VITE_APP_VERSION || fallbackVersion);
export const APP_BUILD = String(env.VITE_APP_BUILD || fallbackBuild);
// BETA-1: the short git commit hash this build was produced from, e.g.
// "4715497" - never a secret, just a build-provenance identifier so a
// tester/support engineer can report exactly which release candidate they're
// on (see TrackToZero V2 Settings' "Build" line). Empty when unavailable
// (e.g. a shallow checkout with no .git directory) - callers must treat "" as
// "unknown," never fabricate a placeholder commit.
export const APP_COMMIT = String(fallbackCommit || "");
export const APP_VERSION_LABEL = `${APP_VERSION}${APP_BUILD && APP_BUILD !== APP_VERSION ? ` • ${APP_BUILD}` : ""}`;
