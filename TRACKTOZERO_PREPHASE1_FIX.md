# TrackToZero Pre-Phase 1 Fix

## 1. Status

Pre-Phase 1 backup, production-parity investigation, and XLSX security isolation were completed.

No remote push was performed. No Phase 1 / TrackToZero 2.0 engineering was started.

## 2. Safety Backup

The full dirty working state was preserved before cleanup.

| Item | Result |
| --- | --- |
| Backup branch | `backup/pre-phase1-20260812` |
| Backup commit | `4d00dc730ec330bede0cd1bc1e7a8b211ee19ff8` |
| External bundle | `D:\My Projects\trackToZero-prephase1-backup.bundle` |
| Bundle verification | Passed: bundle is complete and valid |

The backup commit includes the previously dirty tracked work plus the untracked audit/blueprint/test files that existed before this cleanup:

- `TRACKTOZERO_2_PRODUCT_BLUEPRINT.md`
- `TRACKTOZERO_BLOCKER_RESOLUTION.md`
- `TRACKTOZERO_PRODUCT_AUDIT.md`
- `src/xlsxImport.test.js`

## 3. Production Parity Investigation

Production parity remains unresolved because Firebase Hosting release metadata proves the deployed build/version, but does not prove the source commit/tree used to produce it.

Verified repository/project facts:

| Item | Finding |
| --- | --- |
| Hosting public directory | `dist` |
| Hosting rewrite | SPA rewrite to `/index.html` |
| Firebase default project | `budgetapp-c9306` |
| Hosting site observed | `budgetapp-c9306` |
| Live channel latest release time | `2026-07-28T16:24:09.410Z` |
| Latest live release | `projects/budgetapp-c9306/sites/budgetapp-c9306/channels/live/releases/1785255849410000` |
| Latest live version | `projects/budgetapp-c9306/sites/budgetapp-c9306/versions/0169d134cf5a1cac` |
| Version file count | `72` |
| Version bytes | `1641952` |
| Deployment metadata | Firebase CLI deployment label only; no git commit metadata found |

Conclusion: the current repository cannot prove that `main@36e31dee379db508309baccedd17b61f1cfc6239` is the exact source currently live at `tracktozero.app`.

Still required before Phase 1:

1. Product owner or deploy owner must verify the source commit/tree used for the live Firebase Hosting release.
2. Compare that source against this repository baseline.
3. Declare the canonical implementation baseline.

## 4. XLSX Security Fix Isolation

Created a clean branch from `main`:

- Branch: `fix/xlsx-security`
- XLSX/security commit: `e5712cf`
- Commit message: `fix: secure spreadsheet import dependency`

Included changes:

- Replaced npm `xlsx@^0.18.5` with SheetJS CDN `xlsx@0.20.3`.
- Moved `@capacitor/cli` from production dependencies to dev dependencies.
- Added a 10 MB spreadsheet file-size guard in `src/ExcelImport.jsx`.
- Added `src/xlsxImport.test.js` regression coverage for `XLSX.read` and `sheet_to_json`, including CSV through the same API.
- Added CI checks for Firestore rules tests, production dependency audit, and bundle budgets.
- Hardened the Firestore test runner environment for reliable emulator execution.
- Updated bundle budgets to match the clean baseline and secure SheetJS chunk:
  - App entry: `425 kB`
  - Spreadsheet parser: `500 kB`

Explicitly excluded from this branch:

- Payoff UI changes.
- TrackToZero 2.0 architecture changes.
- Plan/engine behavioral changes not needed for XLSX security.
- Product audit/blueprint changes from the dirty working tree, except this final report.

Those excluded changes remain recoverable in the backup branch and bundle.

## 5. Validation Results

Validation was run on `fix/xlsx-security` after a fresh production build.

| Check | Result |
| --- | --- |
| `npm audit --omit=dev` | Passed, `0 vulnerabilities` |
| `npm test -- src/xlsxImport.test.js --run` | Passed, 1 file / 2 tests |
| `npm test -- --run` | Passed, existing suite 5 files / 41 tests |
| `npm run test:firestore` | Passed, 12/12 rules tests |
| `npm run lint` | Passed with 3 existing React hook dependency warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run perf:check` | Passed |

Lint warnings observed:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

These warnings were not introduced by the XLSX security slice.

## 6. Current Branch State

After the XLSX security commit, the branch was clean before this report file was added.

This report should be committed separately from the XLSX security code so the security fix remains reviewable on its own.

## 7. Remaining Blockers Before Phase 1

Phase 1 remains blocked until:

1. Production parity is verified and a canonical baseline is declared.
2. The `fix/xlsx-security` branch is reviewed and intentionally merged/landed.
3. Household-as-v1-core migration and role-rule requirements are accepted as baseline product constraints.
4. The team confirms when to re-run household usage counts before migration cutover.

