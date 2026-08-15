# TrackToZero — UX-4.1 Results

Seven standalone Plan surfaces (`/plan/my-plan`, `/plan/snowball`, `/plan/avalanche`, `/plan/compare`, `/plan/what-if`, `/plan/finish-by`, `/plan/scenarios`), replacing the nested-tab `PlanHub` from UX-4.

## 1. Starting state

`8ab704f` — "Build unified TrackToZero Plan Hub" (UX-4), branch `phase4/migration-rehearsal`. This phase found `src/components/tracktozero/plan/PlanSection.jsx` and `TrackToZeroV2App.jsx`'s wiring to it already substantially built (uncommitted, in the working tree) — a real, route-based seven-destination rewrite of UX-4's tab-based `PlanHub`. This phase reviewed that code, fixed the bugs found (both the two the user explicitly reported and several more found during verification), filled the gaps against the UX-4.1 spec, removed the now-superseded `PlanHub.jsx`/`planCopy.js`, and verified the whole thing end-to-end in a real browser.

## 2. The two reported bugs — root-caused and fixed

**"The highlighted [What If → Add money every month] area doesn't work, unable to click."** `WhatIfView`'s `runPreview`/`FinishByView`'s `check` were bare `async () => {...}` handlers wired directly to `onClick`, with no `runAction` wrapper and no try/catch. Any failure — including the very next bug below — was a silently swallowed unhandled promise rejection: the click registered, nothing visibly happened, no error, no loading state. Fixed by routing every preview/save/apply action through the existing `runAction` helper (the same pattern every other write in this app already uses), so failures surface in the app's shared error banner and buttons show a loading state.

**"No option to select the debt I want to try it on, also the option should contain All in case I want to spread it over all my debt. Same thing in the Finish By page."** Finish By already had a working "All included debts" + per-debt selector (verified directly - not a real bug there). What If's "Add money every month" mode genuinely had no debt selector at all - it only ever previewed a plan-wide extra payment. Added a debt selector with "All included debts" as the default, wired to `previewCustomTarget`'s new optional `extraMonthlyPayment` override (see §4) when a specific debt is chosen, and to the existing `previewReforecast` when left on "All."

Combined, these two bugs explain what the user saw: picking a specific debt wasn't even possible, and the untargeted "All" path called `previewReforecast`, which returns `null` when there's no active plan - and the unguarded handler crashed silently reading `.oldProjectedZeroDate` off that `null`.

## 3. A related, deeper bug found during verification: reforecast never refreshed which debts were in the plan

While verifying "Reforecast to include a new debt" as a remedy for the above, live testing showed the debt still wasn't included **even after reforecasting**. Root cause, in both `v2AsyncApplicationService.js` and `v2ApplicationService.js`'s `applyReforecast`: the new `PlanVersion` spread `...snapshot.activeContext.version` first, which carries the OLD version's frozen `startingDebtSnapshot` forward completely unchanged - only `overrides` (extra payment, strategy) ever got applied on top. A comment elsewhere in the codebase (`v2ApplicationService.test.js:251`) already documented the intent - "newly added debts wouldn't be part of includedDebts until a reforecast" - but no test ever exercised that specific sequence (add a debt → reforecast → check it joined), so the promise the comment made was never actually true in the code.

**Fix**: `applyReforecast` now re-derives `startingDebtSnapshot` from whichever debts are eligible *right now* (`includedInCorePayoffPlan !== false && status === "active"` - the exact same rule `createDraftPlan` already uses for the first version), applied in both the async and sync services for parity. A mortgage or other explicitly-excluded debt still correctly never joins. Historical `PlanVersion`s are untouched - this only changes what a **new** version's snapshot is built from. Regression-tested: a debt added after activation joins the queue on the next reforecast; an excluded debt never does; the prior version stays byte-identical.

My Plan also now shows an honest, transient notice — "New debts aren't in this plan yet... Reforecast to include them" — for the (now genuinely-true) window between adding a debt and reforecasting.

## 4. Service-layer addition: `previewCustomTarget`'s optional `extraMonthlyPayment`

Extended (backward-compatible, defaults unchanged when omitted) so a debt-targeted What-If preview can carry its own hypothetical extra amount instead of only ever using the active plan's existing one. This is what lets "Add money every month, targeted at debt X" work as a single preview call, and - since `previewCustomTarget` already gracefully defaults strategy/extra with no active plan - it's also what makes the targeted path work even before any plan has ever been activated (verified with a fresh no-plan workspace in a service-layer test).

## 5. Routing: refresh-safe, Back/Forward-safe

`PlanSection.jsx`'s own `resolvePlanDestination`/`buildPlanPath`/`navigateToPlanDestination` (extracted to `planRouting.js` to satisfy the `react-refresh/only-export-components` lint rule the same way REVIEW-1C's `reviewSessionSummary.js` did) already handled sub-navigation between the seven destinations correctly. What was missing: `TrackToZeroV2App.jsx`'s own `tab` state was never synced with the URL at all - it's a plain `useState("home")` with no read of `window.location.pathname` - so a **fresh load or refresh at `/plan/snowball` rendered Home**, not Plan; `PlanSection` never even mounted. Fixed with a mount + `popstate` effect that derives `tab` from the URL (`/plan/*` → `"plan"`, else `"home"`), and a `navigateTab` wrapper (replacing every raw `setTab` call site) that pushes `/plan/my-plan` on entering Plan and `/` on leaving it, so the URL and the tab never disagree in either direction.

Verified live: direct load at `/plan/avalanche` renders Avalanche with the Plan nav correctly highlighted; Snowball → Avalanche → What If → Back → Back → Forward walks the exact expected URL sequence.

## 6. The Snowball/Avalanche "same debts" question

Verified this is not a bug. `personal-seed`'s two debts (Capital One $2,400 @ 24.99% APR, SoFi $7,800 @ 11.9% APR) have Capital One as *simultaneously* the smallest balance and the highest APR, so Snowball and Avalanche correctly agree on the same order for two independent reasons. With `household-seed`'s three debts, where balance and APR don't line up, Snowball and Avalanche produce genuinely different, independently-verified orders (Snowball: Samsung → Old Store Card → Priceline; Avalanche: Priceline → Samsung → Old Store Card, unknown-APR sorting last in both cases per the pre-existing, already-tested comparator). No code change was needed here - just verification, reported directly.

## 7. The seven standalone destinations

- **My Plan** (`/plan/my-plan`) - one intentional empty state when no plan is active ("Build your path to $0" + a single "Compare Snowball vs Avalanche" primary CTA + secondary links - no duplicate banner found or introduced). When active: debt-free date/strategy/monthly commitment/current target summary, a compact "Your path to $0" timeline (fixed a bug where every debt said "Current" - now only the actual target says "Current target," the rest say "Up next"), current-target card, full payoff order, plan-status warnings, and three secondary action cards - **Reforecast** (preview + confirm + apply, inline), **Change strategy** (links to Snowball/Avalanche/Compare), and **Plan history** (via the existing `listPlanHistory`, newest first, current version badged) - all newly added this phase per the spec's explicit "Secondary: Reforecast / Change strategy / Plan history" requirement, which the inherited code hadn't built yet.
- **Snowball** / **Avalanche** (`/plan/snowball`, `/plan/avalanche`) - projected $0, months to $0, first target, projected interest, full ranked payoff order with owner labels, unknown-APR warning, and a "Use Snowball/Avalanche" CTA gated behind a `ConfirmationDialog` showing the before/after projected date (previously applied on a single click with no confirmation at all - fixed this phase, since the spec explicitly required a confirm step and the original UX-4 spec's "Apply QA" section demanded it).
- **Compare** (`/plan/compare`) - side-by-side metrics, both full payoff orders, an honest tradeoff callout (interest saved vs. months faster - never a fabricated recommendation beyond what the trusted preview data actually supports), and "Inspect Snowball/Avalanche" links (now correctly separated from the Apply-with-confirmation path they used to incorrectly share - see §8).
- **What If?** (`/plan/what-if`) - segmented "what do you want to test" sandbox (recurring extra / one-time payment / target another debt / custom scenario), control-then-result layout, current-vs-scenario deltas, honest "never creates a PaymentEvent" note, Save Scenario.
- **Finish By** (`/plan/finish-by`) - target-date-first interaction, feasible/infeasible honest branching (never a bare FAIL - always the nearest realistic date when infeasible), Apply-with-confirmation when feasible, Save Scenario.
- **Saved Scenarios** (`/plan/scenarios`) - a real library, not a database dump: name, type badge, "View" that actually calls `getScenarioPreview` (previously a literal no-op `onClick={() => {}}`), projected $0, a "vs. your current plan" delta computed from two already-trusted date labels (not new payoff math), a stale-plan warning when the active version has moved on, Apply gated to the three types that can actually apply (`recurring_extra`/`strategy_comparison`/`goal_date`) with a matching confirmation dialog, and an honest "preview-only, can't be applied directly" note for `one_time`/`custom_target` instead of a broken Apply button.

## 8. A related fix: `StrategyExperience`'s dual role

The shared `StrategyExperience` card was reused for two different things - Snowball/Avalanche's real "Use this strategy" apply action, and Compare's "Inspect Snowball/Avalanche" pure navigation - through the same `onUse` prop, meaning navigation and a real plan mutation shared one code path with no confirmation on either. Split into `onApply` (confirm-gated, real mutation, used by the standalone pages) and `onInspect` (plain navigation, used by Compare) so a future change to one can never accidentally affect the other.

## 9. Tests

**Exact results**: `npx vitest run` **590/590 passed**, 41 files (5 new this phase: 3 for the `applyReforecast` snapshot-refresh fix, 2 for `previewCustomTarget`'s optional extra override). `npm run lint`: 0 errors, 3 pre-existing unrelated warnings. `npm run build`: succeeds. `npm run test:firestore`: **12/12** (unaffected). `npm run test:firestore:v2`: **59/59**, rules parity **PASS** (unaffected - no rules changed this phase). `npm run perf:check`: all budgets pass. `npm audit --omit=dev`: 0 vulnerabilities.

## 10. Browser QA (Playwright, `inMemory` mode, zero console errors throughout)

- All seven destinations resolve to distinct, correct URLs and render distinct content.
- **Refresh-safety**: hard reload at `/plan/avalanche` renders Avalanche with Plan correctly highlighted in top nav (previously would have shown Home).
- **Back/Forward**: Snowball → Avalanche → What If → Back → Back → Forward walks the exact expected URL/content sequence.
- **Apply flow**: previewed Avalanche, clicked "Use Avalanche," confirmation dialog showed the before/after date, confirmed, verified My Plan immediately reflected Avalanche as active with the correct new payoff order; Plan History showed the new version.
- **Reforecast from My Plan**: adjusted extra payment, previewed, applied with confirmation; Plan History correctly grew from Version 1 to Version 2.
- **Full household fixture expansion** (via the real Add Debt / Confirm Balance UI, not fixture-file edits): added a Joint debt (owner "Joint / Household"), a mortgage marked excluded from the core plan, and confirmed via the Debts page that Joint counts exactly once in the household total ("Total household debt: $6,762.00 (counted once)") and the mortgage's $250,000 is correctly excluded from that total. Re-verified Compare/Snowball/Avalanche/My Plan all correctly include the Joint debt (once) and correctly exclude the mortgage from every payoff order and projection.
- **Originally-reported bug, directly re-verified fixed**: What If → Add money every month now has a working debt selector defaulting to "All included debts," and both the "All" and targeted paths produce a visible, correct preview instead of doing nothing.
- **Saved Scenarios**: saved a debt-targeted recurring-extra scenario (correctly stored as `custom_target`, the honest preview-only category, not `recurring_extra`), confirmed it lists with the right type label, "View" correctly loads a live preview with a computed delta ("9 months sooner than your current plan"), and the preview-only note (no Apply button) renders correctly for that type.

**Not separately fabricated this pass**: a genuinely "paid-off" historical debt via the browser (recording a payment doesn't zero `currentBalance` in this app's truth model by design - only an explicit "Confirm balance" to $0 does, and the attempt made during this QA pass didn't land before time ran out on this already-large session). The underlying "a debt with a $0 confirmed balance exits the payoff queue and can never be the current target" behavior is pre-existing and already covered by `v2ApplicationService.test.js`'s own "REPRODUCTION" tests, unrelated to and unaffected by this phase's changes.

## 11. Files changed

Deleted (superseded, now orphaned): `src/components/tracktozero/plan/PlanHub.jsx`, `planCopy.js`.

New: `src/components/tracktozero/plan/planRouting.js`, `TRACKTOZERO_UX4_1_STANDALONE_PLAN_RESULTS.md`.

Modified: `src/components/tracktozero/plan/PlanSection.jsx` (bug fixes and gap-filling described above, on top of the inherited uncommitted implementation); `src/components/tracktozero/TrackToZeroV2App.jsx` (top-level tab/URL sync, `navigateTab`); `src/services/tracktozero/v2AsyncApplicationService.js` (`applyReforecast` snapshot refresh, `previewCustomTarget` optional extra override); `src/services/tracktozero/v2ApplicationService.js` (matching `applyReforecast` fix, kept in parity); `src/services/tracktozero/v2AsyncApplicationService.planHub.test.js` (+5 tests).

## 12. Known limitations

- The "paid-off historical debt" leg of the full household fixture wasn't separately demonstrated live in the browser this pass (see §10) - the underlying behavior is pre-existing and tested elsewhere, but a dedicated UX-4.1 browser screenshot of it doesn't exist yet.
- `debtsAwaitingReforecast`'s "New debts aren't in this plan yet" notice is presentation-only (a set comparison between today's live eligible debts and the active version's own queue) - it does not attempt to also flag a debt that became *excluded* since the plan was last set (e.g. someone unchecked "include in core plan" after activation); that's a narrower, less common case and was out of scope for this pass.

## 13. Explicitly not started

UX-2.1 (Home charts/momentum/donut visuals) was not touched, per instruction.

---

```text
ALL SEVEN PLAN DESTINATIONS ARE IMPLEMENTED, DISTINCT, REFRESH-SAFE, AND BACK/FORWARD-SAFE
BOTH ORIGINALLY-REPORTED BUGS ARE ROOT-CAUSED, FIXED, AND RE-VERIFIED LIVE
APPLY ALWAYS REQUIRES EXPLICIT CONFIRMATION WITH A BEFORE/AFTER FIGURE
PLANVERSION HISTORY REMAINS IMMUTABLE (N -> N+1, N PRESERVED, VERIFIED LIVE AND BY TEST)
HOME / MY PLAN / DEBTS AGREE AFTER APPLY, VERIFIED LIVE
UNKNOWN APR NEVER SILENTLY BECOMES 0% OR CONFIRMED
HYPOTHETICAL PAYMENTS NEVER CREATE A PAYMENTEVENT
JOINT DEBT COUNTS EXACTLY ONCE, VERIFIED LIVE WITH A REAL JOINT DEBT
MORTGAGE EXCLUSION FROM THE CORE PLAN VERIFIED LIVE ACROSS EVERY PLAN SURFACE
OLD NESTED PLANHUB TAB UI REMOVED FROM THE REPOSITORY, NOT JUST UNMOUNTED
UX-2.1 NOT STARTED
NO PRODUCTION DEPLOYMENT
NO REAL FINANCIAL DATA USED
```

**YES — UX-4.1 COMPLETE — STANDALONE PLAN EXPERIENCE VERIFIED**
