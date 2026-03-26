import {
  approveJoinRequest,
  continueSoloWorkspace,
  createHousehold,
  rejectJoinRequest,
  requestJoinHousehold,
  saveHouseholdMemberProfile,
  saveUserProfile,
  searchHouseholds,
  subscribeHouseholdForUser,
  subscribeHouseholdMembers,
  subscribeJoinRequests,
  subscribeUserProfile,
} from "../firebase";

export const HOUSEHOLD_ROLES = ["owner", "admin", "member", "viewer"];

export const canManageHouseholdRole = (role) => ["owner", "admin"].includes(String(role || ""));

export const buildHouseholdSeed = ({ records, income, settings, plans }) => ({
  records: records || {},
  income: income || {},
  settings: settings || {},
  plans: plans || [],
});

export const createHouseholdWorkspace = ({ user, household, seed }) => createHousehold(user, household, seed);
export const continueSoloHouseholdFlow = (uid) => continueSoloWorkspace(uid);
export const searchJoinableHouseholds = (term) => searchHouseholds(term);
export const joinHouseholdWorkspace = ({ user, household }) => requestJoinHousehold(user, household);
export const approveHouseholdMember = ({ householdId, requestUserId, approver }) => approveJoinRequest(householdId, requestUserId, approver);
export const rejectHouseholdMember = ({ householdId, requestUserId, approver }) => rejectJoinRequest(householdId, requestUserId, approver);
export const subscribeCurrentHousehold = (uid, callback) => subscribeHouseholdForUser(uid, callback);
export const subscribeMembers = (householdId, callback) => subscribeHouseholdMembers(householdId, callback);
export const subscribePendingRequests = (householdId, callback) => subscribeJoinRequests(householdId, callback);
export const subscribeCurrentUserProfile = (uid, callback) => subscribeUserProfile(uid, callback);
export const saveCurrentUserProfile = ({ uid, profile }) => saveUserProfile(uid, profile);
export const saveCurrentHouseholdMemberProfile = ({ householdId, uid, profile }) => saveHouseholdMemberProfile(householdId, uid, profile);

export const formatHouseholdRole = (role) => {
  const value = String(role || "member").toLowerCase();
  if (value === "owner") return "Owner";
  if (value === "admin") return "Admin";
  if (value === "viewer") return "Viewer";
  return "Member";
};

export const buildHouseholdNextMove = ({ dueSoon = [], totalDue = 0, remaining = 0 }) => {
  const nextDue = dueSoon[0];
  if (nextDue) {
    return {
      title: "Next move",
      body: `${nextDue.name} is the next thing to clear.`,
      meta: `${nextDue.d_left === 0 ? "Due today" : `Due in ${nextDue.d_left} day${nextDue.d_left === 1 ? "" : "s"}`}`,
    };
  }
  if (remaining > 0) {
    return {
      title: "Next move",
      body: "Keep the month moving forward.",
      meta: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(totalDue || remaining || 0))} left to cover`,
    };
  }
  return {
    title: "Shared progress",
    body: "You covered the month together.",
    meta: "One thing left: keep the streak going tomorrow.",
  };
};

export const buildHouseholdInviteLink = (household, origin = "") => {
  if (!household?.joinCode) return "";
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}?joinCode=${encodeURIComponent(household.joinCode)}`;
};
