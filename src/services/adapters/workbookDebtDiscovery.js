import { normalizeAprField, normalizeCurrency, normalizeDateField, normalizeDebtType } from "./importCandidateAdapter.js";
import { stableHash } from "./legacyTrackToZeroAdapter.js";

export const WORKBOOK_DISCOVERY_VERSION = "data-1a";

export const EVIDENCE_TRUTH = Object.freeze({
  observed: "observed",
  userEntered: "user_entered",
  formulaDerived: "formula_derived",
  projected: "projected",
  ambiguous: "ambiguous",
  missing: "missing",
});

export const CLASSIFICATIONS = Object.freeze({
  likelyDebt: "likely_debt",
  possibleDebt: "possible_debt",
  notDebt: "not_debt",
  uncertain: "uncertain",
});

export const SCOPE_SUGGESTIONS = Object.freeze({
  householdCandidate: "household_candidate",
  businessCandidate: "business_candidate",
  scopeUncertain: "scope_uncertain",
});

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const HEADER_ALIASES = {
  identity: [
    "creditor", "account", "account name", "account/cardholder", "account / cardholder",
    "debt", "lender", "card", "card name", "loan", "account holder", "cardholder",
  ],
  creditorName: ["creditor", "lender", "bank", "issuer"],
  accountName: ["account", "account name", "debt", "debt name", "name", "account/cardholder", "account / cardholder"],
  debtType: ["type", "debt type", "account type", "category"],
  currentBalance: ["balance", "current balance", "remaining balance", "amount owed", "debt balance", "outstanding", "payoff amount", "new balance"],
  startingBalance: ["starting balance", "opening balance", "original balance"],
  minimumPayment: ["minimum payment", "minimum", "minimum due", "monthly payment", "payment", "required payment", "min payment", "min due"],
  apr: ["apr", "interest rate", "rate", "annual percentage rate", "interest %"],
  dueDate: ["due date", "payment due", "due day", "due"],
  owner: ["owner", "cardholder", "borrower", "account holder", "member"],
};

const STRONG_SHEET_RE = /debt|debt tracker|balance tracker|loan|credit card|liabilit|payoff|balances/i;
const LOW_SHEET_RE = /holiday|calendar|note|instruction/i;

const DEBT_CATEGORY_RE = /\b(credit cards?|student loans?|personal loans?|auto loans?|car loans?|mortgage|medical debt|collections?|tax debt|line of credit|heloc|financing|installment|bnpl|payoff|liabilit(?:y|ies))\b/i;
const BILL_CATEGORY_RE = /\b(insurance|subscriptions?|home expenses?|utilities|storage|groceries|restaurants?|daycare|memberships?|rent|phone|internet|streaming|electric(?:ity)?|water|natural gas|gas utility|cable|household service)\b/i;
const BUSINESS_RE = /\b(business|stallion|llc|inc\.?|corp\.?|company)\b/i;
const JUNK_OWNER_RE = /undeliverable|account services|important information|customer service|payment address|mail only/i;
const POSSIBLE_PAYMENT_RE = /\b(car payment|house payment|medical payment|furniture payment|loan payment)\b/i;
const ORDINARY_BILL_RE = /\b(electric|electricity|water|natural gas|gas utility|internet|phone|cable|netflix|hulu|spotify|streaming|subscription|insurance|grocery|groceries|restaurant|daycare|storage|membership|rent|utility|utilities)\b/i;

const safeString = (value) => String(value ?? "").trim();
const normalizeText = (value) => safeString(value).toLowerCase().replace(/[\u2022*•]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const compactKey = (value) => normalizeText(value).replace(/\b(services?|bank|card|credit|loan|inc|llc|na)\b/g, "").replace(/\s+/g, " ").trim();
const cellRef = (XLSX, rowIndex, colIndex) => XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
const decodeRange = (XLSX, sheet) => {
  if (!sheet?.["!ref"]) return null;
  try { return XLSX.utils.decode_range(sheet["!ref"]); } catch { return null; }
};
const normalizeHeader = (value) => normalizeText(value).replace(/\s*\/\s*/g, " / ");
const isMonthName = (value) => MONTH_NAMES.includes(normalizeText(value));
const columnLetter = (XLSX, colIndex) => XLSX.utils.encode_col(colIndex);

export const getSafeAccountReference = (text = "") => {
  const source = safeString(text);
  const last4 = source.match(/(?:\*{2,}|x{2,}|•{2,}|\bending\s+in\s+|\blast\s*4\s*)\s*(\d{4})\b/i)?.[1]
    || source.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)?.[1]
    || "";
  return last4 ? `last4:${last4}` : "";
};

export const normalizeCreditorName = (value = "") => {
  const text = normalizeText(value);
  if (/\bbofa\b|bank of america/.test(text)) return "bank of america";
  if (/\bnfcu\b|navy federal/.test(text)) return "navy federal credit union";
  if (/firstmark/.test(text)) return "firstmark services";
  if (/\bamex\b|american express/.test(text)) return "american express";
  if (/capital one/.test(text)) return "capital one";
  if (/wells fargo/.test(text)) return "wells fargo";
  if (/chase/.test(text)) return "chase";
  return compactKey(text);
};

export const parseOwnerSuggestion = (label = "") => {
  const raw = safeString(label);
  if (!raw || JUNK_OWNER_RE.test(raw)) return "";
  const paren = raw.match(/\(([^)]+)\)\s*$/);
  const candidate = safeString(paren?.[1] || "");
  if (!candidate || JUNK_OWNER_RE.test(candidate) || BUSINESS_RE.test(candidate)) return "";
  return candidate;
};

const stripOwnerSuffix = (label = "") => safeString(label).replace(/\s*\([^)]+\)\s*$/g, "").trim();

const inferDebtTypeFromText = (text = "") => normalizeDebtType("", text);

// DATA-1 HOTFIX: `value` previously had no default, and both call sites
// below (classification/bill signal evidence) never pass one - Firestore's
// setDoc() rejects any document containing a literal `undefined` field
// value, so every ImportBatch containing at least one classified row (i.e.
// almost any real workbook) failed to persist with "Unsupported field
// value: undefined". A signal-only evidence entry has no discrete value
// beyond its `source` description, so `null` (explicitly "no value", never
// silently dropped) is the correct default, not an accidental gap.
const evidence = ({ kind, source, weight = 1, provenance, value = null, truth = EVIDENCE_TRUTH.observed, note = "" }) => ({
  kind,
  source: safeString(source),
  weight,
  provenance,
  value,
  truth,
  note,
});

const provenanceForCell = ({ fileName = "", sheetName, sheetIndex, rowIndex, colIndex, header = "", cell, XLSX }) => ({
  fileName,
  sheetName,
  sheetIndex,
  row: rowIndex + 1,
  column: columnLetter(XLSX, colIndex),
  cell: cellRef(XLSX, rowIndex, colIndex),
  header,
  originalValue: cell?.w ?? cell?.v ?? null,
  formula: cell?.f || "",
});

const cellTruth = ({ cell, header = "", sheetName = "", formulaRefMonths = [] }) => {
  if (!cell) return EVIDENCE_TRUTH.missing;
  const headerNorm = normalizeText(header);
  const sheetNorm = normalizeText(sheetName);
  const formula = safeString(cell.f);
  if (formula) {
    const projected = /december|november|october|september|q\d+|\b12\b/i.test(formula)
      || formulaRefMonths.some((month) => ["september", "october", "november", "december"].includes(month))
      || /new balance/.test(headerNorm);
    return projected ? EVIDENCE_TRUTH.projected : EVIDENCE_TRUTH.formulaDerived;
  }
  if (MONTH_NAMES.some((month) => headerNorm.includes(month)) || MONTH_NAMES.some((month) => sheetNorm.includes(month))) {
    return EVIDENCE_TRUTH.observed;
  }
  if (/starting|opening|original/.test(headerNorm)) return EVIDENCE_TRUTH.userEntered;
  if (/new balance/.test(headerNorm)) return EVIDENCE_TRUTH.ambiguous;
  return EVIDENCE_TRUTH.userEntered;
};

const formulaReferences = (formula = "") => {
  const refs = [];
  const re = /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))?!?\$?[A-Z]{1,3}\$?\d+/g;
  let match;
  while ((match = re.exec(formula))) {
    const sheet = safeString(match[1] || match[2] || "");
    if (sheet) refs.push(sheet);
  }
  return refs;
};

export const analyzeWorkbookTopology = ({ workbook, XLSX, fileName = "" }) => {
  const sheets = (workbook?.SheetNames || []).slice(0, 60).map((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    const range = decodeRange(XLSX, sheet);
    const rows = [];
    let nonEmptyCellCount = 0;
    let formulaCount = 0;
    let debtVocabularyHits = 0;
    let billVocabularyHits = 0;
    let crossSheetReferenceCount = 0;
    if (range) {
      const maxRows = Math.min(range.e.r, range.s.r + 500);
      const maxCols = Math.min(range.e.c, range.s.c + 80);
      for (let r = range.s.r; r <= maxRows; r += 1) {
        const cells = [];
        for (let c = range.s.c; c <= maxCols; c += 1) {
          const ref = cellRef(XLSX, r, c);
          const cell = sheet[ref];
          if (!cell) { cells.push(null); continue; }
          nonEmptyCellCount += 1;
          if (cell.f) {
            formulaCount += 1;
            if (formulaReferences(cell.f).length) crossSheetReferenceCount += 1;
          }
          const text = safeString(cell.w ?? cell.v);
          if (DEBT_CATEGORY_RE.test(text)) debtVocabularyHits += 1;
          if (BILL_CATEGORY_RE.test(text)) billVocabularyHits += 1;
          cells.push({ ref, value: cell.v, text, formula: cell.f || "", cell });
        }
        rows.push(cells);
      }
    }
    const headerRows = findHeaderRows(rows);
    const nameSignals = STRONG_SHEET_RE.test(sheetName) ? 4 : 0;
    const lowSignals = LOW_SHEET_RE.test(sheetName) ? -6 : 0;
    const headerSignals = headerRows.reduce((sum, row) => sum + row.score, 0);
    const monthSignals = isMonthName(sheetName) ? 1 : 0;
    const relevanceScore = Math.max(0, nameSignals + lowSignals + headerSignals + debtVocabularyHits * 0.8 - billVocabularyHits * 0.2 + monthSignals);
    return {
      fileName,
      sheetName,
      sheetIndex,
      usedRange: sheet?.["!ref"] || "",
      hidden: !!workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden,
      nonEmptyCellCount,
      formulaCount,
      candidateTableRegions: headerRows.map((row) => ({ headerRow: row.rowIndex + 1, score: row.score })),
      headerLikeRows: headerRows.map((row) => row.rowIndex + 1),
      debtVocabularyDensity: nonEmptyCellCount ? debtVocabularyHits / nonEmptyCellCount : 0,
      billVocabularyDensity: nonEmptyCellCount ? billVocabularyHits / nonEmptyCellCount : 0,
      dateMonthCharacteristics: { isMonthSheet: isMonthName(sheetName), monthName: isMonthName(sheetName) ? normalizeText(sheetName) : "" },
      crossSheetReferenceCount,
      relevanceScore,
      rows,
    };
  });
  return { fileName, sheetCount: sheets.length, sheets };
};

const headerFieldFor = (text) => {
  const normalized = normalizeHeader(text);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalized === normalizeHeader(alias))) return field;
  }
  if (MONTH_NAMES.some((month) => normalized.includes(month) && normalized.includes("balance"))) return "currentBalance";
  return "";
};

function findHeaderRows(rows = []) {
  return rows.map((cells, rowIndex) => {
    const fields = new Set(cells.map((cell) => headerFieldFor(cell?.text)).filter(Boolean));
    const score = fields.size + (fields.has("identity") ? 2 : 0) + (fields.has("currentBalance") ? 2 : 0) + (fields.has("apr") ? 1 : 0) + (fields.has("minimumPayment") ? 1 : 0);
    return { rowIndex, fields: [...fields], score };
  }).filter((row) => row.score >= 3);
}

const buildColumnMap = (headerCells = []) => {
  const map = {};
  headerCells.forEach((cell, index) => {
    const field = headerFieldFor(cell?.text);
    if (!field) return;
    if (field === "identity" && map.accountName == null) map.accountName = index;
    else if (map[field] == null) map[field] = index;
  });
  return map;
};

const rowIdentity = ({ row, columnMap, sheetName }) => {
  const accountText = safeString(row[columnMap.accountName]?.text || row[columnMap.creditorName]?.text);
  const categoryText = safeString(row[columnMap.debtType]?.text || "");
  if (!accountText && !categoryText) return null;
  return { accountText, categoryText, sheetName };
};

const classifyRow = ({ accountText, categoryText, sheetName, hasBalanceEvidence, hasAprEvidence, hasMinimumEvidence }) => {
  const haystack = `${accountText} ${categoryText} ${sheetName}`;
  const debtSignals = [];
  const billSignals = [];
  if (DEBT_CATEGORY_RE.test(haystack)) debtSignals.push("debt vocabulary/category");
  if (inferDebtTypeFromText(haystack) !== "other") debtSignals.push("debt type alias");
  if (hasBalanceEvidence) debtSignals.push("balance evidence");
  if (hasAprEvidence) debtSignals.push("APR evidence");
  if (hasMinimumEvidence && debtSignals.length) debtSignals.push("minimum payment evidence");
  if (ORDINARY_BILL_RE.test(haystack) || BILL_CATEGORY_RE.test(haystack)) billSignals.push("ordinary bill vocabulary/category");
  if (POSSIBLE_PAYMENT_RE.test(haystack) && !hasBalanceEvidence && !hasAprEvidence && !DEBT_CATEGORY_RE.test(haystack)) {
    return { classification: CLASSIFICATIONS.possibleDebt, debtSignals, billSignals, reason: "Recurring payment resembles debt but no payoff balance/loan evidence was found." };
  }
  if (billSignals.length && !debtSignals.some((signal) => signal !== "minimum payment evidence")) {
    return { classification: CLASSIFICATIONS.notDebt, debtSignals, billSignals, reason: "Ordinary recurring bill/expense evidence without payoff-balance evidence." };
  }
  if (debtSignals.length >= 2 || (DEBT_CATEGORY_RE.test(haystack) && (hasBalanceEvidence || hasAprEvidence || hasMinimumEvidence))) {
    return { classification: CLASSIFICATIONS.likelyDebt, debtSignals, billSignals, reason: "Debt-like label/category with financial payoff evidence." };
  }
  if (debtSignals.length === 1 || hasBalanceEvidence || hasAprEvidence) {
    return { classification: CLASSIFICATIONS.possibleDebt, debtSignals, billSignals, reason: "Some debt/payoff evidence exists, but the workbook did not prove enough fields." };
  }
  return { classification: CLASSIFICATIONS.uncertain, debtSignals, billSignals, reason: "Workbook row has financial-looking data but not enough semantic evidence." };
};

const chooseBestBalanceEvidence = (balances = []) => {
  const sorted = [...balances].sort((a, b) => {
    const rank = (item) => {
      if (item.truth === EVIDENCE_TRUTH.observed) return 5;
      if (item.truth === EVIDENCE_TRUTH.userEntered) return 4;
      if (item.truth === EVIDENCE_TRUTH.ambiguous) return 2;
      if (item.truth === EVIDENCE_TRUTH.formulaDerived) return 1;
      if (item.truth === EVIDENCE_TRUTH.projected) return 0;
      return -1;
    };
    return rank(b) - rank(a);
  });
  return sorted[0] || null;
};

const entityKeyFor = ({ label, ownerSuggestion, accountReferenceSafe }) => {
  if (accountReferenceSafe) return `acct:${accountReferenceSafe}|${ownerSuggestion || ""}`;
  return `name:${normalizeCreditorName(label)}|${compactKey(stripOwnerSuffix(label))}|${ownerSuggestion || ""}`;
};

const pushFieldEvidence = ({ fieldEvidence, field, item }) => {
  if (!fieldEvidence[field]) fieldEvidence[field] = [];
  fieldEvidence[field].push(item);
};

const candidateFromGroup = ({ group, importBatchId, source, sourceFilename }) => {
  const fieldEvidence = group.fieldEvidence;
  const bestBalance = chooseBestBalanceEvidence(fieldEvidence.balance || []);
  const aprCandidates = fieldEvidence.apr || [];
  const knownAprs = aprCandidates.filter((item) => item.aprStatus !== "unknown");
  const aprUnique = [...new Set(knownAprs.map((item) => `${item.aprStatus}:${item.apr}`))];
  const aprChoice = knownAprs[0] || { apr: null, aprStatus: "unknown" };
  const minimum = (fieldEvidence.minimumPayment || []).find((item) => item.value != null);
  const due = (fieldEvidence.dueDate || []).find((item) => item.value);
  const debtType = group.debtType || "other";
  const classification = group.classifications.includes(CLASSIFICATIONS.likelyDebt)
    ? CLASSIFICATIONS.likelyDebt
    : group.classifications.includes(CLASSIFICATIONS.possibleDebt)
      ? CLASSIFICATIONS.possibleDebt
      : group.classifications.includes(CLASSIFICATIONS.notDebt)
        ? CLASSIFICATIONS.notDebt
        : CLASSIFICATIONS.uncertain;
  const balanceStatus = bestBalance && [EVIDENCE_TRUTH.observed, EVIDENCE_TRUTH.userEntered].includes(bestBalance.truth) ? "confirmed" : "unresolved";
  const currentBalance = balanceStatus === "confirmed" ? bestBalance.value : 0;
  const scopeSuggestion = group.businessSignals.length ? SCOPE_SUGGESTIONS.businessCandidate : SCOPE_SUGGESTIONS.householdCandidate;
  const warnings = [
    classification === CLASSIFICATIONS.possibleDebt ? "Possible debt - needs human confirmation before import." : "",
    balanceStatus === "unresolved" ? "Current balance is unresolved; missing or formula/projected evidence was not treated as confirmed truth." : "",
    aprChoice.aprStatus === "unknown" ? "APR missing or unknown." : "",
    aprUnique.length > 1 ? "Multiple plausible APR values found; review before confirming." : "",
    minimum?.value == null ? "Minimum payment is missing or unresolved." : "",
    scopeSuggestion === SCOPE_SUGGESTIONS.businessCandidate ? "Business-like scope evidence found; do not include in household plan without confirmation." : "",
  ].filter(Boolean);
  const confidenceLabel = scopeSuggestion === SCOPE_SUGGESTIONS.businessCandidate
    ? "business_debt_confirm_scope"
    : classification === CLASSIFICATIONS.likelyDebt && balanceStatus === "confirmed"
      ? "high_confidence_debt"
      : classification === CLASSIFICATIONS.likelyDebt
        ? "debt_needs_information"
        : classification === CLASSIFICATIONS.possibleDebt
          ? "possible_debt"
          : "uncertain";
  return {
    candidateId: `cand-${stableHash([importBatchId, source, group.key].join("|"))}`,
    source,
    sourceFilename,
    creditorName: group.creditorName,
    accountName: group.accountName || group.creditorName,
    accountReferenceSafe: group.accountReferenceSafe,
    debtType,
    currentBalance,
    balanceStatus,
    statementDate: bestBalance?.statementDate || "",
    apr: aprChoice.apr,
    aprStatus: aprChoice.aprStatus,
    minimumPayment: minimum?.value ?? null,
    dueDate: due?.value || null,
    ownerSuggestion: group.ownerSuggestion || "",
    ownerType: "unassigned",
    ownerId: "",
    includedInCorePayoffPlan: debtType !== "mortgage" && scopeSuggestion !== SCOPE_SUGGESTIONS.businessCandidate,
    confidence: confidenceLabel,
    evidence: {
      parserVersion: WORKBOOK_DISCOVERY_VERSION,
      classification,
      classificationReason: group.reasons,
      classificationEvidence: group.classificationEvidence,
      fieldEvidence,
      sources: group.sources,
      scopeSuggestion,
      businessSignals: group.businessSignals,
      duplicateResolution: {
        entityKey: group.key,
        sourceCount: group.sources.length,
        consolidated: group.sources.length > 1,
      },
      ordinaryBillEvidence: group.ordinaryBillEvidence,
    },
    warnings,
    duplicateStatus: group.sources.length > 1 ? "likely_duplicate" : "new",
    decision: "pending_review",
  };
};

const extractRowsFromSheet = ({ topologySheet, sheet, XLSX, fileName }) => {
  const records = [];
  const range = decodeRange(XLSX, sheet);
  if (!range) return records;
  for (const region of topologySheet.candidateTableRegions) {
    const headerRowIndex = region.headerRow - 1;
    const headerCells = topologySheet.rows[headerRowIndex] || [];
    const columnMap = buildColumnMap(headerCells);
    if (columnMap.accountName == null && columnMap.creditorName == null) continue;
    const maxRows = Math.min(range.e.r, headerRowIndex + 300);
    for (let r = headerRowIndex + 1; r <= maxRows; r += 1) {
      const row = topologySheet.rows[r] || [];
      const identity = rowIdentity({ row, columnMap, sheetName: topologySheet.sheetName });
      if (!identity) continue;
      const accountCell = row[columnMap.accountName] || row[columnMap.creditorName];
      const accountText = safeString(identity.accountText);
      const categoryText = safeString(identity.categoryText);
      const ownerSuggestion = parseOwnerSuggestion(accountText) || (columnMap.owner != null ? parseOwnerSuggestion(row[columnMap.owner]?.text) || safeString(row[columnMap.owner]?.text) : "");
      const strippedLabel = stripOwnerSuffix(accountText);
      const debtType = normalizeDebtType(categoryText, `${accountText} ${topologySheet.sheetName}`);
      const balanceCells = [columnMap.currentBalance, columnMap.startingBalance]
        .filter((col) => col != null)
        .map((col) => ({ col, cell: sheet[cellRef(XLSX, r, col)], header: headerCells[col]?.text || "" }))
        .filter((item) => item.cell);
      const balanceEvidence = balanceCells.map(({ col, cell, header }) => {
        const formulaMonths = formulaReferences(cell.f).map(normalizeText).filter(isMonthName);
        return {
          value: normalizeCurrency(cell.w ?? cell.v),
          header,
          truth: cellTruth({ cell, header, sheetName: topologySheet.sheetName, formulaRefMonths: formulaMonths }),
          provenance: provenanceForCell({ fileName, sheetName: topologySheet.sheetName, sheetIndex: topologySheet.sheetIndex, rowIndex: r, colIndex: col, header, cell, XLSX }),
          statementDate: isMonthName(header) ? header : (isMonthName(topologySheet.sheetName) ? topologySheet.sheetName : ""),
        };
      });
      const aprCell = columnMap.apr != null ? sheet[cellRef(XLSX, r, columnMap.apr)] : null;
      const apr = normalizeAprField(aprCell?.w ?? aprCell?.v);
      const minCell = columnMap.minimumPayment != null ? sheet[cellRef(XLSX, r, columnMap.minimumPayment)] : null;
      const minimumPayment = minCell ? normalizeCurrency(minCell.w ?? minCell.v) : null;
      const dueCell = columnMap.dueDate != null ? sheet[cellRef(XLSX, r, columnMap.dueDate)] : null;
      const dueDate = dueCell ? normalizeDateField(dueCell.w ?? dueCell.v) || (Number.isInteger(Number(dueCell.v)) ? `day:${Number(dueCell.v)}` : null) : null;
      const classification = classifyRow({
        accountText,
        categoryText,
        sheetName: topologySheet.sheetName,
        hasBalanceEvidence: balanceEvidence.some((item) => item.value != null),
        hasAprEvidence: apr.aprStatus !== "unknown" || !!aprCell,
        hasMinimumEvidence: minimumPayment != null,
      });
      const accountReferenceSafe = getSafeAccountReference(accountText);
      records.push({
        key: entityKeyFor({ label: strippedLabel, ownerSuggestion, accountReferenceSafe }),
        creditorName: strippedLabel,
        accountName: strippedLabel,
        ownerSuggestion: JUNK_OWNER_RE.test(ownerSuggestion) ? "" : ownerSuggestion,
        accountReferenceSafe,
        debtType,
        classification,
        identityEvidence: accountCell ? [{
          value: accountText,
          truth: cellTruth({ cell: accountCell.cell, header: headerCells[columnMap.accountName ?? columnMap.creditorName]?.text || "", sheetName: topologySheet.sheetName }),
          provenance: provenanceForCell({
            fileName,
            sheetName: topologySheet.sheetName,
            sheetIndex: topologySheet.sheetIndex,
            rowIndex: r,
            colIndex: columnMap.accountName ?? columnMap.creditorName,
            header: headerCells[columnMap.accountName ?? columnMap.creditorName]?.text || "",
            cell: accountCell.cell,
            XLSX,
          }),
        }] : [],
        balanceEvidence,
        aprEvidence: aprCell ? [{ ...apr, raw: aprCell.w ?? aprCell.v, provenance: provenanceForCell({ fileName, sheetName: topologySheet.sheetName, sheetIndex: topologySheet.sheetIndex, rowIndex: r, colIndex: columnMap.apr, header: headerCells[columnMap.apr]?.text || "", cell: aprCell, XLSX }), truth: cellTruth({ cell: aprCell, header: headerCells[columnMap.apr]?.text || "", sheetName: topologySheet.sheetName }) }] : [],
        minimumEvidence: minCell ? [{ value: minimumPayment, raw: minCell.w ?? minCell.v, provenance: provenanceForCell({ fileName, sheetName: topologySheet.sheetName, sheetIndex: topologySheet.sheetIndex, rowIndex: r, colIndex: columnMap.minimumPayment, header: headerCells[columnMap.minimumPayment]?.text || "", cell: minCell, XLSX }), truth: cellTruth({ cell: minCell, header: headerCells[columnMap.minimumPayment]?.text || "", sheetName: topologySheet.sheetName }) }] : [],
        dueEvidence: dueCell ? [{ value: dueDate, raw: dueCell.w ?? dueCell.v, provenance: provenanceForCell({ fileName, sheetName: topologySheet.sheetName, sheetIndex: topologySheet.sheetIndex, rowIndex: r, colIndex: columnMap.dueDate, header: headerCells[columnMap.dueDate]?.text || "", cell: dueCell, XLSX }), truth: cellTruth({ cell: dueCell, header: headerCells[columnMap.dueDate]?.text || "", sheetName: topologySheet.sheetName }) }] : [],
        source: { sheetName: topologySheet.sheetName, sheetIndex: topologySheet.sheetIndex, row: r + 1 },
        businessSignal: BUSINESS_RE.test(`${accountText} ${categoryText} ${topologySheet.sheetName}`) ? `${accountText} ${categoryText}` : "",
      });
    }
  }
  return records;
};

export const discoverWorkbookDebtCandidates = ({ workbook, XLSX, fileName = "", importBatchId = "", source = "excel" }) => {
  if (!workbook?.SheetNames?.length) {
    return { candidates: [], batchWarnings: ["No sheet was found in this file."], topology: { fileName, sheetCount: 0, sheets: [] }, scanSummary: {}, confident: false };
  }
  const topology = analyzeWorkbookTopology({ workbook, XLSX, fileName });
  const records = [];
  for (const topologySheet of topology.sheets) {
    if (LOW_SHEET_RE.test(topologySheet.sheetName) && topologySheet.relevanceScore < 3) continue;
    records.push(...extractRowsFromSheet({ topologySheet, sheet: workbook.Sheets[topologySheet.sheetName], XLSX, fileName }));
  }
  const groups = new Map();
  const ordinaryBills = [];
  const ambiguousItems = [];
  for (const record of records) {
    if (record.classification.classification === CLASSIFICATIONS.notDebt) {
      ordinaryBills.push(record);
      continue;
    }
    if (record.classification.classification === CLASSIFICATIONS.uncertain) ambiguousItems.push(record);
    if (!groups.has(record.key)) {
      groups.set(record.key, {
        key: record.key,
        creditorName: record.creditorName,
        accountName: record.accountName,
        ownerSuggestion: record.ownerSuggestion,
        accountReferenceSafe: record.accountReferenceSafe,
        debtType: record.debtType,
        classifications: [],
        reasons: [],
        classificationEvidence: [],
        fieldEvidence: {},
        sources: [],
        businessSignals: [],
        ordinaryBillEvidence: [],
      });
    }
    const group = groups.get(record.key);
    group.classifications.push(record.classification.classification);
    group.reasons.push(record.classification.reason);
    group.sources.push(record.source);
    if (record.businessSignal) group.businessSignals.push(record.businessSignal);
    record.classification.debtSignals.forEach((signal) => group.classificationEvidence.push(evidence({ kind: "debt_signal", source: signal, weight: 1, provenance: record.source })));
    record.classification.billSignals.forEach((signal) => group.ordinaryBillEvidence.push(evidence({ kind: "bill_signal", source: signal, weight: 1, provenance: record.source })));
    record.identityEvidence.forEach((item) => pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "identity", item }));
    record.balanceEvidence.forEach((item) => item.value != null && pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "balance", item }));
    record.aprEvidence.forEach((item) => pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "apr", item }));
    record.minimumEvidence.forEach((item) => pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "minimumPayment", item }));
    record.dueEvidence.forEach((item) => pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "dueDate", item }));
    if (record.ownerSuggestion) pushFieldEvidence({ fieldEvidence: group.fieldEvidence, field: "owner", item: { value: record.ownerSuggestion, truth: EVIDENCE_TRUTH.ambiguous, provenance: record.source } });
  }
  const candidates = [...groups.values()]
    .map((group) => candidateFromGroup({ group, importBatchId, source, sourceFilename: fileName }))
    .filter((candidate) => candidate.evidence.classification !== CLASSIFICATIONS.notDebt);
  const scanSummary = {
    sheetsAnalyzed: topology.sheets.length,
    sheetsRelevant: topology.sheets.filter((sheet) => sheet.relevanceScore >= 3).length,
    candidateDebts: candidates.filter((candidate) => candidate.evidence.classification === CLASSIFICATIONS.likelyDebt).length,
    possibleDebts: candidates.filter((candidate) => candidate.evidence.classification === CLASSIFICATIONS.possibleDebt).length,
    businessCandidates: candidates.filter((candidate) => candidate.evidence.scopeSuggestion === SCOPE_SUGGESTIONS.businessCandidate).length,
    needsInformation: candidates.filter((candidate) => candidate.balanceStatus === "unresolved" || candidate.aprStatus === "unknown" || candidate.minimumPayment == null).length,
    ordinaryBillsIgnored: ordinaryBills.length,
    ambiguousItems: ambiguousItems.length,
  };
  const batchWarnings = [
    candidates.length ? "" : "Valid workbook parsed, but no likely debt candidates were found.",
    ordinaryBills.length ? `${ordinaryBills.length} ordinary bill/expense row(s) were ignored.` : "",
    ambiguousItems.length ? `${ambiguousItems.length} ambiguous row(s) need review.` : "",
  ].filter(Boolean);
  return {
    candidates,
    batchWarnings,
    topology: {
      ...topology,
      sheets: topology.sheets.map((topologySheet) => {
        const sheet = { ...topologySheet };
        delete sheet.rows;
        return sheet;
      }),
    },
    scanSummary,
    confident: candidates.length > 0,
  };
};
