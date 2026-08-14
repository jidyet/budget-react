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

const nameTokens = (value) => String(value || "")
  .toLowerCase()
  .split(/[^a-z]+/)
  .filter((token) => token.length >= 2);

// A convenience pre-fill only - never authoritative on its own. When a
// statement parser's raw ownerSuggestion (e.g. a cardholder name printed on
// a PDF) matches a REAL verified household member, the import review UI can
// pre-select that member instead of forcing a manual pick every time.
// Household member profiles are frequently just a first name (e.g. seeded/
// invited as "Baba"), so a single-token member matches if that token equals
// either the suggestion's first or last token; a multi-token member matches
// on first+last (ignoring middle names/initials, so "Kristina K Davis" still
// matches a member profile of "Kristina Davis"). Either way this is exact
// token equality, never fuzzy/substring matching, to avoid matching two
// different people. Whatever this returns is still just a starting
// selection: resolveDebtOwnership re-verifies against the real membership
// list before anything is saved, so a false match here can never itself
// grant ownership - the human still reviews and confirms (or changes) it
// before the import is committed.
export const matchMemberByName = (suggestion, members = []) => {
  const suggestionTokens = nameTokens(suggestion);
  if (suggestionTokens.length < 2) return null;
  const first = suggestionTokens[0];
  const last = suggestionTokens.at(-1);
  return members.find((member) => {
    if (member.status === "removed") return false;
    const memberTokens = nameTokens(member.displayName);
    if (memberTokens.length === 1) return memberTokens[0] === first || memberTokens[0] === last;
    if (memberTokens.length >= 2) return memberTokens[0] === first && memberTokens.at(-1) === last;
    return false;
  }) || null;
};
