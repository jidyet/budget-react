# TrackToZero — BETA-3.1: Real Workbook Import Truth Test

## 1. Executive verdict

**YES — REAL WORKBOOK IMPORT VERIFIED + PAYMENT EXECUTION READY + GATE 10 READY.**

Gate 10 was held pending this mandatory real-world import truth test. The product owner's real household workbook was run through TrackToZero's actual XLSX import pipeline, found to expose five real, generalizable bugs, all fixed and regression-tested, then re-verified live (before and after) against the real deployed `tracktozero-beta` environment. Zero real financial data was persisted as authoritative Debt data at any point. Gate 10 reopens.

## 2. Repository state

Verified before any code change: branch `beta/v2-controlled`, up to date with `origin/beta/v2-controlled`, working tree clean, `beta/v2-controlled`'s HEAD at the BETA-3 commit (`8a868cf`, "BETA-3: add payment execution and first-cohort readiness"). No unexplained modifications found. All BETA-3.1 work happened on this same branch.

## 3. Private workbook safety

The real workbook was never copied into `budget-react`, never `git add`ed, never committed, never pushed, never uploaded to production, and never used to create production Debt data. It was read and parsed locally, and uploaded twice to the isolated `tracktozero-beta` project (before/after the fixes) via a synthetic QA account that was fully deleted afterward. All screenshots and detailed diagnostics containing real financial values were written exclusively to `D:\My Projects\tracktozero-private-review\beta3-real-workbook\diagnostics\`, outside this repository, untracked, never pushed.

## 4. Exact workbook tested

`Household_Budget_2026_v27 - Copy.xlsx` (197,757 bytes). No further filesystem/private detail is reproduced here beyond what's operationally useful.

## 5. Workbook structure

14 sheets: January–December, Balance Tracker, Bank Holidays — confirmed, not assumed. January is a genuine master sheet (its own header row contains an explicit "MASTER SHEET" note: edit January, other months update automatically, don't edit Feb–Dec directly). January's columns, confirmed exactly: Expense, Amount, Due Date, Adj Due Date, Paid?, Amt Paid, Interest Rate, Balance, Est. Next Pmt, New Purchases. Balance Tracker's columns, confirmed: Account / Cardholder, APR (%), Min Payment, Starting Balance, New Balance, Total Paid YTD, Total Purchases YTD, Est Annual Interest, then JAN–DEC Balance. `Adj Due Date` confirmed via direct formula inspection to use `WORKDAY(DueDate-1, 1, BankHolidayDates)` — genuinely independent of `Due Date`, never a source for it.

## 6. Current importer — before results

Ran unmodified against the real workbook: 53 candidate debts, 412 correctly-excluded non-debt rows (Insurance 97, Subscriptions 61, Home expenses 109, Utilities 25, Storage 120), 0 ambiguous items. 17 of 53 candidates sourced only from Balance Tracker, never merged with their monthly-sheet counterpart — the first signal of the split-identity bug (Section 11).

## 7. Parser bugs found

**Bug 3** (bare day-of-month due date silently misread as 1970-01-01) and **Bug 4** (a present-but-empty APR cell counted as evidence, capable of misclassifying an ordinary bill as debt) — both in `workbookDebtDiscovery.js`'s row-extraction/classification layer. See Section 23 for full description of each.

## 8. Classifier bugs found

None beyond Bug 4 above (which is a classification-input bug, not a classification-logic bug — `classifyRow` itself behaved correctly once given accurate evidence flags).

## 9. Structural row findings

Zero bare section-heading or subtotal rows leaked into either the candidate list or the non-debt list for the real workbook — the pre-existing `matchSectionHeading`/subtotal-detection logic already handled this workbook's exact vocabulary (CREDIT CARDS, STUDENT LOANS, LINE OF CREDIT, BUSINESS, HOME EXPENSES, SUBSCRIPTIONS, STORAGE, and their SUBTOTAL variants) correctly, with no fix required. Bug 4 (Section 7) was the one way a structural section's *child* rows (not the heading itself) could still be misclassified, and only when that section had an Interest Rate column populated-but-blank.

## 10. Monthly duplication findings

No monthly-duplication explosion occurred: the existing entity-key consolidation (grouping by normalized creditor name + owner) correctly reduced each real account's 12-13 sheet-appearances down to one candidate, for every account whose entity key matched consistently across sheets. Bug 1 (Section 11) was the exception — a false owner-suggestion could make one real account's entity key differ between sheets, producing a false SPLIT (not a duplication).

## 11. Cross-sheet identity findings

**Bug 1**: a debt-type/category parenthetical (e.g. "SOFI (Personal Loan)") was indistinguishable from a real owner name (Balance Tracker's "SOFI (Babajide)" for the same account) by the pre-existing owner-suggestion parser, producing two different entity keys for one real account. Fixed by rejecting category vocabulary as an owner suggestion (reusing the file's own `DEBT_CATEGORY_RE`/`BILL_CATEGORY_RE`).

**Bug 2**: a cross-sheet APR formula (January's Chase Line-of-Credit row) referenced a Balance Tracker row that, on direct inspection, is a *different, unrelated* account from the one actually named "Chase" in Balance Tracker (confirmed: the identity-bearing row and the formula-referenced row have differently-lengthed, differently-worded account names) — and the referenced cell happens to be blank, which Excel evaluates as 0. This is a genuine error/inconsistency in the SOURCE workbook, not something TrackToZero should try to silently repair — TrackToZero's obligation is to not present the resulting 0% with unearned confidence, which the fix (Section 23) accomplishes.

Some same-lender pairs (Navy Federal Personal, Citi, Mohela, UTD) remain split even after Bug 1's fix, because the workbook encodes distinguishing information inconsistently between sheets in a way that can't be safely reconciled by name alone — left as separate NEEDS REVIEW candidates, per the governing "surface the ambiguity, never guess" policy (Section 30 of the governing spec).

## 12. Workbook-internal inconsistencies

Two identified, both real properties of the SOURCE workbook (not something "wrong" for TrackToZero to leave unrepaired): (a) the LINE OF CREDIT section's monthly formula template has one fewer row than January's actual 3-account list, so one real account (the "second" Chase LOC entry) only ever gets January + Balance Tracker evidence, never the 11 other monthly sheets'; (b) the cross-sheet APR misalignment described as Bug 2. Both are safely surfaced (low source count / unresolved balance / "APR missing or unknown" warnings), never presented as false confidence.

## 13. Balance provenance

Every balance's provenance (`observed` / `user_entered` / `formula_derived` / `projected` / `ambiguous` / `missing`) was already tracked per-evidence-item pre-BETA-3.1 (`EVIDENCE_TRUTH`, `cellTruth`) and correctly ranks toward "confirmed" only for `observed`/`user_entered` evidence — this pre-existing discipline was re-verified against the real workbook's actual formula chains (e.g. a "New Balance" formula column correctly resolves to `projected`, never `observed`) and required no fix.

## 14. Starting vs. current balance policy

Unchanged and re-verified: only `observed`/`user_entered` evidence can set `balanceStatus: "confirmed"`; a Balance-Tracker-only "Starting Balance"/formula-derived "New Balance" alone leaves `balanceStatus: "unresolved"` and `currentBalance: 0` internally (never displayed as a real $0 — see Bug 5, Section 23, for where that internal placeholder previously leaked into the UI unqualified).

## 15. Required payment mapping

`Amount`/`Min Payment`/`Est. Next Pmt` continue to be treated as independently-ranked evidence (existing `minimumPaymentPriority`, unchanged, already prefers "Est. Next Pmt" over generic "Amount" when both are present) rather than blindly equated. No conflicting-source case was found unflagged in the real workbook. `minimumPayment` remained `null` (never a fabricated $0) wherever no evidence existed.

## 16. APR mapping

Confirmed correct normalization (0.264 → 26.4%, blank → unknown, never blank → 0%) for every literal/user-entered case in the real workbook. Bug 2 (Section 11) is the one case where a *formula-derived* value could present as confidently 0% without adequate grounds — fixed.

## 17. Due Date vs. Adj Due Date

Confirmed via direct code inspection AND a new explicit regression test: the header-alias matcher requires an exact string match, so "Adj Due Date" was never at risk of being picked up as the "Due Date" field even before this phase — `Adj Due Date`'s own bank-holiday-adjusted value is simply not extracted as a due-date field at all today (a possible future enhancement to preserve as auxiliary scheduling metadata, not implemented this phase since it isn't needed for creditor due-date truth).

## 18. Owner mapping

Free-text owner suggestions (including "Stallion," correctly recognized as a business marker via the pre-existing `BUSINESS_RE`) never became verified workspace membership — unchanged, re-verified against the real workbook's actual owner-suffix patterns. Bug 1 is a false-owner-*value* bug (a category word masquerading as an owner), not a membership-fabrication bug — `ownerSuggestion` was always treated as suggestion-only, never auto-membership, throughout.

## 19. Duplicate handling

Same lender ≠ same Debt, confirmed against the real workbook's two genuinely-distinct Aidvantage student loan rows (kept separate, both flagged `possibleSeparateAccount`, neither silently merged nor silently discarded). Same account repeated across 12 sheets ≠ 12 Debts, confirmed via entity-key consolidation reducing each real account to one candidate.

## 20. Non-debt exclusion

412 real ordinary-bill/expense rows correctly excluded from the debt queue in every pass, both before and after the fixes (this pipeline stage was never broken) — Insurance/Subscriptions/Home-expenses/Utilities/Storage, all correctly typed via the existing DATA-2 taxonomy.

## 21. Business debt handling

A literal "BUSINESS" section heading and an ordinary "Business storage fee" row both correctly excluded from the debt queue; genuine business credit (e.g. a real business credit card) correctly retained as a debt candidate with a `business_debt_confirm_scope` confidence label and `includedInCorePayoffPlan: false` by default — re-verified against the real workbook and against the new sanitized fixture's equivalent "Test Business credit card" / "Business storage fee" pair.

## 22. Formula-derived truth policy

Unchanged core policy (a formula/projected value is never automatically "confirmed observed truth"), with Bug 2 closing the one real gap found: a cross-sheet formula's 0-through-a-blank-cell no longer masquerades as a confident 0% APR.

## 23. Fixes implemented

1. `parseOwnerSuggestion` (`workbookDebtDiscovery.js`) now rejects `DEBT_CATEGORY_RE`/`BILL_CATEGORY_RE` matches as owner suggestions, not just `BUSINESS_RE`/`JUNK_OWNER_RE`.
2. A cross-sheet-formula APR resolving to exactly 0 is downgraded to `aprStatus: "unknown"` (never for a literal or same-sheet-formula 0, which still correctly reports confident `no_interest`).
3. A bare 1-31 integer in a due-date cell is detected *before* date parsing is attempted (previously an unreachable fallback, since `normalizeDateField` never actually fails for small numbers); `dueDayFromCandidate` (`v2AsyncApplicationService.js`) now parses the resulting `"day:N"` encoding directly; `ReviewSessionCard.jsx` now displays it as "Day N of each month" instead of the raw encoding.
4. `hasAprEvidence`'s redundant `|| !!aprCell` fallback removed — `apr.aprStatus !== "unknown"` alone is complete and correct.
5. `ImportCandidateList.jsx`'s sidebar row now shows "Balance unknown" instead of a placeholder `$0.00` whenever `balanceStatus !== "confirmed"`.

All five are generalized fixes with no dependency on the real workbook's filename or specific content.

## 24. Permanent regression tests

12 new tests in `workbookDebtDiscovery.test.js` (WB-real-01 through WB-real-10, plus a `WB-fixture` end-to-end test), 1 new test in `v2AsyncApplicationService.test.js` (bare-day-of-month → `Debt.dueDay`) — all using synthetic identities and fabricated values. Full suite: **888/888 passing** (up from 876 before this phase).

## 25. Sanitized fixture

`src/services/adapters/__fixtures__/householdBudgetStructural.fixture.xlsx` (new, committed) — synthetic (Alex/Jordan/Test Business, fabricated amounts), reproducing the master sheet, formula-derived monthly sheets, the deliberately-misaligned cross-sheet formula (Bug 2's exact shape), the split-identity naming pattern (Bug 1's exact shape), business debt vs. business bill, and subtotal/section-heading rows. Verified through the real public `readExcelFileToCandidates` entry point in a locked-in test.

## 26. Real live beta Review

Two full live passes against `https://tracktozero-beta.web.app` with the REAL workbook, via a synthetic isolated QA account approved through `tools/betaAccess.cjs` and fully deleted afterward: Upload → Parse → Review, explicitly stopped before "Add these debts to TrackToZero" both times. Second pass (post-fix) confirmed Bug 5's fix live: "Balance unknown" now appears for all 41 genuinely-unresolved candidates; "$0.00" appears only twice, both legitimately (the $0 "total confirmed" summary before anything was approved). Zero console errors, zero unexpected network requests, either pass.

## 27. Synthetic persistence test

Using the sanitized fixture (never the real workbook): full authenticated flow through Confirm → real Debt + opening BalanceSnapshot creation → Home (Upcoming Payments renders) → Debts (zero structural/subtotal rows ever appeared as debt cards) → Plan (renders without error) → re-login → hard refresh, with data persisting correctly at every step and never regressing to onboarding. Direct Firestore inspection of the resulting Debt documents confirmed correct balances/APRs/due-days/business-exclusion end-to-end. Fully cleaned up afterward.

## 28. Payment execution integration

The sanitized fixture's due dates (including the bare-day-of-month case) flowed correctly through `NormalizedImportCandidate → Review → Debt.dueDay → paymentTiming.js → Home's Upcoming Payments`, using the deterministic 2026-08-18 as-of date established in BETA-3.

## 29. Household / Joint verification

Not independently re-exercised this phase beyond what BETA-3 already proved (Joint-once counting, owner-label display) — this phase's fixture and live tests used personal-workspace scope only, since the real workbook itself is a personal/household budget without a multi-member Joint-debt scenario to reproduce. No regression risk identified: none of this phase's five fixes touch household/Joint logic at all.

## 30. Performance

Real workbook: 197,757 bytes, 14 sheets, ~600 non-empty cells/sheet average, 53 candidates + 412 non-debt items produced. Local parse (Node, via the same `discoverWorkbookDebtCandidates` the browser uses) completes in well under a second. Live browser parse (real network, real Firestore round-trips for Review persistence) completed within the test's generous timeout with no visible freeze. No async-boundary changes were needed; none of this phase's fixes added synchronous heavy work. Bundle size unaffected (444.60 kB / 450 kB budget, unchanged from before this phase — these were logic-only fixes, no new dependencies).

## 31. Firestore / security validation

Unaffected by this phase (no rules changes) — re-verified regardless: 12/12 legacy, 69/69 V2 (zero drift from production `firestore.rules`), 16/16 beta allowlist, all green.

## 32. Console / network

Zero uncaught console errors and zero unexpected network requests across both real-workbook live passes and the sanitized persistence test. No workbook content sent to any third party; only `tracktozero-beta`'s own Firebase endpoints were ever contacted.

## 33. Synthetic QA cleanup

Both real-workbook QA sessions (Auth user, workspace, member_index, `import_batches` subcollection) and the persistence-test QA session (Auth user, workspace, 5 synthetic Debts + BalanceSnapshots) were fully deleted via the Admin SDK. A separate, unrelated inventory of 25 leftover synthetic accounts / 21 workspaces from BETA-2's own earlier testing was also found and removed (flagged and explicitly approved first, since bulk-deleting 25+21 records is a genuinely destructive action even when scoped to synthetic data), preserving only the real owner's own account/workspace.

## 34. Real data persistence check

Zero real-workbook-derived Debt, BalanceSnapshot, PaymentEvent, or Plan documents exist anywhere on `tracktozero-beta` (confirmed via direct Firestore inspection after each cleanup pass). The one `import_batches` document each real-workbook pass created (which *did* contain real candidate data, since Review must survive a reload) was deleted along with its workspace.

## 35. Production non-touch proof

`firestore.rules` unmodified this phase (re-verified via the unchanged 69/69 V2 parity result). Every deploy command this phase used `scripts/deploy-beta.mjs`'s pre-existing literal-project-id verification, which fails closed against anything other than `tracktozero-beta`. `budgetapp-c9306` / `tracktozero.app` were never referenced by any command executed this phase.

## 36. Full test results

| Check | Before this phase | After this phase |
|---|---|---|
| Unit tests | 876/876 | **888/888** |
| Firestore legacy | 12/12 | 12/12 |
| Firestore V2 (+ parity) | 69/69 | 69/69 |
| Firestore beta allowlist | 16/16 | 16/16 |
| Lint | 0 errors, 4 warnings | 0 errors, 4 warnings (same) |
| Build | green | green |
| `npm audit --omit=dev` | 0 vulnerabilities | 0 vulnerabilities |
| `perf:check` | PASS | PASS (444.60 kB / 450 kB, unchanged) |

## 37. Known limitations

Some same-lender-different-naming-convention pairs (Navy Federal Personal/Business, Citi, Mohela, UTD) remain as separate NEEDS REVIEW candidates rather than being automatically reconciled — this is a deliberate safety choice (Section 30 of the governing spec), not an oversight; forcing a merge without unambiguous identity would risk exactly the silent-corruption failure mode this whole phase exists to prevent. Household/Joint-specific import scenarios were not re-exercised this phase (Section 29).

## 38. Remaining import risks

The real workbook's own LINE OF CREDIT row-count mismatch (Section 12) means one real account is permanently under-evidenced (2-3 sources instead of 12-13) *for this specific workbook* until the owner's own spreadsheet is corrected — TrackToZero surfaces this safely today (low confidence, review-blocking) and there is no further product fix available for a gap that exists in the source data itself. A future phase could consider a dedicated "these two candidates look like the same account — merge?" reconciliation UI for the remaining split-identity pairs, rather than requiring a human to notice and manually resolve them across two separate review cards.

## 39. Gate-10 status

**PASS.** See the updated `TRACKTOZERO_GATE10_FIRST_TESTER_MANIFEST.md` for the formal field-by-field record.

## 40. Final verdict

**YES — REAL WORKBOOK IMPORT VERIFIED + PAYMENT EXECUTION READY + GATE 10 READY.**

- Beta URL: `https://tracktozero-beta.web.app`.
- Deployed commit: this phase's changes are committed as `"BETA-3.1: harden real-world workbook import"` on `beta/v2-controlled` (see the commit for the exact hash) and deployed to `tracktozero-beta` Hosting.
- Workbook structural result: 14-sheet master-sheet architecture confirmed exactly as expected.
- Before-parser candidate count: 53 debts / 412 non-debt / 0 ambiguous.
- After-parser candidate count: unchanged at the aggregate level (53/412/0) — the fixes correct *which* evidence each candidate carries and how confidently, not how many rows qualify as debt-shaped in this particular workbook (Bug 4 would have changed the count for a workbook where a bill section's Interest Rate column is populated-but-blank in a way that tips the balance — confirmed via the sanitized fixture, where the count changed from 13 to 9 once Bug 4 was fixed).
- Excluded structural/non-debt count: 412, unchanged, correct throughout.
- Needs-review count: 45 of 53.
- Genuine bugs fixed: 5, categorized as 1 classifier/identity bug (owner-suggestion false positive), 2 provenance/confidence bugs (cross-sheet-formula APR-to-zero, present-but-empty-cell-as-evidence), 1 date-mapping bug (bare day-of-month), 1 UI-truthfulness bug (Review list's $0.00 display).
- Sanitized fixture status: created, committed, verified end-to-end, used for the full persistence test.
- Payment execution integration: re-verified working through the sanitized fixture's due dates.
- Test totals: 888/888 unit, 12/12 + 69/69 + 16/16 Firestore, 0 lint errors, build/perf/audit green.
- Production non-touch proof: Section 35.
- Real workbook financial data persisted: **none, anywhere, ever, during this phase.**
- Remaining non-blocking limitations: Section 37-38.

No real tester emails were requested or added. Gate 10 remains at the same authorization checkpoint it was at the end of BETA-3 — this phase only removes the hold that was placed on it, per the governing instruction, it does not itself authorize Cohort 1.
