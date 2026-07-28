import { useRef, useState } from "react";
import { LAUNCH_COPY } from "./config/launchCopy";
import { fx } from "./utils/budgetUtils";

// Generic statement patterns — no per-lender dispatch.
// Provider detection and all field enrichment are handled by detectProviderName() + enrichStatement().

// Balance: prefer "new balance" first (credit card statements), then fallbacks for loans/LOCs.
const STMT_BALANCE_RE = [
  /\bnew balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bstatement balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\baccount balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\boutstanding balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\btotal balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bcurrent balance[^\d\n-]*\$?([\d,]+\.\d{2})/i,
  /\bamount owed[^\d\n-]*\$?([\d,]+\.\d{2})/i,
];

// Minimum due: ordered from most-explicit to most-generic to avoid false positives.
const STMT_MIN_DUE_RE = [
  /minimum (?:payment )?due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /minimum amount due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /regular monthly payment amount[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /monthly payment[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /amount due[^\d\n]*\$?([\d,]+\.\d{2})/i,
  /payment due[^\d\n]*\$?([\d,]+\.\d{2})/i,
];

// Due date: "Payment Due Date" is the most reliable label; fall back to generic "Due Date".
const STMT_DUE_DATE_RE = [
  /payment\s+due\s+date[^\n]*?(\d{2}\/\d{2}\/\d{4})/i,
  /payment\s+due\s+date[^\n]*?(\w+ \d{1,2},?\s*\d{4})/i,
  /due\s+date[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /due\s+date[^\n]*?(\w+ \d{1,2},?\s*\d{4})/i,
  /pay\s+by[^\n]*?(\w+ \d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
];

const EXTRACTION_RE = {
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
const APR_CONTEXT_PATTERNS = [
  { label: "purchase", regex: new RegExp(`(?:purchase|purchases|purchase apr|apr for current and future transactions|current and future transactions)[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 120 },
  { label: "variable", regex: new RegExp(`(?:variable apr|variable rate|annual percentage rate \\(apr\\))[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 90 },
  { label: "interest-rate", regex: new RegExp(`(?:interest rate|annual interest rate)[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 70 },
  { label: "generic", regex: new RegExp(`(?:${APR_LABEL_PATTERNS.join("|")})[^\\n%]{0,80}?${APR_VALUE_RE}`, "gi"), priority: 55 },
];

const APR_TABLE_ROW_RE = /([A-Za-z][A-Za-z /&()-]{3,80}?)\s+(\d{1,2}(?:\.\d{1,3})?)%/g;
const MONEY_VALUE_RE = /\$?([\d,]+\.\d{2})/g;

const FIELD_CONFIG = [
  { label: "Balance", key: "balance", step: "0.01", placeholder: "Not found" },
  { label: "Remaining balance", key: "remaining_balance", step: "0.01", placeholder: "Optional" },
  { label: "Min due", key: "min_due", step: "0.01", placeholder: "Not found" },
  { label: "Due day", key: "due_day", step: "1", placeholder: "Not found" },
  { label: "APR %", key: "apr_percent", step: "0.001", placeholder: "Optional" },
  { label: "New purchases", key: "new_purchases", step: "0.01", placeholder: "Optional" },
  { label: "Interest charged", key: "interest_charged", step: "0.01", placeholder: "Optional" },
  { label: "Fees", key: "fees", step: "0.01", placeholder: "Optional" },
];

const PROVIDER_EXAMPLES = ["Discover", "Chase", "Bank of America", "Capital One", "Citi", "Wells Fargo", "US Bank", "Navy Federal", "SoFi", "Affirm", "Synchrony", "Navient", "MOHELA", "Nelnet", "Sallie Mae", "AES", "+ any PDF statement"];

let pdfJsLoading = null;
let ocrLoading = null;

const loadPdfJs = async () => {
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

const loadOcr = async () => {
  if (ocrLoading) return ocrLoading;
  ocrLoading = import("tesseract.js");
  return ocrLoading;
};

function parseCurrency(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[$,\s]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseNumericInput(value) {
  if (value === "" || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrency(value) {
  return value == null ? "-" : fx(value);
}

function getTextLines(text) {
  return String(text || "")
    .split(/\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function extractDay(dateStr) {
  if (!dateStr) return null;
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
  if (slashMatch) return Number(slashMatch[2]);
  const wordMatch = dateStr.match(/\w+ (\d{1,2})/);
  if (wordMatch) return Number(wordMatch[1]);
  return null;
}

function firstCurrencyMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseCurrency(match[1]);
      if (amount != null) return amount;
    }
  }
  return null;
}

function extractLabeledCurrency(text, labelPatterns, { allowZero = true, searchLines = 2 } = {}) {
  const lines = getTextLines(text);
  const candidates = [];

  lines.forEach((line, index) => {
    const joined = lines.slice(index, index + searchLines + 1).join(" ");
    labelPatterns.forEach((labelPattern, labelIndex) => {
      if (!labelPattern.test(joined)) return;
      const amounts = [...joined.matchAll(MONEY_VALUE_RE)]
        .map((match) => parseCurrency(match[1]))
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

function extractLabeledDate(text, labelPatterns, { searchLines = 2 } = {}) {
  const lines = getTextLines(text);
  const dateValueRe = /(\d{2}\/\d{2}\/\d{4}|\w+ \d{1,2},?\s*\d{4})/i;
  const candidates = [];

  lines.forEach((line, index) => {
    const joined = lines.slice(index, index + searchLines + 1).join(" ");
    labelPatterns.forEach((labelPattern, labelIndex) => {
      if (!labelPattern.test(joined)) return;
      const dateMatch = joined.match(dateValueRe);
      if (!dateMatch?.[1]) return;
      let score = 100 - labelIndex * 10 - index;
      if (index < 12) score += 18;
      candidates.push({ value: dateMatch[1], score });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value ?? null;
}

function extractLast4(value) {
  const match = String(value || "").match(/(\d{4})(?!.*\d)/);
  return match?.[1] || "";
}

function normalizeProviderKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractAccountLast4FromText(text) {
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

function extractPaymentDueDay(text) {
  const source = String(text || "");
  const exactMatch = source.match(/Payment\s+Due\s+Date[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  if (exactMatch?.[1]) return extractDay(exactMatch[1]);
  const dueDateFallback = source.match(/Due\s+Date[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  if (dueDateFallback?.[1]) return extractDay(dueDateFallback[1]);
  const minimumPaymentWindow = source.match(/Minimum\s+Payment\s+Due[\s\S]{0,120}?([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  return minimumPaymentWindow?.[1] ? extractDay(minimumPaymentWindow[1]) : null;
}

function extractPurchasesAmount(text) {
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

function normalizeAprCandidate(value, context = "", priority = 0) {
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

function scoreAprRowContext(context, value) {
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

function extractAprDetails(text) {
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

function extractAprPercent(text) {
  const { aprSelected } = extractAprDetails(text);
  return aprSelected?.value ?? null;
}

const HOLDER_NAME_BLOCKLIST = /^(?:payable|payment|balance|transfer|minimum|account|statement|interest|previous|current|new|due|date|total|amount|fee|charge|purchase|credit|debit|available|billing|return|transaction|activity|summary|account number|routing)$/i;
const HOLDER_NAME_BAD_PHRASE_RE = /\b(?:account notifications|your account|my account|notifications|statement for|account summary|rewards|customer service|payment options|minimum payment|new balance|debt|shared|solo|owner|viewer|member|admin)\b/i;
const BANK_NAME_RE = /^(?:discover|chase|bank of america|capital one|citi|wells fargo|navy federal|us bank|sofi|navient|mohela|nelnet|sallie mae|aes|affirm|synchrony|american express|firstmark services|firstmark)$/i;
const PERSON_SUFFIX_RE = /^(?:jr|sr|ii|iii|iv|v)$/i;
const INSTITUTION_HINT_KEYWORDS_RE = /\b(?:bank|federal|credit|financial|services|capital|citi|chase|discover|affirm|synchrony|nelnet|navient|mohela|sallie|aes|american express|firstmark|wells fargo|sofi|navy)\b/i;

// Entity / business name detection — handles DBA names, single-word brands, and formal suffixes.
const ENTITY_SUFFIX_RE = /\b(?:llc|inc|corp|co|ltd|lp|llp|pllc|pc|dba|company|group|services|solutions|enterprises|associates|business|industries|ventures|holdings)\b/i;

function looksLikeEntityName(value) {
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

function normalizeEntityKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(ENTITY_SUFFIX_RE, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizePersonName(value) {
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

function formatPersonNameDisplay(value) {
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

function looksLikeHumanName(value) {
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

function sanitizeInstitutionHint(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  if (raw.length > 48) return "";
  if (!/^[A-Za-z0-9&.'()\-\/\s]+$/.test(raw)) return "";
  if (HOLDER_NAME_BAD_PHRASE_RE.test(raw)) return "";
  if (!INSTITUTION_HINT_KEYWORDS_RE.test(raw) && !BANK_NAME_RE.test(raw)) return "";
  return raw;
}

function matchOwnerOption(holderName, ownerOptions = []) {
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

function extractHolderName(text) {
  // Explicit label patterns — most reliable, try first
  const labelPatterns = [
    /(?:account holder|account owner|name on account|prepared for|statement for)[:\s]+([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i,
    /dear\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})[,\n]/i,
    // "payable to NAME" — extract the name, not "payable to"
    /payable\s+to\s+(?:the\s+order\s+of\s+)?([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i,
  ];
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].trim().replace(/\s+/g, " ");
      if (cleaned.length >= 4 && !BANK_NAME_RE.test(cleaned)) return cleaned;
    }
  }

  // Statement headers often show the cardholder in uppercase on the first lines,
  // just above the mailing address. Support that layout so uploaded statements
  // can auto-select the right household owner without relying on one lender format.
  const topWindow = String(text || "").split(/\n/).slice(0, 18).join("\n");
  const uppercaseHeaderMatch = topWindow.match(/^\s*([A-Z][A-Z\s]{5,})$/m);
  if (uppercaseHeaderMatch?.[1]) {
    const cleaned = uppercaseHeaderMatch[1].trim().replace(/\s+/g, " ");
    const words = cleaned.split(/\s+/);
    const isFinancialKeyword = words.some((w) => HOLDER_NAME_BLOCKLIST.test(w));
    if (cleaned.length >= 5 && !BANK_NAME_RE.test(cleaned) && !isFinancialKeyword) return cleaned;
  }

  // All-caps name before a street address (e.g. "JOHN SMITH 123 MAIN ST")
  const addressMatch = text.match(/([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,3})\s+\d{2,5}\s+[A-Z]/);
  if (addressMatch?.[1]) {
    const cleaned = addressMatch[1].trim().replace(/\s+/g, " ");
    const words = cleaned.split(/\s+/);
    const isFinancialKeyword = words.some((w) => HOLDER_NAME_BLOCKLIST.test(w));
    if (cleaned.length >= 5 && !BANK_NAME_RE.test(cleaned) && !isFinancialKeyword) return cleaned;
  }

  return null;
}

function extractTrustedHolderName(text) {
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
const PROVIDER_DETECT = [
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

function detectProviderName(text) {
  const source = String(text || "");
  const providerLabels = PROVIDER_DETECT;

  for (const [label, regex] of providerLabels) {
    if (regex.test(source)) return label;
  }

  const genericHeaderMatch = source.match(/(?:^|\n)\s*([A-Z][A-Za-z&.,'()\/ -]{2,40})\s+(?:statement|account statement|monthly statement|billing statement)\b/i);
  const genericLabel = sanitizeInstitutionHint(genericHeaderMatch?.[1] || "");
  if (genericLabel) return genericLabel;

  return "";
}

function extractLoanType(text) {
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
function bestCurrencyMatch(text, patterns) {
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

function extractCoSigner(text) {
  const match = text.match(/co[-\s]?signer[:\s]+([A-Za-z][A-Za-z\s]{2,40}?)(?:\n|co[-\s]?maker|$)/i);
  if (!match?.[1]) return null;
  const name = match[1].trim().replace(/\s+/g, " ");
  return name.length >= 3 && !/^n\/?a$/i.test(name) ? name : null;
}

function enrichStatement(result, text) {
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
function parseStatement(text) {
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

function matchAccount(parsed, accounts) {
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

function buildInitialOverrides(parsed) {
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

function getFileType(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext))) return "image";
  return "unknown";
}

function buildCreateDraft(parsed, ownerOptions = []) {
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

export default function StatementUpload({ accounts = [], theme, onSaved, onUpload, onCreateAccount, onComplete, sourceMode = "pdf", ownerOptions = [] }) {
  const [status, setStatus] = useState("idle");
  const [parsed, setParsed] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [createDraft, setCreateDraft] = useState(buildCreateDraft(null, ownerOptions));
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [savedList, setSavedList] = useState([]);
  const fileRef = useRef(null);

  const isDark = theme === "dark";
  const acceptsPdf = sourceMode === "pdf";
  const acceptsImages = sourceMode !== "pdf";
  const copyKey = acceptsPdf ? "pdf" : "image";
  const sourceTitle = LAUNCH_COPY.uploadModes[copyKey].title;
  const sourceDescription = LAUNCH_COPY.uploadModes[copyKey].description;
  const fileAccept = acceptsPdf ? ".pdf" : "image/png,image/jpeg,image/jpg,image/webp";
  const dropBadge = LAUNCH_COPY.uploadModes[copyKey].badge;
  const dropTitle = LAUNCH_COPY.uploadModes[copyKey].dropTitle;
  const dropSubtext = LAUNCH_COPY.uploadModes[copyKey].dropSubtext;
  const palette = {
    surf: isDark ? "#141414" : "#ffffff",
    surf2: isDark ? "#1e1e1e" : "#f0efe9",
    border: isDark ? "#2c2c2c" : "#e2e0d8",
    border2: isDark ? "#3a3a3a" : "#ccc9be",
    tx: isDark ? "#f0f0f0" : "#111111",
    tx2: isDark ? "#a0a0a0" : "#4a4a4a",
    muted: isDark ? "#555555" : "#999888",
    ac: "#00c9a7",
    acSoft: isDark ? "rgba(0,201,167,.14)" : "rgba(0,201,167,.10)",
    warn: isDark ? "#ffaa00" : "#c97800",
    danger: isDark ? "#ff4c4c" : "#d42828",
    dangerSoft: isDark ? "rgba(255,76,76,.12)" : "rgba(212,40,40,.08)",
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: palette.muted,
    marginBottom: 5,
    fontFamily: "'Instrument Sans',sans-serif",
  };
  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1.5px solid ${palette.border2}`,
    background: palette.surf,
    color: palette.tx,
    fontSize: 13,
    fontFamily: "'DM Mono',monospace",
    outline: "none",
    boxSizing: "border-box",
  };
  const buttonStyle = (background, color = "#000") => ({
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    background,
    color,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Instrument Sans',sans-serif",
  });

  const extractPdfText = async (file) => {
    const { pdfjsLib, workerSrc } = await loadPdfJs();
    if (!pdfjsLib) throw new Error("PDF reader is not available");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const pdf = await pdfjsLib.getDocument({
            data: event.target.result,
            useSystemFonts: true,
            disableFontFace: true,
            isEvalSupported: false,
            disablePreferences: true,
            disableHistory: true,
          }).promise;
          let fullText = "";
          for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
            try {
              const page = await pdf.getPage(pageIndex);
              const content = await page.getTextContent();
              const lines = [];
              let currentLine = [];
              let lastY = null;
              for (const item of content.items) {
                const chunk = String(item?.str || "").trim();
                if (!chunk) continue;
                const y = Number(item?.transform?.[5] ?? 0);
                if (lastY != null && Math.abs(y - lastY) > 2.5) {
                  if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
                  currentLine = [];
                }
                currentLine.push(chunk);
                lastY = y;
              }
              if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
              fullText += `${lines.join("\n")}\n`;
            } catch {
              // skip page if it fails (e.g. color space issues on some browsers)
            }
          }
          if (!fullText.trim()) throw new Error("No readable text found in PDF");
          resolve(fullText);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const extractImageText = async (file) => {
    const ocrModule = await loadOcr();
    const workerApi = ocrModule.createWorker ? ocrModule : ocrModule.default;
    const result = await workerApi.recognize(file, "eng", {
      logger: () => {},
    });
    return result?.data?.text || "";
  };

  const handleFile = async (file) => {
    const fileType = getFileType(file);
    const invalidForMode =
      fileType === "unknown" ||
      (acceptsPdf && fileType !== "pdf") ||
      (acceptsImages && fileType !== "image");
    if (!file || invalidForMode) {
      setErrorMsg(acceptsPdf ? "Please upload a PDF statement." : "Please upload a PNG, JPG, JPEG, or WEBP image.");
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("parsing");
    setErrorMsg("");

    try {
      const text = fileType === "pdf" ? await extractPdfText(file) : await extractImageText(file);
      const result = parseStatement(text);
      if (!result) {
        const manual = {
          balance: null,
          remaining_balance: null,
          min_due: null,
          due_day: null,
          apr_percent: null,
          new_purchases: null,
          interest_charged: null,
          fees: null,
          previous_balance: null,
          account_hint: "Manual entry",
          bank: "",
        };
        setParsed(manual);
        setMatches([]);
        setSelectedId(null);
        setOverrides(buildInitialOverrides(manual));
        setCreateDraft(buildCreateDraft(manual, ownerOptions));
        setStatus("results");
        return;
      }

      const matchedAccounts = matchAccount(result, accounts);
      setParsed(result);
      setMatches(matchedAccounts);
      setSelectedId(matchedAccounts.length === 1 ? matchedAccounts[0].id : null);
      setOverrides(buildInitialOverrides(result));
      setCreateDraft(buildCreateDraft(result, ownerOptions));
      setStatus("results");
    } catch (error) {
      setErrorMsg(`We could not read that file: ${error?.message || error}`);
      setStatus("error");
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setErrorMsg("");
    setStatus("saving");

    const account = accounts.find((item) => item.id === selectedId);
    if (!account) {
      setErrorMsg("Please choose a valid account before saving.");
      setStatus("error");
      return;
    }

    const nextBalance = parseNumericInput(overrides.remaining_balance) ?? parseNumericInput(overrides.balance) ?? account.cur_bal;
    const nextMinDue = parseNumericInput(overrides.min_due) ?? account.min_due_v;
    const nextPurchases = parseNumericInput(overrides.new_purchases) ?? account.purch_v ?? 0;
    const nextAprPercent = parseNumericInput(overrides.apr_percent);

    const updates = {
      cur_bal: nextBalance,
      min_due_v: nextMinDue,
      paid_v: account.paid_v || 0,
      is_paid: account.is_paid || false,
      purch_v: nextPurchases,
      apr_v: nextAprPercent != null ? nextAprPercent / 100 : account.apr_v,
    };

    const uploadAfter = {
      ...updates,
      remaining_balance_v: parseNumericInput(overrides.remaining_balance),
      previous_balance_v: parsed?.previous_balance ?? null,
      new_purchases_v: nextPurchases,
      interest_charged_v: parseNumericInput(overrides.interest_charged),
      fees_v: parseNumericInput(overrides.fees),
      due_day_v: parseNumericInput(overrides.due_day),
    };

    const parsedSnapshot = {
      ...parsed,
      balance: parseNumericInput(overrides.balance),
      remaining_balance: parseNumericInput(overrides.remaining_balance),
      min_due: parseNumericInput(overrides.min_due),
      due_day: parseNumericInput(overrides.due_day),
      apr_percent: parseNumericInput(overrides.apr_percent),
      new_purchases: parseNumericInput(overrides.new_purchases),
      interest_charged: parseNumericInput(overrides.interest_charged),
      fees: parseNumericInput(overrides.fees),
    };

    const before = account || null;
    try {
      await (onSaved ? onSaved(selectedId, updates) : Promise.resolve());
      setSavedList((current) => [...current, account.name]);

      if (typeof onUpload === "function") {
        onUpload({
          fileName,
          type: getFileType({ name: fileName }),
          rows: [{ accountId: selectedId, name: account.name, before, after: uploadAfter }],
          parsed: parsedSnapshot,
        });
      }
      setStatus("done");
      onComplete?.({ mode: "update", accountId: selectedId, accountName: account.name });
    } catch (error) {
      setErrorMsg(`We could not save that statement: ${error?.message || error}`);
      setStatus("error");
    }
  };

  const handleCreateAccount = async () => {
    if (typeof onCreateAccount !== "function") return;
    const name = String(createDraft.name || "").trim();
    if (!name) {
      setErrorMsg("Give the new bill a name before you save it.");
      setStatus("error");
      return;
    }
    setErrorMsg("");
    setStatus("saving");

    const created = await onCreateAccount({
      name,
      bank: String(createDraft.bank || parsed?.bank || name).trim(),
      owner: String(createDraft.owner || "").trim() || undefined,
      category: String(createDraft.category || "DEBT").trim().toUpperCase(),
      bal: String(parseNumericInput(overrides.remaining_balance) ?? parseNumericInput(overrides.balance) ?? createDraft.bal ?? ""),
      min: String(parseNumericInput(overrides.min_due) ?? createDraft.min ?? ""),
      due: String(parseNumericInput(overrides.due_day) ?? createDraft.due ?? ""),
      apr: String(parseNumericInput(overrides.apr_percent) ?? createDraft.apr ?? ""),
      interest_type: createDraft.interest_type || "variable_apr",
    });

    if (!created?.id) {
      setStatus("results");
      return;
    }

    setSavedList((current) => [...current, created.name || name]);

    if (typeof onUpload === "function") {
      onUpload({
        fileName,
        type: getFileType({ name: fileName }),
        rows: [{ accountId: created.id, name: created.name || name, before: null, after: created }],
        parsed: {
          ...parsed,
          balance: parseNumericInput(overrides.balance),
          remaining_balance: parseNumericInput(overrides.remaining_balance),
          min_due: parseNumericInput(overrides.min_due),
          due_day: parseNumericInput(overrides.due_day),
          apr_percent: parseNumericInput(overrides.apr_percent),
          new_purchases: parseNumericInput(overrides.new_purchases),
          interest_charged: parseNumericInput(overrides.interest_charged),
          fees: parseNumericInput(overrides.fees),
        },
      });
    }

    setStatus("done");
    onComplete?.({ mode: "create", accountId: created.id, accountName: created.name || name });
  };

  const reset = () => {
    setStatus("idle");
    setParsed(null);
    setMatches([]);
    setSelectedId(null);
    setOverrides({});
    setCreateDraft(buildCreateDraft(null, ownerOptions));
    setFileName("");
    setErrorMsg("");
    setSavedList([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ maxWidth: 760, margin: "24px auto 0" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: palette.muted, marginBottom: 6, fontFamily: "'Instrument Sans',sans-serif" }}>
          {sourceTitle}
        </div>
        <div style={{ fontSize: 13, color: palette.tx2 }}>
          {sourceDescription}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ width: "100%", fontSize: 11, color: palette.muted, marginBottom: 8 }}>
          Common examples only. You can still upload statements from other providers.
        </div>
        {PROVIDER_EXAMPLES.map((bank) => (
          <span key={bank} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: bank.startsWith("+") ? palette.acSoft : palette.surf2, border: `1px solid ${bank.startsWith("+") ? palette.ac : palette.border}`, color: bank.startsWith("+") ? palette.ac : palette.tx2, fontFamily: "'Instrument Sans',sans-serif" }}>
            {bank}
          </span>
        ))}
      </div>

      {(status === "idle" || status === "error") && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${status === "error" ? palette.danger : palette.border2}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: palette.surf, transition: "all .2s", marginBottom: 12 }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = palette.ac;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = status === "error" ? palette.danger : palette.border2;
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{dropBadge}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: palette.tx, marginBottom: 4 }}>{dropTitle}</div>
            <div style={{ fontSize: 12, color: palette.muted }}>{dropSubtext}</div>
            {fileName && <div style={{ marginTop: 8, fontSize: 12, color: palette.ac, fontWeight: 600 }}>{fileName}</div>}
          </div>

          <input ref={fileRef} type="file" accept={fileAccept} style={{ display: "none" }} onChange={(event) => handleFile(event.target.files?.[0])} />

          {status === "error" && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: palette.dangerSoft, border: `1px solid ${palette.danger}`, color: palette.danger, fontSize: 13, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}
        </>
      )}

      {status === "parsing" && (
        <div style={{ textAlign: "center", padding: "40px 0", color: palette.muted }}>
          <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>o</div>
          <div style={{ marginTop: 10, fontSize: 13 }}>Reading {fileName}...</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {status === "results" && parsed && (
        <div>
          {parsed.holder_name && (
            <div style={{ background: palette.acSoft, border: `1px solid ${palette.ac}`, borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15 }}>👤</span>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: palette.ac }}>Detected owner from statement: </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: palette.tx }}>{parsed.holder_name}</span>
              </div>
            </div>
          )}

          <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: parsed.bank === "" ? palette.warn : palette.ac, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>
              {parsed.bank === "" ? "Could not auto-detect the bank - enter values manually and pick an account." : `Detected from ${parsed.account_hint}`}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {FIELD_CONFIG.map(({ label, key, step, placeholder }) => (
                <div key={key}>
                  <div style={labelStyle}>{label}</div>
                  <input type="number" step={step} style={inputStyle} value={overrides[key] ?? ""} onChange={(event) => setOverrides((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} />
                </div>
              ))}
            </div>

            {(parsed.loan_type || parsed.co_signer || parsed.estimated_payoff != null || parsed.principal_balance != null || parsed.accrued_interest_v != null || parsed.previous_balance != null || parsed.interest_charged != null || parsed.fees != null) && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsed.loan_type && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Loan type: {parsed.loan_type}</div>}
                {parsed.co_signer && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Co-signer: {parsed.co_signer}</div>}
                {parsed.estimated_payoff != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Est. payoff: {formatCurrency(parsed.estimated_payoff)}</div>}
                {parsed.principal_balance != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Principal: {formatCurrency(parsed.principal_balance)}</div>}
                {parsed.accrued_interest_v != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Accrued interest: {formatCurrency(parsed.accrued_interest_v)}</div>}
                {parsed.previous_balance != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Previous balance: {formatCurrency(parsed.previous_balance)}</div>}
                {parsed.interest_charged != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Interest charged: {formatCurrency(parsed.interest_charged)}</div>}
                {parsed.fees != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Fees: {formatCurrency(parsed.fees)}</div>}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: palette.muted }}>Review anything the parser found before you save it to the account.</div>
          </div>

          <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.muted, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>Match to account</div>
            {matches.length === 0 ? (
              <div style={{ color: palette.warn, fontSize: 13 }}>No match yet. Pick the account you want to update.</div>
            ) : (
              <div style={{ fontSize: 12, color: palette.muted, marginBottom: 10 }}>
                {matches.length === 1
                  ? "We found 1 matching account and selected it below."
                  : `We found ${matches.length} matching accounts. Pick the one you want to update.`}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {(matches.length > 0 ? matches : accounts).map((account) => (
                <div key={account.id} onClick={() => setSelectedId(account.id)} style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selectedId === account.id ? palette.ac : palette.border}`, background: selectedId === account.id ? palette.acSoft : palette.surf2, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all .13s" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: palette.tx }}>{account.name}</div>
                    <div style={{ fontSize: 11, color: palette.muted }}>{account.owner} - {account.category}</div>
                  </div>
                  {selectedId === account.id && <span style={{ color: palette.ac, fontWeight: 800, fontSize: 16 }}>Y</span>}
                </div>
              ))}
            </div>
          </div>

          {typeof onCreateAccount === "function" && (
            <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.muted, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>Create new bill</div>
              <div style={{ fontSize: 12, color: palette.tx2, marginBottom: 12 }}>
                No bill yet for this statement? Save it as a brand-new bill and start tracking it right away.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                <div>
                  <div style={labelStyle}>Bill name</div>
                  <input type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Discover card" />
                </div>
                <div>
                  <div style={labelStyle}>Provider</div>
                  <input type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.bank} onChange={(event) => setCreateDraft((current) => ({ ...current, bank: event.target.value }))} placeholder="e.g. Discover" />
                </div>
                <div>
                  <div style={labelStyle}>Bill owner{parsed?.holder_name ? " (from statement)" : ""}</div>
                  <input list="statement-owner-options" type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.owner} onChange={(event) => setCreateDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Pick or type a bill owner" />
                  <datalist id="statement-owner-options">
                    {ownerOptions.map((owner) => <option key={owner} value={owner} />)}
                  </datalist>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={buttonStyle(palette.surf2, palette.tx2)} onClick={reset}>
              Start over
            </button>
            {typeof onCreateAccount === "function" && (
              <button
                type="button"
                style={{ ...buttonStyle(palette.surf2, palette.tx), flex: 1 }}
                onClick={handleCreateAccount}
              >
                Create new bill
              </button>
            )}
            <button
              type="button"
              style={{ ...buttonStyle(selectedId ? palette.ac : "#ccc", selectedId ? "#000" : palette.muted), flex: 1, opacity: selectedId ? 1 : 0.5 }}
              disabled={!selectedId}
              onClick={handleSave}
            >
              Save to {selectedId ? accounts.find((account) => account.id === selectedId)?.name : "account"}
            </button>
          </div>
        </div>
      )}

      {status === "saving" && (
        <div style={{ textAlign: "center", padding: "40px 0", color: palette.muted }}>
          <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>o</div>
          <div style={{ marginTop: 10, fontSize: 13 }}>Saving to your account...</div>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>Saved</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: palette.tx, marginBottom: 6 }}>Saved!</div>
          <div style={{ fontSize: 13, color: palette.muted, marginBottom: 20 }}>
            {savedList.map((name, index) => (
              <div key={`${name}-${index}`}>* {name}</div>
            ))}
          </div>
          <button type="button" style={buttonStyle(palette.ac)} onClick={reset}>
            Upload another statement
          </button>
        </div>
      )}
    </div>
  );
}
