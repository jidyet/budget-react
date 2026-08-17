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
// The leading $ is optional so this can match "New Balance 1,845.20" as well
// as "$1,845.20" - but that means a bare percentage figure like "6.74" from
// "6.74% APR" would otherwise match too. The negative lookahead excludes any
// number immediately followed by a % sign so an APR can never be mistaken
// for a currency amount (e.g. minimum payment) elsewhere on the statement.
export const MONEY_VALUE_RE = /\$?([\d,]+\.\d{2})(?!\s*%)/g;

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

// A day-of-month is only ever 1-31 - accepting anything outside that range
// (e.g. a garbled "79" from misaligned PDF text extraction) would present an
// impossible value as if it were real. Unknown is safer than wrong.
const isPlausibleDay = (day) => Number.isInteger(day) && day >= 1 && day <= 31;

export function extractDay(dateStr) {
  if (!dateStr) return null;
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
  if (slashMatch) {
    const day = Number(slashMatch[2]);
    return isPlausibleDay(day) ? day : null;
  }
  const wordMatch = dateStr.match(/\w+ (\d{1,2})/);
  if (wordMatch) {
    const day = Number(wordMatch[1]);
    return isPlausibleDay(day) ? day : null;
  }
  return null;
}

const MONTH_NAMES = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Converts a raw date string as matched by extractLabeledDate (US-format
// "MM/DD/YYYY" or "Month D, YYYY") into ISO "YYYY-MM-DD" for use in an
// <input type="date">. Only ever called on a string that already matched
// extractLabeledDate's own strict date pattern, so this never guesses at an
// ambiguous format - it just reformats a date the statement already stated.
export function dateStringToIso(dateStr) {
  if (!dateStr) return null;
  const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const word = dateStr.match(/^([A-Za-z]+) (\d{1,2}),?\s*(\d{4})$/);
  if (word) {
    const month = MONTH_NAMES[word[1].toLowerCase()];
    const day = Number(word[2]);
    if (!month || !isPlausibleDay(day)) return null;
    const year = Number(word[3]);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

// A payment due date printed without a year (e.g. "Feb 10") is only ever
// resolved using the statement's OWN date as the anchor - never "now"/system
// time, which would be wrong for a statement being imported well after it
// was issued. If the due month is earlier in the calendar than the
// statement's month, the due date must roll into the following year (e.g. a
// December statement's January due date is next year). Returns null (never
// guesses) when there is no statement date to anchor to.
export function inferYearForMonthDay(month, day, referenceDateIso) {
  if (!isPlausibleDay(day) || !(month >= 1 && month <= 12)) return null;
  const refMatch = String(referenceDateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!refMatch) return null;
  const refYear = Number(refMatch[1]);
  const refMonth = Number(refMatch[2]);
  const year = month < refMonth ? refYear + 1 : refYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
// stopPatterns (optional): a widened forward window (searchLines > 1) risks
// crossing into a DIFFERENT label's own line - e.g. "Payment Due Date"
// searching 2 lines forward could reach "Statement Closing Date <a full
// date>" and mistake that unrelated date for its own value. When provided,
// the window truncates as soon as a forward line matches one of these
// patterns, rather than reading past it.
const forwardWindowFromLabelMatch = (lines, lineIndex, match, searchLines, stopPatterns = []) => {
  const line = lines[lineIndex];
  const afterLabelOnSameLine = line.slice(match.index + match[0].length);
  const collected = [afterLabelOnSameLine];
  for (let i = lineIndex + 1; i <= lineIndex + searchLines && i < lines.length; i += 1) {
    const forwardLine = lines[i];
    if (stopPatterns.some((pattern) => pattern.test(forwardLine))) break;
    collected.push(forwardLine);
  }
  return collected.join(" ");
};

// DATA-2: shared by extractLabeledCurrency (unchanged behavior/signature -
// existing callers are unaffected) and extractLabeledCurrencyWithProvenance
// (new - carries matchedLabel/matchedText forward for source-evidence
// display), so there is exactly one place that decides which candidate wins.
const collectLabeledCurrencyCandidates = (text, labelPatterns, { allowZero = true, searchLines = 2 } = {}) => {
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
      candidates.push({ value, score, matchedLabel: match[0].trim(), matchedText: line });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates;
};

export function extractLabeledCurrency(text, labelPatterns, options = {}) {
  return collectLabeledCurrencyCandidates(text, labelPatterns, options)[0]?.value ?? null;
}

// DATA-2: same selection as extractLabeledCurrency, but returns the winning
// candidate's provenance (which label matched, and the full source line) -
// "where did this value come from?" for a field that previously had no
// answer at all once it left this module.
export function extractLabeledCurrencyWithProvenance(text, labelPatterns, options = {}) {
  const top = collectLabeledCurrencyCandidates(text, labelPatterns, options)[0];
  return top ? { value: top.value, matchedLabel: top.matchedLabel, matchedText: top.matchedText, score: top.score } : null;
}

// A garbled/misaligned match (e.g. day 79) must never outrank - or stand in
// for - a genuinely valid date elsewhere in the search window.
const isPlausibleDateString = (value) => {
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    return month >= 1 && month <= 12 && isPlausibleDay(day);
  }
  const word = value.match(/^\w+ (\d{1,2})/);
  if (word) return isPlausibleDay(Number(word[1]));
  return true;
};

const collectLabeledDateCandidates = (text, labelPatterns, { searchLines = 2, stopPatterns = [] } = {}) => {
  const lines = getTextLines(text);
  const dateValueRe = /(\d{2}\/\d{2}\/\d{4}|\w+ \d{1,2},?\s*\d{4})/i;
  const candidates = [];

  lines.forEach((line, index) => {
    labelPatterns.forEach((labelPattern, labelIndex) => {
      const match = line.match(labelPattern);
      if (!match) return;
      const forwardWindow = forwardWindowFromLabelMatch(lines, index, match, searchLines, stopPatterns);
      // Consider every date-shaped match in the window, not just the first -
      // a two-column statement layout can interleave unrelated text (and an
      // implausible date) between the label and its real value.
      const dateMatches = [...forwardWindow.matchAll(new RegExp(dateValueRe, "gi"))]
        .map((m) => m[1])
        .filter(isPlausibleDateString);
      if (!dateMatches.length) return;
      let score = 100 - labelIndex * 10 - index;
      if (index < 12) score += 18;
      candidates.push({ value: dateMatches[0], score, matchedLabel: match[0].trim(), matchedText: line });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates;
};

export function extractLabeledDate(text, labelPatterns, options = {}) {
  return collectLabeledDateCandidates(text, labelPatterns, options)[0]?.value ?? null;
}

export function extractLabeledDateWithProvenance(text, labelPatterns, options = {}) {
  const top = collectLabeledDateCandidates(text, labelPatterns, options)[0];
  return top ? { value: top.value, matchedLabel: top.matchedLabel, matchedText: top.matchedText, score: top.score } : null;
}

// "Month Day" with NO year (e.g. "Feb 10") - only ever tried as a fallback
// when extractLabeledDate found no full (with-year) date anywhere in the
// window. The month/day here still need a reference date (the statement's
// own date) to become a real due date - see inferYearForMonthDay.
const MONTH_DAY_ONLY_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?!\s*,?\s*\d{4})(?!\s*\/)\b/i;

export function extractMonthDayOnly(text, labelPatterns, { searchLines = 2, stopPatterns = [] } = {}) {
  const lines = getTextLines(text);
  const candidates = [];

  lines.forEach((line, index) => {
    labelPatterns.forEach((labelPattern, labelIndex) => {
      const match = line.match(labelPattern);
      if (!match) return;
      const forwardWindow = forwardWindowFromLabelMatch(lines, index, match, searchLines, stopPatterns);
      const dateMatch = forwardWindow.match(MONTH_DAY_ONLY_RE);
      if (!dateMatch) return;
      const month = MONTH_NAMES[dateMatch[1].toLowerCase()];
      const day = Number(dateMatch[2]);
      if (!month || !isPlausibleDay(day)) return;
      let score = 100 - labelIndex * 10 - index;
      if (index < 12) score += 18;
      candidates.push({ value: { month, day }, score });
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

// Tries each pattern in order and only STOPS at the first one that produces
// a genuinely plausible day (extractDay already rejects an out-of-range
// day). Real-world multi-column statement layouts can put unrelated text
// between a label and its value (pdfjs extracts text in on-page position
// order, which doesn't always match visual reading order for a two-column
// layout) - the previous version returned on the first REGEX match
// regardless of whether the captured "day" made sense, so one garbled match
// could block every later, correct fallback from ever being tried.
export function extractPaymentDueDay(text) {
  const source = String(text || "");
  const patterns = [
    /Payment\s+Due\s+Date[\s\S]{0,60}?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /Due\s+Date[\s\S]{0,60}?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
    /Minimum\s+Payment\s+Due[\s\S]{0,120}?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const day = match?.[1] ? extractDay(match[1]) : null;
    if (day != null) return day;
  }
  return null;
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

// DATA-2: previously there was no way to tell "the creditor's required
// minimum" (min_due, above) apart from what the person actually paid this
// period - a statement's own "Amount Paid"/"Payments Received" line was
// never read at all. allowZero: true because a genuine $0 payment this
// period is meaningful information, distinct from "not found."
export function extractAmountPaid(text) {
  return extractLabeledCurrency(text, [
    /\bamount paid\b/i,
    /\bpayment received\b/i,
    /\bpayments received\b/i,
    /\bpayments? and credits\b/i,
  ], { allowZero: true, searchLines: 1 });
}

// DATA-2: credit limit / available credit were never extracted at all.
export function extractCreditLimit(text) {
  return extractLabeledCurrency(text, [
    /\bcredit limit\b/i,
    /\btotal credit line\b/i,
    /\bcredit line\b/i,
  ], { allowZero: true, searchLines: 1 });
}

export function extractAvailableCredit(text) {
  return extractLabeledCurrency(text, [
    /\bavailable credit\b/i,
    /\bcredit available\b/i,
  ], { allowZero: true, searchLines: 1 });
}

// DATA-2: which kind of balance an APR applies to - normalizeAprCandidate
// already EXCLUDES cash-advance/penalty/balance-transfer rows from ever
// winning as the selected purchase APR (correct for that purpose), which
// means those rates were simply thrown away rather than preserved. This
// classifies (never excludes) so extractAprRateComponents below can keep
// them as structured, non-authoritative reference data.
const APR_BALANCE_TYPE_PATTERNS = [
  { balanceType: "cash_advance", re: /cash advance/i },
  { balanceType: "penalty", re: /penalty/i },
  { balanceType: "balance_transfer", re: /balance transfer/i },
  { balanceType: "purchase", re: /\bpurchases?\b|current and future transactions|revolving/i },
];
export function balanceTypeForAprContext(context) {
  const source = String(context || "");
  const found = APR_BALANCE_TYPE_PATTERNS.find((entry) => entry.re.test(source));
  return found ? found.balanceType : "other";
}

// DATA-2: preserves EVERY APR candidate as a structured, balance-typed
// component (purchase/cash_advance/penalty/balance_transfer/other) instead
// of discarding every non-purchase rate the way the single-winner selection
// in extractAprDetails necessarily does. balanceSubjectToRate/interestCharged
// are best-effort, read from the same interest-charge-table row the rate
// itself came from when present - null (never invented) otherwise.
// `aprSelected` is passed in (already computed by the caller) rather than
// recomputed here, so the primary-APR text scan only runs once per statement.
export function extractAprRateComponents(text, { aprSelected = null } = {}) {
  const components = [];
  const seen = new Map(); // key -> the component object already pushed into `components` (same reference, so mutating it here updates that entry directly)
  const pushComponent = ({ apr, context, balanceSubjectToRate = null, interestCharged = null }) => {
    const numeric = Number(apr);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 99.999) return;
    const balanceType = balanceTypeForAprContext(context);
    const key = `${balanceType}|${numeric}`;
    const existing = seen.get(key);
    if (existing) {
      // A later match for the same balance type + rate can carry richer data
      // (the interest-charge-table row sweep, which runs after the plain
      // APR_CONTEXT_PATTERNS sweep, is the only source that ever finds
      // balanceSubjectToRate/interestCharged) - fill in whichever fields the
      // first match left null, rather than "first seen wins" discarding them.
      if (existing.balanceSubjectToRate == null && balanceSubjectToRate != null) existing.balanceSubjectToRate = balanceSubjectToRate;
      if (existing.interestCharged == null && interestCharged != null) existing.interestCharged = interestCharged;
      return;
    }
    const component = { balanceType, apr: numeric, balanceSubjectToRate, interestCharged, source: String(context || "").trim() };
    seen.set(key, component);
    components.push(component);
  };

  APR_CONTEXT_PATTERNS.forEach(({ regex }) => {
    for (const match of text.matchAll(regex)) pushComponent({ apr: match[1], context: match[0] });
  });

  const interestChargeSection = text.match(/interest charge calculation[\s\S]{0,1200}/i)?.[0] || "";
  const rowSource = interestChargeSection || text;
  for (const match of rowSource.matchAll(APR_TABLE_ROW_RE)) {
    const restOfLine = rowSource.slice(match.index + match[0].length).split("\n")[0] || "";
    const amounts = [...restOfLine.matchAll(MONEY_VALUE_RE)].map((m) => parseCurrency(m[1])).slice(0, 2);
    pushComponent({ apr: match[2], context: match[0], balanceSubjectToRate: amounts[0] ?? null, interestCharged: amounts[1] ?? null });
  }

  // The "active" component is the one matching the already-selected primary
  // APR (extractAprDetails' battle-tested scoring) - never a second,
  // independently-derived "which one is active" heuristic that could
  // disagree with it.
  const selectedBalanceType = aprSelected ? balanceTypeForAprContext(aprSelected.source) : null;
  return components.map((component) => ({
    ...component,
    activeBalance: aprSelected != null && component.apr === aprSelected.value && component.balanceType === selectedBalanceType,
  }));
}

export const HOLDER_NAME_BLOCKLIST = /^(?:payable|payment|balance|transfer|minimum|account|statement|interest|previous|current|new|due|date|total|amount|fee|charge|purchase|credit|debit|available|billing|return|transaction|activity|summary|account number|routing)$/i;
export const HOLDER_NAME_BAD_PHRASE_RE = /\b(?:account notifications|your account|my account|notifications|statement for|account summary|rewards|customer service|payment options|minimum payment|new balance|debt|shared|solo|owner|viewer|member|admin|undeliverable|service requested|current resident|current occupant|postal customer|boxholder|or resident|forwarding service|visa signature|visa platinum|visa infinite|visa business|mastercard|world elite|signature card|platinum card|business card)\b/i;
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

// DATA-2: product-tier detection - detectProviderName only ever identifies
// the ISSUER (e.g. "Capital One", "US Bank"), never which specific card/
// line/loan product it is, which was direct evidence for debt-type
// classification the parser never used ("Personal Line" is strong evidence
// of a line of credit, not "Other").
export const PRODUCT_DETECT = [
  ["Quicksilver",           /quicksilver/i],
  ["Venture",                /\bventure\b/i],
  ["Cash+ Visa Signature",   /cash\+\s*visa signature|\bcash\+/i],
  ["Personal Line",          /personal line(?: of credit)?/i],
  ["Sapphire",                /sapphire/i],
  ["Freedom",                 /\bfreedom\b/i],
  ["World Elite Mastercard",  /world elite mastercard/i],
];
export function detectProductName(text) {
  const source = String(text || "");
  for (const [label, regex] of PRODUCT_DETECT) {
    if (regex.test(source)) return label;
  }
  return "";
}

// DATA-2: coarse document-type pre-classification so field-label priority
// can differ by product shape later if needed - a line-of-credit statement
// is checked first since it can ALSO legitimately contain "minimum payment
// due" (so a credit-card check alone would misfire), but real LOC
// statements don't describe themselves as a "credit card."
export function detectDocumentType(text) {
  const source = String(text || "");
  // Many real card statements never literally say "credit card" - they name
  // the card network/product instead ("Visa Signature", "Mastercard", ...).
  if (/\bcredit card\b|\bvisa\b|\bmastercard\b/i.test(source)) return "CREDIT_CARD_STATEMENT";
  // Deliberately does NOT trigger on a bare "advance" - "cash advance" is
  // normal credit-card vocabulary too, so that alone would misclassify most
  // credit card statements as a line of credit. Only genuinely LOC-specific
  // terms count here.
  if (/line of credit|personal line|draw period/i.test(source)) return "LOC_STATEMENT";
  if (/principal balance|amortization|loan servicer|payoff amount/i.test(source)) return "LOAN_STATEMENT";
  return "UNKNOWN";
}

// DATA-2: the CFPB-mandated "Minimum Payment Warning" box (federally
// standardized wording across US card issuers) - reference-only illustration
// data, never TrackToZero's own PlanVersion/payoff projection. Deliberately
// narrow/specific patterns (not generic "years"/"total" matches) so this
// can't accidentally capture min_due/balance from unrelated nearby text.
export function extractCreditorPayoffIllustration(text) {
  const minOnlyMatch = text.match(/only the minimum payment[\s\S]{0,200}?(\d{1,2})\s*years?[\s\S]{0,160}?(?:total of\s*)?\$?([\d,]+)(?:\.\d{2})?\s*\(including interest\)/i);
  // The dollar figure must be IMMEDIATELY adjacent (only whitespace between
  // it and its own "pay off the balance" sentence) - a wider gap risks
  // binding to an EARLIER, unrelated dollar amount (e.g. the minimum-only
  // paragraph's total-paid figure) that happens to precede a LATER "pay off
  // the balance" sentence by coincidence.
  const altMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)\s{0,10}(?:pay off the balance|you will pay off)[\s\S]{0,160}?(\d{1,2})\s*years?[\s\S]{0,220}?save an estimated\s*\$?([\d,]+)/i);
  if (!minOnlyMatch && !altMatch) return null;
  return {
    yearsToPayoff: minOnlyMatch ? Number(minOnlyMatch[1]) : null,
    totalPaid: minOnlyMatch ? parseCurrency(minOnlyMatch[2]) : null,
    alternatePaymentAmount: altMatch ? parseCurrency(altMatch[1]) : null,
    alternateYearsToPayoff: altMatch ? Number(altMatch[2]) : null,
    estimatedSavings: altMatch ? parseCurrency(altMatch[3]) : null,
  };
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
  const BALANCE_LABELS = [
    /\bnew balance\b/i,
    /\bcurrent balance\b/i,
    /\bstatement balance\b/i,
    /\bbalance due\b/i,
    /\btotal balance\b/i,
    /\boutstanding balance\b/i,
    /\bamount owed\b/i,
  ];
  const labeledBalance = extractLabeledCurrency(text, BALANCE_LABELS, { allowZero: false, searchLines: 1 });
  const balanceProvenance = extractLabeledCurrencyWithProvenance(text, BALANCE_LABELS, { allowZero: false, searchLines: 1 });
  const previousBalance = extractLabeledCurrency(text, [/\bprevious balance\b/i, /\bprior balance\b/i, /\blast statement balance\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.previousBalance);
  const MIN_DUE_LABELS = [/\bminimum payment due\b/i, /\bminimum due\b/i, /\bminimum amount due\b/i, /\bpayment due\b/i];
  const minimumDue = extractLabeledCurrency(text, MIN_DUE_LABELS, { allowZero: true, searchLines: 1 }) ?? result.min_due;
  const minDueProvenance = extractLabeledCurrencyWithProvenance(text, MIN_DUE_LABELS, { allowZero: true, searchLines: 1 });
  // DATA-2: the amount actually paid this period is a DIFFERENT field from
  // the creditor's required minimum above - previously there was no
  // extraction for this at all, so nothing prevented a caller from
  // mistaking one for the other upstream.
  const AMOUNT_PAID_LABELS = [/\bamount paid\b/i, /\bpayment received\b/i, /\bpayments received\b/i, /\bpayments? and credits\b/i];
  const amountPaid = extractAmountPaid(text);
  const amountPaidProvenance = extractLabeledCurrencyWithProvenance(text, AMOUNT_PAID_LABELS, { allowZero: true, searchLines: 1 });
  const CREDIT_LIMIT_LABELS = [/\bcredit limit\b/i, /\btotal credit line\b/i, /\bcredit line\b/i];
  const creditLimit = extractCreditLimit(text);
  const creditLimitProvenance = extractLabeledCurrencyWithProvenance(text, CREDIT_LIMIT_LABELS, { allowZero: true, searchLines: 1 });
  const availableCredit = extractAvailableCredit(text);
  const rateComponents = extractAprRateComponents(text, { aprSelected });
  const productName = detectProductName(text);
  const documentType = detectDocumentType(text);
  const creditorPayoffIllustration = extractCreditorPayoffIllustration(text);
  const interestCharged = extractLabeledCurrency(text, [/\binterest charged\b/i, /\btotal interest\b/i, /\binterest charge\b/i, /\binterest\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.interestCharged);
  const fees = extractLabeledCurrency(text, [/\bfees charged\b/i, /\btotal fees\b/i, /\bfees\b/i], { allowZero: true, searchLines: 1 })
    ?? firstCurrencyMatch(text, EXTRACTION_RE.fees);
  // searchLines: 2 (not 1) - real multi-column statement layouts can put an
  // extra line of unrelated text between a due-date label and its value
  // (pdfjs extracts text in on-page position order, which for a two-column
  // layout doesn't always match the visual single-column reading order a
  // human sees). Still forward-only, so this can't reach backward into an
  // earlier label's value the way the original cross-contamination bug did.
  const DUE_DATE_LABELS = [/\bpayment due date\b/i, /\bnext due date\b/i, /\bdue date\b/i, /\bdue on\b/i, /\bpayment date\b/i];
  const STATEMENT_DATE_LABELS = [/\bstatement closing date\b/i, /\bclosing date\b/i, /\bstatement date\b/i, /\bstatement period end(?:ing| date)?\b/i];
  // Each date label's forward search stops at the OTHER label's own line -
  // otherwise a widened window (needed to reach a value a line or two below
  // its label) risks crossing into a completely different label's value
  // (e.g. "Payment Due Date" reading forward into "Statement Closing Date
  // <a full date>" and mistaking that unrelated date for its own).
  const dueDateFromLabels = extractLabeledDate(text, DUE_DATE_LABELS, { searchLines: 2, stopPatterns: STATEMENT_DATE_LABELS });
  const dueDateProvenance = extractLabeledDateWithProvenance(text, DUE_DATE_LABELS, { searchLines: 2, stopPatterns: STATEMENT_DATE_LABELS });
  const statementDateFromLabels = extractLabeledDate(text, STATEMENT_DATE_LABELS, { searchLines: 2, stopPatterns: DUE_DATE_LABELS });
  const statementDateIso = statementDateFromLabels ? dateStringToIso(statementDateFromLabels) : null;
  // Only tried when no full (with-year) due date was found anywhere in the
  // window - a statement that prints its due date as just "Feb 10" still
  // deserves a real due_date, with the year inferred from the statement's
  // own date rather than left permanently blank.
  const dueMonthDayOnly = !dueDateFromLabels ? extractMonthDayOnly(text, DUE_DATE_LABELS, { searchLines: 2, stopPatterns: STATEMENT_DATE_LABELS }) : null;
  const dueDateFromMonthDay = dueMonthDayOnly ? inferYearForMonthDay(dueMonthDayOnly.month, dueMonthDayOnly.day, statementDateIso) : null;
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
    due_day: strictDueDay ?? (dueDateFromLabels ? extractDay(dueDateFromLabels) : null) ?? dueMonthDayOnly?.day ?? result.due_day ?? null,
    // Set from a full date found under an explicit due-date-style label
    // (dueDateFromLabels), or a year-less "Month Day" date whose year could
    // be safely inferred from the statement's own date (dueDateFromMonthDay)
    // - never from strictDueDay's lower-confidence "a date happened to
    // appear near Minimum Payment Due" fallback, and never guessed when
    // there is no statement date to anchor a year-less date to.
    due_date: dueDateFromLabels ? dateStringToIso(dueDateFromLabels) : dueDateFromMonthDay,
    statement_date: statementDateIso,
    bank: sanitizeInstitutionHint(detectedProvider || result.bank || ""),
    account_hint: detectedProvider
      ? `${detectedProvider}${detectedLast4 ? ` . . . ${detectedLast4}` : ""}`
      : sanitizeInstitutionHint(result.account_hint),
    account_last4: detectedLast4 || extractLast4(result?.account_hint),
    // DATA-2 additions below - amount actually paid (distinct from min_due),
    // credit limit/available credit, structured multi-APR rate components,
    // product/document-type detection, the CFPB payoff-illustration box
    // (reference-only), and per-field source provenance (matched label +
    // source line - page number is not tracked in this phase, see
    // pdfImportReader.js's extractTextFromPdf).
    amount_paid: amountPaid,
    credit_limit: creditLimit,
    available_credit: availableCredit,
    rate_components: rateComponents,
    product_name: productName,
    document_type: documentType,
    creditor_payoff_illustration: creditorPayoffIllustration,
    balance_provenance: balanceProvenance,
    min_due_provenance: minDueProvenance,
    amount_paid_provenance: amountPaidProvenance,
    credit_limit_provenance: creditLimitProvenance,
    due_date_provenance: dueDateProvenance,
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

  let dueDateStr = extractLabeledDate(text, [/\bpayment due date\b/i, /\bnext due date\b/i, /\bdue date\b/i, /\bdue on\b/i, /\bpayment date\b/i], { searchLines: 2 });
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
