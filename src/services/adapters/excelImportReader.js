import { normalizeSpreadsheetRowsToCandidates } from "./importCandidateAdapter.js";

// Thin, format-specific reader: turns an uploaded Excel file into raw
// { headers, rows }, then hands off to the shared normalizeSpreadsheetRowsToCandidates
// pipeline. Contains no financial parsing/normalization logic of its own -
// see importCandidateAdapter.js for why that boundary matters (CSV converges
// on the exact same function).
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
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error("This file could not be read. It may be corrupted or in an unsupported format.");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheet was found in this file.");
  const XLSX = await import("xlsx");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, cellDates: true });
  if (!rows.length) throw new Error("No rows were found in the first sheet of this file.");
  const headers = Object.keys(rows[0]);

  return normalizeSpreadsheetRowsToCandidates({ headers, rows, source, importBatchId, sourceFilename: file.name });
};
