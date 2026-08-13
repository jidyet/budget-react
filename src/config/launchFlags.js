const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const parseFlag = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export const LAUNCH_FLAGS = {
  billingEnabled: parseFlag(env.VITE_LAUNCH_BILLING_ENABLED, false),
  testerMode: parseFlag(env.VITE_LAUNCH_TESTER_MODE, false),
  premiumUnlockedForTesters: parseFlag(env.VITE_LAUNCH_PREMIUM_UNLOCKED, false),
  softLaunchEnabled: parseFlag(env.VITE_LAUNCH_SOFT_MODE, false),
  aiCoachEnabled: parseFlag(env.VITE_LAUNCH_AI_COACH_ENABLED, false),
  aiCoachTesterOnly: parseFlag(env.VITE_LAUNCH_AI_COACH_TESTER_ONLY, true),
  reviewPromptsEnabled: parseFlag(env.VITE_LAUNCH_REVIEW_PROMPTS, true),
  founderOpsEnabled: parseFlag(env.VITE_LAUNCH_FOUNDER_OPS, false),
  localAuthEnabled: parseFlag(env.VITE_LAUNCH_LOCAL_AUTH, false),
  starterTemplateEnabled: parseFlag(env.VITE_LAUNCH_STARTER_TEMPLATE, false),
  trackToZeroV2Enabled: parseFlag(env.VITE_TRACKTOZERO_V2_ENABLED, true),
  trackToZeroMigrationEnabled: parseFlag(env.VITE_TRACKTOZERO_MIGRATION_ENABLED, false),
};

export const getLaunchFlags = () => ({ ...LAUNCH_FLAGS });

export const isTesterPremiumUnlocked = () =>
  Boolean(LAUNCH_FLAGS.testerMode && LAUNCH_FLAGS.premiumUnlockedForTesters);

export const canAccessAICoach = ({ founderAccount = false } = {}) =>
  Boolean(
    LAUNCH_FLAGS.aiCoachEnabled
      && (!LAUNCH_FLAGS.aiCoachTesterOnly || LAUNCH_FLAGS.testerMode || founderAccount)
  );
