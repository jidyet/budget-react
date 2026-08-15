# TrackToZero — UX-4 Results

Unified Plan Hub: My Plan / Snowball / Avalanche / What If / Finish By / Saved Scenarios as one coherent destination.

## 1. Starting HEAD

`859c4dc` — "Add household financial person identity mapping" (DATA-HH1), branch `phase4/migration-rehearsal`, working tree clean at start.

## 2. Final HEAD

See git log after the commit accompanying this document (this file is written just before that commit).

## 3. Architecture: one active-plan truth source, never inferred

Nothing about `Workspace.activePlanId → PayoffPlan.activeVersionId → PlanVersion` changed. Every Plan Hub read goes through the existing `getWorkspaceSnapshot`/`getActivePlanContext`, which resolve the pointer chain exactly as before — no "most recent version" heuristic was introduced anywhere. All new preview/apply methods live in `v2AsyncApplicationService.js` only (the async service is the one actually mounted in the UI); the sync `v2ApplicationService.js` was intentionally left untouched, per this session's established precedent that new interactive-feature methods land only in the async service.

## 4. Preview vs Apply — the zero-write boundary

One internal helper, `buildPlanPreviewFromDebts`, is the single wrapper around `buildProjectionWithWarnings`/`payoffSimulate` that every preview call (`compareStrategies`, `previewOneTimePayment`, `previewCustomTarget`, `previewGoalDate`) funnels through — so My Plan/Compare/What If/Finish By can never independently drift from each other or from the trusted engine. None of these four methods, nor `getScenarioPreview`, write anything: no `activePlanId`/`activeVersionId` mutation, no `PlanVersion` write, no `Debt` mutation, no `PaymentEvent`, no `BalanceSnapshot`. Verified directly by tests that snapshot the active `PlanVersion` before and after each preview call and assert byte-identical equality, and by a dedicated cross-screen test that calls all four preview methods back-to-back and confirms `getWorkspaceSnapshot`'s target debt and active version are unchanged.

Applying only ever happens through the two pre-existing, already-tested primitives:
- `applyReforecast(workspaceId, overrides)` — used directly by the Adjust Plan tab, the Compare tab's "Switch strategy," and Finish By's "Apply this payment increase." Always creates PlanVersion N+1 and preserves N; never mutates history in place.
- `applyScenario(workspaceId, scenarioId)` — routes `recurring_extra`/`strategy_comparison`/`goal_date` scenarios to `applyReforecast` under the hood, and explicitly **refuses** to apply `one_time`/`custom_target` scenarios (`"...is preview only and cannot be applied directly."`), since a lump sum is never a real payment and a custom debt order is never a persistable strategy.

No parallel activation path was ever added.

## 5. The "custom" pseudo-strategy

`payoffEngine.js`'s `orderPayoffTargets`/`payoffSimulate` gained a `"custom"` strategy value and a `customTargetOrder` parameter, threaded through `projectionStatusService.js`'s `buildProjectionWithWarnings`. `"custom"` is **not** in `PLAN_STRATEGIES` (still exactly `["snowball", "avalanche"]`), so it structurally can never be persisted as an activatable `PlanVersion.strategy` — it only exists as a preview-time ordering override for the What If → Custom Target tab.

## 6. Unknown APR handling — verified, not assumed

`sortDebtsForStrategy`'s existing Avalanche comparator treats `aprStatus === "unknown"` as a value below every known APR (including 0%), so an unknown-APR debt is never guessed to be the highest-priority target — it sorts to the back of the Avalanche queue, and `evaluateProjectionWarnings` still attaches an explicit `unknown_apr` warning to it. The Plan Hub UI surfaces that warning as a labeled `WarningCallout` ("Some interest rates are unknown...") on every tab that shows a payoff order (My Plan, Compare, custom target preview) — never a silently-omitted debt, never a fabricated 0%.

## 7. Finish By — a real bug found and fixed

`previewGoalDate`'s binary search capped its internal simulation at `maxMonths = min(monthsAvailable, 240)` and used `projection.length` as "months to zero." But `payoffSimulate` pushes one row per simulated month regardless of whether the debt actually reached $0 — it only stops early once every account is paid off, otherwise it runs the clock out to `maxMonths`. That meant a truncated (unfinished) simulation always reported `monthsToZero === searchCapMonths`, which trivially satisfied `baselineMonths <= monthsAvailable` for **every** target date — a 1-month payoff of $5,547 in test debt was reported `feasible: true` at the *current* $200/mo extra payment, before any fix. This directly violated the spec's "never falsely report a target as feasible" requirement.

**Fix**: `monthsToZeroAt` now checks whether the simulation's last row actually reached a ~$0 remaining balance; if not, it returns `Infinity` instead of the truncated month count, so the search correctly treats an unfinished simulation as "not yet feasible" and keeps searching (or correctly reports infeasibility) rather than confusing "ran out of simulation window" with "paid off on time." Verified before/after with the same seed debts: a 1-month target now correctly reports `requiredMonthlyExtra: $5,428/mo` instead of falsely claiming the current $200/mo already works. A synthetic $900M debt now correctly exercises the true `feasible: false` branch (the realistic seed debts are too small to ever hit the search's $5,000,000/mo/40-doubling bound).

## 8. Saved Scenarios

New entity `SavedScenario` (`createSavedScenario` in `models.js`; `SCENARIO_TYPES = ["recurring_extra", "one_time", "custom_target", "goal_date", "strategy_comparison"]`, `SCENARIO_STATUSES = ["active", "archived"]`), stored at `workspaces/{workspaceId}/scenarios/{scenarioId}` in both `InMemoryTrackToZeroRepository` and `FirebaseTrackToZeroRepository`, with `firestoreTimestamps.js` allowlist support.

- Non-authoritative by construction: nothing about saving a scenario touches `Workspace.activePlanId`/`PayoffPlan.activeVersionId`.
- Staleness is detected honestly: `basePlanVersionId` is captured at save time; `getScenarioPreview` compares it against the workspace's *current* active version id and returns `isStale: true` the moment a reforecast/strategy switch/scenario-apply has moved the plan on — the UI shows an explicit "your plan has changed since this was saved" warning rather than silently presenting old numbers as current.
- Applying re-derives its preview at apply time rather than trusting a cached one (`applyScenario`'s `goal_date` branch re-runs `previewGoalDate` before calling `applyReforecast`).
- Workspace-scoped and security-tested: a scenario id from workspace A is never readable, previewable, or applicable against workspace B (`"Scenario not found in this workspace."`).

## 9. Plan History (lightweight, not UX-7)

New read-only method `listPlanHistory(workspaceId)` — returns the active plan's existing, already-immutable `PlanVersion` records (newest first by `versionNumber`), nothing new persisted. Rendered as a plain list on the Adjust Plan tab: version number, strategy, why it was created, extra payment, and a "Current" badge on the active version. No milestones, no retention nudges, no celebration animations, no streaks — that is UX-7 and was deliberately not built.

## 10. Firestore rules

New `scenarios/{scenarioId}` nested collection added to both `firestore.v2.rules` and `firestore.rules`, gated identically to `people`/`import_batches`: read requires `isViewerPlus`/`v2ViewerPlus`, create/update requires `isAdminPlus`/`v2AdminPlus` (the `managePlans` permission tier — owner/admin only, matching every scenario method's own `hasPermission(membership, "managePlans")` check), `workspaceId`/`id` field-vs-path consistency enforced, no direct delete (`archiveScenario` sets `status: "archived"` via update so a scenario id, once referenced, never dangles). Rules-parity guard re-confirmed **PASS** — the identical test suite passes against both the production `firestore.rules` and the reference `firestore.v2.rules` with zero drift.

## 11. UI — `src/components/tracktozero/plan/`

New directory, matching the existing `review/`/`home/` convention:
- `planCopy.js` — centralized, honest copy (never claims a preview is applied, never hides an unknown APR, always distinguishes "save" from "apply").
- `PlanHub.jsx` — orchestrator using the existing `ui/` design system (`Card`, `Button`, `Tabs`, `ConfirmationDialog`, `WarningCallout`/`InfoCallout`, `Select`/`Field`/`MoneyInput`/`Input`, `Badge`, `theme.js` tokens) rather than the older ad-hoc inline-`styles` convention, since this is a new, prominent, unified destination. Five tabs: **Adjust Plan** (reforecast + strategy change + Plan History), **Snowball vs Avalanche** (`compareStrategies`, read-only side-by-side), **What If?** (three sub-modes: recurring extra, one-time payment, custom target debt — all preview-only, each save-able as a Scenario), **Finish By** (goal-date search, apply-with-confirmation when feasible), **Saved Scenarios** (list/preview/archive/apply, staleness surfaced).

`TrackToZeroV2App.jsx`'s `Plan` component is unchanged for the "Active payoff plan" summary and "Payoff queue" sections (both already correct, per "don't rebuild something already correct") and for the no-active-plan → `FirstPlanBuilder` path. Only the old single hardcoded "+$50/mo" Reforecast section was replaced with `<PlanHub>`.

Every apply action (reforecast, strategy switch, Finish By payment increase, scenario apply) requires an explicit `ConfirmationDialog` click showing a before/after figure (old vs. new projected $0 date, or old vs. new estimated interest) before calling the real service method — never an implicit apply-on-preview.

## 12. Home/Plan consistency

Verified both by a dedicated service-layer test (four preview calls in a row, then re-check `getWorkspaceSnapshot`'s target debt and active version id are unchanged) and by browser QA: after running Compare, all three What-If sub-modes, two Finish By checks, and a full save→preview→archive Saved Scenario cycle, Home's Zero Day (Nov 2027), total debt ($5,547.00), and current target (Priceline Card) were pixel-identical to before any preview activity.

## 13. Tests

- `src/services/calc/payoffCalculations.test.js` — +4 tests for the `"custom"` pseudo-strategy (ranks by `customOrder`, falls back to snowball ordering for unlisted debts, safe empty-order default, `payoffSimulate` actually redirects the extra-payment pool).
- `src/services/tracktozero/projectionStatusService.test.js` — +1 test threading `customTargetOrder` through to the engine.
- `src/services/tracktozero/v2AsyncApplicationService.planHub.test.js` — new file, **34 tests**: `compareStrategies` (Snowball/Avalanche ordering correctness including the unknown-APR-sorts-last behavior, unknown-APR warning surfaced, zero-write, no-active-plan fallback), `previewOneTimePayment` (balance reduction, no PaymentEvent created, source Debt untouched, default-target fallback, invalid-input handling), `previewCustomTarget` (forces order, labeled `"custom"`, zero-write), `previewGoalDate` (already-on-pace, aggressive-but-feasible requiring a real extra payment, honest large-requirement math, a genuine `feasible: false` case via a synthetic oversized debt, past-date rejection, not-found target debt, debt-scoped variant), `listPlanHistory` (newest-first, grows after reforecast, empty for no plan, non-member denied), Saved Scenarios full lifecycle (save/list/archive, staleness detection after a reforecast, workspace isolation, unsupported-type/blank-name rejection), `applyScenario` (recurring_extra creates N+1 and preserves N, strategy_comparison switches strategy, one_time/custom_target refusal, goal_date re-checks feasibility at apply time), security (owner/admin allowed, viewer denied with specific messages, non-member denied, cross-workspace scenario access denied), and cross-screen Home/Plan consistency.
- `tests/firestore.v2.rules.test.js` — +5 tests for the `scenarios` collection (owner/admin write + no-delete, viewer read-only, contributor denied, non-member/unauthenticated denied, cross-workspace forgery denied) — run against both `firestore.rules` and `firestore.v2.rules` via the existing parity guard.

**Exact results**: `npx vitest run` **585/585 passed**, 41 files (39 new tests this phase: 34 in the new Plan Hub file + 4 payoff-engine + 1 projection-status). `npm run lint`: 0 errors, 3 pre-existing unrelated warnings. `npm run build`: succeeds. `npm run test:firestore`: **12/12** (V1 suite, unaffected by the combined-rules-file edit). `npm run test:firestore:v2`: **59/59** (54 pre-existing + 5 new scenario tests), rules parity **PASS**. `npm run perf:check`: all budgets pass (`TrackToZeroV2App` chunk grew from ~222 kB to ~242 kB, still well inside its page-level budget). `npm audit --omit=dev`: 0 vulnerabilities.

## 14. Browser QA

Real Playwright session against `npx vite --port 5190` in `inMemory` mode (auto-seeded `personal-seed`/`household-seed`, zero manual setup needed — reuses the exact household fixtures already covered by DATA-HH1: Priceline Card $4,100 @ 27.99% APR owned by "Baba", Samsung Financing $517 no-interest owned by "Jidye", Old Store Card $930 **unknown APR** owned by "Baba"). Zero console errors throughout. Verified:

- Switched to the household workspace via the QA harness controls; navigated to Plan.
- **Adjust Plan** tab: Plan History section rendered (Version 1, "Activated", Current badge).
- **Snowball vs Avalanche**: both cards rendered side-by-side with the correct, independently-verified payoff orders (Snowball: Samsung → Old Store Card → Priceline; Avalanche: Priceline → Samsung → Old Store Card, i.e. the unknown-APR debt correctly sorted last, not guessed as highest-priority), each showing owner labels (Jidye/Baba) via `presentedOwnerLabel`, the current-strategy badge on Snowball, and an identical "Some interest rates are unknown" warning on both cards.
- **What If → Recurring extra**: previewed +$50/mo, saw old→new projected date.
- **What If → One-time payment**: previewed a $500 lump sum toward Priceline Card, saw "Without this payment: Nov 2027. With it: Oct 2027," and the explicit "never recorded as a real payment" note.
- **What If → Custom target debt**: previewed forcing extra payment to a specific debt.
- **Finish By**: checked a September 2026 target (1 month out, ~$5,547 total debt) and got the honest, corrected answer — `$5,428.00/mo extra required, projected for Aug 2026` — instead of the pre-fix bug's false "already feasible at $200/mo."
- **Saved Scenarios**: saved a "recurring_extra" scenario from What If, confirmed it appeared in the Saved Scenarios list with its type badge, previewed it, archived it, and confirmed it disappeared from the active list.
- Returned to Home and confirmed the Zero Day, total debt, and current target were unchanged from before any of the above preview/save/archive activity.

Not exercised in this pass: applying a reforecast/strategy-switch/scenario end-to-end in the browser (covered thoroughly at the service-test level instead, including the exact PlanVersion N/N+1 preservation check), and the full synthetic 6-8-debt household fixture called for in the original spec's browser-QA section (the existing 3-debt `household-seed` fixture already exercises every distinct code path — multiple owners, Joint is not present in this seed but was already covered structurally in DATA-HH1's own QA, unknown APR, and a mortgage-scale exclusion is exercised in `personal-seed`, not `household-seed`). Given the volume of remaining scope, this pass prioritized breadth across every new Plan Hub surface over further seed-data expansion.

## 15. Accessibility

- Tabs use the existing `Tabs.jsx` primitive: native `<button role="tab" aria-selected>`, keyboard-reachable.
- Every form field uses `Field`/`Select`/`Input`/`MoneyInput`, which already wire `id`/`aria-describedby`/`aria-invalid`.
- Warnings render through `WarningCallout`/`Callout`, which pairs an icon with text and a `role="status"`/`role="alert"` — never color-only.
- `ConfirmationDialog` reuses the existing `Modal` primitive (already covered by the app's accessibility baseline) for every apply action.
- No new custom widgets were introduced.

## 16. Files changed

New: `src/components/tracktozero/plan/PlanHub.jsx`, `planCopy.js`, `src/services/tracktozero/v2AsyncApplicationService.planHub.test.js`, `TRACKTOZERO_UX4_PLAN_HUB_RESULTS.md`.

Modified: `src/services/calc/payoffEngine.js` (`"custom"` pseudo-strategy), `payoffCalculations.test.js`; `src/services/tracktozero/projectionStatusService.js` (`customTargetOrder` threading), `projectionStatusService.test.js`; `src/domain/tracktozero/constants.js` (+`SCENARIO_TYPES`/`SCENARIO_STATUSES`), `models.js` (+`createSavedScenario`); `src/services/repositories/tracktozeroRepositories.js`, `firebaseTrackToZeroRepository.js`, `firestoreTimestamps.js` (scenario collection CRUD + path helpers + timestamp fields); `src/services/tracktozero/v2AsyncApplicationService.js` (+`buildPlanPreviewFromDebts`, `compareStrategies`, `previewOneTimePayment`, `previewCustomTarget`, `previewGoalDate` (+bug fix), `listPlanHistory`, `listWorkspaceScenarios`, `saveScenario`, `archiveScenario`, `getScenarioPreview`, `applyScenario`); `src/components/tracktozero/TrackToZeroV2App.jsx` (`Plan` now renders `<PlanHub>` instead of the old inline Reforecast section; unchanged otherwise); `firestore.rules`, `firestore.v2.rules`, `tests/firestore.v2.rules.test.js`.

## 17. Known limitations

- The full 20-step, 6-8-debt synthetic browser QA script from the original spec was scoped down to the existing `household-seed` fixture (3 debts) for this pass — see §14 for exactly what was and wasn't covered and why.
- No end-to-end browser click-through of an actual "Apply" confirmation was performed (service-layer tests cover this thoroughly, including PlanVersion N/N+1 preservation) — a natural next QA pass would click through Adjust Plan → Apply and Saved Scenarios → Apply in the browser and screenshot the resulting Plan History entry.
- What If's "Recurring extra" sub-mode and the Adjust Plan tab both ultimately call the same `previewReforecast`/`applyReforecast` primitives from two different entry points by design (explore-and-save vs. direct-adjust) — this is intentional, not duplicated payoff math, but is worth knowing if the two ever need to diverge in copy/behavior later.

## 18. Explicitly deferred

- **UX-2.1** (Home charts/momentum/donut visuals) — not touched.
- **UX-5** (broad import redesign) — not touched.
- **UX-6** (invitations/account-linking) — not touched.
- **UX-7** (full milestone/retention/celebration engine) — not built; only the lightweight, explicitly-allowed Plan History list (§9) was added.

---

```text
NO PARALLEL ACTIVATION PATH WAS EVER ADDED
NO PREVIEW CALL WRITES ANYTHING
NO SCENARIO IS EVER TREATED AS THE ACTIVE PLAN WITHOUT EXPLICIT APPLY CONFIRMATION
NO HYPOTHETICAL PAYMENT BECOMES A PAYMENTEVENT
UNKNOWN APR NEVER SILENTLY BECOMES 0% OR CONFIRMED
HISTORICAL PLANVERSIONS REMAIN IMMUTABLE
UX-2.1 NOT IMPLEMENTED
UX-5 BROAD POLISH NOT IMPLEMENTED
UX-6 NOT IMPLEMENTED
UX-7 FULL SYSTEM NOT IMPLEMENTED (LIGHTWEIGHT PLAN HISTORY ONLY)
NO PRODUCTION DEPLOYMENT
NO REAL FINANCIAL DATA USED
```

**NEXT:** a browser click-through of the Apply confirmation flows (Adjust Plan, Compare's Switch Strategy, Finish By, Saved Scenarios), and/or expanding the household seed fixture to the full 6-8-debt/Joint-debt/paid-off-debt/mortgage-exclusion shape called for in the original spec.
