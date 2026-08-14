import { loadOcr, getFileType, parseStatement } from "./statementTextExtraction.js";
import { statementResultToCandidate } from "./statementCandidateAdapter.js";

// Direct photo/screenshot upload of a statement, reusing the exact same
// already-deployed OCR path (tesseract.js) StatementUpload.jsx uses for its
// image mode - not a new, unproven OCR dependency. Same downstream mapping
// as pdfImportReader.js: OCR'd text -> parseStatement -> one V2 candidate.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const readImageFileToCandidate = async (file, { importBatchId = "", source = "image" } = {}) => {
  if (getFileType(file) !== "image") throw new Error("Please upload a PNG, JPG, JPEG, or WEBP image.");
  if (!file || file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Please upload a file smaller than 10 MB.");

  let text = "";
  try {
    const ocrModule = await loadOcr();
    const workerApi = ocrModule.createWorker ? ocrModule : ocrModule.default;
    const result = await workerApi.recognize(file, "eng", { logger: () => {} });
    text = result?.data?.text || "";
  } catch {
    throw new Error("This image could not be read. Try a clearer photo, or enter the debt manually.");
  }

  if (!text.trim()) {
    return {
      status: "unreadable",
      message: "No text could be read from this image. Try a clearer, well-lit photo, or enter the debt manually.",
      candidate: null,
    };
  }

  const parsed = parseStatement(text) || { balance: null, min_due: null, due_day: null, apr_percent: null, apr_candidates: [], bank: "", account_hint: "", holder_name: "" };
  const candidate = statementResultToCandidate(parsed, { source, importBatchId, fileName: file.name });
  candidate.warnings = [...candidate.warnings, "Extracted from a photo/screenshot using OCR - double-check every field carefully, as OCR accuracy is lower than a text-based PDF or spreadsheet."];
  return { status: "parsed", message: "", candidate };
};
