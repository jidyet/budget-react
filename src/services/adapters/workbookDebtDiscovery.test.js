import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { discoverWorkbookDebtCandidates, parseOwnerSuggestion, EVIDENCE_TRUTH, CLASSIFICATIONS, SCOPE_SUGGESTIONS } from "./workbookDebtDiscovery.js";
import { readExcelFileToCandidates } from "./excelImportReader.js";
import { FINANCIAL_ITEM_TYPES } from "../../domain/tracktozero/financialItemTaxonomy.js";
import { HOUSEHOLD_BUDGET_LARGE_ROWS } from "./__fixtures__/householdBudgetLarge.fixture.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const FIXTURES_DIR = `${dirname(fileURLToPath(import.meta.url))}/__fixtures__`;

const addSheet = (wb, name, rows) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
  return ws;
};

const buildSyntheticHouseholdBudget = () => {
  const wb = XLSX.utils.book_new();
  const monthRows = (month) => [
    ["Household Budget", month],
    [],
    ["Category", "Account / Cardholder", "Payment", "Balance"],
    ["CREDIT CARDS", month === "August" ? { f: "January!B4", v: "CAPITAL ONE (Kristina)" } : "CAPITAL ONE (Kristina)", 125, month === "August" ? { f: "'Balance Tracker'!F4", v: 2269.82 } : 2046.12],
    ["CREDIT CARDS", "Chase Freedom ****1234 (Babajide)", 80, 2200],
    ["CREDIT CARDS", "Chase Sapphire ****5678 (Babajide)", 95, 4800],
    ["STUDENT LOANS", "FIRSTMARK (Babajide)", 500, null],
    ["LINE OF CREDIT", "Chase Line of Credit (Kristina)", 175, 6000],
    ["BUSINESS", "AMEX BUSINESS (STALLION)", 300, 9100],
    ["HOME EXPENSES", "Electricity", 225, null],
    ["SUBSCRIPTIONS", "Netflix", 22, null],
    ["GROCERIES", "Groceries", 700, null],
    ["INSURANCE", "Auto Insurance", 240, null],
    ["TRANSPORTATION", "Car Payment", 615, null],
  ];
  [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ].forEach((month) => addSheet(wb, month, monthRows(month)));
  const tracker = addSheet(wb, "Balance Tracker", [
    ["Balances as entered by household"],
    [],
    ["Account / Cardholder", "APR", "Minimum Payment", "Starting Balance", "New Balance", "January Balance", "February Balance", "March Balance", "April Balance", "May Balance", "June Balance", "July Balance", "August Balance", "September Balance", "October Balance", "November Balance", "December Balance"],
    ["CAPITAL ONE (Kristina)", "24.99%", 125, 2046.12, { f: "Q4", v: 2476.25 }, 1991.99, 2010.11, 2090.33, 2150.44, 2199.55, 2220.66, 2244.77, { f: "F4+277.83", v: 2269.82 }, 2330.25, 2380.25, 2425.25, 2476.25],
    ["Chase Freedom ****1234 (Babajide)", "20.99%", 80, 2200, 2100, 2200, 2150, 2120, 2100, 2080, 2050, 2025, 2000, 1975, 1950, 1925, 1900],
    ["Chase Sapphire ****5678 (Babajide)", "21.99%", 95, 4800, 4700, 4800, 4760, 4720, 4680, 4640, 4600, 4560, 4520, 4480, 4440, 4400, 4360],
    ["FIRSTMARK (Babajide)", "", 500, null, null],
    ["Chase Line of Credit (Kristina)", "13.5%", 175, 6000, 5800],
    ["AMEX BUSINESS (STALLION)", "18.5%", 300, 9100, 9000],
  ]);
  tracker["!cols"] = [{ wch: 32 }];
  addSheet(wb, "Bank Holidays", [["Date", "Holiday"], ["2026-01-01", "New Year's Day"], ["2026-12-25", "Christmas Day"]]);
  return wb;
};

const byName = (candidates, text) => candidates.find((candidate) => candidate.accountName.includes(text));

describe("DATA-1A workbook debt discovery", () => {
  it("discovers topology, ranks Balance Tracker above monthly sheets, and ignores Bank Holidays", () => {
    const result = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    expect(result.topology.sheetCount).toBe(14);
    const tracker = result.topology.sheets.find((sheet) => sheet.sheetName === "Balance Tracker");
    const january = result.topology.sheets.find((sheet) => sheet.sheetName === "January");
    const holidays = result.topology.sheets.find((sheet) => sheet.sheetName === "Bank Holidays");
    expect(tracker.relevanceScore).toBeGreaterThan(january.relevanceScore);
    expect(holidays.relevanceScore).toBe(0);
  });

  it("consolidates monthly duplicate appearances into one candidate with many sources", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    const capitalOne = byName(candidates, "CAPITAL ONE");
    expect(capitalOne).toBeTruthy();
    expect(candidates.filter((candidate) => candidate.accountName.includes("CAPITAL ONE"))).toHaveLength(1);
    expect(capitalOne.evidence.duplicateResolution.sourceCount).toBeGreaterThanOrEqual(13);
  });

  it("keeps same-creditor accounts separate when safe account references differ", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    expect(byName(candidates, "Freedom")).toMatchObject({ accountReferenceSafe: "last4:1234" });
    expect(byName(candidates, "Sapphire")).toMatchObject({ accountReferenceSafe: "last4:5678" });
    expect(candidates.filter((candidate) => candidate.creditorName.includes("Chase"))).toHaveLength(3);
  });

  it("ignores ordinary bills and keeps ambiguous car payment as possible debt, not authoritative auto loan", () => {
    const { candidates, scanSummary } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    expect(candidates.some((candidate) => /Electricity|Netflix|Groceries|Auto Insurance/.test(candidate.accountName))).toBe(false);
    expect(scanSummary.ordinaryBillsIgnored).toBeGreaterThanOrEqual(48);
    const car = byName(candidates, "Car Payment");
    expect(car.evidence.classification).toBe(CLASSIFICATIONS.possibleDebt);
    expect(car.debtType).toBe("other");
    expect(car.balanceStatus).toBe("unresolved");
  });

  it("detects missing-balance student loan as a likely debt needing information, never fake confirmed $0", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    const firstmark = byName(candidates, "FIRSTMARK");
    expect(firstmark).toMatchObject({
      debtType: "student_loan",
      balanceStatus: "unresolved",
      currentBalance: 0,
      aprStatus: "unknown",
      minimumPayment: 500,
    });
    expect(firstmark.evidence.classification).toBe(CLASSIFICATIONS.likelyDebt);
  });

  it("flags business debt scope and excludes it from the household payoff plan by default", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    const business = byName(candidates, "AMEX BUSINESS");
    expect(business.evidence.scopeSuggestion).toBe(SCOPE_SUGGESTIONS.businessCandidate);
    expect(business.includedInCorePayoffPlan).toBe(false);
    expect(business.warnings.join(" ")).toMatch(/business/i);
  });

  it("preserves owner as suggestion only and records formula/projection provenance", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    const capitalOne = byName(candidates, "CAPITAL ONE");
    expect(capitalOne.ownerSuggestion).toBe("Kristina");
    expect(capitalOne.ownerType).toBe("unassigned");
    expect(capitalOne.ownerId).toBe("");
    const projected = capitalOne.evidence.fieldEvidence.balance.find((item) => item.provenance.header === "New Balance");
    expect(projected.truth).toBe(EVIDENCE_TRUTH.projected);
    expect(projected.provenance.formula).toBe("Q4");
    const linkedIdentity = capitalOne.evidence.fieldEvidence.identity.find((item) => item.provenance.sheetName === "August");
    expect(linkedIdentity.truth).toBe(EVIDENCE_TRUTH.formulaDerived);
    expect(linkedIdentity.provenance.formula).toBe("January!B4");
  });

  it("preserves multiple APR ambiguity for review when the SAME account (same sheet, one row) is re-read across sheets over time", () => {
    const wb = XLSX.utils.book_new();
    // Same account tracked across two monthly tabs - the legitimate
    // cross-sheet consolidation case, unaffected by DATA-2's same-sheet
    // duplicate-creditor disambiguation (see the test below).
    addSheet(wb, "January", [["Account", "APR", "Balance"], ["Capital One", "19.99%", 1000]]);
    addSheet(wb, "February", [["Account", "APR", "Balance"], ["Capital One", "24.99%", 1000]]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "rates.xlsx", importBatchId: "batch" });
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.evidence.fieldEvidence.apr).toHaveLength(2);
    expect(candidate.warnings.join(" ")).toMatch(/multiple plausible APR/i);
  });

  it("DATA-2: does NOT invent an account identifier - two same-creditor rows in the SAME sheet with no last-4 stay separate candidates, not merged", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Student Loans", [
      ["Account", "Balance", "APR", "Minimum Payment"],
      ["Aidvantage", 8000, "5.5%", 90],
      ["Aidvantage", 12000, "6.0%", 130],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "loans.xlsx", importBatchId: "batch" });
    const aidvantage = candidates.filter((candidate) => candidate.creditorName.includes("Aidvantage"));
    expect(aidvantage).toHaveLength(2);
    expect(aidvantage.map((candidate) => candidate.currentBalance).sort((a, b) => a - b)).toEqual([8000, 12000]);
    expect(aidvantage.every((candidate) => candidate.evidence.duplicateResolution.possibleSeparateAccounts)).toBe(true);
    expect(aidvantage.every((candidate) => /kept as a separate possible account/i.test(candidate.warnings.join(" ")))).toBe(true);
  });

  it("keeps clean debt spreadsheets working through the workbook engine", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Creditor", "Balance", "APR", "Minimum Payment"],
      ["Chase", 1200, "24.99%", 35],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "clean.xlsx", importBatchId: "batch" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ creditorName: "Chase", currentBalance: 1200, aprStatus: "known", minimumPayment: 35 });
  });

  it("recognizes the household budget monthly layout and prefers the newest month for balance, minimum due, due date, and as-of date", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "January", [
      ["Expense", "Amount", "Due Date", "Adj Due Date", "Paid?", "Amt Paid", "Interest Rate", "Balance", "Est. Next Pmt"],
      ["CAPITAL ONE (Credit Card) (Kristina)", 100, "2026-01-03", "2026-01-03", "", 0, "26.40%", 2046.12, 143.82],
    ]);
    addSheet(wb, "December", [
      ["Expense", "Amount", "Due Date", "Adj Due Date", "Paid?", "Amt Paid", "Interest Rate", "Balance", "Est. Next Pmt"],
      ["CAPITAL ONE (Credit Card) (Kristina)", 100, "2026-12-03", "2026-12-03", "", 0, "26.40%", 2476.25, 154.48],
      ["CREDIT CARDS SUBTOTAL", 100, "", "", "", 0, "", 2476.25, 154.48],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "household-budget.xlsx", importBatchId: "batch" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      accountName: "CAPITAL ONE (Credit Card)",
      debtType: "credit_card",
      currentBalance: 2476.25,
      balanceStatus: "confirmed",
      aprStatus: "known",
      minimumPayment: 154.48,
      dueDate: "2026-12-03",
      statementDate: "2026-12-31",
    });
    expect(candidates[0].evidence.fieldEvidence.minimumPayment[0].provenance.header).toBe("Est. Next Pmt");
  });

  it("DATA-1 HOTFIX regression: classification/bill-signal evidence never contains a literal undefined value (Firestore setDoc rejects it)", () => {
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: buildSyntheticHouseholdBudget(), XLSX, fileName: "synthetic.xlsx", importBatchId: "batch" });
    expect(candidates.length).toBeGreaterThan(0);
    const walk = (node, path = "") => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (node !== null && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          expect(value, `${path}.${key} must never be undefined (Firestore rejects it)`).not.toBeUndefined();
          walk(value, `${path}.${key}`);
        }
      }
    };
    for (const candidate of candidates) walk(candidate.evidence, "evidence");
    // The specific field that triggered the original bug: every signal
    // entry explicitly carries null, not an omitted/undefined key.
    const withSignals = candidates.find((candidate) => candidate.evidence.classificationEvidence?.length);
    expect(withSignals).toBeTruthy();
    expect(withSignals.evidence.classificationEvidence[0].value).toBeNull();
  });

  it("readExcelFileToCandidates returns structured errors/metadata-compatible candidates without committing truth", async () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Debts", [
      ["Creditor", "Balance", "APR", "Minimum Payment"],
      ["SoFi Personal Loan", 5000, "11.5%", 255],
    ]);
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buffer], "clean.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const result = await readExcelFileToCandidates(file, { importBatchId: "batch" });
    expect(result.parserVersion).toBe("data-1a");
    expect(result.candidates[0]).toMatchObject({ decision: "pending_review", balanceStatus: "confirmed" });
  });

  it("DATA-2: recognizes a STANDALONE section-heading row (not just a per-row Category column) and propagates it to rows with no category of their own", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Payment", "Balance"],
      ["CREDIT CARDS", null, null],
      ["Capital One", 65, 2000],
      ["UTILITIES", null, null],
      ["Gas", 150, null],
    ]);
    const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "sections.xlsx", importBatchId: "batch" });
    // The heading rows themselves never become a candidate or a non-debt item.
    expect(candidates.some((c) => /CREDIT CARDS|UTILITIES/.test(c.accountName))).toBe(false);
    expect(nonDebtItems.some((item) => /CREDIT CARDS|UTILITIES/.test(item.label))).toBe(false);
    const capitalOne = candidates.find((c) => c.accountName === "Capital One");
    expect(capitalOne).toMatchObject({ debtType: "credit_card" });
    expect(capitalOne.evidence.classification).toBe(CLASSIFICATIONS.likelyDebt);
    expect(candidates.some((c) => c.accountName === "Gas")).toBe(false);
    const gas = nonDebtItems.find((item) => item.label === "Gas");
    expect(gas).toMatchObject({ financialItemType: FINANCIAL_ITEM_TYPES.utility });
  });

  it("DATA-2: recognizes the full non-debt taxonomy via section headings, including savings/income which previously had no vocabulary at all", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Payment", "Balance"],
      ["INSURANCE", null, null],
      ["Auto Insurance", 240, null],
      ["SUBSCRIPTIONS", null, null],
      ["Netflix", 22, null],
      ["HOME EXPENSES", null, null],
      ["Lawn Service", 60, null],
      ["STORAGE", null, null],
      ["Storage bill", 90, null],
      ["SAVINGS", null, null],
      ["Monthly Savings", 500, null],
      ["INCOME", null, null],
      ["EagleView income", 3000, null],
    ]);
    const { candidates, nonDebtItems, scanSummary } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "taxonomy.xlsx", importBatchId: "batch" });
    expect(candidates).toHaveLength(0);
    const byLabel = (label) => nonDebtItems.find((item) => item.label === label);
    expect(byLabel("Auto Insurance").financialItemType).toBe(FINANCIAL_ITEM_TYPES.insurance);
    expect(byLabel("Netflix").financialItemType).toBe(FINANCIAL_ITEM_TYPES.subscription);
    expect(byLabel("Lawn Service").financialItemType).toBe(FINANCIAL_ITEM_TYPES.homeExpense);
    expect(byLabel("Storage bill").financialItemType).toBe(FINANCIAL_ITEM_TYPES.storageExpense);
    // Savings and income: genuinely new vocabulary - previously these had NO
    // dedicated classification at all and fell through as generic "ordinary
    // bill" (or worse, `uncertain`).
    expect(byLabel("Monthly Savings").financialItemType).toBe(FINANCIAL_ITEM_TYPES.savings);
    expect(byLabel("EagleView income").financialItemType).toBe(FINANCIAL_ITEM_TYPES.income);
    expect(scanSummary.nonDebtByType[FINANCIAL_ITEM_TYPES.savings]).toBe(1);
    expect(scanSummary.nonDebtByType[FINANCIAL_ITEM_TYPES.income]).toBe(1);
  });

  it("DATA-2: BUSINESS section requires secondary classification - a business row with debt evidence becomes business debt, a business row with only expense evidence stays non-debt", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Payment", "Balance", "APR"],
      ["BUSINESS", null, null, null],
      ["U.S. Bank Business credit card", 120, 4000, "22%"],
      ["Business storage fee", 60, null, null],
    ]);
    const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "business.xlsx", importBatchId: "batch" });
    const businessCard = candidates.find((c) => c.accountName.includes("Business credit card"));
    expect(businessCard).toMatchObject({ debtType: "business_debt" });
    expect(businessCard.evidence.scopeSuggestion).toBe(SCOPE_SUGGESTIONS.businessCandidate);
    expect(businessCard.includedInCorePayoffPlan).toBe(false);
    const storageFee = nonDebtItems.find((item) => item.label === "Business storage fee");
    expect(storageFee).toMatchObject({ financialItemType: FINANCIAL_ITEM_TYPES.storageExpense, scopeSuggestion: SCOPE_SUGGESTIONS.businessCandidate });
  });

  it("DATA-2 / formula-derived future balances never become confirmed balance truth, even when they are the ONLY balance evidence for a debt", () => {
    const wb = XLSX.utils.book_new();
    // "New Balance" is the same formula-projection marker the household
    // budget's own Balance Tracker sheet uses for a value computed from an
    // earlier balance rather than directly observed/entered.
    addSheet(wb, "Balance Tracker", [
      ["Account / Cardholder", "APR", "Minimum Payment", "New Balance"],
      ["Future Only Card", "19.99%", 50, { f: "B4+100", v: 1500 }],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "future-only.xlsx", importBatchId: "batch" });
    const candidate = candidates.find((c) => c.accountName === "Future Only Card");
    expect(candidate).toBeTruthy();
    expect(candidate.evidence.fieldEvidence.balance[0].truth).toBe(EVIDENCE_TRUTH.projected);
    // The only balance evidence available is a formula-derived projection -
    // never confirmed truth, never a fabricated observed value.
    expect(candidate.balanceStatus).toBe("unresolved");
    expect(candidate.currentBalance).toBe(0);
  });

  // REVIEW-2: a real household budget import produced a review queue with a
  // literal "HOUSEHOLD" candidate ("HOUSEHOLD - is this a loan you're paying
  // down to $0?") - a bare section-label row with zero balance/APR/category
  // evidence that fell through classifyRow's old fallback into `uncertain`
  // (review-blocking) instead of `not_debt` (silently excluded/counted).
  it("REVIEW-2: a standalone 'HOUSEHOLD' section-heading row is recognized as a header, never a debt candidate or review item", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Payment", "Balance"],
      ["HOUSEHOLD", null, null],
      ["CREDIT CARDS", null, null],
      ["Capital One", 65, 2000],
    ]);
    const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "household.xlsx", importBatchId: "batch" });
    expect(candidates.some((c) => c.accountName === "HOUSEHOLD")).toBe(false);
    expect(nonDebtItems.some((item) => item.label === "HOUSEHOLD")).toBe(false);
    // The bogus "HOUSEHOLD" header doesn't corrupt the real "CREDIT CARDS"
    // section context that follows it - Capital One still resolves correctly.
    expect(candidates.find((c) => c.accountName === "Capital One")).toMatchObject({ debtType: "credit_card" });
  });

  it("REVIEW-2: classifyRow's structural zero-evidence fallback excludes ANY unrecognized bare label, not just a whitelisted section-heading word", () => {
    // "TBD" is deliberately NOT in SECTION_HEADING_MATCHERS's whitelist, and
    // a non-empty Debt type column means the row is never even offered to
    // matchSectionHeading (categoryText is present) - this exercises the
    // classifyRow fallback specifically, proving the fix is structural
    // (works for evidence-free rows generally), not just a bigger word list.
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Debt type", "Payment", "Balance"],
      ["Random Line Item", "TBD", null, null],
    ]);
    const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "zero-evidence.xlsx", importBatchId: "batch" });
    expect(candidates).toHaveLength(0);
    const item = nonDebtItems.find((entry) => entry.label === "Random Line Item");
    expect(item).toMatchObject({ financialItemType: FINANCIAL_ITEM_TYPES.unknown });
  });

  it("REVIEW-2: a genuinely ambiguous row with real (if unrecognized-category) evidence still enters review - the fix must not over-exclude", () => {
    // "Fingerhut" matches no debt-category vocabulary, but a real balance
    // number is credible debt evidence a human filled in - this must stay
    // reviewable (possibleDebt), never silently dropped alongside the truly
    // evidence-free rows above (task's explicit "fail closed" requirement).
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Sheet1", [
      ["Account / Cardholder", "Payment", "Balance"],
      ["Fingerhut", null, 3200],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "ambiguous.xlsx", importBatchId: "batch" });
    const fingerhut = candidates.find((c) => c.accountName === "Fingerhut");
    expect(fingerhut).toBeTruthy();
    expect(fingerhut.evidence.classification).toBe(CLASSIFICATIONS.possibleDebt);
  });

  // REVIEW-2: locks in the real, measured before/after counts for the
  // realistic large fixture (31 rows: 10 real debts, 9 real bills, 2
  // genuinely ambiguous items, 7 bare section-heading rows, 3 unrecognized
  // placeholder labels). Verified by hand via `git stash` against the
  // pre-fix code: before this phase, 22 rows became candidates (12 of them
  // review-blocking, 10 of which were the fake header/placeholder rows).
  // After the fix: 12 candidates, only the 2 genuinely ambiguous items
  // blocking, and every real bill keeps its correct specific type.
  it("REVIEW-2: realistic large fixture - exact candidate/non-debt counts, no fake header candidates, no bill-type corruption", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Household Budget", HOUSEHOLD_BUDGET_LARGE_ROWS);
    const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "large.xlsx", importBatchId: "batch" });

    expect(candidates).toHaveLength(12);
    const blocking = candidates.filter((c) => c.evidence.classification === CLASSIFICATIONS.uncertain || c.evidence.classification === CLASSIFICATIONS.possibleDebt);
    expect(blocking.map((c) => c.accountName).sort()).toEqual(["Car Payment", "Fingerhut"]);

    // None of the 7 bare section-heading rows ever became a candidate or a
    // non-debt item - pure structural noise, correctly invisible.
    for (const heading of ["HOUSEHOLD", "MISC", "OTHER", "GENERAL", "SUMMARY", "NOTES", "OVERVIEW"]) {
      expect(candidates.some((c) => c.accountName === heading)).toBe(false);
      expect(nonDebtItems.some((item) => item.label === heading)).toBe(false);
    }

    expect(nonDebtItems).toHaveLength(12);
    const byLabel = (label) => nonDebtItems.find((item) => item.label === label);
    // Unrecognized placeholder labels are honestly UNKNOWN, not miscategorized as a bill.
    expect(byLabel("TBD").financialItemType).toBe(FINANCIAL_ITEM_TYPES.unknown);
    expect(byLabel("Review later").financialItemType).toBe(FINANCIAL_ITEM_TYPES.unknown);
    expect(byLabel("Placeholder").financialItemType).toBe(FINANCIAL_ITEM_TYPES.unknown);
    // Real bills keep their correct specific type - the generic section
    // headings above them (SUMMARY/NOTES/OVERVIEW) must never overwrite a
    // row's own more-specific category.
    expect(byLabel("Electricity").financialItemType).toBe(FINANCIAL_ITEM_TYPES.utility);
    expect(byLabel("Netflix").financialItemType).toBe(FINANCIAL_ITEM_TYPES.subscription);
    expect(byLabel("Auto Insurance").financialItemType).toBe(FINANCIAL_ITEM_TYPES.insurance);
    expect(byLabel("Storage bill").financialItemType).toBe(FINANCIAL_ITEM_TYPES.storageExpense);
    expect(byLabel("Monthly Savings").financialItemType).toBe(FINANCIAL_ITEM_TYPES.savings);
    expect(byLabel("EagleView income").financialItemType).toBe(FINANCIAL_ITEM_TYPES.income);
  });

  // BETA-3.1: bugs found via a real household workbook's actual structure -
  // fixed generically, verified here with synthetic data only.
  describe("BETA-3.1: real-workbook cross-sheet identity/provenance bugs", () => {
    it("WB-real-01: a debt-type/category parenthetical is never mistaken for an owner suggestion", () => {
      expect(parseOwnerSuggestion("SOFI (Personal Loan)")).toBe("");
      expect(parseOwnerSuggestion("CITI (Credit Card)")).toBe("");
      expect(parseOwnerSuggestion("MOHELA (Student Loan)")).toBe("");
      expect(parseOwnerSuggestion("WELLS FARGO (Line of Credit)")).toBe("");
      expect(parseOwnerSuggestion("Auto Insurance (Insurance)")).toBe("");
      // A genuine person's name in parens is unaffected.
      expect(parseOwnerSuggestion("SOFI (Babajide)")).toBe("Babajide");
      expect(parseOwnerSuggestion("SOFI (Kristina)")).toBe("Kristina");
    });

    it("WB-real-02: a category-descriptor parenthetical never becomes a candidate's ownerSuggestion field", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Balance", "APR", "Minimum Payment"],
        ["SOFI (Personal Loan)", 5000, "11.5%", 255],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "sofi.xlsx", importBatchId: "batch" });
      const sofi = byName(candidates, "SOFI");
      expect(sofi).toBeTruthy();
      expect(sofi.ownerSuggestion).toBe("");
    });

    it("WB-real-03: a cross-sheet formula APR that resolves to exactly 0 is treated as unknown, not confident no_interest", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Balance Tracker", [
        ["Account / Cardholder", "APR", "Minimum Payment", "Balance"],
        ["Real Account", "18.5%", 100, 3000],
      ]);
      addSheet(wb, "January", [
        ["Expense", "Amount", "Due Date", "Interest Rate", "Balance"],
        // Formula references a Balance Tracker cell that is blank (row 9 has
        // nothing in column B) - simulating a broken/misaligned cross-sheet
        // reference exactly like the real workbook's Chase-LOC row, which
        // pointed at the wrong (blank) Balance Tracker row.
        ["Real Account", 100, "2026-01-15", { f: "'Balance Tracker'!B9", v: 0 }, 3000],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "misaligned.xlsx", importBatchId: "batch" });
      const account = byName(candidates, "Real Account");
      expect(account).toBeTruthy();
      // The January row's own APR evidence (cross-sheet formula -> 0) must
      // not be confidently "no_interest" - but the Balance Tracker row's
      // OWN literal 18.5% is still real, known evidence for the same
      // consolidated candidate.
      expect(account.aprStatus).toBe("known");
      expect(account.apr).toBeCloseTo(0.185);
    });

    it("WB-real-04: a cross-sheet formula APR resolving to 0 with NO corroborating evidence anywhere stays unknown, never a fabricated 0%", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "January", [
        ["Expense", "Amount", "Due Date", "Interest Rate", "Balance"],
        ["Only Sourced Here", 100, "2026-01-15", { f: "'Balance Tracker'!B99", v: 0 }, 3000],
      ]);
      addSheet(wb, "Balance Tracker", [["Account / Cardholder", "APR"], ["Unrelated Account", "9%"]]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "unresolved-apr.xlsx", importBatchId: "batch" });
      const account = byName(candidates, "Only Sourced Here");
      expect(account).toBeTruthy();
      expect(account.aprStatus).toBe("unknown");
      expect(account.apr).toBeNull();
      expect(account.warnings.join(" ")).toMatch(/APR missing or unknown/i);
    });

    it("WB-real-05: a LITERAL (non-formula) 0% APR still reports as confident no_interest - the fix is scoped to cross-sheet formulas only", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Balance", "APR", "Minimum Payment"],
        ["Zero Interest Card", 1000, 0, 50],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "zero-interest.xlsx", importBatchId: "batch" });
      const card = byName(candidates, "Zero Interest Card");
      expect(card).toMatchObject({ aprStatus: "no_interest", apr: 0 });
    });

    it("WB-real-07: a bare day-of-month due-date cell (no year/month) is never silently misread as a 1970 timestamp", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Balance", "APR", "Due Date"],
        ["Bare Day Card", 1000, "20%", 15],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "bare-day.xlsx", importBatchId: "batch" });
      const card = byName(candidates, "Bare Day Card");
      expect(card).toBeTruthy();
      expect(card.dueDate).toBe("day:15");
    });

    it("WB-real-08: a real calendar due date is unaffected by the bare-day-of-month detection", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Balance", "APR", "Due Date"],
        ["Dated Card", 1000, "20%", new Date(2026, 0, 15)],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "real-date.xlsx", importBatchId: "batch" });
      const card = byName(candidates, "Dated Card");
      expect(card).toBeTruthy();
      expect(card.dueDate).toBe("2026-01-15");
    });

    it("WB-real-09: 'Due Date' is used as creditor due-date truth; 'Adj Due Date' (bank-holiday-adjusted scheduling) is never picked up as the due date", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "January", [
        ["Expense", "Amount", "Due Date", "Adj Due Date", "Balance", "APR"],
        ["Real Creditor", 100, "2026-01-03", "2026-01-05", 2000, "20%"],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "adj-due-date.xlsx", importBatchId: "batch" });
      const creditor = byName(candidates, "Real Creditor");
      expect(creditor).toBeTruthy();
      // Must reflect "Due Date" (the 3rd), never "Adj Due Date" (the 5th) -
      // if the 2 header columns were ever confused, dueDate would be the
      // 5th instead.
      expect(creditor.dueDate).toBe("2026-01-03");
    });

    it("WB-real-06: a SAME-SHEET formula APR resolving to 0 also still reports as confident no_interest - only cross-sheet references are downgraded", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Balance", "APR", "Minimum Payment"],
        ["Promo Card", 1000, 0, 50],
        ["Linked Row", 1000, { f: "C4", v: 0 }, 50],
      ]);
      const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "same-sheet-formula.xlsx", importBatchId: "batch" });
      const linked = byName(candidates, "Linked Row");
      expect(linked).toMatchObject({ aprStatus: "no_interest", apr: 0 });
    });

    it("WB-real-10: a section-heading row with an EMPTY (but present) APR cell is never miscounted as APR evidence, never becomes a fake Debt", () => {
      const wb = XLSX.utils.book_new();
      addSheet(wb, "Sheet1", [
        ["Account", "Amount", "Interest Rate", "Balance"],
        ["UTILITIES", null, null, null],
        // Interest Rate cell is explicitly an empty string (present cell,
        // blank value) - a real household workbook column layout where
        // "Interest Rate" applies to debt rows but is simply left blank
        // for a bill row, rather than the column being entirely absent.
        ["Electric Bill", 150, "", null],
      ]);
      const { candidates, nonDebtItems } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "blank-apr-cell.xlsx", importBatchId: "batch" });
      expect(candidates.some((c) => c.accountName === "Electric Bill")).toBe(false);
      expect(nonDebtItems.some((item) => item.label === "Electric Bill")).toBe(true);
    });

    // WB-fixture: the actual sanitized structural fixture file (see Section
    // 31/BETA-3.1) - a synthetic household budget reproducing every
    // structural challenge found in the real private workbook (master
    // sheet, formula-derived monthly sheets, a deliberately-misaligned
    // cross-sheet formula, split-identity same-lender-different-naming,
    // business debt vs. business bills, subtotal/section-heading rows) -
    // run through the full public readExcelFileToCandidates entry point,
    // exactly as a real upload would. Locks in the end-to-end outcome so a
    // future regression is caught immediately.
    it("WB-fixture: the sanitized structural fixture produces exactly the expected safe outcome end-to-end", async () => {
      const buffer = readFileSync(`${FIXTURES_DIR}/householdBudgetStructural.fixture.xlsx`);
      const file = new File([buffer], "householdBudgetStructural.fixture.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const result = await readExcelFileToCandidates(file, { importBatchId: "structural-fixture" });

      expect(result.topology.sheetCount).toBe(4);
      expect(result.candidates).toHaveLength(9);
      // Every structural/subtotal/section-heading row is invisible - never
      // a candidate, never a non-debt item.
      const structuralLabels = ["CREDIT CARDS", "CREDIT CARDS SUBTOTAL", "STUDENT LOANS", "STUDENT LOANS SUBTOTAL", "PERSONAL LOANS", "PERSONAL LOANS SUBTOTAL", "LINE OF CREDIT", "LINE OF CREDIT SUBTOTAL", "BUSINESS", "BUSINESS SUBTOTAL", "HOME EXPENSES", "SUBSCRIPTIONS", "STORAGE"];
      for (const label of structuralLabels) {
        expect(result.candidates.some((c) => c.accountName === label)).toBe(false);
        expect(result.nonDebtItems.some((item) => item.label === label)).toBe(false);
      }
      // Ordinary bills never enter the debt queue.
      for (const bill of ["Electricity", "Netflix", "Public Storage", "Business storage fee"]) {
        expect(result.candidates.some((c) => c.accountName === bill)).toBe(false);
        expect(result.nonDebtItems.some((item) => item.label === bill)).toBe(true);
      }
      // Real debts, correctly identified and never fabricated as confident
      // when the underlying evidence doesn't support it.
      const wellsFargoJanuary = result.candidates.find((c) => c.accountName === "WELLS FARGO (Line of Credit)");
      expect(wellsFargoJanuary).toBeTruthy();
      // The deliberately-misaligned cross-sheet APR formula (pointing at a
      // blank Balance Tracker cell) must resolve to unknown, never a
      // fabricated confident 0%.
      expect(wellsFargoJanuary.aprStatus).toBe("unknown");
      const businessCard = result.candidates.find((c) => c.accountName === "Test Business credit card");
      expect(businessCard).toMatchObject({ debtType: "business_debt", balanceStatus: "confirmed" });
      expect(businessCard.evidence.scopeSuggestion).toBe(SCOPE_SUGGESTIONS.businessCandidate);
      // Same-lender, different-owner accounts stay distinct, never merged.
      const chaseCandidates = result.candidates.filter((c) => c.creditorName.includes("Chase"));
      expect(chaseCandidates).toHaveLength(2);
      // Zero candidates are ever auto-committed by this pipeline stage -
      // every one is `pending_review`.
      expect(result.candidates.every((c) => c.decision === "pending_review")).toBe(true);
    });
  });
});

