import { getPlanId, getPlanLimits, hasPremiumAccess } from "../utils/planLimits";
import { getLaunchFlags } from "../config/launchFlags";

const toDateLabel = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const buildSubscriptionState = ({ userProfile = {}, householdMembers = [], memberships = [] } = {}) => {
  const launchFlags = getLaunchFlags();
  const subscription = userProfile?.subscription || {};
  const planId = getPlanId(subscription);
  const effectiveSubscription = {
    ...subscription,
    testerMode: launchFlags.testerMode,
    premiumUnlockedForTesters: launchFlags.premiumUnlockedForTesters,
  };
  const limits = getPlanLimits(effectiveSubscription);
  const premium = hasPremiumAccess(effectiveSubscription);
  const memberCount = householdMembers.length;

  return {
    raw: subscription,
    effective: effectiveSubscription,
    planId,
    premium,
    testerMode: launchFlags.testerMode,
    billingEnabled: launchFlags.billingEnabled,
    premiumUnlockedForTesters: launchFlags.premiumUnlockedForTesters,
    status: String(subscription?.status || "free"),
    renewalDate: toDateLabel(subscription?.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    customerPortalUrl: subscription?.customerPortalUrl || "",
    limits,
    memberCount,
    multipleHouseholdsCount: Array.isArray(memberships) ? memberships.length : 0,
    memberLimitReached: memberCount >= Number(limits.householdMembers || 0),
  };
};
