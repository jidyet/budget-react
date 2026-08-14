import { OWNER_TYPES } from "./constants.js";

// Debts written before ownerType existed (including anything read straight
// back from a repository without going through createDebt's validation,
// which is how both the in-memory and Firestore repositories read data)
// only have ownerId. Every reader of ownerType must apply this same
// backward-compatible default - never assume the field is always present.
export const effectiveOwnerType = (debt) => debt?.ownerType || (debt?.ownerId ? "member" : "unassigned");

// The single source of truth for turning a requested ownership choice into a
// verified { ownerType, ownerId, ownerLabel } triple. Used by both the sync
// and async application services so the two runtimes can never drift (see
// the zero-balance targetDebt bug this same duplication caused elsewhere).
//
// Contract:
// - Personal workspaces always default to the signed-in member - there is
//   never a choice to make, and nothing the caller requests can override it.
// - Household workspaces require an explicit choice: a verified member uid,
//   "joint" (the household as a whole), or "unassigned" (decision deferred).
//   A member uid that isn't in the real, active membership list is REJECTED,
//   never silently accepted or invented - this is what stops arbitrary
//   parser text (or any other unverified string) from becoming an owner.
export const resolveDebtOwnership = ({ workspaceType, members = [], actorId, requested = {} } = {}) => {
  if (workspaceType === "personal") {
    const self = members.find((member) => member.uid === actorId);
    return { ownerType: "member", ownerId: actorId, ownerLabel: self?.displayName || "You" };
  }

  const ownerType = requested.ownerType || "unassigned";
  if (!OWNER_TYPES.includes(ownerType)) {
    throw new Error(`Invalid ownerType "${ownerType}".`);
  }

  if (ownerType === "member") {
    const memberId = String(requested.ownerId || "").trim();
    const match = memberId ? members.find((member) => member.uid === memberId && member.status !== "removed") : null;
    if (!match) {
      throw new Error("Owner must be a verified household member. Choose Joint/Household or Unassigned instead.");
    }
    return { ownerType: "member", ownerId: memberId, ownerLabel: match.displayName || memberId };
  }

  if (ownerType === "joint") {
    return { ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household" };
  }

  return { ownerType: "unassigned", ownerId: "", ownerLabel: "Unassigned" };
};
