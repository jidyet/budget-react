# TrackToZero DATA-1A Results

## 1. Status

Completion gate:

**PARTIAL — DATA-1A WORKBOOK DISCOVERY IMPLEMENTED AND AUTOMATED REGRESSION GREEN; LOCAL BROWSER UPLOAD QA REMAINS BLOCKED**

Branch:

- `phase4/migration-rehearsal`

Starting HEAD:

- `c8561f1` — `UX-1: restore TrackToZero brand and design system`

Scope honored:

- No DATA-1B existing-debt reconciliation.
- No Update Existing / New Debt / I'm Not Sure workflow.
- No Needs Review Center.
- No UX-2 Home redesign.
- No production deploy.
- No production migration.
- No production Firebase writes.
- No private workbook committed.

## 2. Existing Importer Audit

| Stage | Current implementation before DATA-1A | Limitation | DATA-1A change |
| --- | --- | --- | --- |
| File selection | V2 upload/import flows use source-specific readers under `src/services/adapters/`; legacy `ExcelImport.jsx` also supports Excel/CSV. | V2 Excel reader assumed a clean debt sheet. Legacy importer scans sheets but is bill/account-era and UI-coupled. | DATA-1A keeps V2 adapter boundary and adds pure workbook discovery. |
| File type detection | Excel: `.xlsx`, `.xls`; CSV: `.csv`; PDF/image separate readers. | XLS/XLSX and CSV converged only after rows were flattened. | Excel now uses workbook topology first; CSV remains row-based and compatible. |
| Workbook reader | SheetJS `xlsx@0.20.3` from SheetJS CDN tarball. | Existing V2 Excel reader read only `workbook.SheetNames[0]`. | Reader now loads formulas/text and passes the whole workbook to `discoverWorkbookDebtCandidates()`. |
| Sheet parsing | First sheet only in `excelImportReader.js`; CSV hand-rolled parser. | Could miss `Balance Tracker` and duplicate monthly tabs. | All sheets are analyzed with relevance scores, header/table detection, and formula counts. |
| Row parsing | `normalizeSpreadsheetRowsToCandidates()` required balance + identity mapping for confidence. | Missing-balance debts such as student loans could be dropped. Ordinary bills could look debt-like if represented in clean columns. | Workbook engine classifies debt existence separately from financial-field completeness. |
| Candidate generation | Produces `ImportCandidate`-compatible objects. | Minimal evidence/provenance and no workbook-level entity resolution. | Candidates include classification evidence, field evidence, source provenance, formula truth, scope suggestion, and duplicate-resolution metadata. |
| ImportBatch | `createImportBatch()` stores candidates for human review. | Good safety contract; keep it. | Preserved. Workbook results are still candidates only. |
| Review/approval | `decideImportCandidate()` sets human decision. | Good safety contract; keep it. | Preserved. |
| Commit | `commitImportBatch()` creates Debt + opening BalanceSnapshot atomically only for confirmed candidates. | Good safety contract; keep it. | Preserved. No PaymentEvents fabricated. |

Original workbook failure class addressed:

- Valid multi-sheet workbook with important data outside the first sheet.
- Valid workbook where debt identity is spread across monthly sheets and Balance Tracker.
- Formula-derived values previously collapsed by row flattening or ignored.
- Ordinary bills mixed with debt categories.

## 3. New Workbook Topology Engine

Added:

- `src/services/adapters/workbookDebtDiscovery.js`

Core capabilities:

- Sheet metadata: name, order, used range, hidden flag, non-empty cells, formula count.
- Header-like row discovery.
- Candidate table-region discovery.
- Debt/bill vocabulary density.
- Date/month characteristics.
- Cross-sheet formula reference counts.
- Sheet relevance scoring.

Strong relevance signals include debt tracker, balance tracker, loans, credit cards, liabilities, payoff, balances, APR, balance, and minimum-payment headers.

Low relevance signals include holidays, calendars, notes, and instructions.

## 4. Table / Header Detection

DATA-1A supports non-A1 tables and aliases for:

- Creditor / Account / Account Cardholder.
- Balance / Current Balance / New Balance / Starting Balance.
- Minimum / Required / Monthly Payment.
- APR / Interest Rate.
- Due Date / Due Day.
- Owner / Cardholder / Borrower / Account Holder.

Alias matching is treated as evidence, not final truth.

## 5. Classification

Supported workbook classification states:

- `likely_debt`
- `possible_debt`
- `not_debt`
- `uncertain`

Debt-like taxonomy includes credit card, student loan, personal loan, auto loan, mortgage, medical debt, collections, tax debt, line of credit, HELOC, BNPL/financing, installment loan, personal debt, and other payoff balance.

Ordinary bill taxonomy includes utilities, internet, phone, streaming, subscriptions, insurance premiums, groceries, daycare, storage, memberships, routine rent, and routine household expenses.

Important behavior:

- Monthly payment alone is not debt proof.
- Missing balance does not discard a likely debt.
- Missing balance is never converted into confirmed `$0`.
- Ambiguous labels like `Car Payment` become `possible_debt` unless payoff/loan/balance evidence exists.
- Business-like evidence becomes `business_candidate` scope.

## 6. Entity Resolution

Workbook-level consolidation now uses:

- Normalized creditor/account label.
- Safe last-4 account reference when present.
- Owner suggestion.
- Debt category/type context.
- Cross-sheet formula lineage.
- Consistent account naming.

Safety behavior:

- Monthly duplicates consolidate into one candidate.
- `Balance Tracker` + monthly occurrences consolidate.
- Same creditor with different safe account references remains separate.
- Same creditor alone is insufficient to merge.

## 7. Evidence / Provenance

Candidates now preserve:

- `classificationEvidence`
- `fieldEvidence`
- `sources`
- `scopeSuggestion`
- `duplicateResolution`
- source file name
- sheet name
- sheet index
- row
- column
- cell reference
- header label
- original value
- formula where available

Field evidence currently covers:

- identity
- balance
- APR
- minimum payment
- due date
- owner suggestion

Owner remains a suggestion only:

- `ownerSuggestion` may be populated.
- `ownerType` remains `unassigned`.
- `ownerId` remains empty until human/verified-member confirmation.

## 8. Formula / Truth Classification

Financial evidence can be classified as:

- `observed`
- `user_entered`
- `formula_derived`
- `projected`
- `ambiguous`
- `missing`

Safety behavior:

- Formula-derived value is not collapsed into literal truth.
- `New Balance` formula referencing a future projected balance is classified as projected.
- Projected/future balances do not become confirmed opening BalanceSnapshots.
- Best current balance prefers observed/user-entered evidence over formula/projection.
- If no safe current balance exists, candidate balance is unresolved.

## 9. Temporal Intelligence

Implemented:

- Month-named sheet detection.
- Month-named balance header detection.
- Formula/header signals that classify future-looking `New Balance` / December references as projected.

Deliberate limit:

- DATA-1A does not overclaim exact recency from workbook month names alone.
- It does not simply assume "current month sheet = truth."

## 10. Synthetic Household Workbook

Synthetic fixture is generated in tests, not committed as a private workbook.

Required sheets covered:

- January through December.
- Balance Tracker.
- Bank Holidays.

Synthetic structure includes:

- credit cards
- student loans
- line of credit
- business debt
- ordinary utilities/bills
- insurance
- subscriptions
- groceries
- owner labels
- missing balances
- unknown APR
- formula-linked monthly balances
- future projections
- same-creditor distinct accounts

Automated expectations proven:

- Balance Tracker outranks January.
- Bank Holidays is irrelevant.
- Monthly duplicates consolidate.
- Ordinary bills are ignored.
- Capital One-like debt is detected.
- Firstmark-like student loan is detected with missing information.
- Business debt is flagged and excluded from household payoff by default.
- Owner text is suggestion only.
- Formula-derived future balance remains non-authoritative.
- Chase Freedom and Chase Sapphire remain separate by safe last-4.
- Multiple APR values survive as review evidence.

Representative synthetic result:

| Metric | Result |
| --- | --- |
| Sheets analyzed | 14 |
| Ordinary bill rows ignored | 48+ in focused fixture |
| Capital One candidates | 1 consolidated candidate |
| Firstmark candidate | likely debt, balance unresolved |
| Business candidates | flagged with `business_candidate` |
| Same-creditor Chase cards | preserved as separate accounts |

## 11. Compatibility

Clean XLSX:

- `Creditor | Balance | APR | Minimum Payment` still produces a candidate.

CSV:

- Existing CSV parsing and normalization tests still pass.
- CSV remains row-based because it has no workbook topology/formulas.

Human approval:

- No candidate creates a Debt until explicit confirmation.
- No authoritative BalanceSnapshot is created before import commit.
- No PaymentEvent is fabricated.
- Import commit remains atomic Debt + opening BalanceSnapshot.

## 12. Browser QA

Blocked in this session.

Findings:

- In-app/browser connector was unavailable.
- Chrome/Edge headless binaries were not available.
- Firefox exists locally, but without a browser-control driver it can only provide crude screenshots and cannot perform upload/review QA.
- Playwright/Puppeteer are not installed in the repo, and no new dependency was added just for this QA pass.

Therefore the required local browser upload QA cases remain open:

- clean spreadsheet
- synthetic realistic household workbook
- ambiguous workbook
- workbook with no Debt
- malformed/unsupported workbook

The parser behavior for those workbook classes is covered by unit tests where practical, but the actual browser upload flow was not completed.

## 13. Performance

Synthetic performance smoke:

- 14 sheets.
- 200 rows per sheet.
- 2,800-ish rows scanned.
- Runtime: about 590 ms in Node on this machine.

Complexity guardrails:

- Sheet count is capped at 60.
- Per-sheet row scan is capped at 500 rows.
- Per-sheet column scan is capped at 80 columns.
- Header regions are bounded.

No browser lockup could be validated because browser QA was blocked.

## 14. Validation

| Check | Result |
| --- | --- |
| Focused workbook/import tests | Passed, 4 files / 36 tests |
| Full unit suite | Passed, 28 files / 344 tests |
| `npm run lint` | Passed with same 3 existing hook warnings |
| `npm run build` | Passed with existing large-chunk warning |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |
| `npm run test:firestore` | Passed, 12/12 |
| `npm run test:firestore:v2` | Passed; 47 tests against production-parity and reference rules, parity guard passed |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency.

## 15. Production Safety

- Production touched: **NO**
- Deployed: **NO**
- Production migration: **NO**
- Production Firebase writes: **NO**
- Production backfills: **NO**
- Rules deployed: **NO**
- Private financial workbook committed: **NO**

## 16. Remaining Blockers

DATA-1A is not fully gate-complete until browser upload QA is performed with an available browser automation surface.

Open item:

1. Run local browser QA for spreadsheet upload/review flow using:
   - clean spreadsheet
   - synthetic realistic household workbook
   - ambiguous workbook
   - workbook with no Debt
   - malformed/unsupported workbook

## 17. Backlog / Follow-up

- DATA-1B: existing Debt reconciliation.
- More nuanced temporal recency scoring once real user examples are available.
- Import Review UX copy using `classificationEvidence`.
- Optional parser telemetry for sheet/candidate counts only.
- More business-scope review UI.
- More formula-lineage depth for complex chained formulas.

## 18. Conclusion

NOT READY — DATA-1A STILL OPEN.

Reason: implementation and automated validation are complete, but required local browser upload QA could not be completed in this session.

