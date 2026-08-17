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
  { name: "TrackToZero V2", match: /^TrackToZeroV2App-.*\.js$/, maxBytes: 450 * 1024 },
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
