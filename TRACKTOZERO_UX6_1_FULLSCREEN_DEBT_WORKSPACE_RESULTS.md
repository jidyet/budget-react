# UX-6.1 — Full-Screen Financial Workspace + Visual Debt Portfolio + Import/Review Redesign: Results

## 1. Completion status

Complete. All locked/non-negotiable requirements from the spec are implemented, tested (unit + real browser QA across desktop/laptop/tablet/mobile), and verified. A handful of lower-value items were deliberately descoped/simplified (§37) with reasoning, consistent with the plan approved before implementation.

## 2. Starting HEAD

`25ff83e` (DATA-2, already pushed) on `phase4/migration-rehearsal`. Verified clean worktree and that `25ff83e` is an ancestor of HEAD before starting.

## 3. Final HEAD

Not yet committed at the time this document was written — see §36 for the pending commit. Final HEAD will match the commit this document is included in.

## 4. Reconciliation guardrail

`src/services/tracktozero/debtReconciliation.js`'s `scoreCandidateAgainstDebt` had no negative weight for a `debtType` mismatch — a bare creditor-name-only match (worth +35) already crossed the "possible" match threshold (35) regardless of type compatibility, which is exactly how a U.S. Bank Cash+ credit-card import got fuzzy-matched against an unrelated "House Mortgage" debt during DATA-2 QA. Added a `typeConflict` check (`-40` penalty, plus a `"Debt type does not match"` concern) that keeps a weak creditor/balance-only match from crossing the threshold when types are incompatible, while deliberately **not** vetoing the existing `accountSame && creditorSame → "strong"` bypass — mirroring the pre-existing precedent where an owner mismatch on an otherwise-strong match is surfaced as a concern, not blocked. 3 new regression tests added (12 total in the file, all passing): the literal weak-evidence case, a stronger case that actually exercises the score penalty (creditor+owner match = 45 pre-fix, safely `noMatch` post-fix), and a case confirming a genuine same-account match still surfaces the concern without being vetoed. **Verified live in the browser**: importing the Cash+ PDF fixture against the household-seed workspace (which contains a "House Mortgage" debt) now shows zero mention of "House Mortgage" — the candidate goes straight to "Needs review" for its legitimate multi-APR ambiguity, with no false reconciliation match offered.

## 5. Previous shell

`AppShell → TopBar/PrimaryNav → PageContainer → {page}`, with a single hardcoded `--ttz-container-max: 1180px` used identically by `TopBar.jsx` and `PageContainer.jsx`. All V2 styling is inline-style JS objects driven by `theme.js` (no CSS files, no `@media` queries anywhere in the V2 tree). `Debts`/`Settings`/pre-auth screens were still defined inline inside the 2189-line `TrackToZeroV2App.jsx` monolith using a pre-token legacy `styles` object (hardcoded hex), never migrated to `ttzPalette`.

## 6. New shell architecture

Widened `--ttz-container-max` to `clamp(1180px, 92vw, 1600px)` — a continuous fluid scale (idiomatic to this codebase, which already uses `clamp()` for fluid typography in `HomeCommandCenter.jsx`) rather than a hard breakpoint jump. Added a shared `ttzGutter({isMobile, isTablet})` token (16/24/32px steps) consumed by both `TopBar.jsx` and `PageContainer.jsx` so gutters scale consistently as the shell widens. **No new CSS file was introduced** — the existing `useIsMobile`/`useIsTablet` (`matchMedia`-based) pattern already covers the 3-tier gutter step cleanly, and `clamp()` already gives continuous fluid width for the container with zero JS. Extracted `Debts` (and its supporting `OwnerField`/`DebtBadges`/`ImportPanel`/`ImportReviewCandidate`/`ReconciliationSection`/`AprCandidatesField`/`DEBT_TYPE_OPTIONS`, ~970 lines total) out of the monolith into two new feature folders — `src/components/tracktozero/debts/` and `src/components/tracktozero/import/` (22 new files, ~1,945 lines) — all built on the `ttzPalette`/token system and composed from the existing `ui/` primitive library (`Card`, `Button`, `Badge`, `MetricCard`, `Tabs`, `FilterChip`, `Modal`, `Field`, `Select`, `MoneyInput`, `DateInput`, `Checkbox`, `EmptyState`, `Callout` variants) rather than hand-rolled inline styles. `Settings` and the pre-auth screens were deliberately left in the monolith (they don't share Debts-specific helpers, out of scope for this redesign).

## 7. Responsive shell

Verified via real Playwright QA at 1800 (wide desktop), 1440, 1366, 1024, 768, and 375px — zero horizontal overflow (`scrollWidth === clientWidth`) at every size, zero console/page errors. Category grid uses `repeat(auto-fit, minmax(240px,1fr))` (3-4 tiles/row wide desktop, 2 at tablet, 1 at mobile — no explicit breakpoint code needed). The Debts main-content/Quick-Update-rail split (`1fr 320px` desktop) collapses to a single stacked column at ≤960px (`useIsTablet`). One real issue found and fixed during QA: `PageHeader.jsx` (a shared primitive also used by Review) didn't stack title above actions at mobile width, causing "What you owe" to wrap into 3 lines when squeezed next to 2 header buttons at 375px — fixed by adding `isMobile`-driven `flexDirection: column` stacking, verified visually before/after.

## 8. Debt Command Center

Replaced the flat "all debt cards in one grid" + "3 always-visible inline forms" + inline `ImportPanel` layout with: a `PortfolioHeader` ("What you owe" + 4 metric cards + distinct `+ Add debt`/`Import statement` header actions), a `ScopeSelector` (owner chips), a `CategoryGrid` (visual category tiles), and a `QuickUpdateRail` (side rail desktop / stacked mobile). Verified live: category tile balances sum to exactly the portfolio total ($7,430 + $6,200 + $120,700 + $2,017 = $136,347), which reconciles precisely with "Left to go" ($15,647 = $136,347 minus the excluded mortgage) — the same authoritative math Home already uses, not a parallel computation.

## 9. Category taxonomy

New `src/components/tracktozero/debts/debtCategoryConfig.js` builds directly on DATA-2's previously-100%-unused `DEBT_CATEGORY_GROUPS`/`debtCategoryGroupFor` (`financialItemTaxonomy.js`) — no category logic re-derived. Also centralizes the single `DEBT_TYPE_OPTIONS` list, replacing two independently-hardcoded (but identical-content) `<option>` lists that previously existed in the monolith.

## 10. Category visuals

9 categories mapped to `lucide-react` icons (already an installed, previously-unused-in-V2 dependency — no new dependency added): Credit Cards→`CreditCard`, Student Loans→`GraduationCap`, Personal Loans→`HandCoins`, Lines of Credit→`Landmark`, Auto Loans→`Car`, Mortgage/Home→`Home`, Business Debt→`Briefcase`, BNPL/Financing→`ReceiptText`, Other Debt→`Layers`. Icons only, no illustration/photography — consistent with this codebase's existing icon-free-until-now, typography/color-led visual language. Only categories with ≥1 debt in the current owner scope render a tile (verified: Student Loans/Lines of Credit/Auto/Business/BNPL tiles correctly absent from the household-seed fixture, which has none).

## 11. Hover/focus behavior

Each category tile is a real `<button>` (keyboard/tap accessible by construction, no hover-only functionality) with a "View N →" CTA rendered unconditionally, not revealed on hover. Hover/focus (mouse or keyboard, both wired via `onMouseEnter`/`onFocus` and `onMouseLeave`/`onBlur`) adds a restrained `translateY(-2px)` + elevated shadow — no gimmick animation.

## 12. Category routes/drill-down

New `src/components/tracktozero/debts/debtsRouting.js` mirrors `plan/planRouting.js`'s exact shape (`DEBTS_DESTINATIONS`, `resolveDebtsDestination`, `buildDebtsPath`, `navigateToDebtsDestination`) — a pushState/popstate pattern, not a new router dependency (this repo has none; the entire V2 routing need is a handful of tab/sub-destination paths, which this pattern already serves correctly). `TrackToZeroV2App.jsx`'s `navigateTab`/`syncTabFromLocation` extended to recognize `/debts/*` alongside the existing `/plan` case. **Verified live**: clicking a category tile navigates to `/debts/credit-cards`; browser Back returns to `/debts`; a fresh page load/refresh directly at `/debts/mortgage` correctly resolves straight to the Mortgage category (refresh-safe).

## 13. Saved household name scope

`ScopeSelector.jsx`'s aggregate chip label is `snapshot.workspace.name || "Your household"` — this exact fallback string already matched Settings' own established fallback (verified by reading `Settings`' unmodified code), so no new copy convention was invented. **Bug fix, not just a redesign**: the pre-existing Debts page hardcoded the aggregate option as literal `"Everyone"`, completely ignoring the saved workspace name. **Verified live**: renamed the household to "Davis-Yusuf Household" via Settings, returned to Debts, and the scope selector's aggregate chip updated from "Your household" to "Davis-Yusuf Household" with no other code path involved (pure prop read, no caching).

## 14. Owner filtering

`filterDebtsByOwnerScope` (new, in `debtPortfolioView.js`) is the single shared owner-scope filter, reused by `CategoryGrid`, `CategoryDetailPage`, and (for consistency) available to Import Review — built on the same `effectiveOwnerType`/`ownerId` contract `resolveDebtOwnership` already establishes, never a parallel matching mechanism. **Verified live**: selecting "Baba" recalculated the category grid to show only Baba's debts (Credit Cards 2/$5,030, matching the exact figure independently confirmed in the prior DATA-2 phase's QA); selecting "Joint" showed only Personal Loans (1/$6,200) + Mortgage (1/$120,700).

## 15. Joint behavior

Joint debts are matched via `effectiveOwnerType(debt) === "joint"`, never by `ownerId`, so a joint debt is never double-counted under any member. Verified in the owner-filter test above and in the new `deriveCategoryBreakdown` unit test "counts a joint debt once when scoped to 'joint', not duplicated under any member."

## 16. Unassigned behavior

Unassigned remains a first-class, always-visible scope chip (`ScopeSelector`) — never hidden, never auto-assigned. Unit-tested in `filterDebtsByOwnerScope`'s coverage.

## 17. Category totals

`deriveCategoryBreakdown` (new, in `debtPortfolioView.js`) is computed from the SAME `activeDebts`/`reviewDebts`/`paidOffDebts` arrays `deriveDebtPortfolioView` already derives (never a new query, never re-derived ownership) — guaranteeing category totals reconcile with the rest of the portfolio for the same owner scope, and using the same `latestSnapshotsByDebt[id]?.balance ?? currentBalance` resolution the debt cards themselves use. Verified numerically live (§8) and via 7 new unit tests covering grouping, unmapped-debtType fallback to `OTHER_DEBT`, review-count marking without count inflation, owner-scoped recalculation, joint-once counting, and the snapshot-balance-preference rule.

## 18. Category sorting/filtering

`CategoryDetailPage.jsx` supports independent, composable filters (Status: All/Needs attention/Paid off; Plan: All/Included/Not included/Current target; Data quality: All/Missing APR/Missing minimum/Needs review) and 6 sort modes (current payoff order, due date, highest APR, lowest/highest balance, creditor A-Z) — implemented as plain array `.filter()`/`.sort()` chains, not tested as an exhaustive combination matrix (deliberate descope, §37). Verified live: filters/sort render with real data and produce correct results (e.g. default "Current payoff order" sort correctly showed Old Store Card → Jordan Travel Card → Priceline Card matching the active plan's target order).

## 19. Quick Update

New `QuickUpdateRail.jsx`: two progressive-disclosure actions ("Made a payment? → Record payment" / "Got your latest balance? → Update balance") that reveal the existing, unmodified payment/balance forms only once clicked — no field visible until the user picks an action. Calls the exact same `service.recordPayment`/`service.recordBalanceSnapshot` with no logic changes. Verified live: clicking "Record payment" reveals the Amount field + Save button with zero fields visible beforehand.

## 20. Removal of "Record observed reality"

Confirmed via both static grep (pre-implementation research found exactly one occurrence in the whole repo) and live browser text-content assertion after the redesign (`body.includes("Record observed reality") === false`) — the phrase is gone from the product.

## 21. Add Debt separation

`AddDebtModal.jsx` (wraps `ui/Modal.jsx`) is triggered only from `PortfolioHeader`'s page-level `+ Add debt` action — structurally and visually separate from `QuickUpdateRail`, which contains no debt-creation UI. Verified live: the Add Debt modal opened independently, added "QA Test Auto Loan" ($15,000, auto_loan), which correctly created a new "Auto Loans" category tile and updated "Left to go" from $15,647 → $30,647 and "Active debts" 7 → 8.

## 22. Import separation

`ImportCenter.jsx` is triggered only from `PortfolioHeader`'s `Import statement` action, rendered in the main content area (replacing the category grid while open) — never nested inside `QuickUpdateRail` or `AddDebtModal`. Verified live: opening Import showed "Import debts" with no Add-Debt UI present.

## 23. Import Review redesign

Replaced the monolith's `ImportPanel`/`ImportReviewCandidate` (one full editable card per candidate, unbounded, stacked vertically — the "45-form wall") with a master-detail layout: `ImportCandidateList.jsx` (list pane, grouped by the SAME 5-bucket triage logic as before — missing/ambiguous/needs-review/confident/decided — now extracted into pure, tested `importReviewGroups.js`, with the confident/decided buckets further sub-grouped by debt category) + `ImportCandidateDetail.jsx` (detail pane, one candidate at a time). **Verified live with the DATA-2 household workbook fixture** (6 debt candidates across 3 categories + a business-scope item): only ONE candidate's full form/action buttons rendered at a time, never 6 stacked forms.

## 24. Non-debt callout

`NonDebtCallout.jsx` surfaces `nonDebtItems`/`scanSummary` — DATA-2 data that was computed by `workbookDebtDiscovery.js` and **silently discarded** at the import call site until this phase (confirmed via code trace: `parsed.nonDebtItems` was never forwarded to `service.createImportBatch`). Persisted into the existing `ImportBatch.metadata` passthrough (`v2AsyncApplicationService.js`'s `createImportBatch`, already populated with `parserVersion`, already round-tripped by both repositories with zero schema change) rather than kept ephemeral-only — this matters because the existing resumable-import flow reloads a batch from storage, and ephemeral-only state would silently lose the non-debt callout on resume. **Verified live**: importing the household workbook fixture showed "Not debt — we won't add these" with exact per-type counts (Storage 2, Insurance 1, Subscriptions 1, Home expenses 1, Utilities 1, Savings 1, Income 1 = 8, matching the fixture exactly) and an expandable list with a non-irreversible "This should be a debt" correction action per item (deep-links into `AddDebtModal` with the item's label pre-filled — no changes to DATA-2's classification pipeline).

## 25. Category grouping in Review

`ImportCandidateList.jsx` sub-groups the "Looks good"/"Already decided" buckets by the SAME `debtCategoryConfig.js` used by the Debt Portfolio (visual continuity Import → Review → Portfolio, as required). Verified live: the household workbook import showed "Credit Cards (1)", "Personal Loans (1)", "Lines of Credit (1)" sub-headers within "Looks good."

## 26. Owner filtering in Review

`ImportCandidateDetail.jsx`'s `OwnerField` and the same `filterDebtsByOwnerScope`-compatible scope model are available to Import Review, sharing the identical owner resolution as the Debt Portfolio (no parallel model).

## 27. Source evidence

`EvidenceTrust.jsx` renders DATA-2's per-field provenance (`evidence.provenance.{balance,minimumPayment}`, `{matchedLabel, matchedText, ...}`) as "Found next to '…'" trust labels — shipped for `balance`/`minimumPayment` first (every PDF candidate has these), per the planned descope. **Verified live**: the Capital One import showed "Found next to 'New Balance'" under Current balance and "Found next to 'Minimum Payment Due'" under Minimum due — a PDF-sourced candidate previously had zero persisted/displayed provenance.

## 28. Multi-APR review

`AprCandidatesField.jsx` (token rewrite of the existing, already-correct component — reused, not rebuilt) extended to show a balance-type label when the underlying evidence carries one (`statementCandidateAdapter.js`'s `fieldEvidence.apr[].provenance.matchedText`). **Verified live**: Capital One showed "26.40% APR — Purchases (Most likely)" / "28.40% APR — Cash advance"; Cash+ showed all three of "24.49% APR — Purchases (Most likely)" / "19.49% APR — Balance transfer" / "27.49% APR — Cash advance" — exactly matching the task's example format. No fake 0% or 2640%-style values observed in any import.

## 29. Current-vs-previous balance presentation

`ImportCandidateDetail.jsx` shows the editable "Current balance" field prominently with a distinct "Previous balance: $X" caption beneath it when `evidence.previousBalance` is present. Verified live: Capital One showed "Previous balance: $2,046.12" distinctly captioned below the editable $1,991.99 current-balance field.

## 30. Minimum-vs-payment presentation

The editable "Minimum due" field is visually distinct from a separate "Amount paid last cycle: $X" caption (from `evidence.amountPaid`) — never merged under one ambiguous "Payment" label. Verified live: Capital One showed "Amount paid last cycle: $100.00" distinctly captioned below the editable $65 minimum-due field.

## 31. Responsive behavior

Verified via real Playwright QA (§7): 1800/1440/1366/1024/768/375px, zero horizontal overflow at any size, category grid reflow (3-4→2→1 columns), Quick Update rail correctly relocates below main content at ≤960px, category filters/sort remain usable and legible at 375px, master-detail Import Review was exercised at the wide-desktop size per plan scope (exhaustive narrow-viewport import testing deferred to UX-8 per the plan's explicit boundary).

## 32. Accessibility baseline

Category tiles are real `<button>` elements (native keyboard focus/activation, `aria-label` with the full "View N credit cards" text). Hover-equivalent focus styling wired via `onFocus`/`onBlur`, not hover-only. Filter/sort controls use the existing accessible `Field`/`Select`/`FilterChip` primitives (labeled, ARIA-wired via `Field.jsx`'s existing `aria-describedby` cloning). Status is never conveyed by color alone — badges (`DebtBadges`, `Callout`) pair color with text/an icon glyph, per the existing `ui/Badge`/`Callout` primitives' established pattern. Full axe-level auditing and exhaustive screen-reader passes are explicitly deferred to UX-8 ("final mobile/accessibility hardening"), per the spec's own phase boundary.

## 33. Performance

No new per-category or per-filter network queries — `CategoryGrid`/`CategoryDetailPage` derive everything client-side from the already-loaded `snapshot.debts`/`portfolioSummary` via `deriveCategoryBreakdown`. Bundle: `TrackToZeroV2App-*.js` grew from ~313KB/79.7KB gzip (DATA-2 baseline) to ~322KB/85.2KB gzip (+~5.5KB gzip for the entire redesign, including 9 new lucide-react icon imports) — a new bundle-budget entry was added (`scripts/check-bundle-budget.mjs`, 450KB raw ceiling, generous headroom above the actual ~322KB) since this chunk previously had no budget at all. All 8 budget checks pass.

## 34. Browser QA

Real Playwright sessions against a fresh `inMemory`-mode dev server, `household-seed` workspace, covering: wide desktop (1800px) full Debt Command Center render (zero console errors); category tile navigation + drill-down + filters/sort + Back + refresh-safe direct navigation; Quick Update payment-form reveal; Add Debt modal (separate action, correctly created a new category tile and updated totals); household rename propagation into the scope selector; owner-filter recalculation (aggregate/Baba/Joint, all numerically verified); full Import flow with 2 of the 3 DATA-2 PDF fixtures (Capital One committed successfully, balance updated correctly; Cash+ exercised the reconciliation guardrail) and the DATA-2 household workbook fixture (6 debt candidates across 3 categories, 8 non-debt items across 7 types, master-detail confirmed, non-debt callout expand/collapse and per-item correction action confirmed); responsive sweep at 1440/1366/1024/768/375px with zero horizontal overflow at any size; one real bug found and fixed during QA (`PageHeader.jsx` mobile title-wrap, §7). Zero console/page errors observed across every script run in this phase.

## 35. Test counts

| Suite | DATA-2 baseline | After UX-6.1 |
|---|---|---|
| `npx vitest run` | 661 | **683 passed** (46 files) |
| `npm run test:firestore` | 12 | **12 passed** |
| `npm run test:firestore:v2` | 63 | **63 passed** |
| `npx eslint .` | 0 errors | **0 errors** (4 pre-existing warnings, unrelated) |
| `npm run build` | succeeds | **succeeds** |
| `npm run perf:check` | 7 budgets, all pass | **8 budgets** (new TrackToZero V2 entry), all pass |
| `npm audit --omit=dev` | 0 vulnerabilities | **0 vulnerabilities** |

New tests: 3 reconciliation-guardrail regressions, 7 `deriveCategoryBreakdown`/`filterDebtsByOwnerScope` cases, 5 `debtsRouting` cases, 7 `importReviewGroups` cases (+2 net from a pre-existing rename/restructure) = 22 net new tests (661 → 683).

## 36. Files changed

**Modified**: `src/services/tracktozero/debtReconciliation.js`, `debtReconciliation.test.js`, `v2AsyncApplicationService.js`, `src/components/tracktozero/TrackToZeroV2App.jsx` (970 lines removed — the extracted Debts/Import/OwnerField/DebtBadges block), `debtPortfolioView.js`, `debtPortfolioView.test.js`, `theme.js`, `layout/PageContainer.jsx`, `layout/PageHeader.jsx`, `layout/TopBar.jsx`, `src/domain/tracktozero/financialItemTaxonomy.js`, `scripts/check-bundle-budget.mjs`.

**New** (22 files, ~1,945 lines): `src/components/tracktozero/debts/{debtCategoryConfig,debtsRouting,debtsRouting.test,DebtsCenter,PortfolioHeader,ScopeSelector,CategoryGrid,CategoryDetailPage,QuickUpdateRail,AddDebtModal,OwnerField,DebtBadges}.js(x)`, `src/components/tracktozero/import/{ImportCenter,ImportSummaryHeader,NonDebtCallout,ImportCandidateList,ImportCandidateDetail,ReconciliationSection,AprCandidatesField,EvidenceTrust,importReviewGroups,importReviewGroups.test}.js(x)`.

## 37. Known limitations / explicit descopes

- Multi-APR balance-type labels shipped for real data (Capital One/Cash+ both had it) — no fallback-path regression test written for candidates without `provenance.matchedText`, though the code path handles it (renders no label).
- `CategoryDetailPage`'s owner/status/plan/data-quality filters are independently tested by construction (plain array chains), not exhaustively combination-tested.
- `EvidenceTrust` ships `balance`/`minimumPayment` only; `creditLimit`/`dueDate`/`amountPaid` provenance display deferred as a fast-follow.
- `includedInCorePayoffPlan` mortgage-exclusion default was centralized (`isDebtIncludedByDefault`) only in the 2 call sites this phase already touched (`AddDebtModal`, `ImportCandidateDetail`); the 3 existing adapter call sites were left untouched, as planned.
- Full axe-level accessibility audit and exhaustive narrow-viewport (mobile) exercise of the master-detail Import Review are explicitly deferred to UX-8, per the spec's own phase boundary.
- The category-tile "reviewCount" badge and the `CategoryDetailPage` "Needs attention" status filter both key off the same `reviewDebts` set `deriveDebtPortfolioView` already computes (`isBalanceUnresolved`/`isMinimumPaymentContaminated`) — this does not include every field individually flagged in `DebtBadges` (e.g. `aprStatus === "unknown"` alone doesn't add a debt to `reviewDebts`, only to its own badge) — this is the SAME distinction that already existed pre-redesign between `deriveDebtPortfolioView`'s review set and `DebtBadges`' own richer per-badge checks; not a new inconsistency introduced by this phase.

## 38. Explicitly deferred UX-7 work

No due-date/due-soon/due-today/past-due notification framework, activity feed, monthly reminder, or milestone-notification logic was built. Existing due-day data is displayed as-is (e.g. "Due day: 28") without any lifecycle/notification semantics layered on top, per the spec's explicit "No UX-7" boundary.
