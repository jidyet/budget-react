import { normalizeSpreadsheetRowsToCandidates } from "./importCandidateAdapter.js";

// Thin, format-specific reader mirroring excelImportReader.js: turns an
// uploaded CSV file into raw { headers, rows }, then hands off to the exact
// same normalizeSpreadsheetRowsToCandidates pipeline Excel uses - no separate
// financial business logic for CSV. A small hand-rolled RFC 4180 parser is
// used here instead of adding a new third-party dependency, given this repo's
// prior history of tightening spreadsheet-import dependency security
// (see git history: "fix: secure spreadsheet import dependency").
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const parseCsvText = (text) => {
  const rowsRaw = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rowsRaw.push(row); row = []; };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"") { inQuotes = true; continue; }
    if (char === ",") { pushField(); continue; }
    if (char === "\r") continue;
    if (char === "\n") { pushRow(); continue; }
    field += char;
  }
  if (field.length || row.length) pushRow();

  const nonEmptyRows = rowsRaw.filter((cells) => cells.some((cell) => cell !== ""));
  if (!nonEmptyRows.length) return { headers: [], rows: [] };
  const headers = nonEmptyRows[0].map((header) => String(header || "").trim());
  const rows = nonEmptyRows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] === undefined || cells[index] === "" ? null : cells[index]])));
  return { headers, rows };
};

export const readCsvFileToCandidates = async (file, { importBatchId = "", source = "csv" } = {}) => {
  const name = String(file?.name || "").toLowerCase();
  if (!name.endsWith(".csv")) throw new Error("Please upload a .csv file.");
  if (!file || file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Please upload a file smaller than 10 MB.");

  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("This file could not be read.");
  }

  const { headers, rows } = parseCsvText(text);
  if (!headers.length) throw new Error("No header row was found in this file.");
  if (!rows.length) throw new Error("No rows were found in this file.");

  try {
    return normalizeSpreadsheetRowsToCandidates({ headers, rows, source, importBatchId, sourceFilename: file.name });
  } catch (error) {
    console.error("TrackToZero: CSV analysis failed after the file opened successfully.", error);
    throw new Error("We opened this file, but couldn't analyze its contents. Try re-exporting it as .xlsx or .csv, or use a simpler layout.");
  }
};
