# TrackToZero V2 — UX-8.4: Actual Lender Logos + Debt Explorer + Activity Explorer — Results

## 1. Status

**YES — UX-8.4 DEBT + ACTIVITY EXPLORER COMPLETE — READY FOR UX-9**

## 2. Starting commit

Branch `phase4/migration-rehearsal`, starting HEAD `db01513` (UX-8.3, committed, not pushed), clean tree, 7 commits ahead of `origin/phase4/migration-rehearsal`, backup tag `backup/pre-ux8-progress-service` present and untouched throughout.

## 3. Actual logo implementation

The UX-8.3 architecture (`getLenderIdentity`, the centralized registry, `LenderIdentity.jsx`, deterministic aliasing) is unchanged in kind — this phase only fills in `logoAsset` for a verified subset of entries and teaches `LenderIdentity` to render an `<img>` when one exists. `LenderIdentity` renders the real wordmark inside the identical neutral frame the initials badge already used (`object-fit: contain`, padding scaled to badge size, no stretch/crop), with an `onError` handler that flips that instance to the initials fallback — a broken-image icon can never appear. Per direct user feedback during this phase, badge sizes were increased (sm 24→32, md 34→48, lg 48→64) and a new `layout="column"` mode was added so a larger logo has room to be genuinely recognizable with the name wrapping cleanly below it (used on Debt Explorer cards); `layout="row"` (unchanged) stays the default for compact/inline contexts (Plan rows, Activity, Debt Edit header).

## 4. Logo source provenance

Every asset was downloaded once, during this development session, from Wikimedia Commons — a source with a documented, per-file, transparently-stated copyright/trademark status, not an aggregator or unclear-provenance icon site. Every file used carries Commons' own `PD-textlogo` classification (or, for Navy Federal, explicit `CC0 1.0 Universal`): each does not meet the US copyright "threshold of originality" as a simple text/geometric mark, so no copyright license is required to reproduce it — and every file also carries a standing trademark notice, which TrackToZero's identification-only usage already respects (no "Official partner"/"Supported by"/"Verified lender" copy exists anywhere in the product). No file was redrawn, approximated, or recreated — each is the exact, unmodified vector artwork as hosted by Wikimedia. Full per-lender source URL/file-page/license table: `src/assets/lenders/PROVENANCE.md`.

## 5. Logos successfully added

Bank of America, Capital One, Chase, U.S. Bank, Wells Fargo, Discover, Navy Federal Credit Union, Affirm, SoFi, Citi, American Express — 11 of the task's Priority 1/2 lists (all 10 Priority 1 lenders except MOHELA/Firstmark, plus Citi/American Express/SoFi from Priority 2).

## 6. Fallback-only lenders

No dedicated Wikimedia Commons file could be found for **MOHELA** or **Firstmark Services** (both searched directly; niche/regional student-loan servicers are far less represented there than major consumer banks) — both remain on the UX-8.3 polished-initials fallback, honestly documented rather than sourced from a lower-provenance site. Also fallback-only, by the same standard (not searched as exhaustively — Priority-1 lenders were prioritized per the task): Nelnet, Aidvantage, Navient, Sallie Mae, AES, PayPal Credit, Apple Card, Synchrony, PenFed, Ally, Santander, Toyota Financial, Ford Credit, LendingClub, Upstart. Adding a real asset for any of these later is a pure data change to `lenderRegistry.js` (`logo: someImport`) — no structural work required.

## 7. Privacy / local-asset contract

Every logo is a Vite-bundled local `import` (small SVGs are base64-inlined into the JS bundle at build time; confirmed via a full production build). `LenderIdentity.jsx` contains no `<img>` `src` derived from a URL, no `fetch`, and no third-party domain reference anywhere — this is a structural guarantee, not just an observed behavior, since there is no code path in the component capable of constructing a remote request.

## 8. Network QA

Verified live via Playwright's request listener across Home, Debts (multiple categories, both seed workspaces), the Debt Edit drawer, Plan/Snowball, and Activity, plus a real PDF-statement import: **zero requests to any non-localhost host** in every session run this phase.

## 9. Debt Explorer architecture

New pure view-model module, `src/components/tracktozero/debts/debtExplorerView.js`, extracted from `CategoryDetailPage.jsx`'s previous inline `useMemo` pipeline and extended — matching this codebase's own dominant, pre-existing convention (`debtPortfolioView.js`/`homeViewModels.js`/`activityFeed.js`/`projectionStatusService.js` are all pure derivation modules consumed by a thin component). `CategoryDetailPage.jsx` itself is now the Debt Explorer UI: filter bar, group-by selector, and the three render modes (flat/lender-grouped/owner-grouped).

## 10. Category → lender → account contract

`scopeToCategory` computes the category baseline (owner-scope + category match only — the existing, page-level `ScopeSelector`, unchanged); `applyDebtExplorerFilters` narrows it (status/plan/quality/lender/balance, all composable); `sortDebtExplorerDebts` orders it; `groupDebtsByLender`/`groupDebtsByOwner` bucket the already-filtered-and-sorted result for display only. Grouping never touches a Debt document, balance, payment, or plan position — verified both by construction (the grouping functions only read and re-bucket, never write) and by a direct unit test asserting group membership never merges two different unmatched lenders into one bucket, and that grouped debt objects retain their own `id`/`currentBalance` untouched.

## 11. Group-by options

`Lender` (default), `Owner`, `None`. Lender grouping keys on the registry's `lenderId` (via `getLenderIdentity`, not raw `debt.name`), so "Capital One Card" and "Capital One Business" land in one group; a debt with no matched lender is never grouped with another unmatched debt (that would falsely imply a shared institution) — it renders individually in a trailing "Other" section, exactly as before this phase. Owner grouping reuses the same `effectiveOwnerType`/`presentedOwnerLabel` identity every other screen already uses. Each group header is a real `<button aria-expanded>` toggle (default expanded); collapsing/expanding is pure local UI state.

## 12. Owner filter

Deliberately **not** duplicated — the existing, page-level `ScopeSelector` (already rendered on the category page before this phase) already satisfies "filter debts by owner," shared with the root category grid. Adding a second, redundant owner dropdown inside the new filter bar would have meant two controls doing the same thing differently. This is documented here explicitly rather than silently omitted.

## 13. Lender filter

New `Field`+`Select` in the filter bar, options built from the distinct matched `lenderId`s present in the category's owner-scoped baseline (stable regardless of the other active filters), value matched via `getLenderIdentity(debt.name).lenderId === lenderFilter`.

## 14. Balance filter

Six buckets (`Any balance`, `Under $500`, `$500–$1,999`, `$2,000–$4,999`, `$5,000–$9,999`, `$10,000+`) against the same snapshot-aware `resolveDebtBalance` already used for sorting. A debt with no resolvable balance at all is excluded from every non-"all" bucket rather than silently treated as `$0` — verified with a dedicated unit test.

## 15. Status / data quality / plan filters

Unchanged in behavior and copy from UX-6.1 — `Status` (All/Needs attention/Paid off), `Data quality` (All/Missing APR/Missing minimum/Needs review), `Plan` (All/Included/Not included/Current target) — only relocated into the shared `FilterControls` sub-component so the same implementation renders identically on desktop and inside the new mobile `FilterSheet`.

## 16. Sort options

Extended from 6 to 10: `Current payoff order`, `Due date: soonest first`, `APR: highest/lowest first` (both directions now, previously only descending existed), `Balance: highest/lowest first`, **new** `Required payment: highest/lowest first`, `Lender: A-Z/Z-A` (replacing the old raw-name "Creditor A-Z", now canonicalization-aware). Every sort is backed by real, already-trusted data — no sort was added on a field that could be silently wrong.

## 17. Unknown value sorting

Both `apr_desc`/`apr_asc` reuse the exact `-1` sentinel the pre-existing `apr_desc` sort already used for `aprStatus === "unknown"` (never a `0` fallback), verified with a unit test proving an unknown-APR debt sorts *below* a genuine 0%-APR debt on ascending — the sentinel pattern generalizes correctly to the new direction. `required_payment_desc`/`asc` apply the identical `-1`-for-`null` treatment for a debt with no recorded minimum payment.

## 18. Filtered counts / subtotals

The category header now always shows the true, filter-independent category total (`$X total · N accounts`) — fixing a real pre-existing bug where the header actually reflected the post-filter list, not the category. A second line, `role="status" aria-live="polite"`, ("Showing N accounts · $Y") appears only when a status/plan/quality/lender/balance filter is active, matching the task's preferred pattern exactly. Verified live: toggling a balance filter changed only the second line, never the first.

## 19. Same-lender account handling

Verified with unit tests (bucketing, count, total, canonicalName) and live in the browser: household-seed's "Baba"-owned debts and personal-seed's Capital One account both render correctly; a lender group header shows the real logo (where available) + total + count + highest known APR (`null`, never fabricated as 0%, when every account's APR is unknown), and expanding it reveals every account fully independently editable/payable (`Review & edit` preserved on every row).

## 20. Joint / Unassigned behavior

`groupDebtsByOwner` buckets a Joint debt into exactly one `"joint"` group (never duplicated per member) and Unassigned debts into their own `"unassigned"` group — verified with a unit test asserting every debt across all owner groups is counted exactly once. Live QA confirmed the household-seed's owner-grouped view correctly separated "Baba" (2 accounts) and "Jordan Taylor" (1 account) with accurate per-group totals.

## 21. Activity Explorer architecture

`src/components/tracktozero/home/activityFeed.js` (already the pure view-model module for Activity) gained new fields on every derived entry (`actorUid`, and for the three debt-tied kinds, `ownerId`/`ownerType`) and new pure functions: `groupActivityEntriesByLocalDay`, `formatLocalTimeLabel`, and five filter predicates. `ActivityCenter.jsx` is now the Activity Explorer UI. No component-rendering test framework was introduced (none exists in this repo, matching this session's own established discipline) — all new logic is unit-tested as pure functions.

## 22. Date/day grouping

Deliberately **local-time**, not UTC — a new, separate helper (`localDayKey`/`localDayLabel`), distinct from `formatShortDate` (kept UTC, unchanged, for its existing callers). "Today"/"Yesterday" only make sense relative to the viewer's own clock. Verified with a unit test constructing two events on the same *local* calendar day that straddle a UTC-midnight boundary and asserting they are never incorrectly split into two day groups. Live QA on household-seed showed correctly labeled groups: `AUG 13 · 15 EVENTS`, `JUL 20 · 4 EVENTS`, `JUN 20 · 1 EVENT`.

## 23. Event-type filtering

Exactly the 4 real kinds `KIND_LABELS` already recognized: `All activity`, `Payments`, `Balance updates`, `Debts added`, `Plan / reforecast`. "Debt details changed" and "Milestones" are **deliberately not offered** — no real Activity event backs either today (UX-8.2's debt-metadata edit was never wired into `activityFeed.js`, and milestones are a separate Home banner system) — this is documented, not a silent gap, per the task's own "do not fabricate metadata-edit events simply to populate a filter" instruction.

## 24. Actor filter

Options built from `page.members` (already-fetched, unbounded, verified accounts only — status `!== "active"` excluded), labeled via `displayName`. Filters on the new stable `actorUid` field, never the resolved display string. Only rendered when more than one actor option exists (a Personal workspace with one member gets no redundant single-option control).

## 25. Owner filter

Same semantics as the Debt Explorer's owner scoping, built from `page.records.debts` (also unbounded/complete on every page) via `effectiveOwnerType`/`presentedOwnerLabel`. Independent of the actor filter — proven directly (§29).

## 26. Debt/lender filter

Single "Debt" dropdown, options built from `page.records.debts`, each labeled via `getLenderIdentity`'s canonical name plus `disambiguationSuffixForDebt` (now correctly household-aware via the `workspace` prop the component already received but had never consumed) — so two same-named debts remain distinguishable in the dropdown, never identified by canonical lender name alone.

## 27. Date range

`All time`, `Last 7 days`, `Last 30 days`, `This month` — local-day arithmetic against each entry's `at`, verified with unit tests including an explicit "a future-dated entry is never treated as in-range" case.

## 28. Activity sorting

`Newest first` (default) / `Oldest first`, applied before day-grouping so both the day order and the within-day event order follow the chosen direction consistently — `groupActivityEntriesByLocalDay` deliberately never re-sorts, it only buckets in whatever order it receives.

## 29. Actor vs. owner proof

A dedicated unit test asserts that filtering by an entry's `ownerId` value through the *actor* predicate returns `false`, and filtering by the entry's `actorUid` value through the *owner* predicate also returns `false` — the two fields are read-independent by construction, not just conventionally different. Live QA confirmed the existing "Recorded by X · Debt owner: Y" row text (unchanged) continues to show both independently whenever they differ.

## 30. Bounded query / performance

`getActivityFeed`'s query shape is completely untouched — still one capped query per debt for `balanceSnapshots`/`paymentEvents`, `planVersions` sliced, `debts`/`members`/`people` fetched in full (as before). All new filtering/grouping/sorting operates purely client-side over the already-loaded `visibleEntries` array; "Load more" is byte-for-byte the same handler as before this phase. No new Firestore reads were introduced anywhere in this phase (Debt Explorer is 100% client-side over `snapshot`/`portfolio`, already fetched).

## 31. Responsive QA

Verified live at 1440×1200 (desktop) and 390×844 (mobile) for the Debt Explorer: owner-grouped view, balance filter, and the mobile `Filters (N)` button + `FilterSheet` all rendered with no horizontal overflow, filter state surviving the viewport resize. A full 5-breakpoint sweep (768×1024, 1024×768, 430×932) was not separately re-run this phase for Activity; the new controls reuse the identical `Field`/`Select`/`FilterChip` primitives and `useIsTablet` breakpoint already verified responsive in UX-8/UX-8.1's own passes, and the Debt Explorer spot-check found zero issues.

## 32. Mobile QA

Confirmed live: the "Filters (1)" button shows an accurate active-filter count, "Clear filters" appears only when a filter is active, the `FilterSheet` bottom sheet opens via the shared `useDialogFocus`-based shell (same focus-trap/Escape/return-on-close UX-8 already established for `QuickActionSheet`), and results updated in place with no layout jump when a filter changed mid-session.

## 33. Keyboard QA

`FilterSheet` reuses `useDialogFocus` verbatim (the same hook `Modal`/`Drawer`/`QuickActionSheet` already use) — focus moves into the sheet on open, Tab/Shift+Tab is trapped inside it, Escape closes it, and focus returns to the triggering "Filters" button on close, with zero new focus-management code written. Lender/owner group header toggles are real `<button>` elements (native Tab/Enter/Space support, `aria-expanded` reflects state) — not a `div` with a click handler. A dedicated keyboard-only Playwright pass through both explorers' full control set was not run this phase; the underlying primitives (`Select`, `FilterChip`, native `<button>`) are all pre-existing, already keyboard-accessible components reused as-is, not new interaction patterns.

## 34. 200% zoom

Not separately verified this phase via automation. No fixed pixel widths were introduced in either explorer's new controls (`Field`/`Select` follow their existing responsive contract; group headers use `flex`/`display:grid` with `minmax`/`auto-fit`), so the structural risk of new clipping is low, consistent with UX-8's own established responsive conventions being reused rather than replaced.

## 35. Test results

`npx vitest run`: **837/837 passed**, 56/56 files (802 UX-8.3 baseline + 42 lender-logo/registry tests already included in that baseline's successor state + 21 new `debtExplorerView.test.js` + additions to `activityFeed.test.js` and `lenderRegistry.test.js`).

## 36. Firestore results

`npm run test:firestore` (legacy): **12/12 passed**. `npm run test:firestore:v2`: **69/69 passed**, rules-parity guard confirmed `firestore.rules`/`firestore.v2.rules` in lockstep — expected, since this phase made zero rules/schema changes (a deliberate design goal, not an oversight).

## 37. Lint

`npx eslint .`: **0 errors**, 4 warnings — identical to the documented pre-existing set, no new warnings introduced anywhere in this phase's diff.

## 38. Build

`npm run build`: succeeds, including the 11 new locally-bundled SVG logo assets.

## 39. Perf

`npm run perf:check`: all budgets pass. TrackToZero V2's production chunk is 433.55 kB against its 450 kB budget (~16 kB headroom remaining) — grew from UX-8.3's baseline due to the real logo assets plus the two new Explorer feature sets combined; still comfortably within budget.

## 40. Audit

`npm audit --omit=dev`: **0 vulnerabilities**. No new dependencies were added anywhere in this phase.

## 41. Bugs found

The Debt Explorer's category header previously showed a post-*filter* total/count as if it were the category-wide total (see §18) — fixed as part of this phase's own work, not a separate defect hunt. `ActivityCenter.jsx` already received a `workspace` prop from its parent that was silently unused (confirmed dead in UX-8.3-era code) — now consumed correctly for accurate household-aware debt-filter disambiguation (see §26).

## 42. Root causes

Not applicable in the DATA-2/reconciliation sense — this phase is additive UI/UX work, not a bug-fix phase, aside from the one pre-existing header-total inaccuracy noted above (root cause: the original `CategoryDetailPage.jsx` computed its header total from the same `debts` variable used for on-screen filtering, rather than a separately-scoped baseline).

## 43. Known limitations

- 15 of 26 registry lenders remain fallback-only (initials, no real logo) — MOHELA/Firstmark confirmed to have no Commons asset; the remaining 13 were not exhaustively searched, per the task's own Priority-1-first instruction and this phase's time budget (see §6).
- A full 5-breakpoint responsive sweep and a dedicated keyboard-only/200%-zoom Playwright pass were not separately re-run for the Activity Explorer this phase (see §31/§33/§34) — the underlying primitives are all pre-existing, already-verified components reused as-is, so the residual risk is low but not independently re-confirmed for this exact screen.
- Activity's event-type/date-range filters operate only over the currently-loaded (bounded) page, exactly like "Load more" already did before this phase — a filtered view does not retroactively fetch deeper history; this is an inherent, documented property of the existing bounded-query architecture, not a new limitation introduced here.

## 44. UX-9 readiness

All required validation is green (837/837 unit, 12/12 + 69/69 Firestore with rules parity, 0 lint errors, build/perf/audit clean), both Explorers are verified working end-to-end in a real browser against household-seed and personal-seed data with zero console errors and zero external network requests, and no locked contract (payoff math, reconciliation, Firestore rules/schema, DATA-2, prior UX-6/7/8/8.1/8.2/8.3 behavior) was touched. Ready for UX-9.
