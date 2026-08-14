import { describe, it, expect } from "vitest";
import {
  detectColumnMapping,
  normalizeAprField,
  normalizeCurrency,
  normalizeDateField,
  normalizeDebtType,
  normalizeSpreadsheetRowsToCandidates,
} from "./importCandidateAdapter.js";

describe("importCandidateAdapter: column detection", () => {
  it("maps common header aliases case-insensitively", () => {
    const { mapping, confident, unmatched } = detectColumnMapping(["Creditor", "Current Balance", "Interest Rate", "Min Payment"]);
    expect(mapping.creditorName).toBe("Creditor");
    expect(mapping.currentBalance).toBe("Current Balance");
    expect(mapping.apr).toBe("Interest Rate");
    expect(mapping.minimumPayment).toBe("Min Payment");
    expect(confident).toBe(true);
    expect(unmatched).toContain("accountName");
  });

  it("flags low-confidence mapping when no balance or identity column exists", () => {
    const { confident, requiredMissing } = detectColumnMapping(["Notes", "Category"]);
    expect(confident).toBe(false);
    expect(requiredMissing).toContain("currentBalance");
  });

  it("never silently maps an unrelated column to a canonical field", () => {
    const { mapping } = detectColumnMapping(["Notes", "Random Column", "Balance"]);
    expect(mapping.creditorName).toBeUndefined();
    expect(mapping.accountName).toBeUndefined();
    expect(mapping.currentBalance).toBe("Balance");
  });
});

describe("importCandidateAdapter: field normalization", () => {
  it("normalizes currency strings and numbers, always non-negative", () => {
    expect(normalizeCurrency("$1,234.56")).toBe(1234.56);
    expect(normalizeCurrency(500)).toBe(500);
    expect(normalizeCurrency("-200")).toBe(200);
    expect(normalizeCurrency("")).toBeNull();
    expect(normalizeCurrency(null)).toBeNull();
  });

  it("normalizes 17.99, '17.99%', and 0.1799 to the same decimal APR, never confusing 17.99% with 1799%", () => {
    expect(normalizeAprField(17.99).apr).toBeCloseTo(0.1799, 10);
    expect(normalizeAprField("17.99%").apr).toBeCloseTo(0.1799, 10);
    expect(normalizeAprField(0.1799).apr).toBeCloseTo(0.1799, 10);
    expect(normalizeAprField(17.99).aprStatus).toBe("known");
  });

  it("treats explicit 0% as known no-interest, never as missing", () => {
    expect(normalizeAprField("0%")).toEqual({ apr: 0, aprStatus: "no_interest" });
    expect(normalizeAprField(0)).toEqual({ apr: 0, aprStatus: "no_interest" });
  });

  it("treats missing APR as unknown, never silently as 0%", () => {
    expect(normalizeAprField(null)).toEqual({ apr: null, aprStatus: "unknown" });
    expect(normalizeAprField("")).toEqual({ apr: null, aprStatus: "unknown" });
    expect(normalizeAprField("n/a")).toEqual({ apr: null, aprStatus: "unknown" });
  });

  it("normalizes dates from strings and Date objects to ISO date, or null if unparseable", () => {
    expect(normalizeDateField("2026-08-01")).toBe("2026-08-01");
    expect(normalizeDateField(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-01");
    expect(normalizeDateField("not a date")).toBeNull();
    expect(normalizeDateField(null)).toBeNull();
  });

  it("normalizes debt type from explicit type text or name/creditor fallback, defaulting to other", () => {
    expect(normalizeDebtType("Credit Card")).toBe("credit_card");
    expect(normalizeDebtType("", "Chase Visa credit card")).toBe("credit_card");
    expect(normalizeDebtType("", "Sallie Mae Student Loan")).toBe("student_loan");
    expect(normalizeDebtType("", "Home Mortgage")).toBe("mortgage");
    expect(normalizeDebtType("", "")).toBe("other");
    expect(normalizeDebtType(undefined, "Mystery Corp")).toBe("other");
  });
});

describe("importCandidateAdapter: row-to-candidate pipeline", () => {
  const headers = ["Creditor", "Account Name", "Debt Type", "Balance", "APR", "Min Payment", "Due Date"];

  it("produces confirmable candidates with warnings for a well-formed spreadsheet", () => {
    const rows = [
      { Creditor: "Chase", "Account Name": "Chase Sapphire", "Debt Type": "Credit Card", Balance: "$1,200.00", APR: "24.99%", "Min Payment": "35", "Due Date": "2026-09-01" },
      { Creditor: "SoFi", "Account Name": "SoFi Personal Loan", "Debt Type": "Personal Loan", Balance: 5000, APR: "", "Min Payment": "", "Due Date": "" },
    ];
    const { candidates, batchWarnings, confident } = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-1" });
    expect(confident).toBe(true);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ creditorName: "Chase", currentBalance: 1200, aprStatus: "known", minimumPayment: 35, decision: "pending_review" });
    expect(candidates[0].apr).toBeCloseTo(0.2499, 10);
    expect(candidates[1]).toMatchObject({ aprStatus: "unknown", apr: null, minimumPayment: null });
    expect(candidates[1].warnings.join(" ")).toMatch(/minimum payment/i);
    expect(batchWarnings.join(" ")).not.toMatch(/no usable rows/i);
  });

  it("defaults a mortgage row to excluded from the core payoff plan", () => {
    const rows = [{ Creditor: "Wells Fargo", "Account Name": "Home Mortgage", "Debt Type": "Mortgage", Balance: 250000, APR: "6.1", "Min Payment": "1800", "Due Date": "" }];
    const { candidates } = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-2" });
    expect(candidates[0].includedInCorePayoffPlan).toBe(false);
    expect(candidates[0].warnings.join(" ")).toMatch(/mortgage/i);
  });

  it("skips fully blank rows without producing a phantom candidate", () => {
    const rows = [{ Creditor: "", "Account Name": "", "Debt Type": "", Balance: "", APR: "", "Min Payment": "", "Due Date": "" }];
    const { candidates, batchWarnings } = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-3" });
    expect(candidates).toHaveLength(0);
    expect(batchWarnings.join(" ")).toMatch(/no usable rows/i);
  });

  it("returns zero candidates and an explicit error when no balance column exists, never guessing", () => {
    const result = normalizeSpreadsheetRowsToCandidates({ headers: ["Notes", "Category"], rows: [{ Notes: "x", Category: "y" }], source: "excel", importBatchId: "batch-4" });
    expect(result.confident).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.batchWarnings.join(" ")).toMatch(/balance column/i);
  });

  it("marks balanceStatus unresolved when a row's balance cell could not be read, and confirmed for a real value including a real $0 (UX-0)", () => {
    const rows = [
      { Creditor: "Chase", "Account Name": "Chase Card", "Debt Type": "Credit Card", Balance: "not a number", APR: "", "Min Payment": "", "Due Date": "" },
      { Creditor: "Discover", "Account Name": "Discover Card", "Debt Type": "Credit Card", Balance: "0", APR: "", "Min Payment": "", "Due Date": "" },
    ];
    const { candidates } = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-6" });
    expect(candidates[0].currentBalance).toBe(0);
    expect(candidates[0].balanceStatus).toBe("unresolved");
    expect(candidates[1].currentBalance).toBe(0);
    expect(candidates[1].balanceStatus).toBe("confirmed");
  });

  it("produces the same candidateId for the same importBatchId + row content (deterministic, needed for idempotent commit)", () => {
    const rows = [{ Creditor: "Chase", "Account Name": "Chase Card", "Debt Type": "Credit Card", Balance: 100, APR: "", "Min Payment": "", "Due Date": "" }];
    const first = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-5" });
    const second = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "excel", importBatchId: "batch-5" });
    expect(first.candidates[0].candidateId).toBe(second.candidates[0].candidateId);
  });
});
