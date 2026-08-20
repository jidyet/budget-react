import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_ASSETS_DIR = join(process.cwd(), "dist", "assets");

const budgets = [
  { name: "App entry", match: /^App-.*\.js$/, maxBytes: 425 * 1024 },
  { name: "Vendor", match: /^vendor-.*\.js$/, maxBytes: 600 * 1024 },
  { name: "PDF parser", match: /^pdfjs-.*\.js$/, maxBytes: 450 * 1024 },
  { name: "Spreadsheet parser", match: /^xlsx-.*\.js$/, maxBytes: 500 * 1024 },
  { name: "Settings page", match: /^SettingsPage-.*\.js$/, maxBytes: 60 * 1024 },
  { name: "Accounts page", match: /^AccountsPage-.*\.js$/, maxBytes: 60 * 1024 },
  { name: "Payoff page", match: /^PayoffPage-.*\.js$/, maxBytes: 60 * 1024 },
  // UX-6.1: previously unbudgeted (TrackToZero V2 had no entry at all) - set
  // generously above the post-redesign build (~330 kB) to catch a real
  // regression without being byte-tuned.
  // GATE-10B.1: raised 450 -> 470 kB to cover genuine new functionality
  // (the payment/dynamic-minimum domain model - paymentCycle.js/
  // minimumPaymentRules.js - plus the enriched payment/balance entry flow
  // and Debt Explorer's new Record-payment actions), not to paper over an
  // inefficient implementation - no new dependency was added, and the
  // actual post-hotfix build (~455 kB) still leaves real headroom below
  // this budget to catch a genuine future regression.
  // GATE-10B.1D: raised 470 -> 530 kB for the Plan tab's payoff-decision-
  // engine rebuild across all 7 destinations (My Plan/Snowball/Avalanche/
  // Compare/What If/Finish By/Saved) - two new hand-rolled SVG chart
  // primitives (TrendChart, AllocationDonut - no charting library added),
  // a new pure insight-derivation module (planInsights.js), and
  // substantially more markup per page (charts, per-debt impact tables,
  // scenario comparison). Actual post-rebuild build is ~503 kB; this still
  // leaves ~27 kB of headroom below budget to catch a genuine future
  // regression, not to paper over one already present.
  { name: "TrackToZero V2", match: /^TrackToZeroV2App-.*\.js$/, maxBytes: 530 * 1024 },
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function main() {
  let files;
  try {
    files = readdirSync(DIST_ASSETS_DIR);
  } catch {
    console.error("Bundle budget check could not find dist/assets. Run `npm run build` first.");
    process.exit(1);
  }

  const failures = [];

  for (const budget of budgets) {
    const match = files.find((file) => budget.match.test(file));
    if (!match) {
      console.warn(`Skipped ${budget.name}: no matching asset found.`);
      continue;
    }

    const fullPath = join(DIST_ASSETS_DIR, match);
    const size = statSync(fullPath).size;
    const status = size <= budget.maxBytes ? "PASS" : "FAIL";
    console.log(`${status} ${budget.name}: ${match} (${formatKb(size)} / budget ${formatKb(budget.maxBytes)})`);

    if (size > budget.maxBytes) {
      failures.push({ ...budget, file: match, size });
    }
  }

  if (failures.length) {
    console.error("");
    console.error("Bundle budget check failed:");
    failures.forEach((failure) => {
      console.error(`- ${failure.name}: ${failure.file} is ${formatKb(failure.size)} (budget ${formatKb(failure.maxBytes)})`);
    });
    process.exit(1);
  }

  console.log("");
  console.log("Bundle budgets passed.");
}

main();
