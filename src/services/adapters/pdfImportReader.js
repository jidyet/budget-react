import { loadPdfJs, parseStatement } from "./statementTextExtraction.js";
import { statementResultToCandidate } from "./statementCandidateAdapter.js";

// Reuses the existing, already-deployed pdfjs-based text extraction and
// regex/heuristic statement parser from StatementUpload.jsx (the legacy V1
// statement importer) rather than reimplementing PDF parsing. Only the
// V2-specific boundary is new here: validation, password/encrypted and
// image-only detection surfaced as explicit states (not silently guessed),
// and mapping the parsed result onto the V2 candidate contract.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

// BETA-3.2: some real statement PDFs render an emphasized figure (a summary
// balance, a due date) as individually positioned character glyphs rather
// than one text run - pdf.js then reports each digit/punctuation mark as
// its own text item, which the line-reconstruction below would otherwise
// join into "5 , 2 4 6 . 2 5" instead of "5,246.25", silently breaking
// every currency/date regex downstream. A run of 3+ CONSECUTIVE
// single-character tokens that are each a digit or common numeric/currency
// punctuation is never legitimate prose (a real sentence never contains
// three-plus one-character "words" in a row - "Page 2 of 2" only ever has
// isolated single digits surrounded by real words), so collapsing such a
// run's internal spacing is safe.
const SPACED_GLYPH_RE = /^[\d.,$%/]$/;
export const collapseSpacedDigitRuns = (tokens) => {
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    while (j < tokens.length && SPACED_GLYPH_RE.test(tokens[j])) j += 1;
    if (j - i >= 3) {
      result.push(tokens.slice(i, j).join(""));
      i = j;
    } else {
      result.push(tokens[i]);
      i += 1;
    }
  }
  return result;
};

const extractTextFromPdf = async (file) => {
  const { pdfjsLib, workerSrc } = await loadPdfJs();
  if (!pdfjsLib) throw new Error("PDF reader is not available");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const buffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: buffer,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      disablePreferences: true,
      disableHistory: true,
    }).promise;
  } catch (error) {
    if (error?.name === "PasswordException") {
      throw new Error("This PDF is password-protected. Remove the password and re-upload.");
    }
    throw new Error("This PDF could not be read. It may be corrupted or in an unsupported format.");
  }

  let fullText = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    try {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const lines = [];
      let currentLine = [];
      let lastY = null;
      for (const item of content.items) {
        const chunk = String(item?.str || "").trim();
        if (!chunk) continue;
        const y = Number(item?.transform?.[5] ?? 0);
        if (lastY != null && Math.abs(y - lastY) > 2.5) {
          if (currentLine.length) lines.push(collapseSpacedDigitRuns(currentLine).join(" ").replace(/\s+/g, " ").trim());
          currentLine = [];
        }
        currentLine.push(chunk);
        lastY = y;
      }
      if (currentLine.length) lines.push(collapseSpacedDigitRuns(currentLine).join(" ").replace(/\s+/g, " ").trim());
      fullText += `${lines.join("\n")}\n`;
    } catch {
      // Skip an individual page that fails to render text (e.g. unsupported color space) -
      // matches the existing legacy behavior rather than failing the whole document.
    }
  }
  return { text: fullText, pageCount: pdf.numPages };
};

export const readPdfFileToCandidate = async (file, { importBatchId = "", source = "pdf" } = {}) => {
  const name = String(file?.name || "").toLowerCase();
  if (!name.endsWith(".pdf")) throw new Error("Please upload a .pdf file.");
  if (!file || file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Please upload a file smaller than 10 MB.");

  const { text, pageCount } = await extractTextFromPdf(file);

  if (!text.trim()) {
    // No extractable text layer - this is a scanned/image-only PDF. Rasterizing each
    // page and running OCR on it is a distinct, larger feature (see known limitations);
    // rather than silently guess at fields from nothing, surface this explicitly.
    return {
      status: "image_only_unsupported",
      message: "This statement appears to be scanned or image-only and needs manual review. Try uploading a photo of the page instead (JPG/PNG), or enter the debt manually.",
      candidate: null,
      pageCount,
    };
  }

  const parsed = parseStatement(text) || { balance: null, min_due: null, due_day: null, apr_percent: null, apr_candidates: [], bank: "", account_hint: "", holder_name: "" };
  const candidate = statementResultToCandidate(parsed, { source, importBatchId, fileName: file.name });
  return { status: "parsed", message: "", candidate, pageCount };
};
