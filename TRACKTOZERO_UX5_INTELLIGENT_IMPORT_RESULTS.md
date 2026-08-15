# TRACKTOZERO UX-5 — Intelligent Import Experience + Polish — Results

## 1. Completion status

Core UX-5 goals are implemented and browser-verified end to end (clean import, messy import with a real duplicate reconciliation, missing-field handling, cross-screen consistency). Five real product defects were found and fixed during verification (see §11), followed by an attached-workbook parser validation. Full UX-8 mobile/accessibility hardening and UX-9 beta QA are explicitly **not** in scope here and were not started.

## 2. Starting HEAD / branch

- Branch: `phase4/migration-rehearsal`
- HEAD at start and at time of writing: `61888b92b67c97ebc50a693c28d321f5533e1e37`
- No push was performed. Nothing was committed by this session — all changes remain in the working tree, staged for the user to review/commit.

## 3. Git status

Working tree is **not clean**. It carries this session's changes plus already-in-progress UX-2.1 Home Momentum work from earlier in the same effort (confirmed by reviewing prior session context — not unrelated third-party work). Modified/added files are listed in §14.

## 4. Existing import architecture discovered (before this session's changes)

Confirmed via code inspection:
- `ImportBatch` / `ImportCandidate` staging model in [src/domain/tracktozero/models.js](src/domain/tracktozero/models.js), persisted separately from authoritative `Debt`/`BalanceSnapshot`.
- `createImportBatch` → `decideImportCandidate` (simple confirm/exclude) → `commitImportBatch` in [src/services/tracktozero/v2AsyncApplicationService.js](src/services/tracktozero/v2AsyncApplicationService.js), plus a **separate**, richer reconciliation path: `resolveAsExistingDebt` / `resolveAsNewDebt` / `deferReview` (REVIEW-1A resolution commands), each requiring `batch.status === "review_required"`.
- Duplicate/match detection in [src/services/tracktozero/debtReconciliation.js](src/services/tracktozero/debtReconciliation.js) (`MATCH_CLASSIFICATIONS`, `scoreCandidateAgainstDebt`, `buildReconciliationDiff`).
- A durable, logical "Needs Review" domain in [src/services/tracktozero/reviewDomain.js](src/services/tracktozero/reviewDomain.js) that derives review items directly from `ImportCandidate.evidence` — one shared source of truth for open/blocking/resolved counts (`getReviewSnapshot`).
- A separate, more sophisticated per-item resolution UI already existed in `src/components/tracktozero/review/` (`ReviewCenter.jsx`, `ReviewDetail.jsx`, `ReviewSessionCard.jsx`) with APR-candidate radio pickers and match/duplicate diff cards — but this UI only renders content for candidates that have specific `REVIEW_TYPES` evidence; a candidate with zero evidence signals renders no resolvable action there (by design — it belongs to the quick-confirm Import screen instead).
- **Gap found:** the Import screen's own inline review UI (`ImportPanel`/`ImportReviewCandidate` in [TrackToZeroV2App.jsx](src/components/tracktozero/TrackToZeroV2App.jsx)) never called `resolveAsExistingDebt`/`resolveAsNewDebt`/`deferReview` at all — only the plain `decideImportCandidate`. That meant confirming a candidate that had a real reconciliation match would go through commit's "create new debt" path instead of "update existing debt," silently creating a duplicate Debt. This was fixed in this session (§9, §11).

## 5. Final import information architecture

Unchanged, and now correctly wired end-to-end for both candidate classes:

```
Upload → Analyze/parse → Reconcile (duplicate/match detection)
       → Review (quick-confirm for clean candidates; Update/New/Skip for matched ones)
       → Final summary → Explicit approval → Authoritative Debt (+ opening/updated BalanceSnapshot)
```

No new parser, no second Review Center, no new reconciliation engine were introduced. All resolution actions reuse the pre-existing, tested service methods.

## 6. Entry points

- Debts → "Add debt" (manual entry, unchanged) and "Import debts" (file upload) — both present on the same screen.
- **Bug found and fixed:** Home's empty-state "Import spreadsheet" CTA was wired to `onGoToPlan` (routed to `/plan/my-plan`), not to the Debts/import screen. Fixed to route to Debts, where the import panel actually lives.

## 7. Upload experience

- Added an explicit "selected file" state (filename, size, "Ready to analyze") with a separate **Analyze file** action, instead of parsing immediately on selection.
- Upload copy now explicitly states: "We analyze the file and show you what we found. Nothing becomes part of your debt data until you approve it."
- Only real, supported formats are advertised in the file input `accept` list and in the copy: `.xlsx .xls .csv .pdf .png .jpg .jpeg .webp`. No fake bank-sync/integration options were added.
- Parsing shows descriptive staged copy ("Reading your file… Finding debt details… Checking for duplicates… Preparing your review…"), not a fake percentage.

## 8. Analysis summary

Added a 3-card summary above the candidate list:
- **We found** — N possible debts, and how many look ready vs need a quick review.
- **Found in your file** — sum of all non-excluded candidates' balances (fixed to include unconfirmed candidates too — see §11 bug #3), explicitly labeled "This is not saved yet."
- **What needs attention** — count needing review, with unknown-APR / missing-minimum / excluded sub-counts.

## 9. Review UX — reconciliation (duplicate/match)

New `ReconciliationSection` renders directly on a candidate's review card whenever it has an unresolved reconciliation match:
- Shows each matching existing debt with existing vs. imported balance.
- Shows per-field diffs (APR, minimum payment, due day) as opt-in checkboxes, only for fields that actually changed.
- **"Update this debt"** → calls `service.resolveAsExistingDebt` (existing, tested service method).
- **"It's a different debt"** → calls `service.resolveAsNewDebt`.
- The plain **Confirm** button is now disabled (with a tooltip) while a match is unresolved, so a duplicate can no longer be silently created via the quick-confirm path.

Verified live in-browser (see §16) with a real duplicate: updating "in place" correctly changed the existing debt's balance/minimum payment and did **not** create a second debt.

## 10. Review UX — multiple APR candidates

New `AprCandidatesField` renders a radio list (deduplicated known APR values from `evidence.fieldEvidence.apr`/`aprCandidates`) plus an explicit "I don't know yet" option, whenever more than one plausible APR value was found — mirroring the existing `AprSubSection` pattern already used elsewhere in the review UI, without duplicating its logic verbatim. Never silently resolves to one value; `unknown` stays `unknown` unless the user picks one.

## 11. Bugs found and fixed in this session

1. **Home's "Import spreadsheet" CTA routed to Plan, not Debts/import.** Fixed ([TrackToZeroV2App.jsx](src/components/tracktozero/TrackToZeroV2App.jsx)) — `onUploadBudget` now points to `onGoToDebts`.
2. **Duplicate candidates could be silently confirmed as new debts.** ImportPanel never called the existing `resolveAsExistingDebt`/`resolveAsNewDebt`/`deferReview` methods. Fixed by adding the reconciliation UI (§9) and gating the plain Confirm button.
3. **"Found in your file" always showed $0.00** before any candidate was individually confirmed, because it summed only `decision === "confirmed"` candidates. Fixed to sum all non-excluded candidates.
4. **Review items became permanently stuck "open" forever, even after the corresponding Debt was successfully created/updated.** Root cause: `getReviewItemStatus` in [reviewDomain.js](src/services/tracktozero/reviewDomain.js) only ever resolved a candidate if it had a `reviewResolution` stamp — which is only set by the reconciliation resolution path, never by the plain quick-confirm/exclude path used by most of the Import screen. Fixed by also treating `candidate.committedOutcome` (proof of a completed mutation) and `decision === "excluded"` as resolved/dismissed respectively. This is a correctness fix to the shared, single source of review truth used by Home, the nav badge, and the Review Center — verified it does not change behavior for the already-tested reconciliation path (2 new regression tests added, all 25 pre-existing `reviewDomain.test.js` cases still pass).
5. **A batch left mid-review (e.g. after navigating away) became permanently unreachable** — ImportPanel had no way to resume it, and typeless/clean candidates have no resolvable action in the separate Review Center UI either. Fixed with a minimal resume banner (§12) plus a new read-only `service.getImportBatch` accessor.

## 12. Resume / refresh behavior

Added a lightweight "You have an import waiting for review" banner on the Import screen, sourced from the already-existing `getReviewSnapshot` data (no new persistence, no import-history product). Clicking "Continue review" reloads the batch via a new read-only, workspace-scoped `service.getImportBatch(workspaceId, batchId)` and resumes the exact same review UI. "Open in Review" links to the Review Center. "Dismiss" hides the banner for that batch locally without touching any data. Verified live: a batch abandoned by navigating away was successfully resumed and completed.

## 13. Confidence, copy, and language

Existing "Looks good / Needs review / Missing information / Ambiguous or possible duplicate" grouping and human copy were kept and lightly extended; no raw parser/confidence values are shown to the user. No forced slang was added.

## 14. Files changed this session

- [src/components/tracktozero/TrackToZeroV2App.jsx](src/components/tracktozero/TrackToZeroV2App.jsx) — import UX polish, reconciliation UI, multi-APR UI, resume banner, Home routing fix.
- [src/services/tracktozero/v2AsyncApplicationService.js](src/services/tracktozero/v2AsyncApplicationService.js) — exposed read-only `getImportBatch`.
- [src/services/tracktozero/reviewDomain.js](src/services/tracktozero/reviewDomain.js) — `getReviewItemStatus` correctness fix (§11.4).
- [src/services/tracktozero/reviewDomain.test.js](src/services/tracktozero/reviewDomain.test.js) — 2 new regression tests for the fix.
- [src/services/adapters/workbookDebtDiscovery.js](src/services/adapters/workbookDebtDiscovery.js) — recognizes monthly household-budget debt rows (`Expense`, `Amount`, `Due Date`, `Interest Rate`, `Balance`, `Est. Next Pmt`), suppresses section/total rows, and preserves newest balance evidence dates.
- [src/services/adapters/workbookDebtDiscovery.test.js](src/services/adapters/workbookDebtDiscovery.test.js) — regression coverage for the household-budget layout and newest-month field selection.
- Other modified files (`HomeCommandCenter.jsx`, `homeViewModels.js`, `v2SeedData.js`, etc.) are carried-over, already-in-progress UX-2.1 work from earlier in this effort, not touched further in this session.

## 15. Test results (all commands actually run this session)

| Command | Result |
|---|---|
| `npm test -- --run` | **598 tests passed** (42 files) — includes the import-review and household-workbook regression tests |
| `npm run lint` | 0 errors, 3 pre-existing warnings (unrelated files) |
| `npm run build` | Success |
| `npm run test:firestore` | **12/12 passed** |
| `npm run test:firestore:v2` | **59/59 passed**, rules-parity guard PASS |
| `npm run perf:check` | All bundle budgets PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |

## 16. Browser QA performed (V2 local emulator mode, port 5186)

- Created a fresh beta account + personal workspace.
- **Clean import**: 3-row CSV (Chase Sapphire, Discover It, Personal Loan), all fields present. Verified: file-selected state → Analyze → "3 possible debts, 3 look ready" → correct found-balance total → confirmed all 3 → committed → Debts shows 3 correct debts, Home shows matching totals, Review nav badge cleared (no stale "3").
- **Resume**: navigated away mid-review, confirmed the batch became reachable again via the new resume banner, resumed and completed it.
- **Messy import with a real duplicate**: 2-row CSV — one row matching the already-created Chase Sapphire debt (different balance/minimum), one row missing APR/minimum/due date. Verified: reconciliation card correctly showed existing-vs-imported diff, "Update this debt" updated Chase Sapphire in place (no duplicate created), the missing-info row was flagged non-blocking and confirmable, final commit produced 4 total debts (not 5), Home/Debts totals reconciled ($18,055.00 both places).
- **Attached household workbook**: inspected through the real Excel import reader. Its monthly `Expense`/`Amount`/`Due Date`/`Interest Rate`/`Balance`/`Est. Next Pmt` layout now yields debt candidates with type, balance, APR, minimum due, due date, and month-end balance-as-of date; 26 candidates had a due date and no subtotal/total row was emitted.
- No console errors observed beyond expected Firestore long-polling channel aborts on reload (not from this session's code).

## 17. Known limitations / explicitly deferred scope

- Full UX-8 mobile/responsive/accessibility hardening was **not** expanded beyond the existing baseline.
- UX-9 full beta QA matrix was **not** run.
- UX-6 (household invitations/account connection) and UX-7 (activity/milestones) were **not** touched.
- PDF/image single-candidate import was not separately browser-QA'd this session. CSV was exercised live; the attached multi-sheet Excel workbook was exercised through the real import reader, but not committed through the browser UI.
- No commit or push was made — changes are left in the working tree for review.

## 18. Explicit confirmations

```
PARSED IMPORT DATA DOES NOT AUTOMATICALLY BECOME AUTHORITATIVE DEBT
CANDIDATE DOES NOT EQUAL DEBT
NOTHING BECOMES TRACKTOZERO FINANCIAL TRUTH UNTIL EXPLICIT HUMAN APPROVAL
MULTIPLE APR CANDIDATES ARE NEVER SILENTLY RESOLVED
UNKNOWN APR REMAINS UNKNOWN
MISSING BALANCE DOES NOT BECOME $0
MISSING MINIMUM PAYMENT IS NOT FABRICATED
SKIPPED ITEMS REMAIN NON-AUTHORITATIVE
DUPLICATE IMPORTS DO NOT CREATE DUPLICATE DEBTS (verified live in browser this session)
IMPORT-ONLY FIELD CHANGES DO NOT MANUFACTURE BALANCE SNAPSHOTS
IMPORT DOES NOT MANUFACTURE PAYMENT EVENTS
IMPORTED FINANCIAL PERSON DOES NOT BECOME AN AUTH USER
IMPORTED FINANCIAL PERSON DOES NOT AUTOMATICALLY BECOME A WORKSPACE MEMBER
JOINT DEBT COUNTS ONCE
ACTIVE PLAN IS NOT SILENTLY REWRITTEN BY IMPORT
UX-6, UX-7, and UX-9 remain deferred

No production deployment occurred. No real financial data was used (all test data was synthetic, created and deleted within this session).
```
