/* global __APP_VERSION__, __APP_BUILD__ */

const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const fallbackVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const fallbackBuild = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "";

export const APP_VERSION = String(env.VITE_APP_VERSION || fallbackVersion);
export const APP_BUILD = String(env.VITE_APP_BUILD || fallbackBuild);
export const APP_VERSION_LABEL = `${APP_VERSION}${APP_BUILD && APP_BUILD !== APP_VERSION ? ` • ${APP_BUILD}` : ""}`;
