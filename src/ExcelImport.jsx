/**
 * ExcelImport — generic discovery + mapping pipeline
 *
 * Root cause of old rigidity:
 *   The previous importer assumed column A = name, iterated header row keywords
 *   on row 0 of the first sheet only, and failed with "No data rows found" when
 *   the layout didn't match. It had no value-based inference, no multi-table
 *   detection, no confidence model, and no fallback mapping UI.
 *
 * What this version does differently:
 *   1. Reads every sheet in the workbook.
 *   2. Scans each sheet for the best table candidate (not just row 0).
 *   3. Resolves column meanings in two phases:
 *        Phase 1 — header-name synonyms (HEADER_ALIASES).
 *        Phase 2 — value-pattern inference (currency, due-day integers,
 *                   decimal/whole APRs, date cells, last-4 digit strings,
 *                   boolean-like text, entity-name text).
 *   4. Scores each (sheet, table) pair and ranks them.
 *   5. Produces a confidence score that drives the UX:
 *        ≥ 0.42 → auto-preview (confident enough to show results directly)
 *        0.22-0.42 → preview with a "verify your mappings" warning
 *        < 0.22 → mapping screen first
 *   6. Classifies and skips non-data rows (totals, section headers, blank rows).
 *   7. Normalises extracted values: currency strings, decimal APRs,
 *      ordinal due-day strings ("15th"), Excel serial dates, blank placeholders.
 *   8. Never imports blindly — always goes through the review screen.
 */

import { useState, useRef } from "react";
import { fx } from "./utils/budgetUtils";

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

// ─── 1. Field synonym groups ───────────────────────────────────────────────────
const HEADER_ALIASES = {
  name:      ["expense","account","accountname","billname","name","description","debt",
               "debtname","loan","loanname","card","bill","payee","creditor","linename",
               "title","billaccount","item"],
  provider:  ["provider","bank","lender","issuer","servicer","institution","company",
               "creditcard","bankname","lendername","financialinstitution","creditorname",
               "issuingbank","servicingcompany"],
  owner:     ["owner","accountholder","holder","customer","member","borrower","person",
               "assignedto","whoowes","responsibleparty","primaryowner","whopays",
               "assignee","responsible"],
  last4:     ["last4","lastfour","endingdigits","endingin","accountnumber","acctno",
               "acctnum","last4digits","accountfragment","cardending","ending"],
  balance:   ["balance","currentbalance","statementbalance","remainingbalance","bal",
               "outstandingbalance","amountowed","totalbalance","balancedue",
               "currentamountowed","outstandingamount","currentbal"],
  minDue:    ["mindue","minimumdueamount","minimumpayment","paymentdue","amountdue",
               "mindueamt","minimumdue","minpayment","minpay","minimumpaymentdue",
               "paymentamount","requiredpayment","mindpaymentamt","minimummonthly"],
  dueDate:   ["paymentduedate","nextduedate","duedate","dueon","paymentdate","duedayon",
               "dueday","payby","dueby","daydue","billdue","nextpayment","paymentday",
               "duedate","dayofmonth"],
  paid:      ["amtpaid","amountpaid","paidamount","actualpaid","paidthismonth",
               "paymentmade","actualpayment","paymentmadeamt"],
  isPaid:    ["ispaid","markedpaid","paidstatus","paid","paymentstatus","iscovered",
               "completedpaid","paymentcomplete","paymentreceived","coveredthismonth"],
  purchases: ["newpurchases","purchases","charges","newcharges","purch","newspending",
               "spending","purchasesthisperiod","newchargesothers","monthlypurchases"],
  apr:       ["apr","purchaseapr","annualpercentagerate","interestrate","rate",
               "currentapr","variableapr","annualrate","aprrate","interestpercent",
               "percentrate","interestpct","aprpercent"],
  interest:  ["interestcharged","interest","financecharge","monthlyinterest",
               "interestpaid","interestthisperiod","accruedinterest"],
  fees:      ["fees","feescharged","latefees","totalfees","monthlycharges",
               "additionalfees","penaltyfees","servicefees"],
  category:  ["category","type","billtype","accounttype","debttype","classification",
               "billcategory","segment","group"],
  notes:     ["notes","memo","comment","remarks","additionalinfo","note","description",
               "annotation"],
};

const FIELD_LABELS = {
  name:      "Bill / Account Name",
  provider:  "Provider / Bank / Lender",
  owner:     "Owner / Account Holder",
  last4:     "Last 4 Digits",
  balance:   "Balance",
  minDue:    "Minimum Due",
  dueDate:   "Due Date / Due Day",
  paid:      "Amount Paid",
  isPaid:    "Is Paid?",
  purchases: "New Purchases",
  apr:       "APR / Interest Rate",
  interest:  "Interest Charged",
  fees:      "Fees",
  category:  "Category",
  notes:     "Notes",
};

const ALL_ALIASES   = Object.values(HEADER_ALIASES).flat();
const FIELD_WEIGHTS = {
  name: 0.30, balance: 0.12, minDue: 0.08, dueDate: 0.08, apr: 0.06,
  provider: 0.05, paid: 0.04, isPaid: 0.04, purchases: 0.03,
  interest: 0.03, owner: 0.03, fees: 0.02, last4: 0.02,
  category: 0.01, notes: 0.01,
};

// ─── 2. Header matching utilities ─────────────────────────────────────────────
function normalizeHeader(h) {
  return String(h ?? "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function matchColumn(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(h => {
      const n = normalizeHeader(h);
      return n === alias || n.includes(alias) || (alias.includes(n) && n.length >= 4);
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

function scoreHeaderRow(rowTexts) {
  return rowTexts.filter(h => {
    const n = normalizeHeader(h);
    return n.length >= 3 &&
      ALL_ALIASES.some(a => n === a || n.includes(a) || (a.includes(n) && n.length >= 4));
  }).length;
}

function colLetter(idx) {
  if (idx < 0) return "";
  let s = "", i = idx + 1;
  while (i > 0) { s = String.fromCharCode(64 + (i % 26 || 26)) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// ─── 3. Value-based column type inference ─────────────────────────────────────
/**
 * Given the raw JS values for a column (post XLSX parse, cellDates:true),
 * classify what field this column likely represents.
 */
function analyzeColumnValues(values) {
  const nonNull = values.filter(v => v != null && v !== "");
  if (nonNull.length === 0) return { type: "empty", confidence: 0 };
  const n = nonNull.length;

  const dates  = nonNull.filter(v => v instanceof Date);
  const nums   = nonNull.filter(v => typeof v === "number").map(Number);
  const strs   = nonNull.filter(v => typeof v === "string").map(v => String(v).trim()).filter(Boolean);
  const bools  = nonNull.filter(v =>
    typeof v === "boolean" ||
    /^(yes|no|x|paid|true|false|covered|done|complete)$/i.test(String(v))
  );

  if (dates.length / n >= 0.5) return { type: "date", confidence: Math.min(1, dates.length / n) };
  if (bools.length / n >= 0.6) return { type: "boolean", confidence: Math.min(1, bools.length / n) };

  if (nums.length / n >= 0.4) {
    const allInts    = nums.every(v => Number.isInteger(v));
    const min        = Math.min(...nums);
    const max        = Math.max(...nums);
    const avg        = nums.reduce((a, b) => a + b, 0) / nums.length;
    // Due-day integers: 1-31, all integers
    if (allInts && min >= 1 && max <= 31 && nums.length >= 2)
      return { type: "dueDay", confidence: 0.75 };
    // APR stored as Excel percentage decimal: values 0-1, non-integer
    const hasManySigDecimals = nums.some(v => {
      const dec = String(v).split(".")[1] || "";
      return dec.length >= 3;
    });
    if (!allInts && min >= 0 && max <= 1 && hasManySigDecimals)
      return { type: "aprDecimal", confidence: 0.78, scale: 100 };
    // APR stored as whole number: small positive values typical of interest rates
    if (!allInts && min >= 0 && max <= 50 && avg < 35 && avg > 0)
      return { type: "aprWhole", confidence: 0.62, scale: 1 };
    // Currency / balance / payment: larger or mixed values
    if (avg > 50 || max > 200)
      return { type: "currency", confidence: 0.68 };
    // Small integers that don't fit due-day (e.g. quantities, counts)
    if (allInts && max <= 31) return { type: "smallInt", confidence: 0.3 };
    return { type: "number", confidence: 0.35 };
  }

  if (strs.length / n >= 0.4) {
    const avgLen     = strs.reduce((a, b) => a + b.length, 0) / strs.length;
    const moneyStrs  = strs.filter(v => /^[$(]?[\d,]+\.?\d{0,2}\)?$/.test(v.replace(/\s/g, "")));
    const last4Strs  = strs.filter(v => /^\d{4}$/.test(v));
    const dueDayStrs = strs.filter(v => /^\d{1,2}(st|nd|rd|th)?$/i.test(v.trim()));

    if (last4Strs.length / strs.length >= 0.7)
      return { type: "last4", confidence: 0.85 };
    if (moneyStrs.length / strs.length >= 0.5)
      return { type: "currency", confidence: 0.70 };
    if (dueDayStrs.length / strs.length >= 0.5)
      return { type: "dueDay", confidence: 0.70 };
    if (avgLen >= 3 && avgLen <= 45 && strs.every(s => !/^[\d$,.\s%]+$/.test(s)))
      return { type: "nameText", confidence: Math.min(0.68, 0.28 + (strs.length / n) * 0.40) };
    return { type: "text", confidence: 0.25 };
  }

  return { type: "mixed", confidence: 0.15 };
}

// ─── 4. Table detection ───────────────────────────────────────────────────────
/**
 * Scan rows 0-24 and return the row index whose content best resembles
 * a table header, factoring in whether subsequent rows have numeric data.
 */
function findBestHeaderRow(data) {
  let bestIdx = 0, bestScore = 0;
  for (let i = 0; i < Math.min(data.length, 25); i++) {
    const row = (data[i] || []).map(v => String(v ?? ""));
    const hScore = scoreHeaderRow(row);
    // Bonus: following rows mix text + numbers → confirms this is a data header
    let dataBonus = 0;
    for (let j = i + 1; j < Math.min(data.length, i + 7); j++) {
      const nr = data[j] || [];
      const hasNum = nr.some(v => typeof v === "number");
      const hasTxt = nr.some(v => typeof v === "string" && String(v).trim().length > 1);
      if (hasNum && hasTxt) dataBonus++;
    }
    const total = hScore * 10 + dataBonus * 3;
    if (total > bestScore) { bestScore = total; bestIdx = i; }
  }
  return { headerIdx: bestIdx, headerScore: bestScore };
}

/**
 * Find where a table ends: stop after 3 consecutive fully-empty rows.
 */
function findTableEnd(data, headerIdx) {
  let consecutive = 0, end = Math.min(headerIdx + 1, data.length);
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] || [];
    const filled = row.filter(v => v != null && v !== "").length;
    if (filled === 0) {
      if (++consecutive >= 3) break;
    } else {
      consecutive = 0;
      end = i + 1;
    }
  }
  return end;
}

// ─── 5. Mapping resolution (header + value inference combined) ─────────────────
function resolveMapping(data, headerIdx, tableEnd) {
  const headers  = (data[headerIdx] || []).map(v => String(v ?? ""));
  const dataRows = data.slice(headerIdx + 1, tableEnd);
  const numCols  = Math.max(headers.length, ...dataRows.map(r => (r || []).length), 0);

  // Analyse each column's values
  const colAnalyses = [];
  for (let c = 0; c < numCols; c++) {
    const vals = dataRows.map(r => (r || [])[c] ?? null);
    colAnalyses.push(analyzeColumnValues(vals));
  }

  // Phase 1 — header-name synonym matching
  const headerMap = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    headerMap[field] = matchColumn(headers, aliases);
  }

  // Phase 2 — fill gaps with value inference
  const colMap    = { ...headerMap };
  const usedCols  = new Set(Object.values(headerMap).filter(v => v >= 0));

  const unassigned = colAnalyses
    .map((a, i) => ({ col: i, ...a }))
    .filter(c => !usedCols.has(c.col) && c.confidence >= 0.45);

  const byType = {};
  for (const item of unassigned) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item);
  }

  // Currency columns: sort by average numeric value so we assign balance vs minDue correctly
  const currencyCols = (byType.currency || []).map(item => {
    const vals = dataRows.map(r => (r || [])[item.col]).filter(v => typeof v === "number");
    const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...item, avg };
  }).sort((a, b) => b.avg - a.avg);

  const take = (field, pool) => {
    if (colMap[field] >= 0) return; // already mapped
    const next = pool.find(c => !Object.values(colMap).includes(c.col));
    if (next) { colMap[field] = next.col; usedCols.add(next.col); }
  };

  take("balance",   currencyCols);            // largest avg → balance
  take("minDue",    currencyCols);            // second largest → minDue
  take("paid",      currencyCols);
  take("purchases", currencyCols);
  take("interest",  currencyCols);
  take("fees",      currencyCols);

  take("dueDate",   [...(byType.dueDay || []), ...(byType.date || [])]);
  take("apr",       [...(byType.aprDecimal || []), ...(byType.aprWhole || [])]);
  take("isPaid",    byType.boolean || []);
  take("last4",     byType.last4   || []);

  // Name / provider from nameText columns (first → name, second → provider)
  const nameCands = (byType.nameText || []).filter(c => !Object.values(colMap).includes(c.col));
  if (colMap.name < 0 && nameCands.length > 0) { colMap.name = nameCands[0].col; usedCols.add(nameCands[0].col); }
  if (colMap.provider < 0 && nameCands.length > 1) colMap.provider = nameCands[1].col;

  // Confidence: weighted sum; header matches = full weight, inference = half weight
  let headerScore    = 0;
  let inferenceScore = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (colMap[field] >= 0) {
      if (headerMap[field] >= 0) headerScore    += weight;
      else                        inferenceScore += weight * 0.5;
    }
  }
  const confidence = Math.min(headerScore + inferenceScore, 1.0);

  // Human-readable warnings
  const warnings = [];
  if (colMap.name < 0)                      warnings.push("No bill/account name column found — mapping required.");
  if (colMap.balance < 0 && colMap.minDue < 0) warnings.push("No balance or payment column found.");

  return { colMap, colAnalyses, confidence, warnings };
}

// ─── 6. Value normalisers ──────────────────────────────────────────────────────
function parseMoney(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (v instanceof Date || typeof v === "boolean") return null;
  const s   = String(v).trim();
  const neg = s.startsWith("(") && s.endsWith(")");
  const n   = parseFloat((neg ? s.slice(1, -1) : s).replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : (neg ? -n : n);
}

function parseBool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  return /^(yes|x|true|1|paid|covered|done|complete)$/i.test(String(v).trim());
}

function parseDueDay(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getDate();
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 1 && v <= 31) return v;
    // Excel date serial → extract day
    if (v > 40000 && v < 100000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      if (!isNaN(d.getTime())) return d.getDate();
    }
    return null;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})(st|nd|rd|th)?$/i);
  if (m1) { const n = Number(m1[1]); return n >= 1 && n <= 31 ? n : null; }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\//);
  if (m2) { const n = Number(m2[2]); return n >= 1 && n <= 31 ? n : null; }
  const m3 = s.match(/^\d{4}-\d{2}-(\d{2})/);
  if (m3) { const n = Number(m3[1]); return n >= 1 && n <= 31 ? n : null; }
  const m4 = s.match(/\b(\d{1,2})(?:,\s*\d{4})?$/);
  if (m4) { const n = Number(m4[1]); return n >= 1 && n <= 31 ? n : null; }
  return null;
}

function parseAprValue(v, analysis) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && v.trim().endsWith("%")) {
    const n = parseFloat(v.replace(/[%\s$,]/g, ""));
    return isNaN(n) ? null : n;
  }
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,\s%]/g, ""));
  if (isNaN(n)) return null;
  // Stored as Excel percentage decimal (e.g. 0.1899 displayed as 18.99%)
  if (analysis?.type === "aprDecimal" && n <= 1) return Math.round(n * 10000) / 100;
  return n;
}

// ─── 7. Row classification & parsing ──────────────────────────────────────────
const SKIP_NAMES = [
  /^(subtotal|total|grand total|sum|monthly total|section total|balance forward|overall total)/i,
  /^(credit cards?|student loans?|personal loans?|auto loans?|mortgage|home equity|heloc)/i,
  /^(utilities|subscriptions|household|business|storage|insurance|medical|rent|food)/i,
  /^(income|expenses|bills|monthly expenses|fixed expenses|variable expenses|recurring)/i,
  /^(net|net income|savings goal|total income|total expenses|eagleview|boa|paycheck|salary)/i,
  /^(notes?|description|category|type|account|provider|owner|name|balance|due|apr)$/i,
];

function isSkippable(name) {
  return SKIP_NAMES.some(p => p.test(String(name).trim()));
}

function parseRowsWithMap(data, headerIdx, tableEnd, colMap, colAnalyses, accounts) {
  const accts = accounts || [];
  const rows  = [];

  for (let i = headerIdx + 1; i < tableEnd; i++) {
    const row = data[i] || [];
    const nonNull = row.filter(v => v != null && v !== "").length;
    if (nonNull === 0) continue; // fully empty

    // Name resolution: use mapped column, else first non-empty string cell
    let nameVal;
    if (colMap.name >= 0) {
      nameVal = row[colMap.name];
    } else {
      nameVal = row.find(v => typeof v === "string" && String(v).trim().length > 1);
    }
    const name = String(nameVal ?? "").trim();
    if (!name) continue;
    if (isSkippable(name)) continue;

    // Skip sparse rows that look like section dividers (≤ 2 cells filled in wide table)
    if (nonNull <= 2 && row.length >= 5) continue;

    const rd = {
      rawName:  name,
      provider: colMap.provider >= 0 ? String(row[colMap.provider] ?? "").trim() : "",
      owner:    colMap.owner    >= 0 ? String(row[colMap.owner]    ?? "").trim() : "",
      last4:    colMap.last4    >= 0 ? String(row[colMap.last4]    ?? "").trim() : "",
    };

    rows.push({
      rowNum:     i + 1,
      rawName:    name,
      provider:   rd.provider,
      owner:      rd.owner,
      last4:      rd.last4,
      matched:    fuzzyMatch(rd, accts),
      balance:    colMap.balance    >= 0 ? parseMoney(row[colMap.balance])                   : null,
      min_due:    colMap.minDue     >= 0 ? parseMoney(row[colMap.minDue])                    : null,
      due_day:    colMap.dueDate    >= 0 ? parseDueDay(row[colMap.dueDate])                  : null,
      paid_v:     colMap.paid       >= 0 ? parseMoney(row[colMap.paid])                      : null,
      is_paid:    colMap.isPaid     >= 0 ? parseBool(row[colMap.isPaid])                     : false,
      purch_v:    colMap.purchases  >= 0 ? parseMoney(row[colMap.purchases])                 : null,
      apr_v:      colMap.apr        >= 0 ? parseAprValue(row[colMap.apr], colAnalyses[colMap.apr]) : null,
      interest_v: colMap.interest   >= 0 ? parseMoney(row[colMap.interest])                  : null,
      fees_v:     colMap.fees       >= 0 ? parseMoney(row[colMap.fees])                      : null,
      category:   colMap.category   >= 0 ? String(row[colMap.category]  ?? "").trim()        : "",
      notes:      colMap.notes      >= 0 ? String(row[colMap.notes]     ?? "").trim()        : "",
      include:    false, // set after match
    });
  }

  // Default include=true for all rows — unmatched rows are imported as new bills
  return rows.map(r => ({ ...r, include: true }));
}

// ─── 8. Account fuzzy matching ────────────────────────────────────────────────
function normProv(v)  { return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function last4of(v)   { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 4 ? d.slice(-4) : ""; }
function normOwner(v) {
  return String(v ?? "").toLowerCase()
    .replace(/\b(?:llc|inc|corp|co|ltd|lp|llp|pllc|pc|dba)\b/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

/**
 * Extract a clean provider token from a raw cell value.
 * Handles patterns like:
 *   "AFFIRM (WD)"          → "affirm"
 *   "CHASE CREDIT PAYMENT" → "chase"
 *   "CAPITAL ONE AUTO FIN" → "capitalone"
 */
function extractProviderName(raw) {
  return String(raw ?? "")
    .replace(/\s*\(.*?\)\s*/g, " ")         // strip (parentheticals)
    .replace(/\b(payment|ach|debit|credit|transfer|pymt|pmt|auto|web|online|bill|svc|service|fin|financial|bank|card)\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function fuzzyMatch(rd, accounts) {
  if (!rd.rawName && !rd.provider && !rd.last4) return null;
  const rn  = rd.rawName.toLowerCase();
  const np  = normProv(rd.provider);
  const l4  = last4of(rd.last4);
  const no  = normOwner(rd.owner);

  const tag = (m, confidence) => m ? { ...m, _matchConfidence: confidence } : null;

  if (np && l4) {
    const m = accounts.find(a => normProv(a.bank || a.name || "") === np && last4of(`${a.name || ""} ${a.bank || ""}`) === l4);
    if (m) return tag(m, "Exact");
  }
  if (np && no) {
    const m = accounts.find(a => normProv(a.bank || a.name || "") === np && normOwner(a.owner) === no);
    if (m) return tag(m, "Good");
  }
  if (np && no) {
    const m = accounts.find(a => {
      const ap = normProv(a.bank || a.name || "");
      if (ap !== np) return false;
      const ao = normOwner(a.owner);
      return ao.includes(no) || no.includes(ao);
    });
    if (m) return tag(m, "Fuzzy");
  }

  // Direct name match
  const clean = rn.replace(/[^a-z0-9]/g, "");
  const found = accounts.find(a => {
    const an = String(a.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return an === clean || (clean.length > 6 && (an.includes(clean) || clean.includes(an)));
  }) || null;
  if (found) {
    const an = String(found.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return tag(found, an === clean ? "Exact" : "Fuzzy");
  }

  // Provider-text extraction fallback — handles "AFFIRM (WD)" → "affirm"
  const extracted = extractProviderName(rn);
  if (extracted.length >= 3) {
    const fm = accounts.find(a => {
      const an = normProv(a.name || a.bank || "");
      return an === extracted || (extracted.length >= 4 && (an.includes(extracted) || extracted.includes(an)));
    });
    if (fm) return tag(fm, "Fuzzy");
  }

  return null;
}

// ─── 9. Sheet scoring ─────────────────────────────────────────────────────────
function scoreAndAnalyzeSheet(data) {
  if (!data || data.length < 2) return { score: -1, headerIdx: 0, tableEnd: 0, confidence: 0, colMap: {}, colAnalyses: [], warnings: [] };
  const { headerIdx, headerScore } = findBestHeaderRow(data);
  const tableEnd = findTableEnd(data, headerIdx);
  const dataRowCount = tableEnd - headerIdx - 1;
  if (dataRowCount < 1) return { score: -1, headerIdx, tableEnd, confidence: 0, colMap: {}, colAnalyses: [], warnings: [] };
  const { colMap, colAnalyses, confidence, warnings } = resolveMapping(data, headerIdx, tableEnd);
  const score = headerScore * 2 + Math.min(dataRowCount, 25) + confidence * 30;
  return { score, headerIdx, tableEnd, confidence, colMap, colAnalyses, warnings };
}

// ─── 10. Pre-import mapping validation ────────────────────────────────────────
/**
 * Validates column mappings before allowing preview/import.
 * Returns { criticals, warnings, autoFixes } — all arrays of strings.
 * criticals → block continue; warnings → allow "continue anyway"; autoFixes → suggestions.
 */
function validateMappings(colMap, colAnalyses, parsedRows, headers) {
  const criticals = [];
  const warnings  = [];
  const autoFixes = [];

  const cm = colMap    || {};
  const ca = colAnalyses || [];
  const pr = parsedRows  || [];

  // Helper: human-readable column label, e.g. [C] "Balance"
  const lbl = col => {
    const letter = colLetter(col);
    const head   = headers?.[col] ? ` "${String(headers[col]).slice(0, 24)}"` : "";
    return `[${letter}]${head}`;
  };

  // ── 1. Required: Bill / Account Name ────────────────────────────────────────
  if ((cm.name ?? -1) < 0) {
    criticals.push(
      "Bill / Account Name is required. Assign a name column before previewing."
    );
  }

  // ── 2. At least one supporting field ────────────────────────────────────────
  const hasSupport = ["provider", "balance", "dueDate", "minDue"].some(
    f => (cm[f] ?? -1) >= 0
  );
  if ((cm.name ?? -1) >= 0 && !hasSupport) {
    warnings.push(
      "Only the Name column is mapped. Adding Balance, Due Date, or Provider will improve match quality."
    );
    autoFixes.push(
      "Look for a Balance or Minimum Due column and assign it — even approximate values help matching."
    );
  }

  // ── 3. Duplicate column detection ───────────────────────────────────────────
  const colToFields = {};
  for (const [field, col] of Object.entries(cm)) {
    if (col >= 0) {
      if (!colToFields[col]) colToFields[col] = [];
      colToFields[col].push(field);
    }
  }
  const NUMERIC_FIELDS = new Set(["balance", "minDue", "paid", "purchases", "interest", "fees"]);
  for (const [colStr, fields] of Object.entries(colToFields)) {
    if (fields.length < 2) continue;
    const col        = Number(colStr);
    const colLabel   = lbl(col);
    const numCount   = fields.filter(f => NUMERIC_FIELDS.has(f)).length;
    const fieldNames = fields.map(f => FIELD_LABELS[f] || f).join(" and ");
    if (numCount >= 2) {
      criticals.push(
        `Column ${colLabel} is mapped to both ${fieldNames}. A column cannot serve multiple financial fields — fix this mapping before continuing.`
      );
      const lesser = fields.filter(f => f !== "balance")[0];
      if (lesser) {
        autoFixes.push(
          `Set "${FIELD_LABELS[lesser] || lesser}" to (skip / not in this file) if only one amount column exists.`
        );
      }
    } else {
      warnings.push(
        `Column ${colLabel} is mapped to multiple fields: ${fieldNames}. Verify this is intentional.`
      );
    }
  }

  // ── 4. Type validation ───────────────────────────────────────────────────────
  const NUMERIC_TYPES  = new Set(["currency","dueDay","date","aprDecimal","aprWhole","number","smallInt"]);
  const TEXT_TYPES     = new Set(["nameText","text","boolean","last4"]);
  const TEXT_FIELDS    = ["name","provider","owner","category","notes"];
  const CURRENCY_FIELDS = ["balance","minDue","paid","purchases","interest","fees"];

  for (const field of TEXT_FIELDS) {
    const col = cm[field] ?? -1;
    if (col < 0 || !ca[col]) continue;
    if (NUMERIC_TYPES.has(ca[col].type)) {
      warnings.push(
        `${FIELD_LABELS[field]} is mapped to a mostly-numeric column ${lbl(col)}. Expected text names here, not numbers.`
      );
    }
  }
  for (const field of CURRENCY_FIELDS) {
    const col = cm[field] ?? -1;
    if (col < 0 || !ca[col]) continue;
    if (TEXT_TYPES.has(ca[col].type)) {
      warnings.push(
        `${FIELD_LABELS[field]} is mapped to a text column ${lbl(col)}. Expected dollar amounts, not text.`
      );
    }
  }

  // Due date type mismatch
  const dueCol = cm.dueDate ?? -1;
  if (dueCol >= 0 && ca[dueCol]) {
    const { type } = ca[dueCol];
    if (["nameText","text","currency","aprDecimal","aprWhole"].includes(type)) {
      warnings.push(
        `Due Date / Due Day column ${lbl(dueCol)} doesn't look like dates or day numbers. Values appear to be text or currency.`
      );
    }
  }

  // APR type mismatch
  const aprCol = cm.apr ?? -1;
  if (aprCol >= 0 && ca[aprCol]) {
    const { type } = ca[aprCol];
    if (["nameText","text","boolean","currency","last4"].includes(type)) {
      warnings.push(
        `APR / Interest Rate column ${lbl(aprCol)} doesn't look like an interest rate. Verify it contains percentage values.`
      );
    }
  }

  // ── 5. Row sanity checks ─────────────────────────────────────────────────────
  if (pr.length > 0) {
    // Bill Name blank for most rows → critical
    const nameBlank = pr.filter(r => !r.rawName || r.rawName.trim() === "").length;
    if (nameBlank / pr.length > 0.5 && pr.length > 1) {
      criticals.push(
        `Bill Name appears blank for ${nameBlank} of ${pr.length} detected rows. The name column mapping may be wrong.`
      );
    } else if (nameBlank > 0 && nameBlank < pr.length) {
      warnings.push(
        `Bill Name is blank for ${nameBlank} row${nameBlank !== 1 ? "s" : ""}. Those rows will be skipped.`
      );
    }

    // Balance === minDue for most rows (different columns mapped, but values are the same)
    const balCol = cm.balance ?? -1;
    const minCol = cm.minDue  ?? -1;
    if (balCol >= 0 && minCol >= 0 && balCol !== minCol) {
      const sameCount = pr.filter(
        r => r.balance != null && r.min_due != null && r.balance === r.min_due
      ).length;
      if (sameCount / pr.length > 0.7 && pr.length >= 3) {
        warnings.push(
          `Balance and Minimum Due show identical values for ${sameCount} of ${pr.length} rows. They may be pointing to the same source column.`
        );
      }
    }

    // All-zero fees — soft warning
    if ((cm.fees ?? -1) >= 0) {
      const allZero = pr.every(r => r.fees_v == null || r.fees_v === 0);
      if (allZero && pr.length > 1) {
        warnings.push(
          `Fees column ${lbl(cm.fees)} is zero for all rows. This is fine if no fees are present.`
        );
      }
    }

    // All-zero interest — soft warning
    if ((cm.interest ?? -1) >= 0) {
      const allZero = pr.every(r => r.interest_v == null || r.interest_v === 0);
      if (allZero && pr.length > 1) {
        warnings.push(
          `Interest Charged column ${lbl(cm.interest)} is zero for all rows. Verify it's the right column.`
        );
      }
    }

    // Provider mostly blank
    if ((cm.provider ?? -1) >= 0) {
      const provBlank = pr.filter(r => !r.provider || r.provider.trim() === "").length;
      if (provBlank / pr.length > 0.7 && pr.length >= 3) {
        warnings.push(
          `Provider column ${lbl(cm.provider)} is blank for ${provBlank} of ${pr.length} rows.`
        );
      }
    }

    // Due day out of range
    if ((cm.dueDate ?? -1) >= 0) {
      const badDay = pr.filter(
        r => r.due_day != null && (r.due_day < 1 || r.due_day > 31)
      ).length;
      if (badDay > 0 && badDay / pr.length > 0.3) {
        warnings.push(
          `Due Day column has ${badDay} values outside 1–31. Verify the column contains day-of-month numbers.`
        );
      }
    }
  }

  // ── 6. Left/right table region check ────────────────────────────────────────
  const mappedCols = Object.values(cm).filter(c => c >= 0);
  if (mappedCols.length >= 4) {
    const minC   = Math.min(...mappedCols);
    const maxC   = Math.max(...mappedCols);
    const spread = maxC - minC;
    if (spread >= 8) {
      const mid        = minC + spread / 2;
      const gap        = spread * 0.1;
      const leftCols   = mappedCols.filter(c => c < mid - gap);
      const rightCols  = mappedCols.filter(c => c > mid + gap);
      const middleCols = mappedCols.filter(c => c >= mid - gap && c <= mid + gap);
      if (leftCols.length >= 2 && rightCols.length >= 2 && middleCols.length === 0) {
        warnings.push(
          `Mapped columns appear to span two separate table regions ` +
          `(${colLetter(minC)}–${colLetter(Math.max(...leftCols))} and ` +
          `${colLetter(Math.min(...rightCols))}–${colLetter(maxC)}). ` +
          `Review the row preview to confirm data is aligned.`
        );
      }
    }
  }

  return { criticals, warnings, autoFixes };
}

// ─── 11. Component ─────────────────────────────────────────────────────────────
export default function ExcelImport({ accounts, theme, onImported, onUpload, onCreateBill }) {
  const [status,       setStatus]       = useState("idle");
  const [rows,         setRows]         = useState([]);
  const [fileName,     setFileName]     = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [importing,    setImporting]    = useState(false);
  const [doneCount,    setDoneCount]    = useState(0);
  // discovery state
  const [sheets,       setSheets]       = useState([]);   // [{ name, data }]
  const [sheetIdx,     setSheetIdx]     = useState(0);
  const [headerIdx,    setHeaderIdx]    = useState(0);
  const [tableEnd,     setTableEnd]     = useState(0);
  const [colMap,       setColMap]       = useState({});
  const [colAnalyses,  setColAnalyses]  = useState([]);
  const [confidence,   setConfidence]   = useState(0);
  const [warnings,     setWarnings]     = useState([]);
  const [mappingError, setMappingError] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const fileRef = useRef();

  const D = theme === "dark";
  const c = {
    bg:      D ? "#0a0a0a"  : "#f4f3ef",
    surf:    D ? "#141414"  : "#ffffff",
    surf2:   D ? "#1e1e1e"  : "#f0efe9",
    border:  D ? "#2c2c2c"  : "#e2e0d8",
    border2: D ? "#3a3a3a"  : "#ccc9be",
    tx:      D ? "#f0f0f0"  : "#111111",
    tx2:     D ? "#a0a0a0"  : "#4a4a4a",
    muted:   D ? "#555555"  : "#999888",
    ac:      "#39a844",
    acD:     D ? "rgba(57,168,68,.14)"  : "rgba(57,168,68,.10)",
    go:      D ? "#22d65a"  : "#0a9e3f",
    goD:     D ? "rgba(34,214,90,.12)"  : "rgba(10,158,63,.08)",
    wa:      D ? "#ffaa00"  : "#c97800",
    waD:     D ? "rgba(255,170,0,.13)" : "rgba(201,120,0,.09)",
    da:      D ? "#ff4c4c"  : "#d42828",
    daD:     D ? "rgba(255,76,76,.12)"  : "rgba(212,40,40,.08)",
    blue:    D ? "#18a7e1"  : "#0c7eb5",
    blueD:   D ? "rgba(24,167,225,.13)" : "rgba(12,126,181,.09)",
  };

  const btn = (bg, col = "#fff", disabled = false) => ({
    padding: "9px 18px", borderRadius: 8, border: "none",
    background: disabled ? c.border2 : bg,
    color:      disabled ? c.muted   : col,
    fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'Instrument Sans',sans-serif", opacity: disabled ? 0.6 : 1,
    transition: "opacity .15s",
  });

  const fxLocal = v => v == null ? "—" : fx(v);

  // ── Confidence level helper ──────────────────────────────────────────────────
  const confidenceLevel = conf =>
    conf >= 0.42 ? "high" : conf >= 0.22 ? "medium" : "low";

  // ── Commit detection state to React state ────────────────────────────────────
  const applyDetection = (si, hIdx, tEnd, cm, ca, conf, warns) => {
    setSheetIdx(si);
    setHeaderIdx(hIdx);
    setTableEnd(tEnd);
    setColMap(cm);
    setColAnalyses(ca);
    setConfidence(conf);
    setWarnings(warns);
    setMappingError("");
  };

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      setErrorMsg("Please upload a .xlsx, .xls, or .csv file.");
      setStatus("error"); return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setErrorMsg("Please upload a file smaller than 10 MB.");
      setStatus("error"); return;
    }
    setFileName(file.name);
    setStatus("parsing");
    setErrorMsg("");

    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array", cellDates: true });

      const allSheets = wb.SheetNames.map(sName => ({
        name: sName,
        data: XLSX.utils.sheet_to_json(wb.Sheets[sName], {
          header: 1, defval: null, cellDates: true, blankrows: true,
        }),
      }));

      // Score every sheet and pick the winner
      const scored = allSheets.map((sheet, idx) => ({
        idx,
        ...scoreAndAnalyzeSheet(sheet.data),
      })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

      const best = scored[0] || { idx: 0, headerIdx: 0, tableEnd: 0, confidence: 0, colMap: {}, colAnalyses: [], warnings: [] };

      setSheets(allSheets);
      applyDetection(best.idx, best.headerIdx, best.tableEnd, best.colMap, best.colAnalyses, best.confidence, best.warnings);

      const parsed = parseRowsWithMap(
        allSheets[best.idx].data, best.headerIdx, best.tableEnd,
        best.colMap, best.colAnalyses, accounts || []
      );

      const level = confidenceLevel(best.confidence);

      if (parsed.length > 0 && level !== "low") {
        const hdrs = (allSheets[best.idx].data[best.headerIdx] || []).map(v => String(v ?? ""));
        const vr   = validateMappings(best.colMap, best.colAnalyses, parsed, hdrs);
        setRows(parsed);
        if (vr.criticals.length > 0 || vr.warnings.length > 0) {
          setValidationResult(vr);
          setStatus("validation");
        } else {
          setValidationResult(null);
          setStatus("preview");
        }
      } else if (parsed.length > 0 && level === "low") {
        // Rows were found but confidence is low → show mapping screen
        // so user can verify before committing
        setStatus("mapping");
      } else {
        setStatus("mapping");
      }
    } catch (err) {
      setErrorMsg(`Could not read file: ${err?.message || err}`);
      setStatus("error");
    }
  };

  // ── Sheet change in mapping screen ────────────────────────────────────────
  const handleSheetChange = (newIdx) => {
    const data   = sheets[newIdx]?.data || [];
    const result = scoreAndAnalyzeSheet(data);
    applyDetection(
      newIdx, result.headerIdx, result.tableEnd,
      result.colMap, result.colAnalyses, result.confidence, result.warnings
    );
    setMappingError("");
  };

  const handleHeaderRowChange = (newHIdx) => {
    const data    = sheets[sheetIdx]?.data || [];
    const newEnd  = findTableEnd(data, newHIdx);
    const { colMap: cm, colAnalyses: ca, confidence: conf, warnings: w } = resolveMapping(data, newHIdx, newEnd);
    applyDetection(sheetIdx, newHIdx, newEnd, cm, ca, conf, w);
    setMappingError("");
  };

  const setColMapField = (field, rawVal) => {
    setColMap(prev => ({ ...prev, [field]: Number(rawVal) }));
  };

  const applyMapping = () => {
    const data   = sheets[sheetIdx]?.data || [];
    const parsed = parseRowsWithMap(data, headerIdx, tableEnd, colMap, colAnalyses, accounts || []);
    if (parsed.length === 0) {
      setMappingError("Still no bill rows found. Try a different sheet or header row, or check the Name column assignment.");
      return;
    }
    const hdrs = (data[headerIdx] || []).map(v => String(v ?? ""));
    const vr   = validateMappings(colMap, colAnalyses, parsed, hdrs);
    setRows(parsed);
    setMappingError("");
    if (vr.criticals.length > 0 || vr.warnings.length > 0) {
      setValidationResult(vr);
      setStatus("validation");
    } else {
      setValidationResult(null);
      setStatus("preview");
    }
  };

  // ── Preview interactions ────────────────────────────────────────────────────
  const toggleRow = idx =>
    setRows(r => r.map((row, i) => i === idx ? { ...row, include: !row.include } : row));

  const handleImport = async () => {
    const toImport = rows.filter(r => r.include);
    if (!toImport.length) return;
    setImporting(true);
    let count = 0;
    const auditRows = [];

    for (const row of toImport) {
      if (row.matched) {
        // ── Update existing bill ──────────────────────────────────────────────
        const acct    = row.matched;
        const updates = {
          cur_bal:   row.balance  ?? acct.starting_bal,
          min_due_v: row.min_due  ?? acct.budgeted_min,
          paid_v:    row.paid_v   ?? 0,
          is_paid:   row.is_paid  ?? false,
          purch_v:   row.purch_v  ?? 0,
          apr_v:     row.apr_v    ?? acct.apr,
        };
        const before = (accounts || []).find(a => a.id === acct.id) || null;
        try {
          await (onImported ? onImported(acct.id, updates) : Promise.resolve());
          auditRows.push({ accountId: acct.id, name: acct.name, action: "update", before, after: updates });
          count++;
          setDoneCount(count);
        } catch (e) {
          console.error(`Update failed for "${acct.name}":`, e);
          auditRows.push({ accountId: acct.id, name: acct.name, action: "update", error: e?.message || String(e) });
        }
      } else {
        // ── Create new bill ───────────────────────────────────────────────────
        const newBill = {
          name:         row.rawName,
          bank:         row.provider  || "",
          owner:        row.owner     || "",
          starting_bal: row.balance   ?? 0,
          cur_bal:      row.balance   ?? 0,
          budgeted_min: row.min_due   ?? 0,
          min_due_v:    row.min_due   ?? 0,
          due_day:      row.due_day   ?? null,
          apr:          row.apr_v     ?? null,
          category:     row.category  || "",
          notes:        row.notes     || "",
          billType:     "paydown",
        };
        // Strip null values so Firestore does not reject undefined
        const cleanBill = Object.fromEntries(
          Object.entries(newBill).filter(([, v]) => v != null)
        );
        try {
          if (onCreateBill) {
            await onCreateBill(cleanBill);
          }
          auditRows.push({ name: row.rawName, action: "create", after: cleanBill });
          count++;
          setDoneCount(count);
        } catch (e) {
          console.error(`Create failed for "${row.rawName}":`, e);
          auditRows.push({ name: row.rawName, action: "create", error: e?.message || String(e) });
        }
      }
    }

    setImporting(false);
    setStatus("done");
    if (onUpload) {
      try { onUpload({ fileName, type: "excel", rows: auditRows }); } catch (e) { console.error("onUpload error", e); }
    }
  };

  const reset = () => {
    setStatus("idle"); setRows([]); setFileName(""); setErrorMsg(""); setDoneCount(0);
    setSheets([]); setSheetIdx(0); setHeaderIdx(0); setTableEnd(0);
    setColMap({}); setColAnalyses([]); setConfidence(0); setWarnings([]);
    setMappingError(""); setValidationResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const matched      = rows.filter(r => r.matched);
  const unmatched    = rows.filter(r => !r.matched);
  const selected     = rows.filter(r => r.include && r.matched);
  const selectedNew  = rows.filter(r => r.include && !r.matched);
  const selectedAll  = rows.filter(r => r.include);

  const currentData    = sheets[sheetIdx]?.data || [];
  const currentHeaders = (currentData[headerIdx] || []).map(v => String(v ?? ""));
  const level          = confidenceLevel(confidence);

  // Column dropdown options — include a sample value from the first data row
  const colOptions = [
    { value: -1, label: "(skip / not in this file)" },
    ...currentHeaders.map((h, i) => {
      const sample = String(currentData[headerIdx + 1]?.[i] ?? "").slice(0, 22).trim();
      return {
        value: i,
        label: `[${colLetter(i)}] ${h || `Column ${i + 1}`}${sample ? `  — e.g. "${sample}"` : ""}`,
      };
    }),
  ];

  // Preview rows for the mapping screen (header + up to 4 data rows)
  const previewRows = [currentData[headerIdx], ...currentData.slice(headerIdx + 1, headerIdx + 5)].filter(Boolean);

  // Type badge for a column index
  const typeBadge = col => {
    if (col < 0 || !colAnalyses[col]) return null;
    const { type, confidence: conf } = colAnalyses[col];
    if (conf < 0.4 || type === "empty" || type === "mixed") return null;
    const labels = {
      currency: "currency", dueDay: "due day", date: "date",
      aprDecimal: "APR%", aprWhole: "APR",
      nameText: "text", boolean: "yes/no",
      last4: "last 4", text: "text", number: "number",
    };
    return labels[type] || null;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>

      {/* ═══════════════════ IDLE / ERROR ═══════════════════ */}
      {(status === "idle" || status === "error") && (
        <>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Instrument Sans',sans-serif" }}>
              Import from Excel / CSV
            </div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
              Upload any household budget workbook — debt tracker, bill log, or mixed spreadsheet.
              We scan every sheet, detect the data table, auto-map columns by name and value patterns,
              then let you review before saving anything.
            </div>
          </div>

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: c.tx2 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: c.tx, fontSize: 13 }}>What we auto-detect</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "3px 20px" }}>
              {[
                ["Bill / Account Name", "Account, Expense, Bill, Debt, Loan, Payee…"],
                ["Provider / Bank / Lender", "Bank, Lender, Issuer, Servicer, Institution…"],
                ["Owner / Holder", "Owner, Account Holder, Borrower, Assigned To…"],
                ["Balance", "Balance, Current Balance, Amount Owed, Bal…"],
                ["Minimum Due", "Min Due, Minimum Payment, Payment Due, Amount Due…"],
                ["Due Date / Day", "Due Date, Due Day, Pay By, Day of Month, 15th…"],
                ["APR / Interest Rate", "APR, Interest Rate, Variable APR, Annual Rate…"],
                ["Amount Paid", "Amt Paid, Amount Paid, Payment Made…"],
                ["Is Paid?", "Is Paid, Paid, Covered, Complete, Yes/No/X…"],
                ["New Purchases / Charges", "Purchases, Charges, New Charges, Spending…"],
                ["Interest / Fees", "Interest Charged, Finance Charge, Fees…"],
              ].map(([col, desc]) => (
                <div key={col}>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: c.ac, fontWeight: 600 }}>{col}</span>
                  <span style={{ color: c.muted }}> — {desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
            onDragOver={e => e.preventDefault()}
            style={{ border: `2px dashed ${status === "error" ? c.da : c.border2}`, borderRadius: 14, padding: "44px 24px", textAlign: "center", cursor: "pointer", background: c.surf, marginBottom: 12, transition: "border-color .2s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.ac}
            onMouseLeave={e => e.currentTarget.style.borderColor = status === "error" ? c.da : c.border2}
          >
            <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: c.tx, marginBottom: 4 }}>Drop your workbook here or click to browse</div>
            <div style={{ fontSize: 12, color: c.muted }}>Supports .xlsx · .xls · .csv &nbsp;·&nbsp; All sheets scanned automatically</div>
            {fileName && <div style={{ marginTop: 10, fontSize: 12, color: c.ac, fontWeight: 600 }}>{fileName}</div>}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />
          {status === "error" && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: c.daD, border: `1px solid ${c.da}`, color: c.da, fontSize: 13 }}>
              ⚠️ {errorMsg}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ PARSING ═══════════════════ */}
      {status === "parsing" && (
        <div style={{ textAlign: "center", padding: "48px 0", color: c.muted }}>
          <div style={{ fontSize: 30, animation: "spin 1s linear infinite", display: "inline-block" }}>◈</div>
          <div style={{ marginTop: 12, fontSize: 13 }}>Scanning all sheets in {fileName}…</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ═══════════════════ MAPPING SCREEN ═══════════════════ */}
      {status === "mapping" && (
        <div>
          {/* Reason banner */}
          <div style={{ background: c.waD, border: `1px solid ${c.wa}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: c.wa, fontWeight: 600 }}>
            {confidence < 0.22
              ? `We couldn't confidently detect the bill table in "${fileName}". Choose the right sheet and header row, then map the columns below.`
              : `Detected some columns in "${fileName}" — confidence is moderate. Please review and adjust the mappings, then click Preview.`
            }
          </div>

          {/* Sheet selector */}
          {sheets.length > 1 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 7, fontFamily: "'Instrument Sans',sans-serif" }}>
                Sheet
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sheets.map((s, i) => (
                  <button key={i} onClick={() => handleSheetChange(i)} style={{
                    padding: "5px 14px", borderRadius: 7, fontFamily: "'Instrument Sans',sans-serif",
                    border: `1.5px solid ${sheetIdx === i ? c.ac : c.border}`,
                    background: sheetIdx === i ? c.acD : c.surf,
                    color: sheetIdx === i ? c.ac : c.tx2,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Header row picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 7, fontFamily: "'Instrument Sans',sans-serif" }}>
              Header Row
            </div>
            <select
              value={headerIdx}
              onChange={e => handleHeaderRowChange(Number(e.target.value))}
              style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, fontFamily: "'Instrument Sans',sans-serif", cursor: "pointer" }}
            >
              {(currentData.slice(0, 15)).map((row, i) => {
                const preview = (row || []).filter(v => String(v ?? "").trim()).slice(0, 5).map(v => String(v).slice(0, 18)).join(", ");
                return <option key={i} value={i}>Row {i + 1}{preview ? ` — ${preview}` : " (empty)"}</option>;
              })}
            </select>
          </div>

          {/* Data preview table */}
          {previewRows.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 7, fontFamily: "'Instrument Sans',sans-serif" }}>
                Data Preview — Row {headerIdx + 1} + next {previewRows.length - 1}
              </div>
              <div style={{ overflowX: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
                  <thead>
                    <tr style={{ background: c.surf2 }}>
                      {(previewRows[0] || []).slice(0, 18).map((_, ci) => (
                        <th key={ci} style={{ padding: "4px 10px", color: c.muted, fontFamily: "'DM Mono',monospace", fontWeight: 700, borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
                          [{colLetter(ci)}]
                        </th>
                      ))}
                    </tr>
                    <tr style={{ background: c.acD }}>
                      {(previewRows[0] || []).slice(0, 18).map((h, ci) => (
                        <th key={ci} style={{ padding: "5px 10px", textAlign: "left", color: c.ac, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `2px solid ${c.ac}`, fontFamily: "'Instrument Sans',sans-serif" }}>
                          {String(h ?? "").slice(0, 22) || `Col ${ci + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(1).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${c.border}` }}>
                        {(previewRows[0] || []).slice(0, 18).map((_, ci) => (
                          <td key={ci} style={{ padding: "4px 10px", color: c.tx2, whiteSpace: "nowrap", fontFamily: "'DM Mono',monospace", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {String((row || [])[ci] ?? "").slice(0, 28)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Column assignment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>
                Column Assignments
              </div>
              <div style={{ fontSize: 11, color: c.muted }}>
                — fields marked <span style={{ color: c.da }}>*</span> are needed to find a bill
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 8 }}>
              {Object.entries(FIELD_LABELS).map(([field, label]) => {
                const currentCol = colMap[field] ?? -1;
                const badge      = typeBadge(currentCol);
                const isRequired = field === "name";
                const isMapped   = currentCol >= 0;
                return (
                  <div key={field} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", background: c.surf, borderRadius: 8,
                    border: `1px solid ${isMapped ? c.ac : c.border}`,
                  }}>
                    <div style={{ flex: "0 0 150px", fontSize: 12, color: isMapped ? c.tx : c.muted, fontWeight: isMapped ? 600 : 400 }}>
                      {label}{isRequired && <span style={{ color: c.da }}> *</span>}
                      {badge && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 4, background: c.surf2, color: c.muted, fontFamily: "'DM Mono',monospace" }}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <select
                      value={currentCol}
                      onChange={e => setColMapField(field, e.target.value)}
                      style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surf2, color: c.tx, fontSize: 11, fontFamily: "'Instrument Sans',sans-serif", cursor: "pointer" }}
                    >
                      {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {mappingError && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: c.daD, border: `1px solid ${c.da}`, color: c.da, fontSize: 13, marginBottom: 12 }}>
              ⚠️ {mappingError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button style={btn(c.surf2, c.tx2)} onClick={reset}>← Start Over</button>
            <button style={{ ...btn(c.ac, "#fff"), flex: 1 }} onClick={applyMapping}>
              Preview Results →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════ VALIDATION ═══════════════════ */}
      {status === "validation" && validationResult && (() => {
        const { criticals, warnings: vWarns, autoFixes } = validationResult;
        const hasCriticals = criticals.length > 0;
        const hasWarnings  = vWarns.length > 0;
        const canContinue  = !hasCriticals;
        return (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Instrument Sans',sans-serif" }}>
                Mapping Validation — {fileName}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: hasCriticals ? c.da : c.wa, marginBottom: 6 }}>
                {hasCriticals
                  ? "⛔ Issues found that must be fixed before importing"
                  : "⚠ Suspicious mappings detected — review before continuing"
                }
              </div>
              <div style={{ fontSize: 13, color: c.tx2 }}>
                {hasCriticals
                  ? "Fix the critical issues below, then click Fix Mappings to adjust the column assignments."
                  : "These warnings are often harmless but worth a quick look. You can continue or go back to adjust."
                }
              </div>
            </div>

            {/* Critical issues */}
            {hasCriticals && (
              <div style={{ background: c.daD, border: `1px solid ${c.da}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.da, marginBottom: 10, fontFamily: "'Instrument Sans',sans-serif" }}>
                  ⛔ Critical — Must Fix
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {criticals.map((msg, i) => (
                    <li key={i} style={{ fontSize: 13, color: c.da, marginBottom: 5, lineHeight: 1.5 }}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
              <div style={{ background: c.waD, border: `1px solid ${c.wa}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.wa, marginBottom: 10, fontFamily: "'Instrument Sans',sans-serif" }}>
                  ⚠ Warnings — Recommended Review
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {vWarns.map((msg, i) => (
                    <li key={i} style={{ fontSize: 13, color: c.wa, marginBottom: 5, lineHeight: 1.5 }}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Auto-fix suggestions */}
            {autoFixes.length > 0 && (
              <div style={{ background: c.blueD, border: `1px solid ${c.blue}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.blue, marginBottom: 10, fontFamily: "'Instrument Sans',sans-serif" }}>
                  💡 Suggestions
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {autoFixes.map((msg, i) => (
                    <li key={i} style={{ fontSize: 13, color: c.blue, marginBottom: 5, lineHeight: 1.5 }}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Row sample preview */}
            {rows.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
                  Row Sample — first {Math.min(rows.length, 3)} of {rows.length} detected rows
                </div>
                <div style={{ overflowX: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%", width: "100%" }}>
                    <thead>
                      <tr style={{ background: c.surf2, borderBottom: `1px solid ${c.border}` }}>
                        {["Name","Provider","Balance","Min Due","Due Day","APR"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, fontFamily: "'Instrument Sans',sans-serif", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: "6px 10px", color: row.rawName ? c.tx : c.da, fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.rawName || <em style={{ color: c.da, fontStyle: "italic" }}>blank</em>}
                          </td>
                          <td style={{ padding: "6px 10px", color: c.tx2, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.provider || <span style={{ color: c.muted }}>—</span>}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "'DM Mono',monospace", color: c.ac }}>{fxLocal(row.balance)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "'DM Mono',monospace" }}>{fxLocal(row.min_due)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "'DM Mono',monospace" }}>{row.due_day ?? "—"}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "'DM Mono',monospace" }}>{row.apr_v != null ? `${row.apr_v}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={btn(c.surf2, c.tx2)} onClick={reset}>← Start Over</button>
              <button style={btn(c.surf2, c.tx2)} onClick={() => setStatus("mapping")}>Fix Mappings</button>
              {canContinue ? (
                <button
                  style={{ ...btn(c.wa, "#fff"), flex: 1, minWidth: 180 }}
                  onClick={() => { setValidationResult(null); setStatus("preview"); }}
                >
                  Continue Anyway →
                </button>
              ) : (
                <div style={{ flex: 1, minWidth: 180, padding: "9px 18px", borderRadius: 8, background: c.daD, border: `1px solid ${c.da}`, color: c.da, fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                  Fix critical issues above to continue
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════ PREVIEW ═══════════════════ */}
      {status === "preview" && (
        <div>
          {/* Confidence banner */}
          {level === "high" && (
            <div style={{ background: c.goD, border: `1px solid ${c.go}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: c.go, fontWeight: 600 }}>
              ✓ Auto-detected columns with high confidence — review and import when ready.
            </div>
          )}
          {level === "medium" && (
            <div style={{ background: c.waD, border: `1px solid ${c.wa}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: c.wa, fontWeight: 600 }}>
              ⚠ Some columns were uncertain. Verify the data below matches your bills before importing.
              {warnings.length > 0 && <span> ({warnings.join("; ")})</span>}
            </div>
          )}

          {/* Summary bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Rows Found",  val: rows.length,      color: c.tx },
              { label: "Matched",     val: matched.length,   color: matched.length ? c.go : c.muted },
              { label: "New Bills",   val: unmatched.length, color: unmatched.length ? c.blue : c.muted },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 500, color }}>{val}</div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginTop: 4, fontFamily: "'Instrument Sans',sans-serif" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Matched rows table */}
          {matched.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
                ✓ Matched Bills — click to toggle import
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                      {["", "File Row", "→ Matched Bill", "Confidence", "Balance", "Min Due", "Paid", "Is Paid"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row, i) => (
                      <tr key={i}
                        style={{ borderBottom: `1px solid ${c.border}`, background: row.include ? c.goD : "transparent", cursor: "pointer", transition: "background .1s" }}
                        onClick={() => toggleRow(rows.indexOf(row))}
                      >
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${row.include ? c.go : c.border2}`, background: row.include ? c.go : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {row.include && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", color: c.tx2, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>row {row.rowNum}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: c.tx }}>
                          <div>{row.matched?.name}</div>
                          {row.rawName !== row.matched?.name && <div style={{ fontSize: 10, color: c.muted }}>from: {row.rawName}</div>}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {row.matched?._matchConfidence && (() => {
                            const conf = row.matched._matchConfidence;
                            const bg   = conf === "Exact" ? c.goD : conf === "Good" ? c.acD : c.daD;
                            const col  = conf === "Exact" ? c.go  : conf === "Good" ? c.ac  : c.da;
                            return (
                              <span style={{ padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", fontFamily: "'Instrument Sans',sans-serif", background: bg, color: col, border: `1px solid ${col}` }}>
                                {conf}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace", color: c.ac }}>{fxLocal(row.balance)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace" }}>{fxLocal(row.min_due)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace", color: c.go }}>{fxLocal(row.paid_v)}</td>
                        <td style={{ padding: "8px 10px", color: row.is_paid ? c.go : c.muted }}>{row.is_paid ? "✓ Yes" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched rows — import as new bills */}
          {unmatched.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.blue, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
                + New Bills — click to toggle
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                      {["", "File Row", "Name (from file)", "Provider", "Balance", "Min Due", "Due Day"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((row, i) => (
                      <tr key={i}
                        style={{ borderBottom: `1px solid ${c.border}`, background: row.include ? c.blueD : "transparent", cursor: "pointer", transition: "background .1s" }}
                        onClick={() => toggleRow(rows.indexOf(row))}
                      >
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${row.include ? c.blue : c.border2}`, background: row.include ? c.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {row.include && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", color: c.tx2, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>row {row.rowNum}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, color: c.tx }}>{row.rawName}</div>
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: c.blueD, color: c.blue, fontWeight: 800, letterSpacing: "0.05em", fontFamily: "'Instrument Sans',sans-serif", border: `1px solid ${c.blue}` }}>NEW</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: c.tx2 }}>{row.provider || <span style={{ color: c.muted }}>—</span>}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace", color: c.ac }}>{fxLocal(row.balance)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace" }}>{fxLocal(row.min_due)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace" }}>{row.due_day ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: c.tx2, marginTop: 8, padding: "8px 12px", background: c.surf, border: `1px solid ${c.border}`, borderRadius: 6 }}>
                {onCreateBill
                  ? "Checked new bills will be created in your account list when you import."
                  : <>These rows didn't match existing bills. Uncheck any you want to skip, or{" "}
                    <button onClick={() => setStatus("mapping")} style={{ background: "none", border: "none", color: c.ac, fontWeight: 700, cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}>
                      adjust mapping
                    </button>{" "}
                    if the wrong column is being read as the bill name.</>
                }
              </div>
            </div>
          )}

          {/* No matches at all — informational, not blocking */}
          {rows.length > 0 && matched.length === 0 && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: c.blueD, border: `1px solid ${c.blue}`, color: c.blue, fontSize: 13, marginBottom: 12 }}>
              No existing bills matched — {unmatched.length} row{unmatched.length !== 1 ? "s" : ""} will be imported as new bills.{" "}
              <button onClick={() => setStatus("mapping")} style={{ background: "none", border: "none", color: c.blue, fontWeight: 800, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
                Adjust mapping
              </button>{" "}
              if the names look wrong.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <button style={btn(c.surf2, c.tx2)} onClick={reset}>← Start Over</button>
            <button style={btn(c.surf2, c.tx2)} onClick={() => setStatus("mapping")}>Adjust Columns</button>
            <button
              style={{ ...btn(c.ac, "#fff", !selectedAll.length), flex: 1, minWidth: 200 }}
              disabled={!selectedAll.length}
              onClick={handleImport}
            >
              {importing
                ? `Saving ${doneCount} / ${selectedAll.length}…`
                : selectedAll.length === 0
                  ? "Select rows to import"
                  : selected.length > 0 && selectedNew.length > 0
                    ? `☁ Update ${selected.length} + Add ${selectedNew.length} New`
                    : selectedNew.length > 0
                      ? `☁ Add ${selectedNew.length} New Bill${selectedNew.length !== 1 ? "s" : ""} to Firebase`
                      : `☁ Import ${selected.length} Bill${selected.length !== 1 ? "s" : ""} to Firebase`
              }
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════ DONE ═══════════════════ */}
      {status === "done" && (
        <div style={{ textAlign: "center", padding: "44px 24px" }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: c.tx, marginBottom: 6 }}>
            {doneCount} bill{doneCount !== 1 ? "s" : ""} processed!
          </div>
          <div style={{ fontSize: 13, color: c.muted, marginBottom: 22 }}>
            All selected rows saved to Firebase. Your dashboard is now up to date.
          </div>
          <button style={btn(c.ac, "#fff")} onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
