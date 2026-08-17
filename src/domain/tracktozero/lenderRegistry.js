// UX-8.3: a presentation-only lender identity lookup. Debt has no dedicated
// "creditor" field - `debt.name` is the only free-text display field (the UI
// already labels it "Creditor / debt name" everywhere), so this matches
// against raw name text and never mutates it. This is deliberately separate
// from two other, narrower name-matching tables already in this codebase:
// - services/tracktozero/debtReconciliation.js's normalizeCreditorForMatch,
//   which exists only to score import-duplicate MATCH TOLERANCE, never to
//   choose a display name, and must not be touched by this feature.
// - services/adapters/statementTextExtraction.js's PROVIDER_DETECT, which
//   guesses the issuing bank from OCR'd statement text during parsing,
//   upstream of any Debt existing.
// This module is the only place a canonical DISPLAY identity is derived, and
// it never merges Debt accounts: lenderId identifies an institution, never a
// specific Debt record. Two debts that both resolve to the same lenderId
// remain two separate debts everywhere else in the app.

const STOP_WORDS = new Set(["of", "the", "and", "&", "a", "an"]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Strips a single trailing parenthetical descriptor - e.g. "(Credit Card)",
// "(Line of Credit)" - since debt type is already shown separately by every
// consumer of this module. Never strips anything else; a mid-string
// parenthetical (rare, but possible in a hand-typed name) is left alone.
const stripTrailingParenthetical = (value) => String(value || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

// Deterministic, conservative normalization for MATCHING only (never used
// for display): lowercase, drop periods/commas, collapse whitespace. No
// fuzzy-distance matching, no stemming, no aggressive stripping - matches
// the task's own "fail closed" instruction.
const normalizeForMatch = (value) => stripTrailingParenthetical(value)
  .toLowerCase()
  .replace(/[.,]/g, "")
  .replace(/\s+/g, " ")
  .trim();

// Cleaned text for DISPLAY when no lender is recognized - preserves the
// original creditor text (just trims the redundant trailing descriptor),
// never lowercases or otherwise rewrites it.
const cleanDisplayText = (value) => stripTrailingParenthetical(value) || String(value || "").trim() || "Unknown creditor";

// Two significant words -> two letters. Skips short filler words so "Bank
// of America" -> "BA", not "Bo". Single-word names use their own first two
// characters ("MOHELA" -> "MO").
const deriveInitials = (displayName) => {
  const words = String(displayName || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const aliasRegexCache = new Map();
const aliasRegex = (alias) => {
  if (!aliasRegexCache.has(alias)) {
    aliasRegexCache.set(alias, new RegExp(`\\b${escapeRegExp(alias)}\\b`));
  }
  return aliasRegexCache.get(alias);
};

// UX-8.3: initial curated set, aligned to the lenders already present in
// this codebase's own seed data / test fixtures / statementTextExtraction's
// PROVIDER_DETECT canonical spellings - not an arbitrary "add every bank"
// list. Every alias is the full recognizable institution phrase (never a
// single ambiguous word like "capital" or "america" or "navy") so matching
// stays safe by construction - see lenderRegistry.test.js's false-positive
// tests (Capital Grille, generic "America" text, First Financial vs
// Firstmark, Navy Surplus vs Navy Federal, USAA vs U.S. Bank).
const RAW_LENDERS = [
  { lenderId: "bank_of_america", canonicalName: "Bank of America", category: "bank", aliases: ["bank of america", "boa", "bofa", "bankofamerica"] },
  { lenderId: "capital_one", canonicalName: "Capital One", category: "bank", aliases: ["capital one", "cap one", "capitalone"] },
  { lenderId: "chase", canonicalName: "Chase", category: "bank", aliases: ["chase", "jpmorgan chase", "jpmorgan", "jp morgan", "chase na", "chase n a"] },
  { lenderId: "us_bank", canonicalName: "U.S. Bank", category: "bank", aliases: ["us bank", "usbank", "u s bank"] },
  { lenderId: "wells_fargo", canonicalName: "Wells Fargo", category: "bank", aliases: ["wells fargo", "wellsfargo"] },
  { lenderId: "citi", canonicalName: "Citi", category: "bank", aliases: ["citi", "citibank"] },
  { lenderId: "discover", canonicalName: "Discover", category: "bank", aliases: ["discover"] },
  { lenderId: "american_express", canonicalName: "American Express", category: "bank", aliases: ["american express", "amex"] },
  { lenderId: "synchrony", canonicalName: "Synchrony", category: "fintech", aliases: ["synchrony"] },
  { lenderId: "affirm", canonicalName: "Affirm", category: "fintech", aliases: ["affirm"] },
  { lenderId: "paypal_credit", canonicalName: "PayPal Credit", category: "fintech", aliases: ["paypal credit", "paypal"] },
  { lenderId: "apple_card", canonicalName: "Apple Card", category: "fintech", aliases: ["apple card"] },
  { lenderId: "mohela", canonicalName: "MOHELA", category: "servicer", aliases: ["mohela"] },
  { lenderId: "firstmark", canonicalName: "Firstmark Services", category: "servicer", aliases: ["firstmark services", "firstmark"] },
  { lenderId: "nelnet", canonicalName: "Nelnet", category: "servicer", aliases: ["nelnet"] },
  { lenderId: "aidvantage", canonicalName: "Aidvantage", category: "servicer", aliases: ["aidvantage"] },
  { lenderId: "navient", canonicalName: "Navient", category: "servicer", aliases: ["navient"] },
  { lenderId: "sallie_mae", canonicalName: "Sallie Mae", category: "servicer", aliases: ["sallie mae"] },
  // Short code, already validated safe in this codebase's own
  // statementTextExtraction.js PROVIDER_DETECT table via the identical
  // \baes\b word-boundary approach - kept consistent with that precedent.
  { lenderId: "aes", canonicalName: "AES", category: "servicer", aliases: ["aes"] },
  { lenderId: "sofi", canonicalName: "SoFi", category: "fintech", aliases: ["sofi"] },
  { lenderId: "navy_federal", canonicalName: "Navy Federal Credit Union", category: "credit_union", aliases: ["navy federal credit union", "navy federal", "navy fcu"] },
  { lenderId: "penfed", canonicalName: "PenFed", category: "credit_union", aliases: ["penfed", "pentagon federal"] },
  { lenderId: "ally", canonicalName: "Ally", category: "bank", aliases: ["ally", "ally bank"] },
  { lenderId: "santander", canonicalName: "Santander", category: "bank", aliases: ["santander"] },
  { lenderId: "toyota_financial", canonicalName: "Toyota Financial", category: "auto", aliases: ["toyota financial", "toyota motor credit"] },
  { lenderId: "ford_credit", canonicalName: "Ford Credit", category: "auto", aliases: ["ford credit", "ford motor credit"] },
  { lenderId: "lendingclub", canonicalName: "LendingClub", category: "fintech", aliases: ["lendingclub", "lending club"] },
  { lenderId: "upstart", canonicalName: "Upstart", category: "fintech", aliases: ["upstart"] },
];

// UX-8.3: every entry ships with logoAsset: null - see the results doc's
// "Logo Sourcing" section for why. No real bank logo assets exist anywhere
// in this repo, no safe/verified sourcing pipeline exists, and the task
// explicitly forbids hotlinking a remote logo or fabricating/imitating
// trademarked artwork. The polished initials fallback (see LenderIdentity.jsx)
// is the complete, intentional presentation for this phase; a real local SVG
// could be added later by setting logoAsset on an entry with zero structural
// change to this module or its consumers.
export const LENDER_REGISTRY = Object.freeze(RAW_LENDERS.map((entry) => Object.freeze({
  ...entry,
  logoAsset: null,
  aliasSet: new Set(entry.aliases),
})));

// UX-8.3: the single source of "what lender is this debt" for every UI
// surface (Home/Debts/Plan/Review/Activity) - never reimplemented per
// screen. Pure function: same input always produces the same output, never
// reads or writes a Debt, never touches payoff math or reconciliation.
export const getLenderIdentity = (rawCreditorText) => {
  const normalized = normalizeForMatch(rawCreditorText);
  if (normalized) {
    for (const entry of LENDER_REGISTRY) {
      if (entry.aliasSet.has(normalized)) {
        return {
          lenderId: entry.lenderId,
          canonicalName: entry.canonicalName,
          matched: true,
          matchType: "exact",
          logoAsset: entry.logoAsset,
          initials: deriveInitials(entry.canonicalName),
        };
      }
    }
    for (const entry of LENDER_REGISTRY) {
      if (entry.aliases.some((alias) => aliasRegex(alias).test(normalized))) {
        return {
          lenderId: entry.lenderId,
          canonicalName: entry.canonicalName,
          matched: true,
          matchType: "token",
          logoAsset: entry.logoAsset,
          initials: deriveInitials(entry.canonicalName),
        };
      }
    }
  }
  const cleanedOriginal = cleanDisplayText(rawCreditorText);
  return {
    lenderId: null,
    canonicalName: cleanedOriginal,
    matched: false,
    matchType: "none",
    logoAsset: null,
    initials: deriveInitials(cleanedOriginal),
  };
};
