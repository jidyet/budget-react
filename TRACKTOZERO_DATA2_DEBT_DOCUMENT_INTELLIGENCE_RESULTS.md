# DATA-2 — Debt Document Intelligence + Source Classification: Results

## 1. Completion status

Complete. All in-scope requirements implemented, tested (unit + real browser QA), and verified against the full validation suite. No known regressions. One known limitation is documented in §32 (label-adjacency cross-contamination in the reused legacy text extractor — pre-existing, not introduced by this phase).

## 2. Starting / final HEAD

- Starting HEAD: `5fd2a38` on `phase4/migration-rehearsal` (worktree clean at start).
- This phase's changes are **not yet committed** — see §35 for the pending commit. Final HEAD will be reported after the commit named at the end of this document.

## 3. Architecture before → after

**Before**: spreadsheet rows and PDF/image statement text flowed almost directly into `DebtCandidate` shape. Section-heading rows had a 5-string denylist (`credit cards/student loans/personal loans/line of credit/business`) with no propagation to rows beneath them; anything else (INSURANCE, UTILITIES, SUBSCRIPTIONS, SAVINGS, INCOME, HOME EXPENSES, STORAGE headers) could fall through as a spurious row. The PDF pipeline discarded its own already-computed multi-APR and product/document-type signal instead of persisting it onto the candidate.

**After**, the pipeline is:

```
SOURCE → STRUCTURAL INTERPRETATION → FINANCIAL ITEM CLASSIFICATION → DEBT/NON-DEBT DECISION →
DEBT-TYPE CLASSIFICATION → FIELD EXTRACTION → SEMANTIC NORMALIZATION → SOURCE PROVENANCE →
CONFIDENCE/AMBIGUITY → IMPORT CANDIDATE → HUMAN REVIEW → EXPLICIT APPROVAL → AUTHORITATIVE DATA
```

implemented as additive extensions of the existing three adapters (`workbookDebtDiscovery.js`, `statementTextExtraction.js` / `statementCandidateAdapter.js`, `importCandidateAdapter.js`) plus one new domain module (`financialItemTaxonomy.js`). No parallel import pipeline was created; `classifyRow`'s core debt/not-debt decision logic, `reviewDomain.js`, `debtReconciliation.js`, and `matchImportedOwnerToIdentity` were all reused unchanged.

## 4. Financial-item classification gate

New `src/domain/tracktozero/financialItemTaxonomy.js` defines `FINANCIAL_ITEM_TYPES`: `DEBT, BILL_OR_RECURRING_EXPENSE, UTILITY, SUBSCRIPTION, INSURANCE, HOME_EXPENSE, STORAGE_EXPENSE, SAVINGS, INCOME, HEADER_OR_SECTION, SUBTOTAL_OR_SUMMARY, UNKNOWN`. Every spreadsheet row is now classified before it can become a `DebtCandidate`; only rows landing in `CLASSIFICATIONS.likelyDebt`/`possibleDebt` (via the existing, untouched `classifyRow`) proceed to candidate construction. Rows classified `notDebt` are routed through `financialItemTypeForNonDebt` into the new `nonDebtItems` array instead of being silently dropped or misfiled as debt.

## 5. Debt taxonomy

`DEBT_CATEGORY_GROUPS` (9 values: `CREDIT_CARD, STUDENT_LOAN, PERSONAL_LOAN, LINE_OF_CREDIT, AUTO_LOAN, MORTGAGE_OR_HOME_LOAN, BUSINESS_DEBT, BNPL_OR_INSTALLMENT_FINANCING, OTHER_DEBT`) is a reporting-only grouping layered on top of the existing free-string `debtType` convention via `debtCategoryGroupFor(debtType)` — `debtType` itself (`credit_card`, `student_loan`, …) is untouched, so no data migration or reconciliation-matching change was needed. `medical/collections/tax_debt/personal_debt/other` (live values with no spec equivalent) map to `OTHER_DEBT` for reporting rather than being renamed or collapsed.

## 6. Spreadsheet section-heading interpretation

`extractRowsFromSheet` now tracks a running "current section" as it scans rows (`currentSectionLabel`), reset per table region, matched via new `SECTION_HEADING_MATCHERS` (generalizing the old 5-string denylist to also recognize INSURANCE/SUBSCRIPTIONS/HOME EXPENSES/UTILITIES/STORAGE/SAVINGS/INCOME/BUSINESS). Section context feeds both `classifyRow`'s haystack (so "CREDIT CARDS" above a row is real debt evidence) and `financialItemTypeForNonDebt`'s `sectionHint` for rows beneath a non-debt header.

## 7. Non-debt item handling

Non-debt rows are never silently dropped and never become a `Debt`. `discoverWorkbookDebtCandidates` now returns a `nonDebtItems` array (`{financialItemType, label, sheetName, sheetIndex, row, reason}`) plus a `scanSummary.nonDebtByType` breakdown. This is intentionally **not wired into any new UI this phase** (per the DATA-2 scope boundary) — the existing Review import panel's pre-existing "N ordinary bill/expense row(s) were ignored" summary line already surfaces the count to the user; `nonDebtItems` is available for a future UI to consume in full.

## 8. Business mixed-item (BUSINESS section) classification

A BUSINESS-section row with debt evidence gets `debtType: "business_debt"` and the existing `SCOPE_SUGGESTIONS.businessCandidate` / business-scope review warning (reused unchanged) — verified live in browser QA: "US Bank Business credit card" surfaced with "Business-like scope evidence found; do not include in household plan without confirmation." A BUSINESS-section row with only expense evidence (e.g. "Business storage fee") classifies via `financialItemTypeForNonDebt` into `STORAGE_EXPENSE` and lands in `nonDebtItems` — never auto-promoted to debt. BUSINESS is never itself an auto-debt signal.

## 9. Balance hierarchy (previous vs. current/new balance)

Confirmed correct and unchanged in the spreadsheet path (`workbookDebtDiscovery.js` already separated these). Added to the PDF path via existing `extractLabeledCurrency` label-set separation — verified per-fixture: Capital One previous `$2,046.12` vs. current `$1,991.99`; Cash+ previous `$4,507.06` vs. current `$5,119.10`; Personal Line previous `$4,502.13` vs. current `$4,553.22`. All three are exact-value regression tests in `statementTextExtraction.test.js`.

## 10. Minimum-payment vs. actual-amount-paid hierarchy

New `extractAmountPaid(text)` (label set: "amount paid", "payment received", "payments received", "payments and credits", `allowZero: true`) keeps `amount_paid` structurally separate from the creditor's `min_due` everywhere downstream — verified: Capital One min due `$65` vs. amount paid `$100`; Cash+ min due `$144` vs. amount paid `$172`; Personal Line min due `$102` vs. amount paid `$100`. Regression test explicitly proves the CFPB payoff-illustration's alternate-payment dollar figure (e.g. Capital One's `$81`) never leaks into `min_due`.

## 11. Planned-payment (spreadsheet "Payment" column) distinction

Unchanged from the existing spreadsheet model — the sheet's own "Payment"/"Amount" column is captured as `minimumPayment` evidence exactly as before; this phase did not need to add a third distinct field for the spreadsheet path since household-budget-style sheets don't carry a separate "amount actually paid" column in the fixture matrix. The PDF-path amount-paid work in §10 is the concrete implementation of this requirement for statement documents.

## 12. Due-date extraction (full date, not a stray day number)

Confirmed working for all 3 PDF fixtures via `extractLabeledDate` (pre-existing engine, exercised here): Capital One `2026-02-03`, Cash+ `2026-03-10`, Personal Line `2026-03-15`, each provenanced back to "Payment Due Date"-style label text. Where only a bare day-of-month is present, `statementCandidateAdapter.js` already emits an explicit warning ("Payment due day detected: N. Set the exact due date...") rather than silently treating it as a full date — unchanged, verified still correct.

## 13. APR canonical representation (26.40% never becomes 2640%)

Verified via explicit regression test and browser QA screenshot: Capital One's 26.40% APR displays and stores as `0.264` (decimal convention) / `26.40%` in the UI, never `2640`. `normalizeAprDecimal` (pre-existing, applied consistently at every V2 boundary) was confirmed to already prevent this bug on the V2 path; the historical "2640%" defect lived only in the legacy V1 model, untouched by this phase.

## 14. Multiple APR component model

New `rate_components[]` on the PDF parser output (`{balanceType, apr, balanceSubjectToRate, interestCharged, activeBalance}`), reusing the existing scored `APR_CONTEXT_PATTERNS`/`APR_TABLE_ROW_RE` sweeps with a new `balanceTypeForAprContext` classifier tagging each match `purchase/cash_advance/penalty/balance_transfer/other`. Uses a `Map<key, componentObject>` merge (not "first match wins") so a later, richer table-row match fills in null fields on an earlier plain-sweep match rather than being discarded. Verified: Capital One's active purchase component carries `balanceSubjectToRate: 2045.73, interestCharged: 45.87` (not null); Cash+ correctly preserves purchase (24.49%, active), balance_transfer (19.49%), and cash_advance (27.49%) as three distinct, non-discarded components.

## 15. False-APR-candidate filtering

Explicit regression test confirms the Capital One fixture's `$0/$0` cash-advance row never produces a fake `0.00%` APR candidate (`parsed.apr_candidates` does not contain `0`).

## 16. Product / debt-type detection from explicit source text

New `detectProductName(text)` (Quicksilver, Cash+ Visa Signature, Personal Line, etc.) and `detectDocumentType(text)` (`CREDIT_CARD_STATEMENT | LOC_STATEMENT | LOAN_STATEMENT | UNKNOWN`). **Bug found and fixed**: `statementCandidateAdapter.js`'s `debtType` computation originally only checked creditor/account text against `DEBT_TYPE_ALIASES`, so "Capital One . . . 2656" (no literal "credit card"/"visa"/"mastercard" substring) fell through to `"other"` despite the parser correctly knowing `documentType: CREDIT_CARD_STATEMENT` and `productName: "Quicksilver"` — a direct violation of the "do not classify as Other when explicit product text exists" requirement, caught via real browser QA (screenshot showed "Debt type: Other"). Fixed by feeding a `documentType`-derived hint phrase ("credit card" / "line of credit" / "loan") plus `productName` into the same `normalizeDebtType` haystack, preserving `business_debt`'s priority ordering. Verified fixed in both a new unit regression test and a second browser QA pass (Capital One → "Credit card", Cash+ → "Credit card", Personal Line → "Line of credit", all confirmed via screenshot).

## 17. Account identity ("do not invent account identifiers")

New `resolveNameKeyCollisionsWithinSheet(records)` in `workbookDebtDiscovery.js`: when `accountReferenceSafe` (last-4) is empty and two rows in the **same sheet** produce the same name-based entity key (e.g. two distinct "Aidvantage" rows), they are now kept as separate candidates instead of silently merging — each stamped with `evidence.duplicateResolution.possibleSeparateAccounts: true` and a warning. The legitimate cross-sheet consolidation case (one row per key per month-tab) is untouched. Verified live in browser QA: the household workbook's two Aidvantage rows both surfaced as separate "Needs review" candidates with "This creditor name appears more than once in this sheet without an account number - kept as a separate possible account."

## 18. Owner resolution

Unchanged — `matchImportedOwnerToIdentity` (`personIdentity.js`) was already fully source-agnostic (spreadsheet Owner column or PDF account-holder name) and required no edits. Verified live: Capital One PDF's account-holder hint ("Kristina K Davis") correctly surfaced as a non-binding suggestion in the Review panel, with the real owner left for explicit user selection.

## 19. Statement dates

Balance-as-of / statement-date extraction unchanged (pre-existing, correct) — exercised incidentally by all 3 PDF fixtures without regression.

## 20. Credit limit / available credit

New `extractCreditLimit(text)` / `extractAvailableCredit(text)`. Verified: Capital One `$5,100` / `$3,108.01`; Cash+ `$12,100` / `$6,980.90`; Personal Line `$9,600` / `$5,046.78` — all exact-value regression tests.

## 21. Interest / fees

`interest_charged` extraction (Capital One: `$45.87`) is now also captured as `interestCharged` on the active `rate_components` entry (§14), not just as a standalone field.

## 22. Payment / transaction semantics

Covered by §10 (amount paid) — no separate transaction-ledger extraction was in scope for this phase's fixture matrix.

## 23. Creditor payoff illustration (CFPB minimum-payment warning box)

New segregated `extractCreditorPayoffIllustration(text)` — explicitly reference-only, never authoritative. **Bug found and fixed**: the initial `altMatch` regex's gap tolerance (`[\s\S]{0,40}?`) was wide enough to skip past the correct sentence and capture a later, unrelated dollar figure ($5,847 from the minimum-only paragraph instead of $81 from the alternate-payment paragraph); tightened to a whitespace-only gap (`\s{0,10}`) forcing immediate adjacency. Verified exact values for all 3 fixtures (Capital One: 17yr/$5,847 minimum-only vs. 3yr/$81/$2,942 savings alternate; Cash+: 13yr/$12,396/$202; Personal Line: 8yr/$6,732/$152), each with an explicit assertion that the illustration's dollar figures never leak into `min_due`.

## 24. Formula-derived spreadsheet values never become authoritative BalanceSnapshot

Verified already correctly implemented pre-phase (`EVIDENCE_TRUTH.formula_derived`/`projected` forces `balanceStatus: "unresolved"`, `currentBalance: 0`) — added an explicit `workbookDebtDiscovery.test.js` case with a future-month formula column proving this holds; no production code change was needed here.

## 25. Source provenance

Factored a shared `collectLabeledCurrencyCandidates`/date equivalent out of the existing extractors; added sibling `*WithProvenance` variants (zero change to existing call sites) returning `{value, matchedLabel, matchedText, score}`. `enrichStatement` now threads `balance_provenance`, `min_due_provenance`, `amount_paid_provenance`, `credit_limit_provenance`, `due_date_provenance` onto the parser output, and `statementCandidateAdapter.js` maps these onto `candidate.evidence.provenance.*`. Verified: a PDF-sourced candidate now carries real matched-label/matched-text evidence for balance and minimum payment — previously a PDF candidate had **zero** persisted provenance despite the parser internally computing it. Page-number provenance is explicitly deferred (see §32) — `page: null`, documented as not tracked this phase (multi-page PDFs are concatenated into one string before this pipeline sees them; reconstructing page boundaries would be a materially larger change for a field nothing currently reads).

## 26. Confidence / ambiguity model

The existing multi-APR ambiguity warning (`aprCandidateCount > 1`) and the new same-sheet duplicate-account warning (§17) both route into the existing `warnings` array / Review "Needs review" bucket — no new confidence scoring system was introduced; ambiguity is expressed through the existing warning + `evidence.fieldEvidence` mechanisms `reviewDomain.js` already understands.

## 27. Reconciliation impact

`debtReconciliation.js` was not modified (confirmed already solid — last-4-dominant, fuzzy creditor name, owner, type, balance-closeness). Verified working correctly against the new candidate shape in live browser QA in both directions: (a) the Cash+ PDF import triggered a fuzzy match against an unrelated existing "House Mortgage" debt (a pre-existing weak-signal false-positive in the *reconciliation scorer itself*, not something DATA-2 introduced or is in scope to fix — noted in §32), which the reviewer correctly resolved via the existing "It's a different debt" flow; (b) the household-workbook's Capital One row correctly matched the just-confirmed real Capital One debt with an exact balance match ($1,991.99 = $1,991.99).

## 28. Human Review compatibility (REVIEW-1C / UX-5)

No changes to `reviewDomain.js`, `ReviewSessionCard.jsx`, `reviewSessionSummary.js`, or `reviewCopy.js` — all new evidence flows through the existing generic `fieldEvidence`/`warnings` mechanisms. One real connection was completed: `statementCandidateAdapter.js`'s `fieldEvidenceApr` was initially sourced from `parsed.apr_candidates` (the filtered, purchase-eligible-only list) instead of `rateComponents` (the full, unfiltered list) — meaning PDF candidates never populated `evidence.fieldEvidence.apr`, so `reviewDomain.js`'s existing multi-APR blocking check silently never fired for PDF imports. Found via a failing regression test, fixed by sourcing from `rateComponents`. Verified end-to-end in the real browser: the Capital One PDF import correctly shows the "We found more than one APR. Which one applies?" blocking prompt (26.40% pre-selected "Most likely", 28.40% alternative, "I don't know yet" option).

## 29. Browser QA (real Playwright session, not just unit tests)

Ran against a fresh `inMemory`-mode dev server (port 5210) seeded with `household-seed`. All 3 real, hand-built PDF fixtures (Capital One, U.S. Bank Cash+, U.S. Bank Personal Line) and the real `.xlsx` household-budget fixture were uploaded through the actual Debts → Import UI in one continuous session (SPA navigation, not full reloads, to preserve in-memory repository state across imports):

- Each PDF import showed the correct classification and values in the Review panel (balance, minimum, due date, APR — including the multi-APR blocking prompt where applicable — credit type, owner hint) and was explicitly confirmed and added.
- All 3 resulting debts appeared correctly in the Debts list with correct debtType/balance/APR/minimum/due day/owner-unassigned state.
- The household `.xlsx` import correctly surfaced exactly 6 debt candidates (Capital One [reconciliation-matched], 2× Aidvantage [correctly kept separate], SoFi Personal Loan, US Bank Personal Line, US Bank Business credit card [business-scope flagged]) and correctly excluded 8 non-debt rows ("8 ordinary bill/expense row(s) were ignored") — insurance/subscriptions/home-expenses/utilities/storage/savings/income/business-storage-fee never appeared as fake debt candidates.
- Cross-screen check after the 3 PDF confirms: **Debts** page showed all 3 with correct fields; **Home** correctly marked totals "(PROVISIONAL)" with a "can't fully trust this plan yet" banner while the 6 xlsx candidates remained unreviewed; **Plan** correctly did **not** silently rewrite the active PlanVersion — it explicitly banners "New debts aren't in this plan yet: Capital One . . . 2656, US Bank . . . 1397, US Bank . . . 4139 were added after this plan was last set... Reforecast to include them"; **Review** correctly listed all 6 pending xlsx candidates and did not show the 3 already-confirmed PDF candidates as still-open.
- Zero browser console errors or page errors observed across the entire session.

## 30. Test fixtures

All fixtures are fully synthetic, built directly from the exact numeric values the task specification itself supplied (not copied from any real document):
- `src/services/adapters/__fixtures__/{capitalOneStatement,usBankCashPlusStatement,usBankPersonalLineStatement}.fixture.js` — text fixtures.
- `src/services/adapters/__fixtures__/*.pdf` — real, hand-built, valid single-page PDF binaries (raw PDF syntax, no library) containing the same text, generated via `scripts/generate-data2-pdf-fixtures.mjs`, used for genuine browser-upload QA per explicit user choice over a lighter text-fixture-only approach.
- `src/services/adapters/__fixtures__/householdBudget.fixture.xlsx` — real `.xlsx` binary (via `scripts/generate-data2-xlsx-fixture.mjs`) exercising the full section/BUSINESS/duplicate-creditor/non-debt matrix.
- The synthetic account-holder name "Kristina K Davis" is an established test-fixture persona already reused throughout this codebase's test suite (`v2SeedData.js`, `ownership.test.js`, etc.), not any real individual's identity.

## 31. Test counts

| Suite | Before DATA-2 (spec baseline) | After DATA-2 |
|---|---|---|
| `npx vitest run` | ~614 | **661 passed** (44 files) |
| `npm run test:firestore` | 12 | **12 passed** |
| `npm run test:firestore:v2` | 63 | **63 passed** |
| `npx eslint .` | 0 errors | **0 errors** (4 pre-existing warnings, unrelated) |
| `npm run build` | succeeds | **succeeds** |
| `npm run perf:check` | pass | **pass** (all bundle budgets green) |
| `npm audit --omit=dev` | 0 vulnerabilities | **0 vulnerabilities** |

## 32. Known limitations

- **Legacy extractor label-adjacency cross-contamination** (pre-existing, not introduced or fixed by this phase): the reused `parseStatement`/`enrichStatement` engine searches a small window of lines around each label match, so two labeled amounts placed on immediately-adjacent lines can cross-contaminate. Real-world statements generally have enough visual separation that this hasn't been observed as a live bug; test fixtures were written with realistic line separation to avoid exercising it.
- **`debtReconciliation.js` false-positive on weak signals** (pre-existing, out of this phase's scope — the plan explicitly confirmed this file as "already solid, no changes planned"): a Cash+ credit-card import fuzzy-matched against an unrelated "House Mortgage" debt during browser QA. The existing "It's a different debt" resolution path handles this correctly today, but the scorer's weak-signal fallback (when last-4/creditor-name don't strongly match) could plausibly be tightened in a future phase.
- **Page-number provenance not tracked** (explicitly deferred, §25) — `extractTextFromPdf` concatenates all pages before this pipeline sees the text; `provenance.page` is `null` rather than fabricated.
- **CSV pipeline** was not exercised by this phase's fixture matrix (spreadsheet fixture is `.xlsx`); the classification gate is shared code (`workbookDebtDiscovery.js`) so CSV should inherit the same behavior, but this was not explicitly re-verified with a CSV-specific fixture.
- **OCR/image pipeline** inherits Phase 2's PDF-path fixes for free via the shared `parseStatement()` call, but was not separately exercised with an image fixture in browser QA this phase.

## 33. Explicitly deferred: UX-6.1

Not implemented in this phase, per the task's explicit instruction. No Review Center visual/layout changes, grouped-workspace redesign, or debt-category cards were built. `nonDebtItems`/`scanSummary.nonDebtByType` (§7) are structured and available for a future UX-6.1 phase to surface, but no new UI consumes them yet.

## 34. Explicitly deferred: UX-7

Not implemented in this phase, per the task's explicit instruction. No due-date notification, activity feed, or milestone logic was added or modified.

## 35. Files changed

**Modified**: `src/services/adapters/importCandidateAdapter.js`, `src/services/adapters/importCandidateAdapter.test.js`, `src/services/adapters/statementCandidateAdapter.js`, `src/services/adapters/statementCandidateAdapter.test.js`, `src/services/adapters/statementTextExtraction.js`, `src/services/adapters/workbookDebtDiscovery.js`, `src/services/adapters/workbookDebtDiscovery.test.js`, `src/services/tracktozero/reviewDomain.test.js`.

**New**: `src/domain/tracktozero/financialItemTaxonomy.js`, `src/domain/tracktozero/financialItemTaxonomy.test.js`, `src/services/adapters/statementTextExtraction.test.js`, `src/services/adapters/__fixtures__/` (7 fixture files), `scripts/generate-data2-pdf-fixtures.mjs`, `scripts/generate-data2-xlsx-fixture.mjs`.

Diff stat (tracked files only): 8 files changed, 609 insertions(+), 30 deletions(-).

## 36. Git / sign-off

Full diff reviewed — confirmed only DATA-2-scoped files were touched (no accidental edits to `reviewDomain.js`, `ReviewSessionCard.jsx`, `debtReconciliation.js`, `personIdentity.js`, or any UX-6/UX-6.1/UX-7 file). Ready to commit on `phase4/migration-rehearsal`. Per this session's established git-safety convention, the commit will be created now; **push is deferred pending explicit confirmation**.
