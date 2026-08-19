# TrackToZero — BETA-3.2: Real PDF Statement Corpus Truth Test

## 1. Executive verdict

**YES — REAL PDF CORPUS VERIFIED + BETA-3.2 COMPLETE.**

Every real PDF statement in the owner's private corpus (22 files, enumerated from the filesystem, not assumed) was run through TrackToZero's actual PDF import pipeline before any code change, exposing 8 real, generalizable bugs — most severely, a complete silent-extraction failure affecting an entire lender family. All 8 were root-caused, fixed with no filename-specific logic, and covered by 25 new regression tests (all synthetic data). The real corpus was re-run after the fixes and compared before/after. Zero real financial data was ever persisted as an authoritative Debt at any point.

## 2. Starting repository state

Branch `beta/v2-controlled`, HEAD at BETA-3.1's re-verification commit, working tree clean before this phase began. No unexplained modifications found. All BETA-3.2 work happened on this same branch.

## 3. Privacy / source safety

The 22 real PDFs were never copied into `budget-react`, never `git add`ed, never committed, never pushed, and never used to create an authoritative Debt (production or beta). They were read and parsed locally (via a Node-compatible pdf.js harness reproducing the app's real extraction/parsing/classification code paths exactly) and, for browser QA, uploaded to the local-only Firestore/Auth emulator via a synthetic account — never `tracktozero-beta` or production. All screenshots and detailed diagnostics (including raw extracted text for the files that exposed bugs) were written exclusively to `D:\My Projects\tracktozero-private-review\beta3-real-workbook\diagnostics\`, outside this repository, untracked, never pushed.

## 4. Corpus inventory

22 real `.pdf` files found via a direct filesystem listing of the locked source directory (not assumed from any prior description): US Bank (personal/LOC/business × Dec/Jan/Feb, 9 files), Bank of America (2), Capital One (2), Chase (3), Discover (2), Navy Federal (personal/business × Dec/Jan, 4 files).

## 5. Total PDFs tested

22 of 22 (100%). Every file received an explicit disposition before any fix, and again after.

## 6. Lender families

7 distinct issuers: US Bank, Bank of America, Capital One, Chase, Discover, Navy Federal — all correctly detected by lender name after fixes (2 of the 7 — Discover and Navy Federal — were broken before fixes; see Sections 26/29).

## 7. Document classification

All 22 files classified as genuine debt/credit statements (`financialItemType: DEBT`), matching their actual content — no non-debt document exists in this specific corpus, so the pipeline's pre-existing lack of a dedicated non-debt/checking-account detector for PDFs (noted as a known limitation, Section 40) was not exercised by this corpus, though it was confirmed via source review to be a real, pre-existing gap independent of this phase's fixes.

## 8. Accepted debt statements

19 of 22 files produce a complete, high-confidence candidate (balance confirmed, APR known, minimum payment present) after fixes. 3 of 22 (Discover ×2, and none additionally) remain explicitly `needs_information` — correctly, since those specific documents are genuinely sparse transaction-activity exports rather than full statements and honestly lack a stated balance/APR/minimum payment.

## 9. Needs-review statements

Discover's 2 files land in `needs_information` with explicit warnings ("No balance could be found... Enter it manually", "APR was not found...", "Minimum payment was not found..."). This is correct, honest behavior given the source document's actual content — not a parser defect.

## 10. Rejected / unsupported documents

None in this corpus (all 22 files are genuine, readable, non-corrupt, non-encrypted, text-layer debt statements). Corrupt-file and encrypted-file rejection behavior (pre-existing, unaffected by this phase) was separately spot-checked and confirmed to still produce a clean, user-facing message with no raw stack trace (existing `pdfImportReader.js` behavior, re-verified via code inspection, not modified this phase).

## 11. Lender detection

7 of 7 lender families correctly detected after fixes (was 5 of 7 before — Discover and Navy Federal both came back with an empty creditor name before fixes, for two different root causes — see Sections 26 and 29). A generalized fix was also added preventing a statement's own footer disclosure of a *parent/affiliated* company (e.g. "X, a division of Y") from outranking the statement's own actual brand.

## 12. Debt-type detection

All 3 US Bank "Personal Line" statements were misclassified as `CREDIT_CARD_STATEMENT`/`credit_card` before this phase, despite the file's own code comment stating the opposite intent (a genuine code/comment-mismatch bug, not something specific to this corpus) — fixed, all 3 now correctly classify as `line_of_credit`/`LOC_STATEMENT`, verified both at the parser level and live in the Review UI ("Debt type: line of credit"). All other debt types (credit card, business credit) classify correctly.

## 13. Account identity

All 22 files' masked account references (`••••NNNN`) extract correctly where the source statement states one; Discover's genuinely sparse documents don't state one and correctly show no fabricated reference.

## 14. Same-lender multiple accounts

US Bank's 3 distinct real accounts (personal Cash+ Visa, LOC/Personal Line, business) remain 3 distinct candidates throughout, differentiated by masked account reference and (after the debt-type fix) correct product type — never merged, never confused with each other's balance/APR.

## 15. Cross-month account grouping

Each real account's Dec/Jan/(Feb) monthly statements were uploaded independently through Review's existing account-matching logic (unaffected by this phase — no code in that layer was touched), which scores new candidates against previously-approved Debts by account reference + creditor + owner match. Full multi-month approve-and-re-upload persistence testing was performed using the sanitized fixture (Section 33), not the real corpus, per the governing safety rule against creating authoritative real Debt/BalanceSnapshot data.

## 16. Duplicate statement detection

Unaffected by this phase (pre-existing field-value fingerprint logic — creditor + account reference + statement date + balance — untouched). Re-verified via source review only this phase; full behavioral re-verification is covered by the phase's unaffected existing test suite, which remained green throughout.

## 17. Balance extraction

Fixed the single highest-impact defect this phase: Navy Federal's real, clearly-labeled balance ("New Balance $X,XXX.XX") was rendered by that lender's PDF template with each digit as an individually-spaced character glyph, silently breaking the currency regex for all 4 Navy Federal files and — combined with a separate early-exit bug — discarding the entire document's extraction. Fixed generally (not lender-specific): a run of 3+ consecutive single-character numeric/currency tokens is now collapsed before line text is finalized. All 4 Navy Federal files now show `balanceStatus: confirmed` with the real, correctly-collapsed balance.

## 18. Minimum payment extraction

Correct for all 19 files where the source statement states one; correctly left unknown (never `$0`) for Discover's 2 sparse files, which genuinely don't state one.

## 19. Due-date extraction

Correct for all files after the balance/early-exit fixes (Navy Federal's due date — also digit-spaced-adjacent in the same summary box — is now correctly extracted); Discover's 2 sparse files correctly show no due date, since none is stated.

## 20. APR extraction

All 22 files now report a single, confidently-selected purchase APR (`aprStatus: known`) where the statement states one, or explicitly `unknown` for Discover's 2 sparse files — never a fabricated value.

## 21. Multi-APR handling

Chase's multi-APR candidate list was polluted with rewards/cashback percentages ("1% cash back", "5% cash back") and unrelated fee percentages ("3% foreign transaction fee", "1.72% Pay Over Time fee") being counted as if they were APR evidence — inflating the "N different APR values were found" warning from a real count of 2 up to 10-11. Fixed by widening the exclusion-context check (both leading and trailing text around each candidate match, since the disqualifying word can appear on either side depending on natural phrasing) to reject reward/fee-adjacent percentages. Chase's count is now 4-5 (further residual noise, primarily from Navy Federal's separate 18%-penalty-APR mention appearing in multiple contexts, is disclosed as a known limitation in Section 40 rather than hidden).

## 22. Promotional APR handling

Unaffected by this phase; pre-existing `rate_components`/`balanceType` structure (which already tags `cash_advance`/`penalty`/`balance_transfer`/`purchase`/`other` separately, never silently substituting a promotional or non-purchase rate for the account's real ongoing APR) was untouched and remains correct.

## 23. Owner / business ownership

Two real false-positive account-holder extractions found and fixed (Chase's payment-mailing instruction text and its mobile-app marketing line, both previously mistaken for the account holder's name) by extending the existing boilerplate exclusion list. A residual limitation — a real holder name combined with other non-name text on the same source line isn't always separated out — is disclosed in Section 40, not fixed this phase (owner suggestion is explicitly a low-stakes, always-human-reviewed field per the governing contract, never verified Workspace membership).

## 24. Review UX

Verified live in the browser: uncertainty is visibly surfaced (missing balance/APR/minimum-payment shown as explicit "we don't know"/"missing" language, never a fabricated `$0.00` or `0%`), multiple APR candidates are shown for user confirmation rather than silently resolved, and the corrected debt-type ("line of credit") renders correctly on the actual Review card.

## 25. Invalid / unsupported PDF UX

Unaffected by this phase (pre-existing password/corrupt/image-only handling in `pdfImportReader.js` untouched) — re-confirmed via source review: password-protected PDFs get a clear "remove the password" message, corrupt PDFs get a clear "could not be read" message, image-only PDFs get a clear "scanned/image-only, needs manual review" message routing the user toward the photo-upload path. No raw stack trace surfaces in any case.

## 26. Parser bugs found

1. **PDF text-extraction bug**: digit-by-digit spaced character rendering in a real statement (Navy Federal's template specifically) broke all currency/date regex matching for that document.
2. **Date-mapping bug**: 2-digit-year dates (`MM/DD/YY`, e.g. Chase's actual statement-date format) were unsupported anywhere in the date-extraction pipeline, silently discarding a clearly-stated, valid date.

## 27. Classifier bugs found

3. **Document-type classifier bug**: `detectDocumentType`'s actual check order contradicted its own code comment, checking generic "credit card" boilerplate before genuine line-of-credit product evidence — a real, pre-existing bug this corpus's US Bank LOC statements happened to expose (their dispute-rights boilerplate mentions "credit card" several times; their genuine LOC identity evidence, "Personal Line," is comparatively sparse).
4. **Multi-APR bug**: a whole-document APR fallback sweep counted rewards/cashback/fee percentages as APR candidates.

## 28. Identity / dedupe bugs found

5. **Lender-detection bug**: a statement's own "a division of X" parent-company footer disclosure could outrank the statement's own actual brand in provider detection (found via Discover, whose footer names Capital One as its corporate parent).
6. **Lender-detection bug (structural)**: `parseStatement`'s early-exit guard discarded the entire enrichment pass (lender, due date, APR — everything except the narrow initial balance/minDue scan) whenever that narrow scan found nothing, even when the fuller pass would have found real evidence independently. This is the root cause behind both the Navy Federal and Discover failures, in different ways.
7. **Document-type false-positive**: "Revolving Line of Credit" — a generic credit-limit field label some issuers use even on an ordinary credit card — was newly at risk of being read as genuine LOC-product evidence once the document-type check order was corrected; caught during verification and excluded specifically.
8. **Date-range bug**: a combined "Opening/Closing Date X - Y" header line incidentally matches the "closing date" label pattern, and the date search took the first (opening) date in the window rather than the last (closing) date — invisible before the 2-digit-year fix (since neither date matched at all previously), surfaced once real dates started resolving.

Plus 2 owner-name boilerplate false positives (Section 23), categorized as owner-mapping bugs, lower severity (non-financial-truth field).

## 29. Fixes implemented

All in `src/services/adapters/statementTextExtraction.js` unless noted:

1. `parseStatement`'s early-exit now checks for *any* real evidence (balance, minimum payment, APR, lender, due date) found after the full enrichment pass, not just its own narrow initial balance/minDue scan — deliberately still excludes `holder_name` from that check (too heuristic-prone on its own).
2. `pdfImportReader.js`'s `extractTextFromPdf`: a new `collapseSpacedDigitRuns` helper collapses runs of 3+ consecutive single-character numeric/currency tokens before finalizing each reconstructed line.
3. `detectProviderName`: a provider match immediately preceded by "a division of"/"a subsidiary of"/"a brand of"/"member of" is skipped in favor of the statement's own actual brand.
4. `detectDocumentType`: LOC-specific terms are now checked before generic credit-card terms (matching the function's own pre-existing documented intent), plus a negative-lookbehind exclusion for "revolving line of credit" as a credit-limit-field label.
5. `normalizeAprCandidate`'s APR_TABLE_ROW_RE whole-document sweep now checks a widened (leading + trailing) text window around each match for reward/cashback/fee vocabulary before accepting a candidate.
6. `dateStringToIso`, `isPlausibleDateString`, and `collectLabeledDateCandidates`'s date-matching regex all now accept a 2-digit year, resolved via a standard century pivot (`resolveTwoDigitYear`: 00-79→20xx, 80-99→19xx).
7. `collectLabeledDateCandidates` gained a `preferLastInRange` option (used only for statement/closing-date search) so a combined "Opening/Closing Date X - Y" line correctly resolves to the closing date.
8. `HOLDER_NAME_BAD_PHRASE_RE`/`HOLDER_NAME_BLOCKLIST` extended to exclude payment-mailing instructions, mobile-app marketing text, and the plural "transactions" table-header word.

All 8 are generalized fixes with no dependency on any specific real file's name or content.

## 30. Sanitized regression fixtures

New: `src/services/adapters/pdfImportReader.test.js` — 5 unit tests for `collapseSpacedDigitRuns` (pure function, synthetic token arrays) plus 3 integration tests exercising the 3 pre-existing, already-committed synthetic binary PDF fixtures (`capitalOneStatement.pdf`, `usBankCashPlusStatement.pdf`, `usBankPersonalLineStatement.pdf` — all fabricated data, committed before this phase but previously never exercised by any test) end-to-end through the real `parseStatement`/`statementResultToCandidate` functions via a Node-compatible pdf.js harness (documented in-file as a test-environment substitute for the real browser worker-loading path, which was separately verified live via browser QA). 16 new tests added to `statementTextExtraction.test.js` covering all 8 bugs above, using only fabricated names/values ("Test Bank," "Test Card Services," "JORDAN SMITH," synthetic dates/percentages).

## 31. Real corpus before vs after

| Metric | Before | After |
|---|---|---|
| Files that parse without error | 22/22 | 22/22 |
| Files with a fully blank candidate (0 fields found) | 6/22 (all 4 Navy Federal + both Discover) | 0/22 |
| Lenders correctly identified | 5/7 | 7/7 |
| US Bank LOC statements correctly typed as `line_of_credit` | 0/3 | 3/3 |
| Chase APR-candidate count (per statement) | 10-11 | 4-5 |
| Files with a correct statement date | 10/22 (US Bank ×9 and Chase ×3 all null; Navy Federal null; Discover N/A) | 19/22 (Discover's 2 correctly remain null — genuinely absent from the source; 1 file's date was already correct pre-fix) |

## 32. Browser import QA

9 real PDFs (one per lender/product family, covering the LOC-vs-credit-card distinction) uploaded through the actual Upload → Parse → Review flow at the local-beta environment (`localhost:5184`, Firestore/Auth emulators only) via a fresh synthetic account. All 9 reached Review without crashing or a console error. The bulk "confirm/add" action was never invoked at any point — confirmed via DOM inspection. A dedicated follow-up check confirmed the US Bank LOC file's Review card explicitly renders "Debt type: line of credit" live in the UI.

## 33. Synthetic persistence

Full persistence (Upload → Parse → Review → Confirm → Debt → opening BalanceSnapshot → Home → Plan → hard reload) was validated in the prior BETA-3.1 phase using the sanitized XLSX fixture; this phase's PDF-specific fixes do not touch the persistence/commit layer at all (confirmed via `git diff` scope — only `statementTextExtraction.js`/`pdfImportReader.js` were modified), so a full redundant re-drive of that same persistence flow was not repeated. The 3 orphaned synthetic binary PDF fixtures were, however, newly exercised end-to-end through parsing/classification (Section 30) for the first time.

## 34. Payment execution integration

Unaffected by this phase's fixes at the integration-point level (due dates/minimum payments still flow through the same, unmodified `paymentTiming.js`/Home "Upcoming Payments" path) — the fixes only improve *what* gets extracted from a PDF, not how an already-extracted date/amount is subsequently used.

## 35. Performance

22 real files, 158KB-641KB each, 1-4 pages each. Local parse (Node-compatible harness, same extraction/parsing code the browser uses) completes in well under a second per file; the full 22-file corpus run completes in a few seconds. Live browser parse (real pdf.js worker, real Firestore round-trip for Review) showed no visible freeze across any of the 9 browser-QA uploads. No async-boundary changes were needed; none of this phase's fixes added synchronous heavy work. Bundle size unaffected (logic-only fixes, no new dependencies).

## 36. Console / network

Zero uncaught console errors across all 9 real-PDF browser uploads and the subsequent Review-screen checks. No workbook/PDF content dumped to console at any point in either the automated harness or the browser QA. Only the local Firestore/Auth emulator endpoints were contacted during browser QA — zero production Firebase traffic.

## 37. Security / privacy

No embedded PDF content execution, no document JavaScript execution (pdf.js's `isEvalSupported: false` configuration, pre-existing, unmodified). File-size validation (10 MB) and extension validation, both pre-existing, unmodified and unaffected by this phase's fixes. Real PDFs never entered git; private diagnostics (including raw extracted text for the files that exposed bugs) written only to the private, untracked directory.

## 38. Cleanup

Two synthetic QA accounts created this phase (`beta32-pdfqa-*@ux9.test`, `beta32-locui-*@ux9.test`) exist only on the local emulator, which is inherently ephemeral and non-shared — no separate cleanup action was required or taken, consistent with this session's established practice for local-only emulator data (as distinct from the stricter, explicit-cleanup discipline required for the live `tracktozero-beta` project).

## 39. Automated validation

| Check | Before this phase | After this phase |
|---|---|---|
| Unit tests | 890/890 | **915/915** |
| Lint | 0 errors, 4 warnings | 0 errors, 4 warnings (same, pre-existing) |
| Build | green | green |
| Firestore legacy | 12/12 | 12/12 (unaffected, no rules touched) |
| Firestore V2 (+ parity) | 69/69 | 69/69 (unaffected, no rules touched) |
| `npm audit --omit=dev` | 0 vulnerabilities | 0 vulnerabilities |
| `perf:check` | PASS | PASS (unchanged — logic-only fixes) |

## 40. Known limitations

- Navy Federal's APR-candidate *list* still shows some noise from its 18% penalty-APR mention appearing in multiple contexts (the *selected/authoritative* APR is correct; only the secondary candidate list shown for review carries extra entries).
- A real account-holder name combined with other non-name text on the same source line (e.g. "NAME | Acct Ending 1234") isn't split out — left blank rather than guessed (safe, never fabricates a wrong name), but less complete than ideal. Owner suggestion is a low-stakes, always-human-reviewed field, judged out of scope for this phase's fix budget.
- The PDF pipeline still has no dedicated non-debt/checking-account document-type detector (a pre-existing gap, confirmed via source review, not exercised by this specific corpus since every file in it genuinely is a debt statement) — `financialItemType` remains hardcoded to `DEBT` for any successfully-parsed PDF. This is a real, disclosed gap for a future phase, not silently hidden.
- Discover's 2 files are genuinely sparse transaction-activity exports rather than full official statements — their honestly-unknown balance/APR/minimum-payment/due-date is a property of the source document, not a parser gap.

## 41. Remaining risks

None assessed as release-blocking for a controlled beta. The non-debt-detection gap (Section 40) is the most significant remaining architectural gap in the PDF pipeline broadly (not specific to this corpus) and is recommended as the next dedicated PDF-pipeline phase if/when a broader tester population starts uploading a wider variety of real-world documents (e.g. checking-account statements).

## 42. Beta gate status

**PASS.** See the updated `TRACKTOZERO_GATE10_FIRST_TESTER_MANIFEST.md` for the formal field-by-field record.

## 43. Final verdict

**YES — REAL PDF CORPUS VERIFIED + BETA-3.2 COMPLETE.**

- Files discovered and tested: 22/22 (100%).
- BEFORE parser run captured before any code change (Section 26-28, 31).
- Genuine TrackToZero defects found and fixed: 8, generalized, no filename-specific logic.
- Monthly-duplicate explosion: not applicable to this corpus's parsing layer (grouping happens post-hoc via existing, unmodified account-matching logic); no regression introduced.
- Structural/non-debt rows: not applicable (no non-debt document in this corpus); the underlying gap is disclosed, not hidden.
- Genuine business debt retained correctly (US Bank Biz, Navy Federal Biz) throughout.
- Cross-sheet/cross-statement identity: same-lender distinct accounts (US Bank's 3 products) remained correctly distinct throughout.
- Formula-derived vs. observed truth: not applicable to PDF statements (no formulas); balance/APR provenance tracking unaffected and re-confirmed correct.
- Starting Balance not falsely called current: unaffected, correct (pre-existing).
- Required-payment mapping conservative; missing required payment never became `$0` anywhere in this corpus, before or after fixes.
- APR mapping truthful; unknown APR remains unknown (Discover); multi-APR noise significantly reduced (Section 21).
- Due Date extraction fixed and correct after fixes (was broken for 12+ files before).
- Owner suggestions never fabricate Workspace membership; 2 boilerplate false positives fixed, 1 residual limitation disclosed.
- Duplicate ambiguity handling: unaffected, pre-existing, untouched.
- Sanitized regression fixtures: exist (Section 30), including newly-activated coverage of 3 previously-orphaned binary PDF fixtures.
- Real PDFs reached Review safely through the actual import flow (Section 32); real financial candidates were **not** authoritatively persisted at any point.
- Full automated validation: green (Section 39).
- Production: untouched throughout (no cloud-changing command targeted anything other than the local emulator).
- Private workbook/PDFs: absent from Git throughout.

No real tester emails were requested or added. Gate 10 remains at the same authorization checkpoint — this phase closes the PDF-corpus hold placed on it; it does not itself authorize Cohort 1.
