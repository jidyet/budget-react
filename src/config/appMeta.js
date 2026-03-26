const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

export const APP_VERSION = String(env.VITE_APP_VERSION || "0.0.0");
export const APP_BUILD = String(env.VITE_APP_BUILD || "local");
export const APP_VERSION_LABEL = `${APP_VERSION}${APP_BUILD && APP_BUILD !== APP_VERSION ? ` • ${APP_BUILD}` : ""}`;
