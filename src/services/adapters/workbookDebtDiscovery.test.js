import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { discoverWorkbookDebtCandidates, EVIDENCE_TRUTH, CLASSIFICATIONS, SCOPE_SUGGESTIONS } from "./workbookDebtDiscovery.js";
import { readExcelFileToCandidates } from "./excelImportReader.js";

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

  it("preserves multiple APR ambiguity for review", () => {
    const wb = XLSX.utils.book_new();
    addSheet(wb, "Debt Tracker", [
      ["Account", "APR", "Balance"],
      ["Capital One", "19.99%", 1000],
      ["Capital One", "24.99%", 1000],
    ]);
    const { candidates } = discoverWorkbookDebtCandidates({ workbook: wb, XLSX, fileName: "rates.xlsx", importBatchId: "batch" });
    const candidate = candidates[0];
    expect(candidate.evidence.fieldEvidence.apr).toHaveLength(2);
    expect(candidate.warnings.join(" ")).toMatch(/multiple plausible APR/i);
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
});

