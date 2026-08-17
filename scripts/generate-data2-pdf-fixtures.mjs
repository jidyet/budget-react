import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// DATA-2: builds real, minimal, valid single-page PDF files (raw PDF syntax,
// no external library) from the same synthetic statement text already used
// by the vitest fixtures, so the 3 statement fixtures can be genuinely
// uploaded through the real V2 import UI for browser QA - not just fed to
// parseStatement() as a string. Each line of text is placed at its own
// Y-coordinate so pdfjs's real Y-coordinate line-clustering (see
// extractTextFromPdf in pdfImportReader.js) groups them back into the same
// lines this fixture's text already represents.

const escapePdfString = (line) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function buildPdf(lines) {
  const fontSize = 10;
  const leading = 14;
  const startY = 760;
  const startX = 50;

  // Long lines are split into multiple Tj chunks at word boundaries (no Td
  // between them, so each chunk continues immediately after the previous
  // one's rendered width - same visual line, same Y). Whatever is clipping
  // very long single Tj strings somewhere in this pipeline doesn't affect
  // several shorter consecutive ones, and pdfjs's own Y-coordinate line
  // grouping (see extractTextFromPdf) merges them back into one text line
  // regardless of how many separate text-showing items produced it.
  const MAX_CHUNK = 70;
  const chunkLine = (line) => {
    const words = line.split(" ");
    const chunks = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > MAX_CHUNK && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  const contentParts = ["BT", `/F1 ${fontSize} Tf`, `${startX} ${startY} Td`];
  lines.forEach((line, index) => {
    if (index > 0) contentParts.push(`0 -${leading} Td`);
    chunkLine(line).forEach((chunk, chunkIndex) => {
      contentParts.push(`(${escapePdfString(chunkIndex === 0 ? chunk : ` ${chunk}`)}) Tj`);
    });
  });
  contentParts.push("ET");
  const content = contentParts.join("\n");
  const contentBytes = Buffer.byteLength(content, "latin1");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    // Wide MediaBox (not standard Letter width) - text extraction for a QA
    // fixture doesn't need print-realistic line wrapping, and long lines
    // getting clipped at the page's right edge (empirically ~124 chars from
    // x=50 at 10pt within a 612pt-wide page) was truncating pdfjs's own
    // getTextContent() output even though the raw content-stream bytes were
    // always complete.
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 2000 1600] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentBytes} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

const fixturesDir = resolve(process.cwd(), "src/services/adapters/__fixtures__");

async function build(name, exportName) {
  const module = await import(pathToFileURL(resolve(fixturesDir, `${name}.fixture.js`)).href);
  const text = module[exportName];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const pdf = buildPdf(lines);
  const outPath = resolve(fixturesDir, `${name}.pdf`);
  writeFileSync(outPath, pdf);
  console.log(`Wrote ${outPath} (${pdf.length} bytes, ${lines.length} lines)`);
}

await build("capitalOneStatement", "CAPITAL_ONE_STATEMENT_TEXT");
await build("usBankCashPlusStatement", "US_BANK_CASH_PLUS_STATEMENT_TEXT");
await build("usBankPersonalLineStatement", "US_BANK_PERSONAL_LINE_STATEMENT_TEXT");
