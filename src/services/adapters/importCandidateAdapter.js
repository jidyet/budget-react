import { normalizeAprDecimal } from "../../utils/budgetUtils.js";
import { stableHash } from "./legacyTrackToZeroAdapter.js";

// Canonical import pipeline shared by every source format (Excel, CSV, and any
// future format): raw rows -> HEADER_ALIASES matching -> per-field normalizers
// -> NormalizedImportCandidate[]. A source-specific reader (see excelImportReader.js,
// csvImportReader.js) is only responsible for turning a file into
// `{ headers: string[], rows: Array<Record<string,unknown>> }`; everything after
// that point - column detection, currency/date/APR/debt-type normalization,
// warnings - lives here so no format gets its own financial business logic.

export const HEADER_ALIASES = {
  creditorName: ["creditor", "lender", "creditor name", "lender name", "bank", "issuer"],
  accountName: ["account", "account name", "debt", "debt name", "name"],
  debtType: ["type", "debt type", "account type", "category"],
  currentBalance: ["balance", "current balance", "amount owed", "balance owed", "outstanding balance"],
  apr: ["apr", "interest rate", "rate"],
  minimumPayment: ["minimum payment", "min payment", "minimum due", "min due"],
  dueDate: ["due date", "payment due date", "next due date"],
  statementDate: ["statement date", "as of", "as of date", "balance as of"],
  owner: ["owner", "member", "whose", "belongs to"],
};

const DEBT_TYPE_ALIASES = [
  // Must come before credit_card - Array.find takes the first match, and a
  // label like "U.S. Bank Business credit card" would otherwise always match
  // credit_card first even though the business qualifier is stronger evidence.
  { type: "business_debt", match: /business.{0,25}(credit\s*card|loan|line\s*of\s*credit)/i },
  { type: "credit_card", match: /credit\s*card|visa|mastercard|amex|discover card/i },
  // Known student-loan servicer names count as a student-loan signal even when
  // the literal phrase "student loan" isn't present (common on real statements -
  // same servicer list StatementUpload.jsx's provider detection already uses).
  { type: "student_loan", match: /student\s*loan|\bmohela\b|\bnelnet\b|\bnavient\b|sallie\s*mae|firstmark|\baes\b|subsidized|\bfafsa\b/i },
  { type: "auto_loan", match: /auto\s*loan|car\s*loan|vehicle\s*loan/i },
  { type: "mortgage", match: /mortgage/i },
  { type: "line_of_credit", match: /line\s*of\s*credit|heloc/i },
  { type: "bnpl", match: /bnpl|buy\s*now|affirm|afterpay|klarna/i },
  { type: "medical", match: /medical|hospital/i },
  { type: "collections", match: /collection/i },
  { type: "tax_debt", match: /\btax\b/i },
  { type: "personal_loan", match: /personal\s*loan/i },
  { type: "personal_debt", match: /personal\s*debt|family|friend/i },
];

const normalizeHeader = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const detectColumnMapping = (headers = []) => {
  const normalizedHeaders = headers.map((header) => ({ raw: header, normalized: normalizeHeader(header) }));
  const mapping = {};
  const unmatched = [];
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (found) mapping[field] = found.raw;
    else unmatched.push(field);
  }
  const requiredMissing = ["currentBalance"].filter((field) => unmatched.includes(field))
    .concat(!mapping.creditorName && !mapping.accountName ? ["creditorName/accountName"] : []);
  return { mapping, unmatched, requiredMissing, confident: requiredMissing.length === 0 };
};

export const normalizeCurrency = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? Math.abs(numeric) : null;
};

export const normalizeAprField = (value) => {
  if (value == null || value === "") return { apr: null, aprStatus: "unknown" };
  const cleaned = String(value).trim().replace(/%$/, "");
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return { apr: null, aprStatus: "unknown" };
  if (numeric === 0) return { apr: 0, aprStatus: "no_interest" };
  return { apr: normalizeAprDecimal(numeric), aprStatus: "known" };
};

export const normalizeDateField = (value) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
};

export const normalizeDebtType = (rawType, fallbackText = "") => {
  const haystack = `${rawType || ""} ${fallbackText || ""}`;
  const found = DEBT_TYPE_ALIASES.find((entry) => entry.match.test(haystack));
  return found ? found.type : "other";
};

const rowValue = (row, mapping, field) => {
  const header = mapping[field];
  return header ? row[header] : undefined;
};

export const normalizeSpreadsheetRowsToCandidates = ({ headers = [], rows = [], source = "excel", importBatchId = "", sourceFilename = "" }) => {
  const { mapping, unmatched, requiredMissing, confident } = detectColumnMapping(headers);
  if (!confident) {
    return {
      candidates: [],
      batchWarnings: [
        requiredMissing.includes("currentBalance") ? "No balance column could be found. Add a column such as \"Balance\" or \"Current Balance\"." : null,
        requiredMissing.includes("creditorName/accountName") ? "No creditor or account name column could be found." : null,
      ].filter(Boolean),
      mapping,
      unmatched,
      confident,
    };
  }

  const candidates = [];
  const batchWarnings = [];
  if (unmatched.length) {
    batchWarnings.push(`These fields were not found in the file and will need manual review: ${unmatched.join(", ")}.`);
  }

  rows.forEach((row, index) => {
    const creditorName = String(rowValue(row, mapping, "creditorName") || "").trim();
    const accountName = String(rowValue(row, mapping, "accountName") || "").trim();
    if (!creditorName && !accountName) return; // blank/decorative row - not a candidate at all

    const currentBalance = normalizeCurrency(rowValue(row, mapping, "currentBalance"));
    const rowWarnings = [];
    if (currentBalance == null) rowWarnings.push("Balance could not be read from this row; it needs manual entry before it can be confirmed.");

    const { apr, aprStatus } = normalizeAprField(rowValue(row, mapping, "apr"));
    if (mapping.apr && aprStatus === "unknown" && rowValue(row, mapping, "apr") != null && rowValue(row, mapping, "apr") !== "") {
      rowWarnings.push("APR value could not be parsed; left as unknown.");
    }

    const minimumPaymentRaw = rowValue(row, mapping, "minimumPayment");
    const minimumPayment = minimumPaymentRaw == null || minimumPaymentRaw === "" ? null : normalizeCurrency(minimumPaymentRaw);
    if (mapping.minimumPayment && minimumPayment == null) rowWarnings.push("Minimum payment is missing for this row.");

    const debtType = normalizeDebtType(rowValue(row, mapping, "debtType"), `${creditorName} ${accountName}`);
    if (debtType === "mortgage") rowWarnings.push("Mortgage detected - excluded from the core payoff plan by default.");

    const dueDate = normalizeDateField(rowValue(row, mapping, "dueDate"));
    const statementDate = normalizeDateField(rowValue(row, mapping, "statementDate"));
    const ownerSuggestion = String(rowValue(row, mapping, "owner") || "").trim();

    const candidateId = `cand-${stableHash([importBatchId, source, index, creditorName, accountName].join("|"))}`;

    candidates.push({
      candidateId,
      source,
      creditorName,
      accountName: accountName || creditorName,
      debtType,
      currentBalance: currentBalance ?? 0,
      // See statementCandidateAdapter.js - this row never produced a
      // confident balance, so 0 is a form placeholder, not a claim of "$0
      // owed". Carried through to the created Debt at commit time.
      balanceStatus: currentBalance == null ? "unresolved" : "confirmed",
      statementDate,
      apr,
      aprStatus,
      minimumPayment,
      dueDate,
      ownerSuggestion,
      includedInCorePayoffPlan: debtType !== "mortgage",
      warnings: rowWarnings,
      duplicateStatus: "new",
      decision: "pending_review",
    });
  });

  if (!candidates.length) batchWarnings.push(`No usable rows were found in ${sourceFilename || "this file"}.`);

  return { candidates, batchWarnings, mapping, unmatched, confident };
};
