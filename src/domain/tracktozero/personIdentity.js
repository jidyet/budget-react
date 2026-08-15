import { namesTokenMatch } from "./ownership.js";

// DATA-HH1: the household financial-person matching engine.
//
// Core distinction this whole file exists to protect (see the module's
// companion doc in ownership.js's resolveDebtOwnership): an imported name is
// EVIDENCE that a financial record may belong to a person, never proof of an
// authenticated account, a WorkspaceMembership, or permission to access
// anything. Matching here is deterministic and Workspace-scoped only - no
// fuzzy AI-style guessing, no cross-workspace name matching, no global alias
// table. Every classification below except "exact"/"joint" is a SUGGESTION
// for a human to confirm; nothing in this file ever assigns ownership by
// itself.

// One centralized normalization path (Part 7) - trims, collapses whitespace,
// case-folds, and strips light punctuation. Deliberately does NOT attempt
// anything that would guess a relationship between two different real names
// (e.g. "Kristina Davis" and "Kristina Yusuf" are never assumed related).
export const normalizePersonName = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .toLowerCase();

const JOINT_LITERALS = new Set(["joint", "joint household", "joint / household", "household"]);
const isJointLiteral = (rawName) => JOINT_LITERALS.has(normalizePersonName(rawName));

// nameTokens (ownership.js) filters out anything shorter than 2 characters,
// which is right for full-name equality but throws away a printed initial
// like "B." entirely. This tokenizer keeps single-letter tokens so the
// "possible" tier below can actually see them.
const tokensWithInitials = (value) => String(value || "")
  .toLowerCase()
  .split(/[^a-z]+/)
  .filter(Boolean);

// "Possible" tier (Part 6) - an initial-based abbreviation of the same
// surname (e.g. "B. Yusuf" for "Babajide Yusuf"). Deliberately narrower than
// namesTokenMatch's "exact" tier: a genuine nickname/shortened first name
// (e.g. "Jide" for "Babajide") is NOT auto-detected here - that requires an
// explicit, previously-confirmed alias (the "strong" tier below), never an
// automatic first-token heuristic, since nicknames are far more ambiguous
// than a printed initial.
const isPossibleInitialMatch = (rawName, candidateName) => {
  const rawTokens = tokensWithInitials(rawName);
  const candidateTokens = tokensWithInitials(candidateName);
  if (rawTokens.length < 2 || candidateTokens.length < 2) return false;
  const rawFirst = rawTokens[0];
  const rawLast = rawTokens.at(-1);
  const candidateFirst = candidateTokens[0];
  const candidateLast = candidateTokens.at(-1);
  if (rawLast !== candidateLast) return false;
  if (rawFirst === candidateFirst) return false; // already covered by the "exact" tier
  const initialOf = (short, full) => short.length === 1 && full.startsWith(short);
  return initialOf(rawFirst, candidateFirst) || initialOf(candidateFirst, rawFirst);
};

// The one deterministic classification an imported owner name can receive.
// Workspace-scoped by construction - callers only ever pass in the CURRENT
// workspace's own members/people, never a cross-workspace list.
//
// Returns one of:
//   { status: "joint" }
//   { status: "exact", kind: "member"|"person", membershipUid?, personId?, reason }
//   { status: "strong", kind: "person", personId, reason }   (confirmed alias only)
//   { status: "possible", kind: "member"|"person", membershipUid?, personId?, reason }
//   { status: "unresolved", reason }
export const matchImportedOwnerToIdentity = ({ rawName, members = [], people = [] } = {}) => {
  const raw = String(rawName || "").trim();
  if (!raw) return { status: "unresolved", reason: "No owner name found." };
  if (isJointLiteral(raw)) return { status: "joint", reason: "Explicit Joint/Household reference." };

  const activeMembers = members.filter((member) => member.status !== "removed");
  const activePeople = people.filter((person) => person.status !== "merged");

  const exactMember = activeMembers.find((member) => namesTokenMatch(raw, member.displayName));
  if (exactMember) {
    return { status: "exact", kind: "member", membershipUid: exactMember.uid, reason: "Matches a verified workspace member." };
  }
  const exactPerson = activePeople.find((person) => namesTokenMatch(raw, person.displayName));
  if (exactPerson) {
    return { status: "exact", kind: "person", personId: exactPerson.id, reason: "Matches an existing household person." };
  }

  const normalizedRaw = normalizePersonName(raw);
  const aliasPerson = activePeople.find((person) =>
    (person.aliases || []).some((alias) => normalizePersonName(alias) === normalizedRaw));
  if (aliasPerson) {
    return { status: "strong", kind: "person", personId: aliasPerson.id, reason: "Matches a confirmed alias." };
  }

  const possibleMember = activeMembers.find((member) => isPossibleInitialMatch(raw, member.displayName));
  if (possibleMember) {
    return { status: "possible", kind: "member", membershipUid: possibleMember.uid, reason: "Same surname, initial-only first name - needs confirmation." };
  }
  const possiblePerson = activePeople.find((person) => isPossibleInitialMatch(raw, person.displayName));
  if (possiblePerson) {
    return { status: "possible", kind: "person", personId: possiblePerson.id, reason: "Same surname, initial-only first name - needs confirmation." };
  }

  return { status: "unresolved", reason: "No confident match found." };
};

// Duplicate-person guard (Part 23) - normalized exact match only. Two
// people whose names merely resemble each other (e.g. "Babajide Yusuf" and
// "Jide Yusuf") are NOT treated as duplicates here; that requires an
// explicit confirmed alias or a manual merge, never a silent auto-merge.
export const findDuplicatePerson = (displayName, people = []) => {
  const normalized = normalizePersonName(displayName);
  return people.find((person) => person.status !== "merged" && normalizePersonName(person.displayName) === normalized) || null;
};

// Same guard, but against real verified members too - creating a household
// person whose name exactly matches an existing member would produce two
// competing identities for the same real person (Part 5).
export const findDuplicateMember = (displayName, members = []) => {
  const normalized = normalizePersonName(displayName);
  return members.find((member) => member.status !== "removed" && normalizePersonName(member.displayName) === normalized) || null;
};
