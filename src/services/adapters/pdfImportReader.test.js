import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collapseSpacedDigitRuns, MAX_IMPORT_FILE_BYTES } from "./pdfImportReader.js";
import { parseStatement } from "./statementTextExtraction.js";
import { statementResultToCandidate } from "./statementCandidateAdapter.js";

// BETA-3.2: a real statement PDF discovered during corpus testing rendered
// its summary balance/date figures as individually positioned character
// glyphs (pdf.js then reports each digit as its own text item), which the
// line-reconstruction previously joined into "5 , 2 4 6 . 2 5" instead of
// "5,246.25" - silently breaking every currency/date regex downstream and
// making an otherwise-complete real statement look completely blank.
describe("collapseSpacedDigitRuns", () => {
  it("collapses a spaced-out currency figure into one contiguous token", () => {
    const tokens = ["New", "Balance", "$", "5", ",", "2", "4", "6", ".", "2", "5"];
    expect(collapseSpacedDigitRuns(tokens)).toEqual(["New", "Balance", "$5,246.25"]);
  });

  it("collapses a spaced-out date into one contiguous token", () => {
    const tokens = ["Statement", "Closing", "Date", "0", "1", "/", "1", "9", "/", "2", "0", "2", "6"];
    expect(collapseSpacedDigitRuns(tokens)).toEqual(["Statement", "Closing", "Date", "01/19/2026"]);
  });

  it("never collapses isolated single digits surrounded by real words", () => {
    // A real sentence never has three-plus one-character "words" in a row -
    // this must stay exactly as pdf.js reported it.
    const tokens = ["Page", "2", "of", "2"];
    expect(collapseSpacedDigitRuns(tokens)).toEqual(["Page", "2", "of", "2"]);
  });

  it("does not merge two short but already-whole multi-character numbers", () => {
    // Multiple genuinely separate values on one line (not one number split
    // into single characters) must stay distinct.
    const tokens = ["$100", "$200", "$300"];
    expect(collapseSpacedDigitRuns(tokens)).toEqual(["$100", "$200", "$300"]);
  });

  it("leaves a run of only 2 single-character tokens untouched (below the 3+ threshold)", () => {
    const tokens = ["Room", "4", "9", "Building"];
    expect(collapseSpacedDigitRuns(tokens)).toEqual(["Room", "4", "9", "Building"]);
  });
});

// BETA-3.2: readPdfFileToCandidate's real pdf.js loading path
// (statementTextExtraction.js's loadPdfJs) uses Vite's `?url` import for
// the PDF worker - correct and necessary for the real browser build, but
// it doesn't resolve under Vitest's default Node test environment (nor
// plain Node), so it can't be exercised directly here. This block
// reimplements ONLY the binary-PDF-to-text extraction step using
// pdfjs-dist's Node-legacy build (mirroring extractTextFromPdf's exact
// line-clustering + collapseSpacedDigitRuns algorithm, both copied
// verbatim) so the REAL, unmodified parseStatement/statementResultToCandidate
// functions can be exercised end-to-end against real binary PDF bytes -
// closing the prior "zero test coverage of the actual pdf.js extraction
// path" gap using the existing, already-committed synthetic fixture PDFs.
// The worker-dependent browser path itself is verified separately via live
// browser QA (see the BETA-3.2 results report).
const workerAbsPath = path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerAbsPath).href;

async function extractTextFromPdfNodeLegacy(buffer) {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    disablePreferences: true,
    disableHistory: true,
  }).promise;
  let fullText = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
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
  }
  return fullText;
}

async function readFixturePdfToCandidate(fixtureName) {
  const buffer = readFileSync(path.resolve("src/services/adapters/__fixtures__", fixtureName));
  const text = await extractTextFromPdfNodeLegacy(buffer);
  const parsed = parseStatement(text);
  return parsed ? statementResultToCandidate(parsed, { source: "pdf", importBatchId: "test", fileName: fixtureName }) : null;
}

describe("real binary PDF extraction end-to-end (synthetic fixtures, no real data)", () => {
  it("extracts a Capital One statement PDF matching the sibling text-fixture's expected values", async () => {
    const candidate = await readFixturePdfToCandidate("capitalOneStatement.pdf");
    expect(candidate.creditorName).toBe("Capital One");
    expect(candidate.debtType).toBe("credit_card");
    expect(candidate.currentBalance).toBe(1991.99);
    expect(candidate.minimumPayment).toBe(65);
    expect(candidate.dueDate).toBe("2026-02-03");
  });

  it("extracts a US Bank Cash+ credit card statement PDF correctly", async () => {
    const candidate = await readFixturePdfToCandidate("usBankCashPlusStatement.pdf");
    expect(candidate.creditorName).toBe("US Bank");
    expect(candidate.debtType).toBe("credit_card");
    expect(candidate.documentType).toBe("CREDIT_CARD_STATEMENT");
  });

  it("extracts a US Bank Personal Line statement PDF as a line of credit, not a credit card", async () => {
    const candidate = await readFixturePdfToCandidate("usBankPersonalLineStatement.pdf");
    expect(candidate.creditorName).toBe("US Bank");
    expect(candidate.debtType).toBe("line_of_credit");
    expect(candidate.documentType).toBe("LOC_STATEMENT");
  });
});

describe("PDF validation guards (MAX_IMPORT_FILE_BYTES)", () => {
  it("exposes the documented 10 MB size limit", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});
