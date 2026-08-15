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
//   a verified WorkspacePerson id (DATA-HH1 - a financial identity that may
//   have no TrackToZero account at all), "joint" (the household as a
//   whole), or "unassigned" (decision deferred). A member uid or person id
//   that isn't in the real, active list is REJECTED, never silently
//   accepted or invented - this is what stops arbitrary parser text (or any
//   other unverified string) from becoming an owner.
export const resolveDebtOwnership = ({ workspaceType, members = [], people = [], actorId, requested = {} } = {}) => {
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

  if (ownerType === "person") {
    const personId = String(requested.ownerId || "").trim();
    const match = personId ? people.find((person) => person.id === personId && person.status !== "merged") : null;
    if (!match) {
      throw new Error("Owner must be a verified household person. Choose Joint/Household or Unassigned instead.");
    }
    return { ownerType: "person", ownerId: personId, ownerLabel: match.displayName || personId };
  }

  if (ownerType === "joint") {
    return { ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household" };
  }

  return { ownerType: "unassigned", ownerId: "", ownerLabel: "Unassigned" };
};

export const nameTokens = (value) => String(value || "")
  .toLowerCase()
  .split(/[^a-z]+/)
  .filter((token) => token.length >= 2);

// Exact token equality (never fuzzy/substring matching) between a raw name
// and a candidate's display name - shared by matchMemberByName and
// DATA-HH1's person-matching engine so both use the identical definition of
// "confident enough to pre-fill." A single-token candidate (e.g. seeded/
// invited as just "Baba") matches if that token equals either the raw
// name's first or last token; a multi-token candidate matches on first+last
// (ignoring middle names/initials, so "Kristina K Davis" still matches a
// candidate named "Kristina Davis").
export const namesTokenMatch = (rawName, candidateName) => {
  const rawTokens = nameTokens(rawName);
  if (rawTokens.length < 2) return false;
  const first = rawTokens[0];
  const last = rawTokens.at(-1);
  const candidateTokens = nameTokens(candidateName);
  if (candidateTokens.length === 1) return candidateTokens[0] === first || candidateTokens[0] === last;
  if (candidateTokens.length >= 2) return candidateTokens[0] === first && candidateTokens.at(-1) === last;
  return false;
};

// A convenience pre-fill only - never authoritative on its own. When a
// statement parser's raw ownerSuggestion (e.g. a cardholder name printed on
// a PDF) matches a REAL verified household member, the import review UI can
// pre-select that member instead of forcing a manual pick every time.
// Whatever this returns is still just a starting selection:
// resolveDebtOwnership re-verifies against the real membership list before
// anything is saved, so a false match here can never itself grant
// ownership - the human still reviews and confirms (or changes) it before
// the import is committed.
export const matchMemberByName = (suggestion, members = []) =>
  members.find((member) => member.status !== "removed" && namesTokenMatch(suggestion, member.displayName)) || null;

// ── Balance truth (UX-0) ──────────────────────────────────────────────────
//
// Debts written before balanceStatus existed (same backward-compatibility
// situation as effectiveOwnerType above - repository reads never re-run
// createDebt's defaulting) only have currentBalance. Absent the field
// entirely, a debt is treated as confirmed: every debt creation path that
// predates this field required a real observed balance (manual entry, or an
// opening BalanceSnapshot recorded atomically with the debt), so there is no
// legacy scenario where an absent balanceStatus should mean "unresolved".
export const effectiveBalanceStatus = (debt) => debt?.balanceStatus || "confirmed";

export const isBalanceUnresolved = (debt) => effectiveBalanceStatus(debt) === "unresolved";

// True only when a balance of $0 (or less) is a real, confirmed observation -
// i.e. a genuine claim that the debt is paid off. An unresolved $0 (a failed
// or missing import) must never be treated as "paid off" - see isDebtNeedsReview.
export const isConfirmedZero = (debt) => Number(debt?.currentBalance || 0) <= 0 && !isBalanceUnresolved(debt);

// UX-4: promoted out of TrackToZeroV2App.jsx so the Plan Hub (a separate
// component tree) can share the exact same "how do we show this debt's
// owner" logic instead of re-deriving it - one canonical owner-display path
// (Part 33's own requirement, carried over from DATA-HH1). A stored
// ownerLabel that looks like statement noise (mail-handling boilerplate, a
// card product name) is shown as "Unassigned" instead of as if it were a
// real person - for records written before the parser-level fix existed,
// without ever mutating the stored value or running a backfill.
export const presentedOwnerLabel = (debt) => (looksLikeJunkOwnerLabel(debt?.ownerLabel) ? "Unassigned" : (debt?.ownerLabel || "Unassigned"));

// A minimum/required payment that suspiciously equals the debt's own APR
// percentage (e.g. minimumRequiredPayment: 6.74 when apr is stored as 0.0674,
// i.e. 6.74%) is very likely the exact "APR became minimum payment" data
// contamination the parser-level fix (MONEY_VALUE_RE) prevents going
// forward. This is a pure, non-destructive detector for records that were
// already written before that fix, or written by any other path - it never
// mutates the stored value, only flags it so the UI/plan engine can stop
// trusting it.
export const isMinimumPaymentContaminated = (debt) => {
  if (debt?.aprStatus !== "known" || debt?.apr == null || debt?.minimumRequiredPayment == null) return false;
  const impliedPercent = Number(debt.apr) * 100;
  return Math.abs(Number(debt.minimumRequiredPayment) - impliedPercent) < 0.01 && impliedPercent > 0;
};

// Common statement noise that has been observed leaking into a stored
// ownerLabel (mail-handling boilerplate, card product/network names). This
// is deliberately a SMALL, display-time safety net for records written
// before the parser-level fixes (HOLDER_NAME_BAD_PHRASE_RE) existed - it
// never mutates stored data, it only stops already-written junk from being
// rendered as if it were a real person.
const JUNK_OWNER_LABEL_RE = /\b(?:undeliverable|service requested|current resident|current occupant|postal customer|boxholder|visa signature|visa platinum|visa infinite|mastercard|world elite|signature card|platinum card|business card)\b/i;
export const looksLikeJunkOwnerLabel = (label) => JUNK_OWNER_LABEL_RE.test(String(label || ""));

// A Debt's material financial truth is unresolved if its balance was never
// confirmed, or its minimum payment is almost certainly contaminated data.
// Debts in this state must not silently drive an authoritative payoff plan
// (excluded from the simulation/queue/target - see projectionStatusService's
// getEligiblePlanDebts) until a human reviews and corrects them. This is
// deliberately scoped to fields that would corrupt financial MATH if trusted
// - a junk owner label affects display/attribution, not calculation
// correctness, so it is surfaced separately (see looksLikeJunkOwnerLabel)
// rather than folded in here.
export const isDebtNeedsReview = (debt) => isBalanceUnresolved(debt) || isMinimumPaymentContaminated(debt);
