import { fx } from "../../utils/budgetUtils.js";

// Generic statement text-extraction engine, extracted verbatim (no logic
// changes) from src/StatementUpload.jsx so it can be shared between the
// legacy V1 statement importer and the V2 pdfImportReader.js/imageImportReader.js
// without violating react-refresh/only-export-components (a .jsx file may only
// export components). This module has no React/JSX dependency - it is pure
// text-in, structured-data-out parsing.
//
// Generic statement patterns — no per-lender dispatch.
// Provider detection and all field enrichment are handled by detectProviderName() + enrichStatement().

// Balance: prefer "new balance" first (credit card statements), then fallbacks for loans/LOCs.
export const STMT_BALANCE_RE = [
  /\bnew balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bstatement balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\baccount balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\boutstanding balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\btotal balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bcurrent balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bamount owed[^\d\n-]*\$?([\d,]+\.\d{2})/i,
];

// Minimum due: ordered from most-explicit to most-generic to avoid false positives.
export const STMT_MIN_DUE_RE = [
  /minimum (?:payment )?due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /minimum amount due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /regular monthly payment amount[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /monthly payment[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /amount due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /payment due[^\d\n]*\$?([\d,]+\.\d{2})/i,
];

// Due date: "Payment Due Date" is the most reliable label; fall back to generic "Due Date".
export const STMT_DUE_DATE_RE = [
  /payment\s+due\s+date[^\n]*?(\d{2}\/\d{2}\/\d{4})/i,
  /payment\s+due\s+date[^\n]*?(\w+ \d{1,2},?\s*\d{4})/i,
  /due\s+date[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /due\s+date[^\n]*?(\w+ \d{1,2},?\s*\d{4})/i,
  /pay\s+by[^\n]*?(\w+ \d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
];

export const EXTRACTION_RE = {
  remainingBalance: [
    /remaining statement balance[^\d$]*\$([\d,]+\.\d{2})/i,
    /amount remaining[^\d$]*\$([\d,]+\.\d{2})/i,
  ],
  previousBalance: [
    /(?:previous balance|prior balance|last statement balance)[^\d-]*\$?([\d,]+\.\d{2})/i,
  ],
  newPurchases: [
    /(?:new purchases?|purchases and other charges|new charges|purchase amount)[^\d-]*\$?([\d,]+\.\d{2})/i,
    /(?:^|\s)purchases\s*[+-]?\$?([\d,]+\.\d{2})/i,
  ],
  interestCharged: [
    /(?:interest charged|finance charge|interest this period|total interest charged)[^\d-]*\$?([\d,]+\.\d{2})/i,
    /total interest for this period[^\d-+]*[+-]?\$?([\d,]+\.\d{2})/i,
  ],
  fees: [
    /(?:fees charged|returned payment fee|total fees)[^\d-]*\$?([\d,]+\.\d{2})/i,
    /total fees for this period[^\d-+]*[+-]?\$?([\d,]+\.\d{2})/i,
  ],
  principalBalance: [
    /(?:principal balance|outstanding principal|current principal)[^\d-]*\$?([\d,]+\.\d{2})/i,
  ],
  accruedInterest: [
    /(?:accrued interest|unpaid interest|interest balance|interest accrued)[^\d-]*\$?([\d,]+\.\d{2})/i,
  ],
  estimatedPayoff: [
    /estimated payoff[\s\S]{0,80}?(\d{2,3},\d{3}\.\d{2})/i,
    /payoff amount[\s\S]{0,60}?(\d{2,3},\d{3}\.\d{2})/i,
  ],
};

const APR_LABEL_PATTERNS = [
  "\\bAPR\\b",
  "\\bAPR %\\b",
  "\\bAnnual Percentage Rate\\b",
  "\\bYour Annual Percentage Rate \\(APR\\)\\b",
  "\\bPurchase APR\\b",
  "\\bVariable APR\\b",
  "\\bInterest Rate\\b",
  "\\bannual interest rate\\b",
  "\\bAPR for current and future transactions\\b",
];

const APR_VALUE_RE = "(\\d{1,2}(?:\\.\\d{1,3})?)\\s*%";
export const APR_CONTEXT_PATTERNS = [
  { label: "purchase", regex: new RegExp(`(?:purchase|purchases|purchase apr|apr for current and future transactions|current and future transactions)[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 120 },
  { label: "variable", regex: new RegExp(`(?:variable apr|variable rate|annual percentage rate \\(apr\\))[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 90 },
  { label: "interest-rate", regex: new RegExp(`(?:interest rate|annual interest rate)[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 70 },
  { label: "generic", regex: new RegExp(`(?:${APR_LABEL_PATTERNS.join("|")})[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 55 },
];

export const APR_TABLE_ROW_RE = /([A-Za-z][A-Za-z /&()-]{3,80}?)\s+(\d{1,2}(?:\.\d{1,3})?)%/g;
export const MONEY_VALUE_RE = /\$?([\d,]+\.\d{2})/g;

export const FIELD_CONFIG = [
  { label: "Balance", key: "balance", step: "0.01", placeholder: "Not found" },
  { label: "Remaining balance", key: "remaining_balance", step: "0.01", placeholder: "Optional" },
  { label: "Min due", key: "min_due", step: "0.01", placeholder: "Not found" },
  { label: "Due day", key: "due_day", step: "1", placeholder: "Not found" },
  { label: "APR %", key: "apr_percent", step: "0.001", placeholder: "Optional" },
  { label: "New purchases", key: "new_purchases", step: "0.01", placeholder: "Optional" },
  { label: "Interest charged", key: "interest_charged", step: "0.01", placeholder: "Optional" },
  { label: "Fees", key: "fees", step: "0.01", placeholder: "Optional" },
];

export const PROVIDER_EXAMPLES = ["Discover", "Chase", "Bank of America", "Capital One", "Citi", "Wells Fargo", "US Bank", "Navy Federal", "SoFi", "Affirm", "Synchrony", "Navient", "MOHELA", "Nelnet", "Sallie Mae", "AES", "+ any PDF statement"];

let pdfJsLoading = null;
let ocrLoading = null;

export const loadPdfJs = async () => {
  if (pdfJsLoading) return pdfJsLoading;
  pdfJsLoading = Promise.all([
    import("pdfjs-dist/build/pdf.min.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfModule, workerModule]) => ({
    pdfjsLib: pdfModule,
    workerSrc: workerModule.default,
  }));
  return pdfJsLoading;
};

export const loadOcr = async () => {
  if (ocrLoading) return ocrLoading;
  ocrLoading = import("tesseract.js");
  return ocrLoading;
};

export function parseCurrency(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[$,\s]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function parseNumericInput(value) {
  if (value === "" || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatCurrency(value) {
  return value == null ? "-" : fx(value);
}

export function getTextLines(text) {
  return String(text || "")
    .split(/\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export function extractDay(dateStr) {
  if (!dateStr) return null;
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
  if (slashMatch) return Number(slashMatch[2]);
  const wordMatch = dateStr.match(/\w+ (\d{1,2})/);
  if (wordMatch) return Number(wordMatch[1]);
  return null;
}

export function firstCurrencyMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseCurrency(match[1]);
      if (amount != null) return amount;
    }
  }
  return null;
}

// Forward-only window: once a label matches (possibly mid-line), only text
// AFTER that match - the rest of its own line, then up to `searchLines`
// following lines - is searched for the value. This is the fix for a real
// cross-field contamination bug: the previous implementation joined a whole
// N-line window and then took "the first value anywhere in the window",
// which let an earlier line's amount (e.g. "New Balance: $1,845.20") answer
// a later line's label (e.g. "Minimum Payment Due: $45.00") whenever the two
// were within `searchLines` of each other. Searching only forward from the
// label's own match position means a value can only satisfy the label that
// precedes it, never one that follows - "Label: $X" and "Label\n$X" both
// still resolve correctly, but a *different* label's value earlier in the
// window can no longer leak into this one.
const forwardWindowFromLabelMatch = (lines, lineIndex, match, searchLines) => {
  const line = lines[lineIndex];
  const afterLabelOnSameLine = line.slice(match.index + match[0].length);
  const followingLines = lines.slice(lineIndex + 1, lineIndex + 1 + searchLines);
  return [afterLabelOnSameLine, ...followingLines].join(" ");
};

export function extractLabeledCurrency(text, labelPatterns, { allowZero = true, searchLines = 2 } = {}) {
  const lines = getTextLines(text);
  const candidates = [];

  lines.forEach((line, index) => {
    labelPatterns.forEach((labelPattern, labelIndex) => {
      const match = line.match(labelPattern);
      if (!match) return;
      const forwardWindow = forwardWindowFromLabelMatch(lines, index, match, searchLines);
      const amounts = [...forwardWindow.matchAll(MONEY_VALUE_RE)]
        .map((m) => parseCurrency(m[1]))
        .filter((value) => value != null);
      if (!amounts.length) return;
      const value = allowZero ? amounts[0] : amounts.find((amount) => amount > 0);
      if (value == null) return;
      let score = 100 - labelIndex * 10 - index;
      if (index < 12) score += 18;
      candidates.push({ value, score });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value ?? null;
}

export function extractLabeledDate(text, labelPatterns, { searchLines = 2 } = {}) {
  const lines = getTextLines(text);
  const dateValueRe = /(\d{2}\/\d{2}\/\d{4}|\w+ \d{1,2},?\s*\d{4})/i;
  const candidates = [];

  lines.forEach((line, index) => {
    labelPatterns.forEach((labelPattern, labelIndex) => {
      const match = line.match(labelPattern);
      if (!match) return;
      const forwardWindow = forwardWindowFromLabelMatch(lines, index, match, searchLines);
      const dateMatch = forwardWindow.match(dateValueRe);
      if (!dateMatch?.[1]) return;
      let score = 100 - labelIndex * 10 - index;
      if (index < 12) score += 18;
      candidates.push({ value: dateMatch[1], score });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value ?? null;
}

export function extractLast4(value) {
  const match = String(value || "").match(/(\d{4})(?!.*\d)/);
  return match?.[1] || "";
}

export function normalizeProviderKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractAccountLast4FromText(text) {
  const source = String(text || "");
  const patterns = [
    /(?:account|card)(?: number| no\.?| #)?[^\d]{0,24}(?:ending(?: in)?|ends(?: in)?|last 4)?[^\d]{0,12}(\d{4})(?!\d)/i,
    /ending in[^\d]{0,8}(\d{4})(?!\d)/i,
    /last 4[^\d]{0,8}(\d{4})(?!\d)/i,
    /\b(?:x{2,}|\*{2,}|#){2,}\s*(\d{4})(?!\d)/i,
    /\.\s*\.\s*\.\s*(\d{4})(?!\d)/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

export function extractPaymentDueDay(text) {
  const source = String(text || "");
  const exactMatch = source.match(/Payment\s+Due\s+Date[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  if (exactMatch?.[1]) return extractDay(exactMatch[1]);
  const dueDateFallback = source.match(/Due\s+Date[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  if (dueDateFallback?.[1]) return extractDay(dueDateFallback[1]);
  const minimumPaymentWindow = source.match(/Minimum\s+Payment\s+Due[\s\S]{0,120}?([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  return minimumPaymentWindow?.[1] ? extractDay(minimumPaymentWindow[1]) : null;
}

export function extractPurchasesAmount(text) {
  const src = String(text || "");

  // "Purchases + $0.00" or "Purchases $0.00" on its own line (column-layout statements)
  const lineMatch = src.match(/(?:^|\n)[+\s]*purchases\s*[+]?\s*\$?([\d,]+\.\d{2})/im);
  if (lineMatch?.[1]) return parseCurrency(lineMatch[1]);

  // "Purchases + $X" inline
  const inlineMatch = src.match(/purchases\s*\+\s*\$?([\d,]+\.\d{2})/i);
  if (inlineMatch?.[1]) return parseCurrency(inlineMatch[1]);

  const sectionFallback = src.match(/Purchases[\s\S]{0,220}?TOTAL THIS PERIOD[^\d$]*\$?([\d,]+\.\d{2})/i);
  if (sectionFallback?.[1]) return parseCurrency(sectionFallback[1]);

  // firstCurrencyMatch correctly returns $0.00 (only null when no match at all)
  return firstCurrencyMatch(src, EXTRACTION_RE.newPurchases);
}

export function normalizeAprCandidate(value, context = "", priority = 0) {
  const numeric = Number(value);
  const source = String(context || "").toLowerCase();
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 99.999) return null;

  // Explicitly exclude non-purchase rate rows — these should never become the selected APR.
  if (/cash advance|penalty apr|balance transfer|overdraft|default rate/.test(source)) return null;
  if (/maximum|will not exceed/.test(source)) return null;

  let score = priority;
  // Purchase APR rows get the strongest boost so they beat any other candidate.
  if (/\bpurchases?\b/.test(source) || source.includes("current and future transactions") || source.includes("revolving")) score += 100;
  if (source.includes("variable")) score += 24;
  if (source.includes("interest charge calculation") || source.includes("interest charge calculation section")) score += 30;
  if (source.includes("annual percentage rate")) score += 18;
  if (source.includes("interest rate")) score += 10;

  return { value: numeric, source: String(context || "").trim(), score };
}

export function scoreAprRowContext(context, value) {
  const source = String(context || "").toLowerCase();
  const amounts = [...source.matchAll(/([\d,]+\.\d{2})/g)].map((match) => parseCurrency(match[1])).filter((amount) => amount != null);
  let score = 0;

  if (source.includes("purchase") || source.includes("purchases")) score += 70;
  if (source.includes("cash advance")) score -= 35;
  if (source.includes("penalty")) score -= 50;
  if (source.includes("balance transfer")) score -= 18;
  if (amounts.some((amount) => amount > 0)) score += 28;
  if (amounts.length && amounts.every((amount) => amount === 0)) score -= 45;
  if (source.includes(String(value))) score += 4;

  return score;
}

export function extractAprDetails(text) {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidate) => {
    if (!candidate) return;
    const key = `${candidate.value}|${candidate.source.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  // Lenders label APR differently, so we collect candidates from explicit APR fields first
  // instead of assuming a single "APR" label or the first percentage in the statement.
  APR_CONTEXT_PATTERNS.forEach(({ regex, priority }) => {
    for (const match of text.matchAll(regex)) {
      pushCandidate(normalizeAprCandidate(match[1], match[0], priority));
    }
  });

  // Many statements place the purchase APR in interest charge calculation tables.
  // We score those rows higher than generic footer text so the selected APR follows
  // the active revolving purchase balance whenever the statement provides it.
  const interestChargeSection = text.match(/interest charge calculation[\s\S]{0,1200}/i)?.[0] || "";
  for (const match of interestChargeSection.matchAll(APR_TABLE_ROW_RE)) {
    const context = `Interest charge calculation section: ${match[0]}`;
    const candidate = normalizeAprCandidate(match[2], context, 105);
    if (candidate) {
      candidate.score += scoreAprRowContext(match[0], candidate.value);
      pushCandidate(candidate);
    }
  }

  for (const match of text.matchAll(APR_TABLE_ROW_RE)) {
    const candidate = normalizeAprCandidate(match[2], match[0], 40);
    if (candidate) {
      candidate.score += scoreAprRowContext(match[0], candidate.value);
      pushCandidate(candidate);
    }
  }

  candidates.sort((left, right) => right.score - left.score || right.value - left.value);
  return {
    aprCandidates: candidates.map((item) => item.value),
    aprSelected: candidates[0] || null,
  };
}

export function extractAprPercent(text) {
  const { aprSelected } = extractAprDetails(text);
  return aprSelected?.value ?? null;
}

export const HOLDER_NAME_BLOCKLIST = /^(?:payable|payment|balance|transfer|minimum|account|statement|interest|previous|current|new|due|date|total|amount|fee|charge|purchase|credit|debit|available|billing|return|transaction|activity|summary|account number|routing)$/i;
export const HOLDER_NAME_BAD_PHRASE_RE = /\b(?:account notifications|your account|my account|notifications|statement for|account summary|rewards|customer service|payment options|minimum payment|new balance|debt|shared|solo|owner|viewer|member|admin)\b/i;
export const BANK_NAME_RE = /^(?:discover|chase|bank of america|capital one|citi|wells fargo|navy federal|us bank|sofi|navient|mohela|nelnet|sallie mae|aes|affirm|synchrony|american express|firstmark services|firstmark)$/i;
export const PERSON_SUFFIX_RE = /^(?:jr|sr|ii|iii|iv|v)$/i;
export const INSTITUTION_HINT_KEYWORDS_RE = /\b(?:bank|federal|credit|financial|services|capital|citi|chase|discover|affirm|synchrony|nelnet|navient|mohela|sallie|aes|american express|firstmark|wells fargo|sofi|navy)\b/i;

// Entity / business name detection — handles DBA names, single-word brands, and formal suffixes.
export const ENTITY_SUFFIX_RE = /\b(?:llc|inc|corp|co|ltd|lp|llp|pllc|pc|dba|company|group|services|solutions|enterprises|associates|business|industries|ventures|holdings)\b/i;

export function looksLikeEntityName(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw || raw.length < 2 || /\d/.test(raw)) return false;
  if (BANK_NAME_RE.test(raw)) return false;
  if (HOLDER_NAME_BAD_PHRASE_RE.test(raw)) return false;
  // Has a formal entity suffix → definite entity
  if (ENTITY_SUFFIX_RE.test(raw)) return true;
  // Single capitalized word not on the financial blocklist (e.g. "Stallion")
  if (!/\s/.test(raw) && raw.length >= 3 && /^[A-Z]/.test(raw) && !HOLDER_NAME_BLOCKLIST.test(raw)) return true;
  return false;
}

export function normalizeEntityKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(ENTITY_SUFFIX_RE, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function normalizePersonName(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !PERSON_SUFFIX_RE.test(token));

  if (!tokens.length) return "";
  if (tokens.length >= 3 && tokens[1].length === 1) {
    tokens.splice(1, 1);
  }
  return tokens.filter((token) => token.length > 1).join(" ").trim();
}

export function formatPersonNameDisplay(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\s'.-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      if (token.length === 1) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

export function looksLikeHumanName(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw || raw.length < 6 || /\d/.test(raw)) return false;
  if (HOLDER_NAME_BAD_PHRASE_RE.test(raw)) return false;
  if (BANK_NAME_RE.test(raw)) return false;

  const normalized = normalizePersonName(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (tokens.some((token) => HOLDER_NAME_BLOCKLIST.test(token))) return false;

  return tokens.every((token) => /^[a-z]+(?:['-][a-z]+)*$/i.test(token));
}

export function sanitizeInstitutionHint(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  if (raw.length > 48) return "";
  if (!/^[A-Za-z0-9&.'()\-/\s]+$/.test(raw)) return "";
  if (HOLDER_NAME_BAD_PHRASE_RE.test(raw)) return "";
  if (!INSTITUTION_HINT_KEYWORDS_RE.test(raw) && !BANK_NAME_RE.test(raw)) return "";
  return raw;
}

export function matchOwnerOption(holderName, ownerOptions = []) {
  if (!holderName || !ownerOptions.length) return "";

  // --- Person name matching ---
  const normalizedHolder = normalizePersonName(holderName);
  if (normalizedHolder) {
    const directMatch = ownerOptions.find((owner) => normalizePersonName(owner) === normalizedHolder);
    if (directMatch) return directMatch;

    const holderTokens = normalizedHolder.split(/\s+/).filter(Boolean);
    if (holderTokens.length) {
      const scored = ownerOptions
        .map((owner) => {
          const normalizedOwner = normalizePersonName(owner);
          if (!normalizedOwner) return null;
          const ownerTokens = normalizedOwner.split(/\s+/).filter(Boolean);
          const sharedTokens = holderTokens.filter((token) => ownerTokens.includes(token));
          const score = sharedTokens.length;
          return score > 0 ? { owner, score, exactLast: ownerTokens.at(-1) === holderTokens.at(-1) } : null;
        })
        .filter(Boolean)
        .sort((left, right) => Number(right.exactLast) - Number(left.exactLast) || right.score - left.score);

      if (scored.length) {
        if (scored.length > 1) {
          const [top, next] = scored;
          if (top.score === next.score && top.exactLast === next.exactLast) return "";
        }
        return scored[0]?.owner || "";
      }
    }
  }

  // --- Entity / business name matching (e.g. "Stallion", "Stallion LLC") ---
  if (looksLikeEntityName(holderName)) {
    const holderKey = normalizeEntityKey(holderName);
    if (holderKey) {
      const entityMatch = ownerOptions.find((owner) => {
        if (!looksLikeEntityName(owner)) return false;
        const ownerKey = normalizeEntityKey(owner);
        return ownerKey === holderKey || ownerKey.includes(holderKey) || holderKey.includes(ownerKey);
      });
      if (entityMatch) return entityMatch;
    }
  }

  // Legacy fallback: keep original scoring path for callers passing raw strings
  const holderTokens = normalizePersonName(holderName).split(/\s+/).filter(Boolean);
  if (!holderTokens.length) return "";

  const scored = ownerOptions
    .map((owner) => {
      const normalizedOwner = normalizePersonName(owner);
      if (!normalizedOwner) return null;
      const ownerTokens = normalizedOwner.split(/\s+/).filter(Boolean);
      const sharedTokens = holderTokens.filter((token) => ownerTokens.includes(token));
      const score = sharedTokens.length;
      return score > 0 ? { owner, score, exactLast: ownerTokens.at(-1) === holderTokens.at(-1) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.exactLast) - Number(left.exactLast) || right.score - left.score);

  if (!scored.length) return "";
  if (scored.length > 1) {
    const [top, next] = scored;
    if (top.score === next.score && top.exactLast === next.exactLast) return "";
  }
  return scored[0]?.owner || "";
}

export function extractTrustedHolderName(text) {
  const lines = getTextLines(text);

  // Priority 1: real cardholder/header lines near the top of page 1.
  const topLines = lines.slice(0, 24);
  const headerCandidates = topLines
    .map((line, index) => {
      const human = looksLikeHumanName(line);
      const entity = looksLikeEntityName(line);
      if (!human && !entity) return null;
      let score = 0;
      if (/^[A-Z][A-Z\s'.&-]+$/.test(line)) score += 60;
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,4}$/.test(line)) score += 40;
      if (entity) score += 32;
      if (index < 8) score += 25;
      const nextLine = topLines[index + 1] || "";
      if (/\d{2,5}\s+[A-Za-z]/.test(nextLine)) score += 35;
      return { line, score, entity };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  if (headerCandidates[0]) {
    return headerCandidates[0].entity ? headerCandidates[0].line : formatPersonNameDisplay(headerCandidates[0].line);
  }

  // Priority 2: mailing-name block directly before the street address.
  const addressMatch = text.match(/([A-Z][A-Z'.&-]+(?:\s+[A-Z][A-Z'.&-]+){0,4})\s+\d{2,5}\s+[A-Z]/);
  if (addressMatch?.[1]) {
    if (looksLikeHumanName(addressMatch[1])) return formatPersonNameDisplay(addressMatch[1]);
    if (looksLikeEntityName(addressMatch[1])) return addressMatch[1].trim().replace(/\s+/g, " ");
  }

  // Priority 3: explicit holder labels — accept both person and entity names.
  const labelPatterns = [
    /(?:account holder|account owner|name on account|cardmember(?: name)?|prepared for|billing name|customer name)[:\s]+([A-Za-z][A-Za-z'.\-&, ]+)/i,
    /dear\s+([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,3})[,\n]/i,
    /payable\s+to\s+(?:the\s+order\s+of\s+)?([A-Za-z][A-Za-z'.\-&, ]+)/i,
  ];
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].trim().replace(/\s+/g, " ").split(/\n/)[0].trim();
    if (looksLikeHumanName(candidate)) return formatPersonNameDisplay(candidate);
    if (looksLikeEntityName(candidate)) return candidate;
  }

  return null;
}

// Ordered most-specific first; aliases (e.g. "boa") come after canonical name.
export const PROVIDER_DETECT = [
  ["Bank of America",            /bank of america/i],
  ["US Bank",                    /u\.?s\.? bank/i],
  ["Navy Federal",               /navy federal/i],
  ["Wells Fargo",                /wells fargo/i],
  ["Capital One",                /capital one/i],
  ["American Express",           /american express/i],
  ["Firstmark Services (Nelnet)",/firstmark\s*services/i],
  ["Sallie Mae",                 /sallie mae/i],
  ["Bank of America",            /\bboa\b/i],
  ["Discover",                   /discover/i],
  ["Chase",                      /\bchase\b/i],
  ["SoFi",                       /\bsofi\b/i],
  ["Navient",                    /\bnavient\b/i],
  ["MOHELA",                     /\bmohela\b/i],
  ["Nelnet",                     /\bnelnet\b/i],
  ["AES",                        /(?:american education services|\baes\b(?!\w))/i],
  ["Affirm",                     /\baffirm\b/i],
  ["Synchrony",                  /\bsynchrony\b/i],
  ["Citi",                       /citi(?:bank)?/i],
];

export function detectProviderName(text) {
  const source = String(text || "");
  const providerLabels = PROVIDER_DETECT;

  for (const [label, regex] of providerLabels) {
    if (regex.test(source)) return label;
  }

  const genericHeaderMatch = source.match(/(?:^|\n)\s*([A-Z][A-Za-z&.,'()/ -]{2,40})\s+(?:statement|account statement|monthly statement|billing statement)\b/i);
  const genericLabel = sanitizeInstitutionHint(genericHeaderMatch?.[1] || "");
  if (genericLabel) return genericLabel;

  return "";
}

export function extractLoanType(text) {
  if (/subsidized/i.test(text) && /unsubsidized/i.test(text)) return "Subsidized + Unsubsidized";
  if (/subsidized/i.test(text)) return "Subsidized";
  if (/unsubsidized/i.test(text)) return "Unsubsidized";
  if (/(?:grad\s+)?plus\s+loan/i.test(text)) return "PLUS Loan";
  if (/parent\s+plus/i.test(text)) return "Parent PLUS";
  if (/perkins/i.test(text)) return "Perkins Loan";
  if (/consolidation/i.test(text)) return "Consolidation Loan";
  return null;
}

// Like firstCurrencyMatch but skips $0.00 results
export function bestCurrencyMatch(text, patterns) {
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    for (const match of text.matchAll(global)) {
      if (match[1]) {
        const amount = parseCurrency(match[1]);
        if (amount != null && amount > 0) return amount;
      }
    }
  }
  return null;
}

export function extractCoSigner(text) {
  const match = text.match(/co[-\s]?signer[:\s]+([A-Za-z][A-Za-z\s]{2,40}?)(?:\n|co[-\s]?maker|$)/i);
  if (!match?.[1]) return null;
  const name = match[1].trim().replace(/\s+/g, " ");
  return name.length >= 3 && !/^n\/?a$/i.test(name) ? name : null;
}

export function enrichStatement(result, text) {
  const { aprCandidates, aprSelected } = extractAprDetails(text);
  const estimatedPayoff = firstCurrencyMatch(text, EXTRACTION_RE.estimatedPayoff);
  const principalBalance = firstCurrencyMatch(text, EXTRACTION_RE.principalBalance);
  const explicitRemainingBalance = firstCurrencyMatch(text, EXTRACTION_RE.remainingBalance);
  const strictDueDay = extractPaymentDueDay(text);
  const purchasesAmount = extractPurchasesAmount(text);
  const detectedProvider = detectProviderName(text);
  const detectedLast4 = extractAccountLast4FromText(text);
  const labeledBalance = extractLabeledCurrency(text, [
    /\bnew balance\b/i,
    /\bcurrent balance\b/i,
    /\bstatement balance\b/i,
    /\bbalance due\b/i,
    /\btotal balance\b/i,
    /\boutstanding balance\b/i,
    /\bamount owed\b/i,
  ], { allowZero: false, searchLines: 1 });
  const previousBalance = extractLabeledCurrency(text, [/\bprevious balance\b/i, /\bprior balance\b/i, /\blast statement balance\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.previousBalance);
  const minimumDue = extractLabeledCurrency(text, [/\bminimum payment due\b/i, /\bminimum due\b/i, /\bminimum amount due\b/i, /\bpayment due\b/i], { allowZero: true, searchLines: 1 })
    ?? result.min_due;
  const interestCharged = extractLabeledCurrency(text, [/\binterest charged\b/i, /\btotal interest\b/i, /\binterest charge\b/i, /\binterest\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.interestCharged);
  const fees = extractLabeledCurrency(text, [/\bfees charged\b/i, /\btotal fees\b/i, /\bfees\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.fees);
  const dueDateFromLabels = extractLabeledDate(text, [/\bpayment due date\b/i, /\bnext due date\b/i, /\bdue date\b/i, /\bdue on\b/i, /\bpayment date\b/i], { searchLines: 1 });
  const derivedBalance = labeledBalance ?? result.balance ?? principalBalance ?? estimatedPayoff;
  const derivedRemainingBalance = explicitRemainingBalance ?? principalBalance ?? result.balance ?? estimatedPayoff;
  return {
    ...result,
    remaining_balance: derivedRemainingBalance,
    previous_balance: previousBalance,
    new_purchases: purchasesAmount,
    interest_charged: interestCharged,
    fees,
    principal_balance: principalBalance,
    accrued_interest_v: firstCurrencyMatch(text, EXTRACTION_RE.accruedInterest),
    estimated_payoff: estimatedPayoff,
    // Loan statements often expose principal or payoff instead of a classic statement balance.
    // Use those values as safe fallbacks so Firstmark/Nelnet-style statements don't land as "Not found".
    balance: derivedBalance,
    loan_type: extractLoanType(text),
    co_signer: extractCoSigner(text),
    apr_percent: aprSelected?.value ?? extractAprPercent(text),
    apr_candidates: aprCandidates,
    apr_selected: aprSelected?.value ?? null,
    holder_name: extractTrustedHolderName(text),
    min_due: minimumDue,
    due_day: strictDueDay ?? (dueDateFromLabels ? extractDay(dueDateFromLabels) : null) ?? result.due_day ?? null,
    bank: sanitizeInstitutionHint(detectedProvider || result.bank || ""),
    account_hint: detectedProvider
      ? `${detectedProvider}${detectedLast4 ? ` . . . ${detectedLast4}` : ""}`
      : sanitizeInstitutionHint(result.account_hint),
    account_last4: detectedLast4 || extractLast4(result?.account_hint),
  };
}

// Single generic parser — no per-lender dispatch needed.
// detectProviderName() and enrichStatement() handle provider identity and all extra fields.
export function parseStatement(text) {
  const balance = extractLabeledCurrency(text, [
    /\bnew balance\b/i,
    /\bcurrent balance\b/i,
    /\bstatement balance\b/i,
    /\bbalance due\b/i,
    /\btotal balance\b/i,
    /\boutstanding balance\b/i,
    /\bamount owed\b/i,
  ], { allowZero: false, searchLines: 1 }) ?? bestCurrencyMatch(text, STMT_BALANCE_RE);

  let minDue = extractLabeledCurrency(text, [/\bminimum payment due\b/i, /\bminimum due\b/i, /\bminimum amount due\b/i, /\bpayment due\b/i], { allowZero: true, searchLines: 1 });
  if (minDue == null) {
    for (const re of STMT_MIN_DUE_RE) {
      const m = text.match(re);
      if (m?.[1]) { const v = parseCurrency(m[1]); if (v != null) { minDue = v; break; } }
    }
  }

  let dueDateStr = extractLabeledDate(text, [/\bpayment due date\b/i, /\bnext due date\b/i, /\bdue date\b/i, /\bdue on\b/i, /\bpayment date\b/i], { searchLines: 1 });
  if (!dueDateStr) {
    for (const re of STMT_DUE_DATE_RE) {
      const m = text.match(re);
      if (m?.[1]) { dueDateStr = m[1]; break; }
    }
  }

  if (balance == null && minDue == null) return null;
  return enrichStatement(
    { balance, min_due: minDue, due_day: dueDateStr ? extractDay(dueDateStr) : null, bank: "", account_hint: "" },
    text,
  );
}

export function matchAccount(parsed, accounts) {
  if (!parsed) return [];
  const bankLower = String(parsed.bank || "").toLowerCase();
  const normalizedParsedProvider = normalizeProviderKey(parsed.bank || parsed.account_hint || "");
  const holderLower = normalizePersonName(parsed.holder_name || "");
  const holderTokens = holderLower.split(/[^a-z]+/).filter((token) => token.length >= 3);
  const parsedLast4 = extractLast4(parsed.account_last4 || parsed.account_hint || "");

  const scoreBankMatch = (nameLower) => {
    if (bankLower.includes("discover") && nameLower.includes("discover")) return 3;
    if (bankLower.includes("bank of america") && (nameLower.includes("boa") || nameLower.includes("bank of america"))) return 3;
    if (bankLower.includes("us bank") && nameLower.includes("us bank")) return 3;
    if (bankLower.includes("navy federal") && nameLower.includes("navy federal")) return 3;
    if (bankLower.includes("chase") && nameLower.includes("chase")) return 3;
    if (bankLower.includes("sofi") && nameLower.includes("sofi")) return 3;
    if (bankLower.includes("navient") && (nameLower.includes("navient") || nameLower.includes("student"))) return 3;
    if (bankLower.includes("mohela") && (nameLower.includes("mohela") || nameLower.includes("student"))) return 3;
    if (bankLower.includes("nelnet") && (nameLower.includes("nelnet") || nameLower.includes("student"))) return 3;
    if (bankLower.includes("aes") && (nameLower.includes("aes") || nameLower.includes("american education"))) return 3;
    if (bankLower.includes("sallie mae") && (nameLower.includes("sallie") || nameLower.includes("student"))) return 3;
    if (bankLower.includes("affirm") && nameLower.includes("affirm")) return 3;
    if (bankLower.includes("synchrony") && nameLower.includes("synchrony")) return 3;
    if (bankLower.includes("wells fargo") && (nameLower.includes("wells") || nameLower.includes("wf"))) return 3;
    if (bankLower.includes("capital one") && nameLower.includes("capital")) return 3;
    if (bankLower.includes("citi") && nameLower.includes("citi")) return 3;
    if (bankLower.includes("american express") && (nameLower.includes("amex") || nameLower.includes("american express"))) return 3;
    return 0;
  };

  const ranked = accounts
    .map((account) => {
      const bankNameLower = String(account.bank || account.name || "").toLowerCase();
      const normalizedAccountProvider = normalizeProviderKey(account.bank || account.name || "");
      const ownerLower = normalizePersonName(account.owner || "");
      const accountNameLower = String(account.name || "").toLowerCase();
      const accountLast4 = extractLast4(`${account.name || ""} ${account.bank || ""}`);
      let score = scoreBankMatch(bankNameLower);
      if (normalizedParsedProvider && normalizedAccountProvider && normalizedParsedProvider === normalizedAccountProvider) score += 16;
      if (parsedLast4 && accountLast4 && parsedLast4 === accountLast4) score += 12;
      if (holderTokens.length) {
        const ownerHit = holderTokens.some((token) => ownerLower.includes(token));
        const nameHit = holderTokens.some((token) => accountNameLower.includes(token));
        if (ownerHit) score += 10;  // owner match is the strongest signal
        if (nameHit) score += 2;
      }
      return { account, score, normalizedAccountProvider, accountLast4 };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) return [];
  if (normalizedParsedProvider && parsedLast4) {
    const exactProviderLast4Matches = ranked.filter((entry) => {
      return entry.normalizedAccountProvider === normalizedParsedProvider && entry.accountLast4 && entry.accountLast4 === parsedLast4;
    });
    if (exactProviderLast4Matches.length > 0) {
      return exactProviderLast4Matches.map((entry) => entry.account);
    }
  }
  // If we have a holder name and any accounts matched by owner, only return those
  // (don't dilute with bank-only matches from a different person)
  if (holderTokens.length) {
    const ownerMatched = ranked.filter((entry) => {
      const ownerLower = normalizePersonName(entry.account.owner || "");
      return holderTokens.some((token) => ownerLower.includes(token));
    });
    if (ownerMatched.length > 0) {
      const bestScore = ownerMatched[0].score;
      return ownerMatched.filter((entry) => entry.score === bestScore).map((entry) => entry.account);
    }
  }
  const bestScore = ranked[0].score;
  return ranked.filter((entry) => entry.score === bestScore).map((entry) => entry.account);
}

export function buildInitialOverrides(parsed) {
  return {
    balance: parsed?.balance ?? "",
    remaining_balance: parsed?.remaining_balance ?? parsed?.principal_balance ?? parsed?.balance ?? "",
    min_due: parsed?.min_due ?? "",
    due_day: parsed?.due_day ?? "",
    apr_percent: parsed?.apr_percent ?? "",
    new_purchases: parsed?.new_purchases ?? "",
    interest_charged: parsed?.interest_charged ?? "",
    fees: parsed?.fees ?? "",
  };
}

export function getFileType(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext))) return "image";
  return "unknown";
}

export function buildCreateDraft(parsed, ownerOptions = []) {
  const fallbackName = String(parsed?.bank || parsed?.account_hint || "New bill").trim();
  const matchedOwner = matchOwnerOption(parsed?.holder_name || "", ownerOptions);
  return {
    name: fallbackName,
    bank: String(parsed?.bank || fallbackName).trim(),
    owner: matchedOwner || "",
    category: "DEBT",
    bal: parsed?.remaining_balance ?? parsed?.principal_balance ?? parsed?.balance ?? "",
    min: parsed?.min_due ?? "",
    due: parsed?.due_day ?? "",
    apr: parsed?.apr_percent ?? "",
    interest_type: "variable_apr",
  };
}
