# UX-7 — Home Command Center 2.0 + Activity + Milestones + Retention Loop — Results

## 1. Status

**YES — UX-7 HOME COMMAND CENTER + RETENTION LOOP COMPLETE**

## 2. Starting commit / branch

Branch `phase4/migration-rehearsal`, starting HEAD `2f98f6a` (SEC-INVITE + REVIEW-2 + UX-6.2, already committed, not pushed). Worktree verified clean before starting (`git status`, `git log -8 --oneline`, `git diff --check`).

## 3. Approach

Plan-mode research (2 Explore agents: current Home/nav implementation; BalanceSnapshot/PaymentEvent/PlanVersion/ExpectedCheckpoint/plan-health domain semantics) plus direct verification reads of `homeViewModels.js`, `progressService.js`, `homeMonthlyStatus.js`, `HomeCommandCenter.jsx`, `projectionStatusService.js`, `v2AsyncApplicationService.js`, and the repository layer, before writing an implementation plan and getting it approved. The single biggest finding from that research reshaped the whole Progress Truth Contract section below.

## 4. Key finding: two competing "confirmed progress" implementations existed - only one was ever real

`src/services/tracktozero/progressService.js` carries a comment claiming to be "THE single source of truth... Home... must consume this," but grep confirms it is **never imported by Home or any production code** - only by its own test file. Home has always actually used its own, different `deriveConfirmedProgress` in `homeViewModels.js`. The two models are NOT equivalent:

- `progressService.js`'s model: per-debt `debt.startingBalance` (frozen at debt creation) vs. latest snapshot, summed over whatever debts exist right now. If it were wired to Home, a newly-discovered debt would immediately dilute the aggregate confirmed percentage (its own $0-eliminated contribution grows the denominator) - **exactly the "-25% progress with no explanation" failure mode this task explicitly warned against.**
- `homeViewModels.js`'s actual model: plan-scoped, comparing `activeContext.version.startingDebtSnapshot` (frozen at last activation/reforecast) against each of those same debts' latest confirmed balance. A debt added after activation is structurally excluded from both sides until an explicit reforecast - it can never dilute or distort an already-shown percentage. This is already directly regression-tested (`"compares the SAME frozen debt set on both sides"`).

**Decision:** the already-in-production `homeViewModels.js` model is the Progress Truth Contract's foundation for this phase. `progressService.js` is left untouched, undocumented as canonical, and flagged here as a real but out-of-scope cleanup candidate (dead code masquerading as the source of truth via its own comment - worth fixing in a future phase, not this one).

## 5. Progress Truth Contract (as implemented, documented in code comments)

- **Opening baseline, with an active plan:** `activeContext.version.startingDebtSnapshot`, frozen at the plan's last activation or reforecast.
- **Latest confirmed reality:** each of those same debts' current `latestSnapshotsByDebt` balance.
- **Debt added later:** invisible to the aggregate until the user reforecasts; a reforecast re-derives `startingDebtSnapshot` from currently-eligible debts (already-existing UX-4.1 behavior, untouched), so the new debt joins at its own then-current balance as its new baseline going forward. Never silently included at $0, never retroactively distorts an already-displayed percentage.
- **Opening baseline, without an active plan:** each currently-tracked, non-archived, resolved debt's first balance-history entry vs. its last entry (`aggregateTrackedProgressWithoutPlan`) - a deliberately simpler, different mechanism appropriate to the pre-journey state, now explicitly documented as such in code.
- **Corrections:** no distinct correction semantics exist in the data model - `correctionOfId` is defined on `BalanceSnapshot`/`PaymentEvent` but never set or read anywhere in the codebase (confirmed via full-repo grep). A new snapshot simply becomes the new "latest" by `observedAt`. Building real correction UX is out of scope for this phase (descoped below); every number here stays correct as-is because it's always a live recompute, never a cached delta.
- **Fail-closed:** any debt with `isBalanceUnresolved(debt)` is excluded entirely from the aggregate - already implemented, already tested, unchanged.

## 6. Next Move - `deriveNextMove` priority chain (`homeViewModels.js`)

Expanded from 5 ad-hoc branches (previously buried as inline text inside `ThisMonthCard`) into a single deterministic, fully-ordered 9-tier chain, now rendered by a dedicated `NextMoveHero` component:

1. Blocking review item unresolved
2. Critical plan warning (`planHealth.code === "critical"`)
3. **New:** a confirmed debt not yet reflected in the active plan (`deriveDebtsAwaitingReforecast`, lifted out of `PlanSection.jsx` into `projectionStatusService.js` so Plan and Home can never compute two different answers to the same question)
4. Stale balance (`dataFreshness.isStale`, now reading the single centralized `TRACKTOZERO_STATUS_THRESHOLDS.staleBalanceDays` constant instead of a second hardcoded `45`)
5. Payment confirmation needed
6. Balance update needed after a recorded payment
7. No active plan
8. **New:** all included debts confirmed paid off (a completion-flavored message, distinct from the separate `AllPaidOffState` full-page render)
9. Fallback: stay on this month's target

10 unit tests in `homeViewModels.test.js` cover tier precedence pairwise (e.g. blocking review beats everything at once; critical beats reforecast/stale/payment; reforecast beats stale/payment; stale beats payment; payment beats balance-update) plus a pluralization-correctness test for the reforecast-tier copy.

## 7. Milestones (`home/milestones.js`)

Pure, idempotent `deriveMilestones(homeContext)`, reading only already-confirmed fields (`progress.confirmed/eliminated/percent`, `paidOffDebts`, `allDebtsArePaidOff`) - never a projection. Milestones: first confirmed reduction, $1,000 eliminated, 10/25/50/75/90% confirmed, first debt confirmed paid off (named after the *earliest* payoff, not the most recent), all included debts confirmed at $0. 10 unit tests cover each threshold boundary, the earliest-vs-latest paid-off naming, non-firing when unconfirmed, and idempotency (same input twice never duplicates).

**Celebration dedupe** (`MilestoneBanner.jsx`): no persisted "seen" record exists anywhere else in this app, so this uses `localStorage` keyed `ttz:milestones:{workspaceId}`, diffed on render (no `useEffect`+`setState` - the effect only performs the `localStorage` write, so it never trips the repo's hard `react-hooks/set-state-in-effect` ESLint rule). One restrained, dismissible banner - never one per milestone, never confetti. Respects `prefers-reduced-motion` via the **already-existing** `src/hooks/useReducedMotion.js` (discovered during implementation, not written new - the same hook `LoadingState.jsx`/`useIsMobile`/`useIsTablet` already build on). Verified live in-browser: banner shows on first visit to a workspace with a newly-crossed milestone, and correctly does **not** reappear after a page reload.

## 8. Retention loop

- **Stale-balance nudge:** unchanged logic, now reading the one centralized threshold constant (see §6).
- **Payment confirmation:** unchanged (`homeMonthlyStatus.js`'s `shouldRecordPayment`/`shouldUpdateBalance`, already correctly sourced from real summed `PaymentEvent`s, never from an expected schedule alone).
- **Reforecast feedback:** `PlanVersion.projectedZeroDate` was defined on the model but **never populated** anywhere (`createDraftPlan`/`applyReforecast` in both `v2AsyncApplicationService.js` and the sync `v2ApplicationService.js` never wrote it, confirmed by direct code read - the field always resolved to `""`). Fixed at the source: both functions, in both services (kept in parity, matching this codebase's existing "kept in parity" convention), now compute the projection during creation (via the same trusted `buildProjectionWithWarnings` already used everywhere else) and persist the resulting `projectedZeroDate` onto the new `PlanVersion`. A reforecast Activity entry compares the new version's `projectedZeroDate` against the immediately-prior version's **only when both are non-empty** (i.e. both created after this change); otherwise it shows a neutral "your plan has been updated" message with no fabricated comparison - fail conservatively, per the task's own instruction. Verified end-to-end against the real Firestore emulator (`test:firestore:v2` suite, "Reforecast preview is zero-write; apply creates N+1..." - passing).

## 9. Activity (new)

**No dedicated activity/audit collection exists anywhere in this schema** (grepped the full codebase and `firestore.v2.rules` - confirmed zero matches for any audit-log shape). Building a new event-sourcing collection was avoided per the task's own preference; instead the feed is derived from four already-persisted, already-timestamped record types: `Debt` creation, `BalanceSnapshot`, `PaymentEvent`, `PlanVersion`.

**Bounded-query design, and why it isn't a `collectionGroup` query:** `balance_snapshots`/`payment_events` sit two wildcard path segments below `workspaces/{workspaceId}` (i.e. `.../debts/{debtId}/balance_snapshots/{id}`) - the exact shape this session already proved, during SEC-INVITE, that Firestore security rules can never secure via `collectionGroup()` (see the `member_index` mirror-collection fix from that phase). Rather than repeat that mistake or build a mirror collection (a new subsystem the task said to avoid when unnecessary), `getActivityFeed` fans out one bounded, `limit()`-qualified query per debt (`listBalanceSnapshots`/`listPaymentEvents`, both now accept an optional `limit`, added to both the in-memory and Firebase repository adapters) plus the already-small `listDebts`/`listPlanVersions`. `cursor` is a plain offset; fetching `(cursor + limit)` records from each bounded per-debt source is provably sufficient to assemble the true globally-most-recent page (no single source can contribute more than that many items to a merged top-N list) - every query stays `limit()`-qualified, and the bound only grows with how deep a caller has actually paged, never an unbounded full-history scan. An `exhausted` flag (true only when every source returned under its cap) drives whether "Load more" renders at all.

**No fabricated correlation.** `PaymentEvent` and `BalanceSnapshot` are rendered as two separate entries, always - there is no shared key in the data model that safely links "I paid my card" to "I updated the balance" (`BalanceSnapshot.relatedPaymentEventId` is defined on the model but never written anywhere in this codebase, confirmed by grep). Documented in code and here rather than silently guessing at a correlation.

**Actor identity:** a new `resolveActorName(uid, {members, people})` in `ownership.js`, reusing the exact join pattern the SEC-INVITE/UX-6.2 identity model already established. Deliberately takes only a uid - structurally cannot infer an actor from a debt's owner (the explicit thing the task forbids). Falls back to a neutral "A workspace member" label when a uid no longer resolves, rather than guessing.

**Surfaces:** Home shows a "Recent activity" card (`ActivityPreviewCard.jsx`, top 5, via `getActivityFeed(workspaceId, {limit:5})`) plus a "View all activity" link; a new `ActivityCenter.jsx` is the 6th nav tab, deep-linked the same way `Review`/`Settings` already work (`PrimaryNav.jsx` already had a code comment anticipating this exact tab - no changes to `navigateTab`/`syncTabFromLocation` needed).

**Not eagerly fetched.** Unlike `reviewState`, Activity is fetched only when the `home` or `activity` tab is actually active (a new `useEffect` gated on `tab`), so a user who never opens either surface never pays for the bounded per-debt fan-out at all.

10 unit tests in `activityFeed.test.js` cover: debt-creation entries with resolved actor names; opening-snapshot dedup against the debt-creation entry; later snapshots rendering as their own entry; voided snapshots/payments excluded; payment and balance events never correlated into one entry; plan-version copy per `createdBecause`; the reforecast old-vs-new comparison firing only when both persisted dates exist, and failing conservatively (no fabricated comparison) otherwise; neutral actor fallback; and descending sort across all four record kinds.

## 10. Home layout / visual hierarchy

- `NextMoveHero` (new) is now Home's single dominant top-of-page surface, replacing the previously-buried "Your next move" text that lived inside `ThisMonthCard`. `ThisMonthCard` had its own duplicate primary CTA button removed (it now only offers the single secondary "View debt details" action) so there is exactly one dominant CTA on the page, not two competing ones.
- `DebtFreedomHero` moved below `NextMoveHero` (still fully visible, still answers "where do I stand," just no longer competing for top billing).
- `TrajectoryChart` gained a real minimum-data-point gate: with no meaningful projection and fewer than 3 observed points, a compact `NotEnoughHistoryCard` renders instead of the full 780x260 SVG frame. A real projection (e.g. right after activating a plan, even with only the starting balance observed) is still shown in full, since the projected path is meaningful on its own.
- `MilestoneBanner` and `ActivityPreviewCard` are new, additive surfaces (a compact banner near the hero; a small card in the existing grid) - nothing existing was removed to make room for them.
- Household voice: `getWorkspacePresentation` (already built in UX-6.2, previously explicitly NOT wired to Home) extended with `nextMoveEyebrow` ("Your next move" / "What's next for your household") and now consumed by `NextMoveHero`. Verified live: a household workspace's Next Move showed a real resolved owner name via a `Badge` ("Baba"), never "Everyone."
- Home/Plan status: unchanged - `homeContext.planHealth` still sources directly from `derivePlanHealth`/`snapshot.status`, the single mandated composition point; nothing here recomputes it.

## 11. Navigation

`PrimaryNav.jsx`'s `ITEMS` gained one `{ key: "activity", label: "Activity" }` entry (placed after Plan, before Settings - the code comment explaining Review's placement relative to Home was left untouched). `TrackToZeroV2App.jsx` gained one `{tab === "activity" && <ActivityCenter .../>}` render line. No changes to `navigateTab`/`syncTabFromLocation` - confirmed unnecessary, since Activity mirrors the existing no-sub-route pattern Review/Settings already use.

## 12. File map

**New:** `src/components/tracktozero/home/activityFeed.js` (+ test), `src/components/tracktozero/home/milestones.js` (+ test), `src/components/tracktozero/home/NextMoveHero.jsx`, `src/components/tracktozero/home/MilestoneBanner.jsx`, `src/components/tracktozero/home/ActivityPreviewCard.jsx`, `src/components/tracktozero/activity/ActivityCenter.jsx`.

**Modified:** `src/components/tracktozero/home/homeViewModels.js` (expanded `deriveNextMove`; centralized stale-balance threshold; wired `debtsAwaitingReforecast` into context), `src/components/tracktozero/home/HomeCommandCenter.jsx` (layout restructure, trend-chart gate, `ThisMonthCard` CTA de-duplication), `src/components/tracktozero/plan/PlanSection.jsx` (consumes the lifted `deriveDebtsAwaitingReforecast` instead of a local copy), `src/services/tracktozero/projectionStatusService.js` (`deriveDebtsAwaitingReforecast` export), `src/services/tracktozero/v2AsyncApplicationService.js` and `src/services/tracktozero/v2ApplicationService.js` (persist `PlanVersion.projectedZeroDate`; new `getActivityFeed`), `src/services/repositories/tracktozeroRepositories.js` and `src/services/repositories/firebaseTrackToZeroRepository.js` (optional `limit` on `listBalanceSnapshots`/`listPaymentEvents`), `src/domain/tracktozero/ownership.js` (`resolveActorName`), `src/components/tracktozero/layout/PrimaryNav.jsx` (Activity tab), `src/components/tracktozero/TrackToZeroV2App.jsx` (Activity fetch/state/render wiring), `src/components/tracktozero/workspacePresentation.js` (`nextMoveEyebrow`).

**Explicitly untouched:** `progressService.js`/`ui/ProgressBar.jsx` (confirmed unused, documented not consolidated - see §4), `reviewDomain.js`, `debtPortfolioView.js`, the SEC-INVITE/ownership security model, `derivePlanHealth`/`classifyPlanStatus`, `NoActivePlanState`/`BlockingReviewState`/`AllPaidOffState` (their own existing single-hero framing was judged already correct and left alone - only the default active-plan layout had the buried-CTA problem this task called out).

## 13. Test results (exact counts, this machine, this run)

- `npx vitest run`: **728 / 728 passed** (49 test files), up from the prior phase's 683/683 baseline - the delta is this phase's new test files/cases (10 `deriveNextMove` priority-chain tests, 10 milestone tests, 10 activity-feed tests, 2 new async-service tests for `getActivityFeed`/`projectedZeroDate`, 2 new `workspacePresentation` assertions).
- `npx eslint .`: **0 errors**, 4 pre-existing warnings, all in files this phase never touched (`App.jsx`, `useAccounts.js`, `useInstallPrompt.js`) plus one pre-existing warning on a `useCallback` in `TrackToZeroV2App.jsx` whose dependency array this phase did not modify.
- `npm run build`: succeeds.
- `npm run perf:check`: **all budgets pass**, including `TrackToZero V2: 338.43 kB / 450.00 kB budget` (up from the prior phase's bundle size, still comfortably under budget).
- `npm run test:firestore`: **12 / 12 passed** (unchanged from baseline - this phase touched no production-rules-relevant document shapes).
- `npm run test:firestore:v2`: **67 / 67 passed**, rules parity guard PASS (identical suite against `firestore.rules` and `firestore.v2.rules`, no drift) - includes real Firebase-emulator-backed tests exercising the modified `applyReforecast`/`createDraftPlan` (`projectedZeroDate` persistence) and the `limit()`-qualified repository reads, all passing against a real Firestore emulator, not mocks.
- `npm audit --omit=dev`: **0 vulnerabilities**.

## 14. Browser QA (Playwright, `inMemory` mode, real seeded data)

- **Personal, active plan:** Home renders `NextMoveHero` ("Record your Capital One Card payment," real target name, real remaining-balance figure), a real `MilestoneBanner` ("First confirmed reduction... $600.00 knocked out so far"), `DebtFreedomHero` below it, `ThisMonthCard` with a single CTA, the trajectory chart, and a working "Recent activity" card. Zero console/page errors.
- **Activity tab (personal):** real entries in the correct order - 3 debt-creation entries, 3 balance-confirmation entries (correctly excluding each debt's opening snapshot, confirmed by the balances shown genuinely differing from each debt's starting balance), one "Payoff plan activated" entry, all attributed to "You."
- **Household:** `NextMoveHero`'s eyebrow correctly read "WHAT'S NEXT FOR YOUR HOUSEHOLD" (household voice), and the target-debt owner rendered as a real name ("Baba") via a `Badge` - never "Everyone." "View all activity" navigated correctly to a working Activity page.
- **Milestone fire-once:** verified live - the banner appeared on first visit, and did **not** reappear after a full page reload (localStorage dedup working as designed).
- **Activity pagination:** "Load more" correctly does not render when a workspace's bounded fetch already returned everything available (`exhausted: true`) - verified against the household seed data.
- **Responsive sweep**, 6 viewports (360x800, 390x844, 430x932, 768x1024, 1024x768, 1440x900) on the household workspace: **zero horizontal overflow at any width**, zero console errors.
- Total console/page errors across every flow above: **0**.

## 15. Performance

Activity is never fetched as part of the main snapshot/review load - it's fetched lazily, only when the `home` or `activity` tab is actually active, via its own gated `useEffect`, so a session that never opens either surface pays nothing extra. Its queries are bounded per-debt (`limit()`-qualified), not full-history reads. Bundle budget for the TrackToZero V2 chunk stayed comfortably under its 450 kB limit after all additions (338.43 kB actual).

## 16. Security

Activity is workspace-scoped through the same `getWorkspaceContext` membership check every other read in this service already uses - no new rules, no new collection, so no new attack surface was introduced. No raw statement content or account numbers appear in Activity's derived copy (only debt names, dollar amounts, and dates, matching what's already shown elsewhere in the product).

## 17. Explicit descopes (documented, not silently dropped)

- Removing/consolidating the dead `progressService.js` - a real finding, not this phase's job to fix.
- Historical reforecast comparisons for `PlanVersion`s created before this change shipped (`projectedZeroDate` starts being persisted going forward only - no backfill).
- A persisted, cross-device milestone-seen record (localStorage only - a deliberate, low-stakes tradeoff, since achievement itself is always freshly derived and can never be fabricated by clearing storage).
- Real BalanceSnapshot "correction" UX (the schema has unused scaffolding for it; building it is a separate feature).
- Everything UX-8 already owns (mobile bottom nav, full keyboard/screen-reader audit, contrast matrix, device-specific polish) - the 6-viewport sweep confirms "responsive enough," not exhaustive accessibility hardening.

## 18. Locked / verified not regressed

`NoActivePlanState`/`BlockingReviewState`/`AllPaidOffState` render branches (untouched, still passing their existing dedicated tests); the SEC-INVITE/ownership security model; `derivePlanHealth`/`classifyPlanStatus` (single shared source, unmodified); Joint-counted-once household math; DATA-2/REVIEW-2/UX-6.1/UX-6.2 behaviors (verified via the full 728-test suite staying green, all pre-existing tests for those phases still passing unmodified).

## 19. Git status

All UX-7 work is staged/committed locally on `phase4/migration-rehearsal`, ahead of `origin` by this phase's commit(s) plus the 2 prior unpushed phases. **Not pushed** - per instruction, stopping after local commit and reporting branch-ahead status for explicit direction.
