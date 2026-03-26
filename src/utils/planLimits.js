import { isTesterPremiumUnlocked } from "../config/launchFlags";

export const PLAN_IDS = {
  FREE: "free",
  PREMIUM: "premium",
};

export const PLAN_LIMITS = {
  [PLAN_IDS.FREE]: {
    householdMembers: 2,
    multipleHouseholds: 1,
    advancedProgress: false,
    reminders: false,
    weeklySummaries: false,
    export: false,
  },
  [PLAN_IDS.PREMIUM]: {
    householdMembers: 12,
    multipleHouseholds: 5,
    advancedProgress: true,
    reminders: true,
    weeklySummaries: true,
    export: true,
  },
};

export const getPlanId = (subscription = {}) => {
  if (subscription?.testerMode && subscription?.premiumUnlockedForTesters) {
    return PLAN_IDS.PREMIUM;
  }
  if (isTesterPremiumUnlocked()) {
    return PLAN_IDS.PREMIUM;
  }
  const status = String(subscription?.status || "").toLowerCase();
  const planId = String(subscription?.planId || "").toLowerCase();
  if ((status === "active" || status === "trialing") && planId === PLAN_IDS.PREMIUM) {
    return PLAN_IDS.PREMIUM;
  }
  return PLAN_IDS.FREE;
};

export const getPlanLimits = (subscription = {}) => PLAN_LIMITS[getPlanId(subscription)] || PLAN_LIMITS[PLAN_IDS.FREE];

export const hasPremiumAccess = (subscription = {}) => getPlanId(subscription) === PLAN_IDS.PREMIUM;

export const canUseFeature = (subscription = {}, feature) => {
  const limits = getPlanLimits(subscription);
  if (!(feature in limits)) return true;
  return Boolean(limits[feature]);
};

export const getUpgradeMessage = (feature) => {
  const copy = {
    advancedProgress: "See more of your progress",
    reminders: "Keep your momentum going",
    weeklySummaries: "Go further together",
    export: "Take your progress with you",
    householdMembers: "Unlock shared progress",
  };
  return copy[feature] || "Go further together";
};
