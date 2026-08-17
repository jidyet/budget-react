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
  let result;
  try {
    result = discoverWorkbookDebtCandidates({ workbook, XLSX, fileName: file.name, importBatchId, source });
  } catch (error) {
    // UX-8.1: a genuine bug in candidate discovery (an edge case in a real,
    // complex workbook - unusual cell types, merged regions, an empty/
    // malformed sheet) must never surface its raw JS error text to the user
    // (stack traces, internal field names). The file itself DID open (we
    // already have a real `workbook` at this point) - this is specifically
    // an analysis failure, distinct from "the file could not be read" above.
    console.error("TrackToZero: workbook analysis failed after the file opened successfully.", error);
    throw new Error("We opened this file, but couldn't analyze its contents. Try re-exporting it as .xlsx or .csv, or use a simpler layout.");
  }
  if (!result.topology.sheetCount) throw new Error("No sheet was found in this file.");
  const nonEmptySheets = result.topology.sheets.filter((sheet) => sheet.nonEmptyCellCount > 0);
  if (!nonEmptySheets.length) throw new Error("No rows were found in this workbook.");
  return {
    ...result,
    parserVersion: WORKBOOK_DISCOVERY_VERSION,
  };
};
