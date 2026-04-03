# Performance Budgets

## Current Intent
The app now uses lazy-loaded routes plus dedicated heavy-library chunks for:

- `pdfjs`
- `xlsx`
- `ocr`
- main app shell / entry

The goal is to keep the initial interactive path smaller while letting import-heavy tools load only when needed.

## Current Build Checks
After `npm run build`, run:

```bash
node scripts/check-bundle-budget.mjs
```

Or use the package script:

```bash
npm run perf:check
```

## Budget Targets

- App entry: `<= 350 kB`
- Vendor chunk: `<= 600 kB`
- PDF parser chunk: `<= 450 kB`
- Spreadsheet parser chunk: `<= 450 kB`
- Settings page chunk: `<= 60 kB`
- Accounts page chunk: `<= 60 kB`
- Payoff page chunk: `<= 60 kB`

These are practical guardrails, not theoretical ideals. They should be tightened only after a build improvement is stable.

## What To Watch

- If `App-*.js` grows sharply, check recent additions to `App.jsx`, app shell imports, or eager page imports.
- If `vendor-*.js` grows sharply, check shared third-party dependencies leaking into the startup path.
- If parser chunks grow, confirm they are still lazy and still isolated from the entry bundle.

## Expected Commands

```bash
npm run build
npm run perf:check
```

## Notes
Vite may still warn about large chunks even when these budgets pass. That warning is still useful, but the explicit budget script is the project’s current actionable threshold.
