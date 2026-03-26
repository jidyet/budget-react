import { useRef, useState } from "react";
import { LAUNCH_COPY } from "./config/launchCopy";

const BANK_RE = {
  discover: {
    detect: /discover/i,
    balance: /new balance[:\s$]*([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due date(?:[^\d]{0,40}|.*?new balance.*?)(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /account ending in (\d{4})/i,
  },
  boa: {
    detect: /bank of america/i,
    balance: /(?:new balance|statement balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum payment due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due date[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account number[^\d]*\d*(\d{4})/i,
  },
  usbank: {
    detect: /u\.?s\.? bank/i,
    balance: /(?:new balance|statement balance|total balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  navyfed: {
    detect: /navy federal/i,
    balance: /(?:new balance|statement balance|current balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due date[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  chase: {
    detect: /chase/i,
    balance: /(?:new balance|account balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due date[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  sofi: {
    detect: /sofi/i,
    balance: /(?:outstanding balance|current balance|total balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:minimum (?:payment )?due|monthly payment)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due date[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
  },
  navient: {
    detect: /navient/i,
    balance: /(?:outstanding principal|current balance|total balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:monthly payment|payment due|amount due)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due (?:date)?[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /(?:loan|account)[^\d]*\d*(\d{4})/i,
  },
  mohela: {
    detect: /mohela/i,
    balance: /(?:outstanding balance|principal balance|total balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:payment due|amount due|monthly payment)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due (?:date)?[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /(?:loan|account)[^\d]*\d*(\d{4})/i,
  },
  nelnet: {
    detect: /nelnet/i,
    balance: /(?:outstanding balance|principal|total balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:payment due|amount due|minimum payment)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment )?due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /(?:loan|account)[^\d]*\d*(\d{4})/i,
  },
  aes: {
    detect: /(?:american education services|aes(?!\w))/i,
    balance: /(?:principal balance|outstanding balance|current balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:payment amount|payment due|amount due)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:due date|payment date)[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /(?:loan|account)[^\d]*\d*(\d{4})/i,
  },
  salliemae: {
    detect: /sallie mae/i,
    balance: /(?:current balance|outstanding balance|principal)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:amount due|minimum payment|payment due)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:payment due|due date)[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /(?:account|loan)[^\d]*\d*(\d{4})/i,
  },
  affirm: {
    detect: /affirm/i,
    balance: /(?:remaining balance|total balance|amount owed)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:payment due|next payment|amount due)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:due date|next payment)[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
  },
  synchrony: {
    detect: /synchrony/i,
    balance: /(?:new balance|statement balance|current balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  wellsfargo: {
    detect: /wells fargo/i,
    balance: /(?:new balance|statement balance|current balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  capitalone: {
    detect: /capital one/i,
    balance: /(?:new balance|statement balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum payment[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  citi: {
    detect: /citi(?:bank)?/i,
    balance: /(?:new balance|current balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum payment due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  amex: {
    detect: /american express/i,
    balance: /(?:new charges|total balance|amount due)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /minimum (?:payment )?due[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /payment due[^\n]*?(\w+ \d{1,2},? \d{4}|\d{2}\/\d{2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
  generic: {
    detect: /./,
    balance: /(?:current balance|total balance|outstanding balance|amount owed|principal balance|statement balance)[^\d]*\$?([\d,]+\.\d{2})/i,
    minDue: /(?:minimum payment|payment due|amount due|monthly payment|payment amount)[^\d]*\$?([\d,]+\.\d{2})/i,
    dueDate: /(?:due date|payment date|pay by)[^\n]*?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    name: /account[^\d]*\d*(\d{4})/i,
  },
};

const EXTRACTION_RE = {
  remainingBalance: [
    /remaining statement balance[^\d$]*\$([\d,]+\.\d{2})/i,
    /amount remaining[^\d$]*\$([\d,]+\.\d{2})/i,
  ],
  previousBalance: [
    /(?:previous balance|prior balance|last statement balance)[^\d\-]*\$?([\d,]+\.\d{2})/i,
  ],
  newPurchases: [
    /(?:new purchases?|purchases and other charges|new charges|purchase amount)[^\d\-]*\$?([\d,]+\.\d{2})/i,
    /(?:^|\s)purchases\s*[+\-]?\$?([\d,]+\.\d{2})/i,
  ],
  interestCharged: [
    /(?:interest charged|finance charge|interest this period|total interest charged)[^\d\-]*\$?([\d,]+\.\d{2})/i,
    /total interest for this period[^\d\-+]*[+\-]?\$?([\d,]+\.\d{2})/i,
  ],
  fees: [
    /(?:fees charged|returned payment fee|total fees)[^\d\-]*\$?([\d,]+\.\d{2})/i,
    /total fees for this period[^\d\-+]*[+\-]?\$?([\d,]+\.\d{2})/i,
  ],
};

const APR_PREFERRED_PATTERNS = [
  /purchases?\s+(\d{1,2}(?:\.\d{1,3})?)%\s*(?:V|variable)?/i,
  /purchase apr[^\d]{0,20}(\d{1,2}(?:\.\d{1,3})?)\s*%/i,
  /standard apr[^\d]{0,20}(\d{1,2}(?:\.\d{1,3})?)\s*%/i,
];

const APR_PATTERNS = [
  /(?:purchase apr|variable apr|standard apr|apr)[^\d]{0,20}(\d{1,2}(?:\.\d{1,3})?)\s*%/gi,
  /(?:interest rate)[^\d]{0,20}(\d{1,2}(?:\.\d{1,3})?)\s*%/gi,
];

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

const SUPPORTED_BANKS = ["Discover", "Chase", "Bank of America", "Capital One", "Citi", "Wells Fargo", "US Bank", "Navy Federal", "SoFi", "Affirm", "Synchrony", "Navient", "MOHELA", "Nelnet", "Sallie Mae", "AES", "+ any PDF statement"];

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
  return value == null ? "-" : `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function extractAprPercent(text) {
  for (const pattern of APR_PREFERRED_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const preferred = Number(match[1]);
      if (Number.isFinite(preferred) && preferred >= 0 && preferred <= 99.999) {
        return preferred;
      }
    }
  }

  const values = [];
  APR_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const value = Number(match[1]);
      const source = String(match[0] || "").toLowerCase();
      if (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 99.999 &&
        !source.includes("will not exceed") &&
        !source.includes("maximum")
      ) {
        values.push(value);
      }
    }
  });
  return values.length ? values[0] : null;
}

function extractHolderName(text) {
  const patterns = [
    /([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,2})\s+\d{2,5}\s+[A-Z]/,
    /([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,2})\s+(?:DISCOVER|CHASE|BANK OF AMERICA|CAPITAL ONE|CITI|WELLS FARGO|NAVY FEDERAL|US BANK)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].trim().replace(/\s+/g, " ");
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return null;
}

function enrichStatement(result, text) {
  return {
    ...result,
    remaining_balance: firstCurrencyMatch(text, EXTRACTION_RE.remainingBalance),
    previous_balance: firstCurrencyMatch(text, EXTRACTION_RE.previousBalance),
    new_purchases: firstCurrencyMatch(text, EXTRACTION_RE.newPurchases),
    interest_charged: firstCurrencyMatch(text, EXTRACTION_RE.interestCharged),
    fees: firstCurrencyMatch(text, EXTRACTION_RE.fees),
    apr_percent: extractAprPercent(text),
    holder_name: extractHolderName(text),
  };
}

function parseWithConfig(text, config, bankLabel) {
  if (!config.detect.test(text)) return null;
  const balance = text.match(config.balance);
  const minDue = text.match(config.minDue);
  const dueDate = text.match(config.dueDate);
  const name = config.name ? text.match(config.name) : null;
  return {
    balance: balance ? parseCurrency(balance[1]) : null,
    min_due: minDue ? parseCurrency(minDue[1]) : null,
    due_day: dueDate ? extractDay(dueDate[1]) : null,
    account_hint: name ? `${bankLabel} . . . ${name[1]}` : bankLabel,
    bank: bankLabel,
  };
}

const parsers = {
  discover: (text) => parseWithConfig(text, BANK_RE.discover, "Discover"),
  boa: (text) => parseWithConfig(text, BANK_RE.boa, "Bank of America"),
  usbank: (text) => parseWithConfig(text, BANK_RE.usbank, "US Bank"),
  navyfed: (text) => parseWithConfig(text, BANK_RE.navyfed, "Navy Federal"),
  chase: (text) => parseWithConfig(text, BANK_RE.chase, "Chase"),
  sofi: (text) => parseWithConfig(text, BANK_RE.sofi, "SoFi"),
  navient: (text) => parseWithConfig(text, BANK_RE.navient, "Navient"),
  mohela: (text) => parseWithConfig(text, BANK_RE.mohela, "MOHELA"),
  nelnet: (text) => parseWithConfig(text, BANK_RE.nelnet, "Nelnet"),
  aes: (text) => parseWithConfig(text, BANK_RE.aes, "AES"),
  salliemae: (text) => parseWithConfig(text, BANK_RE.salliemae, "Sallie Mae"),
  affirm: (text) => parseWithConfig(text, BANK_RE.affirm, "Affirm"),
  synchrony: (text) => parseWithConfig(text, BANK_RE.synchrony, "Synchrony"),
  wellsfargo: (text) => parseWithConfig(text, BANK_RE.wellsfargo, "Wells Fargo"),
  capitalone: (text) => parseWithConfig(text, BANK_RE.capitalone, "Capital One"),
  citi: (text) => parseWithConfig(text, BANK_RE.citi, "Citi"),
  amex: (text) => parseWithConfig(text, BANK_RE.amex, "American Express"),
  generic: (text) => {
    const balance = text.match(BANK_RE.generic.balance);
    const minDue = text.match(BANK_RE.generic.minDue);
    const dueDate = text.match(BANK_RE.generic.dueDate);
    if (!balance && !minDue) return null;
    const institutionMatch = text.match(/(?:^|\n)([A-Z][A-Za-z\s]{3,30})(?:\s+Statement|\s+Account Statement|\s+Monthly Statement)/m);
    const institution = institutionMatch ? institutionMatch[1].trim() : "Statement";
    return {
      balance: balance ? parseCurrency(balance[1]) : null,
      min_due: minDue ? parseCurrency(minDue[1]) : null,
      due_day: dueDate ? extractDay(dueDate[1]) : null,
      account_hint: institution,
      bank: institution,
    };
  },
};

function parseStatement(text) {
  const specificParsers = Object.entries(parsers).filter(([key]) => key !== "generic");
  for (const [, parser] of specificParsers) {
    const result = parser(text);
    if (result && (result.balance != null || result.min_due != null)) {
      return enrichStatement(result, text);
    }
  }
  const genericResult = parsers.generic(text);
  if (genericResult && (genericResult.balance != null || genericResult.min_due != null)) {
    return enrichStatement(genericResult, text);
  }
  return null;
}

function matchAccount(parsed, accounts) {
  if (!parsed) return [];
  const bankLower = String(parsed.bank || "").toLowerCase();
  const holderLower = String(parsed.holder_name || "").toLowerCase();
  const holderTokens = holderLower.split(/[^a-z]+/).filter((token) => token.length >= 3);

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
      const ownerLower = String(account.owner || "").toLowerCase();
      const accountNameLower = String(account.name || "").toLowerCase();
      let score = scoreBankMatch(bankNameLower);
      if (holderTokens.length) {
        const ownerHit = holderTokens.some((token) => ownerLower.includes(token));
        const nameHit = holderTokens.some((token) => accountNameLower.includes(token));
        if (ownerHit) score += 5;
        if (nameHit) score += 2;
      }
      return { account, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) return [];
  const bestScore = ranked[0].score;
  return ranked.filter((entry) => entry.score === bestScore).map((entry) => entry.account);
}

function buildInitialOverrides(parsed) {
  return {
    balance: parsed?.balance ?? "",
    remaining_balance: parsed?.remaining_balance ?? "",
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

export default function StatementUpload({ accounts, theme, onSaved, onUpload, sourceMode = "pdf" }) {
  const [status, setStatus] = useState("idle");
  const [parsed, setParsed] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [overrides, setOverrides] = useState({});
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
          const pdf = await pdfjsLib.getDocument({ data: event.target.result }).promise;
          let fullText = "";
          for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
            const page = await pdf.getPage(pageIndex);
            const content = await page.getTextContent();
            fullText += content.items.map((item) => item.str).join(" ") + "\n";
          }
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
        setStatus("results");
        return;
      }

      const matchedAccounts = matchAccount(result, accounts);
      setParsed(result);
      setMatches(matchedAccounts);
      setSelectedId(matchedAccounts.length === 1 ? matchedAccounts[0].id : null);
      setOverrides(buildInitialOverrides(result));
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
    setStatus("saving");

    const account = accounts.find((item) => item.id === selectedId);
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
    await (onSaved ? onSaved(selectedId, updates) : Promise.resolve());
    setSavedList((current) => [...current, account.name]);

    if (typeof onUpload === "function") {
      try {
        onUpload({
          fileName,
          type: getFileType({ name: fileName }),
          rows: [{ accountId: selectedId, name: account.name, before, after: uploadAfter }],
          parsed: parsedSnapshot,
        });
      } catch (error) {
        console.error("onUpload error", error);
      }
    }

    setStatus("done");
  };

  const reset = () => {
    setStatus("idle");
    setParsed(null);
    setMatches([]);
    setSelectedId(null);
    setOverrides({});
    setFileName("");
    setErrorMsg("");
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
        {SUPPORTED_BANKS.map((bank) => (
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

            {(parsed.previous_balance != null || parsed.interest_charged != null || parsed.fees != null) && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsed.holder_name && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Holder {parsed.holder_name}</div>}
                {parsed.previous_balance != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Previous balance {formatCurrency(parsed.previous_balance)}</div>}
                {parsed.interest_charged != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Interest {formatCurrency(parsed.interest_charged)}</div>}
                {parsed.fees != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Fees {formatCurrency(parsed.fees)}</div>}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: palette.muted }}>Review anything the parser found before you save it to the account.</div>
          </div>

          <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.muted, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>Match to account</div>
            {matches.length === 0 ? (
              <div style={{ color: palette.warn, fontSize: 13 }}>No match yet. Pick the account you want to update.</div>
            ) : (
              <div style={{ fontSize: 12, color: palette.muted, marginBottom: 10 }}>{matches.length} account{matches.length > 1 ? "s" : ""} matched - choose which one to update.</div>
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

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={buttonStyle(palette.surf2, palette.tx2)} onClick={reset}>
              Start over
            </button>
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
