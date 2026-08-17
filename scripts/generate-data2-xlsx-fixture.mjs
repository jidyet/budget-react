import * as XLSX from "xlsx";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

// DATA-2 synthetic fixture: a real .xlsx workbook (not a text/JS fixture)
// for genuine browser-upload QA of the Debts -> Import spreadsheet flow.
// Exercises: debt section headings (CREDIT CARDS/STUDENT LOANS/PERSONAL
// LOANS/LINE OF CREDIT), non-debt section headings (INSURANCE/SUBSCRIPTIONS/
// HOME EXPENSES/UTILITIES/STORAGE/SAVINGS/INCOME), BUSINESS secondary
// classification (one debt row, one non-debt row), and a same-sheet
// duplicate-creditor case (two distinct Aidvantage loans, no account
// last-4) that must NOT be silently merged into one candidate.

const wb = XLSX.utils.book_new();
const rows = [
  ["Account / Cardholder", "Payment", "Balance", "APR"],
  ["CREDIT CARDS", null, null, null],
  ["Capital One", 65, 1991.99, "26.40%"],
  ["STUDENT LOANS", null, null, null],
  ["Aidvantage", 90, 8000, "5.5%"],
  ["Aidvantage", 130, 12000, "6.0%"],
  ["PERSONAL LOANS", null, null, null],
  ["SoFi Personal Loan", 255, 5000, "11.5%"],
  ["LINE OF CREDIT", null, null, null],
  ["US Bank Personal Line", 102, 4553.22, "12.75%"],
  ["BUSINESS", null, null, null],
  ["US Bank Business credit card", 120, 4000, "22%"],
  ["Business storage fee", 60, null, null],
  ["INSURANCE", null, null, null],
  ["Auto Insurance", 240, null, null],
  ["SUBSCRIPTIONS", null, null, null],
  ["Netflix", 22, null, null],
  ["HOME EXPENSES", null, null, null],
  ["Lawn Service", 60, null, null],
  ["UTILITIES", null, null, null],
  ["Gas", 150, null, null],
  ["STORAGE", null, null, null],
  ["Storage bill", 90, null, null],
  ["SAVINGS", null, null, null],
  ["Monthly Savings", 500, null, null],
  ["INCOME", null, null, null],
  ["EagleView income", 3000, null, null],
];
const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, ws, "Debts");

const outPath = resolve(process.cwd(), "src/services/adapters/__fixtures__/householdBudget.fixture.xlsx");
const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
