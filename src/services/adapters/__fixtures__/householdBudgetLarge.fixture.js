// REVIEW-2: a realistic-shaped household budget - real debts, real ordinary
// bills, and several "noise" bare-label rows (section headers, placeholder
// notes) a real messy household spreadsheet plausibly contains. Reproduces
// the SHAPE of a reported bug where a bare section label with zero balance/
// APR/category evidence (e.g. "HOUSEHOLD") entered the review queue as a
// blocking debt-classification candidate - not a forced match to the
// specific, private, real dataset that was actually reported (unavailable
// to reproduce directly; this fixture is synthetic).
export const HOUSEHOLD_BUDGET_LARGE_ROWS = [
  ["Account / Cardholder", "Category", "Payment", "Balance", "APR"],
  ["HOUSEHOLD", null, null, null, null],
  ["Capital One", "Credit Cards", 65, 1991.99, "26.40%"],
  ["Chase Freedom ****1234", "Credit Cards", 80, 2200, "20.99%"],
  ["Chase Sapphire ****5678", "Credit Cards", null, 4800, null],
  ["Old Navy Card", "Credit Cards", 40, null, null],
  ["MISC", null, null, null, null],
  ["Firstmark Student Loan", "Student Loans", 210, 18204.55, null],
  ["Aidvantage", "Student Loans", null, null, null],
  ["OTHER", null, null, null, null],
  ["SoFi Personal Loan", "Personal Loans", 255, 5000, "11.5%"],
  ["US Bank Personal Line", "Line of Credit", 102, 4553.22, "12.75%"],
  ["GENERAL", null, null, null, null],
  ["Toyota Auto Loan", "Auto Loans", 340, 12500, "6.9%"],
  ["Primary Mortgage", "Mortgage", 1840, 285400, "6.1%"],
  ["SUMMARY", null, null, null, null],
  ["NOTES", null, null, null, null],
  ["TBD", null, null, null, null],
  ["Review later", null, null, null, null],
  ["Placeholder", null, null, null, null],
  ["OVERVIEW", null, null, null, null],
  ["Electricity", "Utilities", 225, null, null],
  ["Water", "Utilities", 60, null, null],
  ["Netflix", "Subscriptions", 22, null, null],
  ["Spotify", "Subscriptions", 12, null, null],
  ["Auto Insurance", "Insurance", 240, null, null],
  ["Home Insurance", "Insurance", 180, null, null],
  ["Storage bill", "Storage", 90, null, null],
  ["Monthly Savings", "Savings", 500, null, null],
  ["EagleView income", "Income", 3000, null, null],
  ["Car Payment", null, 615, null, null],
  ["Fingerhut", null, null, 3200, null],
];
