import * as XLSX from "xlsx";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { discoverWorkbookDebtCandidates, CLASSIFICATIONS } from "../src/services/adapters/workbookDebtDiscovery.js";
import { HOUSEHOLD_BUDGET_LARGE_ROWS } from "../src/services/adapters/__fixtures__/householdBudgetLarge.fixture.js";

const rows = HOUSEHOLD_BUDGET_LARGE_ROWS;
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, ws, "Household Budget");

const outPath = resolve(process.cwd(), "src/services/adapters/__fixtures__/householdBudgetLarge.fixture.xlsx");
const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);

const { candidates, nonDebtItems, scanSummary } = discoverWorkbookDebtCandidates({
  workbook: wb, XLSX, fileName: "householdBudgetLarge.fixture.xlsx", importBatchId: "batch",
});
const uncertainOrPossible = candidates.filter((c) => c.evidence.classification === CLASSIFICATIONS.uncertain || c.evidence.classification === CLASSIFICATIONS.possibleDebt);
const likelyDebt = candidates.filter((c) => c.evidence.classification === CLASSIFICATIONS.likelyDebt);

console.log("\n=== TOTAL ROWS IN FIXTURE (excluding header) ===", rows.length - 1);
console.log("=== CANDIDATES (enter the debt/review pipeline) ===", candidates.length);
console.log("  likely_debt:", likelyDebt.length, "-", likelyDebt.map((c) => c.accountName).join(", "));
console.log("  uncertain/possible_debt (review-queue-blocking):", uncertainOrPossible.length, "-", uncertainOrPossible.map((c) => `${c.accountName} [${c.evidence.classification}]`).join(", "));
console.log("=== NON-DEBT ITEMS (excluded, non-blocking) ===", nonDebtItems.length);
console.log("  by financialItemType:", JSON.stringify(scanSummary.nonDebtByType));
console.log("  labels:", nonDebtItems.map((i) => `${i.label} [${i.financialItemType}]`).join(", "));
