const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const parseFlag = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const founderEmails = parseList(env.VITE_FOUNDER_EMAILS);

export const LAUNCH_FLAGS = {
  billingEnabled: parseFlag(env.VITE_LAUNCH_BILLING_ENABLED, false),
  testerMode: parseFlag(env.VITE_LAUNCH_TESTER_MODE, true),
  premiumUnlockedForTesters: parseFlag(env.VITE_LAUNCH_PREMIUM_UNLOCKED, true),
  softLaunchEnabled: parseFlag(env.VITE_LAUNCH_SOFT_MODE, true),
  reviewPromptsEnabled: parseFlag(env.VITE_LAUNCH_REVIEW_PROMPTS, true),
  founderOpsEnabled: parseFlag(env.VITE_LAUNCH_FOUNDER_OPS, true),
  localAuthEnabled: parseFlag(env.VITE_LAUNCH_LOCAL_AUTH, false),
  founderEmails,
  starterTemplateEnabled: parseFlag(env.VITE_LAUNCH_STARTER_TEMPLATE, false),
};

export const getLaunchFlags = () => ({ ...LAUNCH_FLAGS });

export const isTesterPremiumUnlocked = () =>
  Boolean(LAUNCH_FLAGS.testerMode && LAUNCH_FLAGS.premiumUnlockedForTesters);

export const isFounderEmail = (email = "") =>
  Boolean(
    LAUNCH_FLAGS.founderEmails.includes(String(email || "").trim().toLowerCase())
  );

export const canAccessFounderOps = (email = "") =>
  Boolean(
    LAUNCH_FLAGS.founderOpsEnabled &&
    isFounderEmail(email)
  );
