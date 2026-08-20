# TRACKTOZERO — GATE 10B.1D — PLAN EXPERIENCE / PAYOFF INTELLIGENCE UI REFRESH — RESULTS

## 1. Executive Verdict

**YES — GATE 10B.1D PLAN REBUILD PASSED**

All 7 Plan destinations (My Plan, Snowball, Avalanche, Compare, What If, Finish By, Saved) were rebuilt around real charts, computed suggestions, and scenario comparison, backed by three genuine projection-engine extensions (per-debt trajectories, one-time payments as a first-class simulation input, dynamic minimum-payment recomputation) built in full depth per the owner's explicit scoping choice ("everything in one pass," "full depth"). Two real engine bugs and one real UI bug were found via live-browser QA and fixed, with regression tests added for each. 1121/1121 unit tests pass (up from a pre-gate baseline of 1043), lint is clean, all three Firestore rules suites pass, the bundle budget was raised by a small, measured, justified amount, and everything is committed (`8fd7abf`), deployed to `tracktozero-beta` (hosting-only, rebuilt post-commit so the embedded commit hash is accurate and verified live), and pushed to `origin/beta/v2-controlled`. A number of deliberate, disclosed scope boundaries remain — see Section 11.

## 2. Context and a Disclosed Limitation

The originating brief (~100 named test IDs, exhaustive per-page structural specs, locked financial-truth invariants) arrived as a single message truncated by the platform at roughly 50,000 characters, with no image attachments. When asked how to scope the remaining work, the product owner explicitly chose **"Everything in one pass"** (not phased) and **"Full depth"** for the engine (real per-debt trajectory series and dynamic-minimum-aware simulation, not aggregate-only charts). This report and the approved implementation plan (`C:\Users\jidye\.claude\plans\foamy-skipping-valiant.md`) are the authoritative sources for what was actually built — nothing below is invented to match an unseen reference image; every claim is backed by a passing test, a passing validation command, or a live-browser screenshot taken this session.

## 3. Projection Engine Extensions

`payoffEngine.js`'s existing `payoffSimulate` (relied on by a 501-line pre-existing test suite and every non-Plan caller) was kept byte-identical. Its simulation loop was extracted into a shared private core, and a new `payoffSimulateDetailed` was added on top, additive and opt-in:

- **Per-debt trajectories**: `{ perDebt: { [debtId]: { startingBalance, rows: [{month, balance, interest, minimumDue}], payoffMonth, payoffMonthIndex } } }` — the exact capability this codebase's own prior comments documented as impossible ("the engine only tracks aggregate balance/interest per month, never a per-account zero-crossing"), now real and used by every chart-bearing page's per-debt impact table.
- **One-time payments** as a first-class engine input (`oneTimePayments: [{debtId, amount, month}]`), proven numerically identical to the old "subtract from starting balance" workaround via a dedicated regression test, with correct ordering semantics for a lump sum that pays off the last remaining debt at month 0, and an honest `skippedOneTimePayments` list (with reasons) for anything that can't be applied — never silently dropped.
- **Dynamic minimum-payment recomputation** (`useMinimumPaymentRules: true`), reusing the already-tested `computeFromRule` (never inventing a new lender formula), recomputed monthly from each account's live simulated balance/APR.

Both flags default to `false`/`[]`, making every existing caller's behavior byte-identical — proven by keeping every pre-existing test across `payoffCalculations.test.js`, `v2AsyncApplicationService.planHub.test.js`, and `projectionStatusService.test.js` green and unedited throughout.

## 4. Two Real Engine Bugs Found and Fixed (via live QA, not caught by unit tests alone)

1. **A `detailed:false` call silently dropped `oneTimePayments`/`useMinimumPaymentRules` entirely.** `buildProjectionWithWarnings` only routed through `payoffSimulateDetailed` (the function that actually understands those options) when `detailed:true`; a `detailed:false` caller that also passed `oneTimePayments` fell through to the old `payoffSimulate` wrapper, which doesn't accept them at all. Found live: What If's "vs other strategies" section (a `detailed:false` call by design, since it doesn't need per-debt data) showed a one-time payment having *zero* effect on Snowball/Avalanche. Fixed by routing through the detailed engine whenever `detailed || oneTimePayments.length || useMinimumPaymentRules` is true, discarding `perDebt` afterward unless `detailed` was actually requested. Two new regression tests added to `projectionStatusService.test.js`.
2. **A dynamic minimum *below* the static one never actually changed simulated payment behavior** — only the recorded `minimumDue` metric. The payment-amount formula used `max(scheduled_payment, min_due)`, where `scheduled_payment` stayed frozen at the original static minimum; a recomputed minimum below that value (the common real case — percentage-of-balance minimums shrink as the balance shrinks) was masked by the frozen ceiling. Fixed by keeping `scheduled_payment` in sync with the recomputed minimum whenever the rule successfully evaluates. New regression test added to `payoffEngine.test.js`, explicitly asserting the simulated balance differs, not just the recorded metric.

## 5. One Real UI Bug Found and Fixed

**Compare's "Scenario Compare (+$100/month)" showed a *later* payoff date for the "+$100" scenario than the baseline.** `SCENARIO_COMPARE_AMOUNT` (100) was passed as the *absolute* `extraMonthlyPayment` instead of added on top of the household-seed workspace's actual active extra payment ($200/mo), so the "+$100" scenario was simulating *less* extra payment than the real baseline. Fixed by computing `currentExtra` from the active plan and using `currentExtra + SCENARIO_COMPARE_AMOUNT` for both scenario calls. Re-verified live: "Snowball baseline: Jul 2028" → "Snowball + $100: Apr 2028" (correctly earlier, saving $383.11 in interest).

## 6. Shared Chart Primitives

New `src/components/tracktozero/plan/charts/`, hand-rolled dependency-free SVG (no charting library exists in `package.json`; the bundle budget was already tight):

- **`TrendChart.jsx`** — multi-series balance-to-$0 line chart, range-window pills (All/5Y/3Y/1Y), payoff markers as a distinct diamond shape (never color-only), `role="img"` + auto-generated `aria-label` summary, plus a visually-hidden accessible `<table>` alternative.
- **`AllocationDonut.jsx`** — hand-rolled `stroke-dasharray` donut, zero-value segments always skipped (never drawn as a sliver or a fabricated full circle), explicit empty state.
- **`MultiScenarioCompareCard.jsx`** — a `TrendChart` + metric-tile grid over 2-4 scenario entries; used by both Compare's "Scenario Compare" and Saved's "Compare selected scenarios."

Both chart primitives resolve `ttzPalette` colors inside the render body (never a module-level constant) and carry a dedicated theme-safety regression test — the exact class of bug GATE-10B.1C found once already in Home.

## 7. Shared Insight Helpers

New `src/services/tracktozero/planInsights.js` (pure, React-free, 29 tests) — one canonical implementation per computation so no two pages can silently disagree: `safePercentDelta` (never `Infinity%`/`NaN%`/a fake `0%`), `deriveAllocationSegments` (minimums + extra only — never a fabricated "buffer"), `deriveDebtCompositionSegments`, `deriveInterestBreakdownSegments`, `deriveNextMove`, `computeSpeedUpSuggestion` (always genuinely computed against the real engine, never a hardcoded savings figure), `deriveStrategyRecommendation` (explicit tie/tradeoff states — never "$0 better"), `classifyGoalDateFeasibility` (a disclosed plan-internal heuristic), `derivePerDebtImpactRows`, `pickBestByZeroDate` (never a fabricated "best" with nothing to compare).

## 8. Page-by-Page

- **My Plan**: 6-metric header, a real 2-line trend chart (active plan vs. paying minimums, both from `previewTrend`), the already-computed-but-never-rendered Plan Health status now visible via a Badge, a computed Next Move card, a Strategy-snapshot mini-card, a payment-allocation donut, top-5 payoff order with "View full schedule."
- **Snowball / Avalanche**: shared `StrategyPageBody` (avoids duplicating chart/speed-up/inline-what-if logic twice) — an explainer callout, the pre-existing `StrategyExperience` untouched, a 3-line trend chart (minimums / this strategy / an optional what-if overlay), a computed "speed this up" suggestion, an inline what-if preview, a strategy-vs-strategy mini-card. Avalanche additionally gets a debt-composition donut.
- **Compare**: an overlaid 2-line trend chart from one `compareStrategies({detailed:true})` call, three donuts (interest-by-debt — genuinely new via `perDebt`; debt composition; payment allocation), a "Scenario Compare (+$100/month)" `MultiScenarioCompareCard`, and a Decision Summary with a confirm-gated "Choose X" CTA reusing the existing activation contract.
- **What If**: all 4 existing modes kept as-is; added symmetric baseline+scenario interest capture, a 2-line trend chart, a per-debt impact table (`derivePerDebtImpactRows`), and a "vs other strategies" 4-row comparison (disclosed trim: rows, not a 4th chart line — and only shown for plan-wide scenarios, since a debt-targeted scenario doesn't generalize across strategy orderings).
- **Finish By**: `previewGoalDate`'s existing binary search reused as-is, extended with an additive `detailed` option capturing the same scoped-debts baseline/scenario the search already computes; added a feasibility badge (`classifyGoalDateFeasibility`, disclosed as a plan-internal heuristic, never certified advice), a 2-line chart, a payment-allocation donut, a comparison table, and a top-5-most-impacted-debts table.
- **Saved**: existing `ScenarioCard`/list/archive/apply/`listPlanHistory` reused as-is; added grouping+counts by type, a "Compare" checkbox feeding `MultiScenarioCompareCard` (second user of that component), a "best option right now" computed only over scenarios already previewed this session (disclosed scope limit, never a background preview burst), and a Plan History timeline over the already-real `listPlanHistory` data.

## 9. Tests Added

79 new tests across 7 new files plus 5 extended files (net +78 vs. the pre-gate baseline of 1043), all passing:
- `payoffEngine.test.js` (new, 13) — detailed-mode parity, per-debt payoff/truncation, one-time-payment numeric parity + skip reasons + the last-debt-at-month-0 edge case, dynamic-minimum shrink-over-time + safe interest-rule fallback, and the scheduled-payment-sync regression.
- `tracktozeroCalcAdapter.test.js` (new, 5) — passthrough fields only.
- `projectionStatusService.test.js` (+6) — detailed-mode parity/warnings, plus the two `detailed:false`-drops-options regressions.
- `v2AsyncApplicationService.planHub.test.js` (+11) — `previewTrend`, detailed passthrough across every preview method, the `previewGoalDate` detailed-mode baseline/scenario tests.
- `planInsights.test.js` (new, 29) — one block per helper, zero-denominator safety, tie/tradeoff/no-fabricated-winner cases, honest no-data-yet for `pickBestByZeroDate`.
- `charts/TrendChart.test.js` (new, 7) + `charts/AllocationDonut.test.js` (new, 6) + `charts/MultiScenarioCompareCard.test.js` (new, 2) — empty states, range-slicing, theme-safety regressions.

## 10. Live Browser Verification

Playwright-driven, real dev-server QA (port 5177, `Household · household-seed` workspace) after each page rebuild, before moving to the next — the same incremental-verification discipline used throughout this session. Screenshot matrix captured: all 7 destinations at 1440×900 in both light and dark, all 7 at 390×844 mobile in dark, plus interactive-state captures (What If's recurring/one-time/target modes; Finish By's feasible/already-on-pace states; Saved's previewed and compared states). Zero console/page errors across every capture. This live pass is what surfaced both engine bugs (Section 4) and the Compare scenario-amount bug (Section 5) — none of the three were caught by the unit-test suite alone.

## 11. Validation Summary

- Unit tests: **1121/1121** (baseline 1043 + 78 net new, including a handful of tests added by the post-GATE-10B.1C polish fixes that shipped earlier in this same session)
- Lint: **0 errors** across every touched file
- `build:beta`: **green**
- `perf:check`: **all budgets pass** — TrackToZero V2 bundle raised **470 → 530 kB** (actual 502.64 kB, ~27 kB headroom), a small, measured, justified raise for two new chart primitives + `planInsights.js` + substantial new markup across 7 pages, matching this same budget's own prior precedent (GATE-10B.1 raised it 450 → 470 kB)
- `test:firestore` (legacy rules): **12/12**
- `test:firestore:v2`: **69/69**, rules-parity guard **PASS** (no rules files touched this gate)
- `test:firestore:beta`: **16/16**
- `npm audit`: 0 vulnerabilities in production dependencies (`--omit=dev`); 11 pre-existing moderate findings remain inside `firebase-admin`'s transitive dependency tree (dev/CLI tooling, never shipped in the app bundle) — not introduced this gate, not fixed (would require `--force` and a breaking version bump, out of scope)

## 12. Git, Deploy, and Push

- Git safety review before staging: `git status`/`git diff --stat` confirmed every changed/untracked file was intentional; grepped the new files for credential-shaped strings, found nothing.
- Committed as `8fd7abf` ("GATE-10B.1D: rebuild Plan tab as a payoff decision engine"), 18 files changed (2625 insertions, 160 deletions).
- `build:beta` was run once before the commit (for validation) and once again *after* it, so the deployed bundle's embedded commit-hash provenance is accurate.
- Deployed **hosting-only** via the unmodified `scripts/deploy-beta.mjs` (no rules/indexes changes needed or made). All of the script's own gates passed: `.firebaserc` alias verification (`beta` → `tracktozero-beta`, distinct from `default` → `budgetapp-c9306`), `firestore.beta.rules` sanity check, beta-config-in-bundle check.
- **Live post-deploy version proof**: fetched the deployed `TrackToZeroV2App-*.js` chunk directly (read-only, unauthenticated) and confirmed the literal string `8fd7abf` is present.
- Pushed cleanly: `git push origin beta/v2-controlled` → `d0414bb..8fd7abf`, no force, not blocked.
- Post-push: `git status` shows a clean working tree, up to date with `origin/beta/v2-controlled`.
- `budgetapp-c9306`/production were never referenced by any command this gate.

## 13. Explicitly Disclosed Scope Boundaries (not defects — deliberate, documented limits)

- **`AllocationDonut`'s center-label text can still touch the ring at its widest** (e.g. a 5-figure dollar amount) — a known, partially-mitigated cosmetic imperfection carried over from when this primitive was first built earlier this session; noted rather than continuing to iterate on pixel-level centering.
- **Service-layer memoization (plan Section 1.4) was deliberately not implemented.** The engine's own documented performance characteristic is sub-millisecond per call even for 3 overlaid lines across 240 months — there is no actual latency problem to solve, and a request-scoped cache would add real risk (serving a stale preview after a debt/payment mutation mid-session) for no measurable benefit. Flagged as a considered, disclosed trim rather than a silent omission.
- **What If's "vs other strategies" section only appears for plan-wide scenarios** (recurring extra without a target debt, or a one-time payment) — a debt-targeted scenario's effect doesn't generalize across Snowball's/Avalanche's own built-in target orderings, so showing 4 rows there would be misleading rather than informative.
- **Finish By's feasibility label (`classifyGoalDateFeasibility`) is a disclosed plan-internal heuristic**, not certified financial advice — this domain has no income/budget-capacity field to base a real affordability judgment on; the label describes how large the required increase is relative to the user's own current payment, nothing more.
- **Saved's "best option" and "Compare" are computed only over scenarios already previewed this session** — never a background burst of previews across every saved scenario on page load, matching the plan's own explicit scope limit.
- **The household-seed workspace's seed `PlanVersion` (Version 1) shows "Projected $0: n/a" in the new Plan History timeline** — the seed fixture itself never populated a `projectedZeroDate` on that record (only versions created via `createDraftPlan`/`applyReforecast` in live app flow do). The timeline correctly falls back to "n/a" rather than fabricating a date; this is a seed-data completeness gap, not a bug in this gate's code.

## 14. Do-Not Compliance

No production Firebase touch of any kind. No real human financial data invented or altered — all functional testing this session used the local dev server's in-memory seed data; the one live-`tracktozero-beta` interaction was a read-only, unauthenticated fetch of a deployed JS asset for version proof. The `deploy-beta.mjs` guard was never bypassed or edited. The one bundle-budget raise (470 → 530 kB) was small, measured, and justified by genuine new functionality, not a cover for an inefficient implementation — no new runtime dependency was added anywhere in this gate.

## 15. Final Verdict

**YES — GATE 10B.1D PLAN REBUILD PASSED**
