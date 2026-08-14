import { discoverWorkbookDebtCandidates, WORKBOOK_DISCOVERY_VERSION } from "./workbookDebtDiscovery.js";

// Format-specific reader: turns an uploaded Excel workbook into reviewable
// ImportCandidate objects. DATA-1A deliberately scans the workbook topology
// before candidate generation, because real budget workbooks often have
// monthly tabs, formula-linked trackers, ordinary bills, and duplicated debt
// appearances across sheets.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".xlsx", ".xls"];

export const readExcelFileToCandidates = async (file, { importBatchId = "", source = "excel" } = {}) => {
  const name = String(file?.name || "").toLowerCase();
  if (!SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new Error("Please upload a .xlsx or .xls file.");
  }
  if (!file || file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Please upload a file smaller than 10 MB.");

  let workbook;
  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellFormula: true, cellNF: true, cellText: true });
  } catch {
    throw new Error("This file could not be read. It may be corrupted or in an unsupported format.");
  }

  const XLSX = await import("xlsx");
  const result = discoverWorkbookDebtCandidates({ workbook, XLSX, fileName: file.name, importBatchId, source });
  if (!result.topology.sheetCount) throw new Error("No sheet was found in this file.");
  const nonEmptySheets = result.topology.sheets.filter((sheet) => sheet.nonEmptyCellCount > 0);
  if (!nonEmptySheets.length) throw new Error("No rows were found in this workbook.");
  return {
    ...result,
    parserVersion: WORKBOOK_DISCOVERY_VERSION,
  };
};
