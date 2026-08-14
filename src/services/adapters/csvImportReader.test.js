import { describe, it, expect } from "vitest";
import { parseCsvText } from "./csvImportReader.js";
import { normalizeSpreadsheetRowsToCandidates } from "./importCandidateAdapter.js";

describe("csvImportReader: parseCsvText", () => {
  it("parses a simple comma-delimited file into header-keyed rows", () => {
    const { headers, rows } = parseCsvText("Creditor,Balance,APR\nChase,1200,24.99%\nSoFi,5000,\n");
    expect(headers).toEqual(["Creditor", "Balance", "APR"]);
    expect(rows).toEqual([
      { Creditor: "Chase", Balance: "1200", APR: "24.99%" },
      { Creditor: "SoFi", Balance: "5000", APR: null },
    ]);
  });

  it("handles quoted fields containing commas and embedded newlines", () => {
    const { rows } = parseCsvText('Creditor,Account Name,Balance\n"Chase, N.A.","My ""Sapphire"" Card",1200\n');
    expect(rows[0]).toEqual({ Creditor: "Chase, N.A.", "Account Name": 'My "Sapphire" Card', Balance: "1200" });
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseCsvText("Creditor,Balance\r\nChase,1200\r\n");
    expect(rows).toEqual([{ Creditor: "Chase", Balance: "1200" }]);
  });

  it("skips fully blank lines rather than producing empty phantom rows", () => {
    const { rows } = parseCsvText("Creditor,Balance\n\nChase,1200\n\n");
    expect(rows).toHaveLength(1);
  });

  it("returns no headers/rows for an empty file", () => {
    expect(parseCsvText("")).toEqual({ headers: [], rows: [] });
  });
});

describe("csvImportReader: normalization parity with Excel", () => {
  it("produces the same normalized candidate fields as the Excel pipeline for equivalent source values", () => {
    const excelHeaders = ["Creditor", "Account Name", "Debt Type", "Balance", "APR", "Min Payment", "Due Date"];
    const excelRows = [{ Creditor: "Chase", "Account Name": "Chase Sapphire", "Debt Type": "Credit Card", Balance: "$1,200.00", APR: "24.99%", "Min Payment": "35", "Due Date": "2026-09-01" }];
    const excelResult = normalizeSpreadsheetRowsToCandidates({ headers: excelHeaders, rows: excelRows, source: "excel", importBatchId: "b" });

    const { headers: csvHeaders, rows: csvRows } = parseCsvText('Creditor,Account Name,Debt Type,Balance,APR,Min Payment,Due Date\nChase,Chase Sapphire,Credit Card,"$1,200.00",24.99%,35,2026-09-01\n');
    const csvResult = normalizeSpreadsheetRowsToCandidates({ headers: csvHeaders, rows: csvRows, source: "csv", importBatchId: "b" });

    const strip = (candidate) => {
      const rest = { ...candidate };
      delete rest.candidateId;
      delete rest.source;
      return rest;
    };
    expect(strip(csvResult.candidates[0])).toEqual(strip(excelResult.candidates[0]));
  });

  it("normalizes mortgage default and unknown APR identically for CSV and Excel sources", () => {
    const headers = ["Creditor", "Account Name", "Debt Type", "Balance", "APR", "Min Payment", "Due Date"];
    const rowsMissingApr = [{ Creditor: "Wells Fargo", "Account Name": "Home Mortgage", "Debt Type": "Mortgage", Balance: 250000, APR: null, "Min Payment": null, "Due Date": null }];
    const excel = normalizeSpreadsheetRowsToCandidates({ headers, rows: rowsMissingApr, source: "excel", importBatchId: "b" });
    const { rows: csvRows } = parseCsvText("Creditor,Account Name,Debt Type,Balance,APR,Min Payment,Due Date\nWells Fargo,Home Mortgage,Mortgage,250000,,,\n");
    const csv = normalizeSpreadsheetRowsToCandidates({ headers, rows: csvRows, source: "csv", importBatchId: "b" });

    expect(excel.candidates[0].aprStatus).toBe("unknown");
    expect(csv.candidates[0].aprStatus).toBe("unknown");
    expect(excel.candidates[0].includedInCorePayoffPlan).toBe(false);
    expect(csv.candidates[0].includedInCorePayoffPlan).toBe(false);
  });
});

describe("csvImportReader: error handling", () => {
  it("flags low confidence when the CSV has no balance column, same as Excel", () => {
    const { headers, rows } = parseCsvText("Notes,Category\nfoo,bar\n");
    const result = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "csv", importBatchId: "b" });
    expect(result.confident).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  it("does not invent a balance for a malformed/blank balance cell", () => {
    const { headers, rows } = parseCsvText("Creditor,Balance\nMystery Corp,not-a-number\n");
    const result = normalizeSpreadsheetRowsToCandidates({ headers, rows, source: "csv", importBatchId: "b" });
    expect(result.candidates[0].currentBalance).toBe(0);
    expect(result.candidates[0].warnings.join(" ")).toMatch(/balance could not be read/i);
  });
});
