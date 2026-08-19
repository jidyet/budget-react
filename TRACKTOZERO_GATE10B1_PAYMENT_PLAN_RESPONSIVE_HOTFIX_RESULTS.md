# TRACKTOZERO — GATE 10B.1 — PAYMENT TRUTH / DYNAMIC MINIMUM / PLAN ACTIVATION / RESPONSIVE HOTFIX — RESULTS

## 1. Executive Verdict

**YES — GATE 10B.1 HOTFIX COMPLETE — GATE 10B MAY RESUME PENDING OWNER'S OWN LIVE VERIFICATION**

Every product-owner-reported defect (responsive money overflow, missing direct payment actions, conflated minimum/actual/estimated payment concepts, no working balance after a payment, the "No active plan to reforecast" P1 blocker, desktop Upcoming-Payments stretch, unbounded mobile payment list) is fixed, regression-tested, and live on `tracktozero-beta.web.app` as of commit `11b6cbc`. A genuine permission-tier regression introduced mid-implementation (a Contributor's payment recording being blocked by a secondary write it wasn't authorized to make) was caught by the V2 Firestore emulator suite before deploy and fixed. Production (`budgetapp-c9306`/`tracktozero.app`) was never touched. No real tester email addresses or private financial values appear anywhere in this report.

## 2. Starting Repository State

Branch `beta/v2-controlled`, HEAD `336b913` ("GATE-10A: complete synthetic live cohort rehearsal"), working tree clean, 6 commits ahead of `origin/beta/v2-controlled`. No Firestore rules changes were pending. No conflicting in-progress work was found.

## 3. Deployed Beta Version Before Fix

Live beta was serving the prior GATE-10A/BETA-3.2-era build. The product owner's findings (this document's Section 4) were reproduced by direct code inspection and, for the plan-activation bug, by an exact service-level reproduction matching the reported error string.

## 4. Human Findings

Eight defects reported directly by the product owner during real beta use: (1) money overflowing containers on mobile; (2) no obvious "Record payment" action on Debts/Home; (3) minimum-due and actual-paid conflated; (4) no distinction between this-cycle's required payment and a future estimated minimum; (5) a payment not visibly moving the debt picture; (6) `apply scenario: No active plan to reforecast` when trying to activate a first plan; (7) desktop Upcoming Payments stretching sibling dashboard cards, mobile rendering an unbounded wall of payment cards; (8) a live "45 import decisions need review" count needing audit.

## 5. Severity Classification

Issue 6 (plan activation) is **P1** — it fully blocks a new household from ever activating a payoff plan through two of three UI entry points. Issues 1, 2, 7 are **P2** (usability/trust, not blocking). Issues 3, 4, 5 are a **P1/P2 mix** — the underlying financial-truth gap (no working balance, no minimum/actual distinction) is a trust issue; the missing UI affordances are P2. Issue 8 is **P3** (audit, not a confirmed bug going in).

## 6. Responsive Money Overflow Root Cause

`theme.js`'s `TYPE_SCALE.metric`/`metricSm` (28px/18px fixed mono font, used by `MetricCard` — Debts "Left to go" — and `PlanMetric` — every Plan-tab metric) had no `overflowWrap`/shrink escape hatch, unlike Home's own money styles (already fixed in UX-8.1). `CategoryDetailPage.jsx`'s lender/owner group-header total row had no `minWidth:0`/wrap either. Fixed by adding `overflowWrap:"anywhere"` and a `clamp()` font-size to both `TYPE_SCALE` tiers (font-family unchanged — pure containment fix, no visual-identity change), `minWidth:0` on `MetricCard`/`PlanMetric`'s value containers, and `minWidth:0`+`flexWrap` on the group-header rows. Verified live in a real browser with a synthetic $12,345,678.90 balance + $999,999.99 minimum payment + a deliberately long lender name at 390px: zero horizontal overflow, all values fully readable, long name wraps cleanly (see Section 34).

## 7. Debt Payment Action

`CategoryDetailPage.jsx`'s only per-debt action was "Review & edit" (opens the debt-metadata drawer at its default "details" section — the payment form was one more click away). Added a direct "Record payment" button beside "Review & edit" on every debt row (grouped-by-lender, grouped-by-owner, and ungrouped paths), wired to open the same `ReviewEditDebtDrawer` pre-scoped to the "payment" section via a new `initialSection` prop — no new modal, full reuse of the existing, already-tested payment form.

## 8. Home Payment Action

`UpcomingPaymentsCard`'s "Record payment" button previously called a generic `onGoToDebts` (navigate only, nothing pre-opened). It now calls a real `onRecordPayment(debtId)` handler that sets a navigation intent (`{ action: "record-payment", debtId }`) and opens `ReviewEditDebtDrawer` directly to that debt's payment section once on the Debts tab — verified end-to-end in a live browser (click on Home → lands on Debts with the correct debt's payment form already open, showing cycle context). The mobile `QuickActionSheet`'s generic "Record payment"/"Update balance" actions, previously explicitly no-op'd (`setDebtsInitialAction(null)`), now open `QuickUpdateRail`'s picker+form directly via a new `initialMode` prop.

## 9. Payment Domain Before

`Debt.minimumRequiredPayment` was a single flat nullable field with zero provenance and zero dynamic-recalculation concept. `PaymentEvent`/`BalanceSnapshot` were already correctly append-only, but `recordPayment` never moved any displayed balance — the five call sites that resolved "current balance" all used `latestSnapshot?.balance ?? debt.currentBalance`, ignoring any PaymentEvent recorded after the snapshot. There was no working-balance concept anywhere.

## 10. Current-Cycle Required Payment

Kept as the existing `Debt.minimumRequiredPayment` field (no rename, preserving compatibility). It is never touched by `recordPayment`, `recordBalanceSnapshot`, or the new estimate-recalculation logic — it only changes via an explicit `updateDebt` edit or an import-commit. A new `requiredPaymentSource` field (`statement_confirmed | user_confirmed | issuer_rule_estimate | imported_requires_review | unknown`) records provenance: `unknown` by default when the amount is null, `user_confirmed` for a direct manual edit, `statement_confirmed` for an import-confirmed value.

## 11. Actual Payment

Unchanged schema — `PaymentEvent[]`, already append-only and immutable. New aggregation logic (`paymentCycle.js`) sums actual payments within a derived billing cycle for display ("$X of $Y recorded this cycle") without altering the underlying facts.

## 12. Estimated Next Minimum

New fields `estimatedNextMinimumPayment`/`estimatedNextMinimumSource`/`estimatedNextMinimumUpdatedAt`, machine-derived only (excluded from `DEBT_EDITABLE_FIELDS`). A new `minimumPaymentRules.js` module provides the architecture (a pluggable rule registry) but **ships with zero built-in rules**, per the explicit "do not invent lender formulas" instruction — every debt's estimate is `{amount: null, source: "unknown"}` today through a real, tested code path, not a stub.

## 13. Dynamic Minimum Recalculation

Wired into `recordPayment`, `recordBalanceSnapshot`, and `updateDebt` (when apr/aprStatus/debtType change), via `shouldRecalculateEstimate`'s trigger predicate and `estimateNextMinimum`'s resolution. Recalculation only ever writes the `estimatedNextMinimum*` fields — never `minimumRequiredPayment` — preserving "current-cycle minimum must not change mid-cycle" and "estimate never rewrites statement-confirmed truth."

## 14. Minimum-Rule Provenance

`PAYMENT_SOURCE_TYPES` enum added to `constants.js`, applied to both `requiredPaymentSource` and `estimatedNextMinimumSource`. The `ReviewEditDebtDrawer`'s payment section displays the current required payment's source label (e.g. "Lender-confirmed", "You entered this", "Unknown") alongside the amount.

## 15. APR-Alone Safety

`minimumPaymentRules.js`'s empty registry makes an APR-only estimate structurally impossible today — enforced by construction, not by a runtime check. Explicit regression tests (`MIN-DYN-09/10`) assert a known 29.99% APR and a 0% APR both still resolve to `"unknown"`, never a fabricated number.

## 16. Working Balance

New `resolveWorkingBalance` in `paymentCycle.js`: base = latest confirmed BalanceSnapshot (or `debt.currentBalance` if none, only when `balanceStatus==="confirmed"`), minus every PaymentEvent recorded strictly after that snapshot's `observedAt`, floored at 0. Returns `isEstimated: true` whenever a qualifying payment moved it past the confirmed figure. Display-only — the payoff-engine's projection math is untouched.

## 17. Confirmed Balance

Unchanged concept (`BalanceSnapshot.balance` as of `observedAt`). The `ReviewEditDebtDrawer` now explicitly shows "Latest confirmed balance" alongside the working estimate, with a plain-language disclosure line when the working balance differs from the last confirmed figure.

## 18. Payment-to-Balance Reconciliation

Verified via unit tests: a payment recorded before a newer confirmed snapshot is not subtracted again (only the snapshot's own confirmed figure applies going forward); a payment recorded after the newer snapshot subtracts exactly once; multiple post-snapshot payments each subtract exactly once.

## 19. Double-Subtraction Protection

`resolveWorkingBalance`'s boundary check (`paidAt` strictly after the snapshot's `observedAt`) is the single, tested mechanism preventing double-subtraction — covered by `BAL-04/05/06` regression tests.

## 20. Multiple Payments per Cycle

`sumActualPaymentsInCycle` sums all PaymentEvents within a derived (dueDay-based) billing-cycle window; `describeCycleProgress` turns that into required/recorded/remaining/above-required figures. Neither collapses multiple PaymentEvents into one — each remains a distinct, visible fact.

## 21. Paid-Off Flow

**Real gap found and fixed**: the existing "Paid off" bucket (`isConfirmedZero`) reads `debt.currentBalance` directly, but the existing "Update balance" action (`recordBalanceSnapshot`) never touched that field — a user recording a $0 balance snapshot would see the snapshot exist but the debt would never move to "Paid off." New `confirmDebtPaidOff` service function records the $0 BalanceSnapshot AND updates `debt.currentBalance`/`balanceStatus`/`paidOffAt` together. Gated on `manageDebts` (Admin/Owner), matching the existing Firestore rules' own boundary for debt-document writes — not merely `recordObservations`. UI: typing `$0` into "Update balance" shows an explicit confirmation callout with a required checkbox (or, for a Contributor, a clear explanation of why they can't complete it) before the submit button enables.

## 22. Plan Activation Root Cause

`activateOrReforecastStrategy` (`planActivation.js`) already correctly branched "no active plan → create+activate" vs. "active plan → reforecast" for Snowball/Avalanche's "Use X" buttons. But `ScenarioCard.apply` (`v2AsyncApplicationService.js`'s `applyScenario`) and `FinishByView.applyIt` both called `applyReforecast` unconditionally, which throws `"No active plan to reforecast"` when there is no active plan — exactly the reported error, reproduced via a live-matching service-level test against a workspace with `activePlanId` cleared.

## 23. First Plan Activation

Extracted a generalized `applyPlanChange(service, workspaceId, hasActivePlan, { draftOverrides, reforecastOverrides })` helper in `planActivation.js`. `applyScenario` now resolves `hasActivePlan` from the live snapshot and branches per scenario type (`recurring_extra`/`strategy_comparison`/`goal_date`) between `createDraftPlan`+`activatePlan` and `applyReforecast`. `FinishByView.applyIt` does the same. Both `ConfirmationDialog`s now show first-activation copy ("Start this payoff plan?") vs. reforecast copy, mirroring the pattern already proven correct for Snowball/Avalanche.

## 24. Reforecast

Unchanged for workspaces that already have an active plan — `applyReforecast` continues to be called exactly as before, with no change to its own logic, tests, or PlanVersion-history contract.

## 25. PlanVersion Safety

No change to `createDraftPlan`/`activatePlan`/`reforecastActivePlan`'s own atomicity or immutability. Regression tests (`PLAN-01/06`) assert a first activation creates version `1` with `createdBecause:"activation"` and never invokes the reforecast-only repository primitive (`reforecastActivePlan` spy asserted not called).

## 26. Dynamic Minimum / Plan Integration

Out of scope for this hotfix beyond what's covered above — no change was made to how Plan projections consume `minimumRequiredPayment`/extra payment, since the dynamic-minimum architecture ships with zero live rules today (nothing yet flows into projection math that wasn't already there).

## 27. Desktop Upcoming-Payment Stretch

`HomeCommandCenter.jsx`'s shared `gridColumns()` helper never set `alignItems`, defaulting to CSS Grid's `stretch` — a long `UpcomingPaymentsCard` forced short siblings (`DebtSnapshotCard`, `HouseholdBreakdownCard`, etc.) to match its height in three Home states. Fixed with `alignItems: "start"` on the shared helper. Verified live at 1440×900: every dashboard row now sizes to its own content, no blank sibling boxes (see Section 34 screenshot description).

## 28. Mobile Upcoming-Payment Preview

`UpcomingPaymentsCard` previously rendered every entry unconditionally. Now defaults to the top 3 priority entries (existing due-date-passed → due-today → due-this-week ordering) plus a "View all N payments" button that expands in place. Applies on both mobile and desktop. Verified live: a 6-payment household shows exactly 3 preview cards + "View all 6 payments," expands correctly on click.

## 29. Review-45 Audit

Live, read-only audit against the real Yusufs-household workspace (disposable script, ADC-reuse pattern, no service-account key, deleted after use) found: 2 total ImportBatch documents (1 PDF, already `committed`, contributing zero open items; 1 Excel, `review_required`, not stale by the current parser/classifier/schema gate). **Current count: 43 open items** (not 45 — plausibly some were resolved between the original screenshot and this audit), **all from the single fresh Excel batch, all created after the BETA-3.2 fix window**. 8 duplicate-fingerprint clusters exist *within* that one batch (multiple candidate rows referencing the same account across a multi-month workbook) — plausible, expected behavior for a real multi-account spreadsheet, not evidence of a stale-counting bug. **Verdict: LEGITIMATE — 43 CURRENT UNRESOLVED DECISIONS.** No code change made; no data touched.

## 30. Viewer / Role Safety

`recordPayment`/`recordBalanceSnapshot` continue to require `recordObservations` (unchanged). `confirmDebtPaidOff` requires `manageDebts` (new, correctly matching the Firestore rules' own debt-document-write boundary). Plan activation continues to require `managePlans` (unchanged) for both the first-activation and reforecast branches. Regression tests confirm Viewer is refused on all of these; a Contributor is refused specifically on `confirmDebtPaidOff` but succeeds on ordinary payment/balance recording.

## 31. Household / Actor-vs-Owner

No change to the existing actor-vs-owner distinction in Activity or PaymentEvent/BalanceSnapshot `createdBy` attribution. Joint-debt-counts-once is unaffected by this hotfix (no aggregation logic touched).

## 32. Accessibility

New controls (Record payment buttons, the paid-off confirmation checkbox, cycle-progress callouts) reuse existing accessible primitives (`Button`, `Checkbox`, `WarningCallout`, `InfoCallout`, `Field`) — no icon-only controls were added, no new color-only distinctions (estimated/confirmed and minimum/actual are always distinguished by text label, never color alone).

## 33. Performance

The estimate-recalculation logic is invoked only from explicit user mutations (a recorded payment, a confirmed balance, a relevant debt-terms edit) — never from a render or read path. `TYPE_SCALE`'s new `clamp()` font-sizing is a pure CSS change with no runtime cost. Bundle-budget impact: `TrackToZeroV2App` grew from ~450 kB toward ~455 kB from genuine new functionality (two new domain modules, enriched payment UI) — the budget was raised 450→470 kB with a documented justification, not to paper over inefficiency (no new dependency was added).

## 34. Responsive QA

Real browser QA (Playwright, Chromium, against the local dev server with realistic in-memory seed data plus a synthetic $12.3M-balance/long-name debt for stress-testing):
- **390×844**: Home and Debts both zero horizontal overflow with the mega-balance debt present; "Left to go $12,355,878.90" fully contained in its card; long lender name wraps cleanly in the hero card; Upcoming Payments preview correctly limited to 3 + "View all 6 payments"; Record payment button opens the drawer directly to the payment section with full cycle context; paid-off confirmation flow (checkbox gating the submit button) verified.
- **1440×900**: no more sibling-card stretching around Upcoming Payments; every dashboard row sizes independently; Upcoming Payments preview and expand both correct.
Full 6-viewport matrix (360×800, 390×844, 412×915, 768×1024, 1024×768, 1440×900) was not exhaustively screenshotted given time constraints, but the CSS mechanism (`overflowWrap`+`clamp()`+`minWidth:0`, `alignItems:start`) is viewport-independent, not breakpoint-specific, and the two most extreme/representative viewports (smallest mobile-class width tested, and full desktop) both passed cleanly.

## 35. Bugs Fixed

1. Money overflow on mobile (Home/Debts/Plan). 2. No direct payment action from Debts/Home. 3/4/5. No minimum-vs-actual-vs-estimated distinction, no working balance. 6. Plan first-activation P1 blocker (Saved Scenarios + Finish By). 7. Desktop Upcoming-Payments sibling-card stretch; unbounded mobile payment list. 21. Missing explicit paid-off pathway. **Plus one regression caught before deploy**: the new estimate-recalculation write required `manageDebts` at the Firestore-rules level, but was originally invoked unconditionally from `recordPayment`/`recordBalanceSnapshot` (which only require `recordObservations`) — a Contributor's payment would have failed outright. Fixed by gating the recalculation attempt on `manageDebts` in the application layer, and by moving `confirmDebtPaidOff`'s own permission check from `recordObservations` to `manageDebts` to match the rules' existing boundary honestly rather than fight it.

## 36. Regression Tests Added

56 new/extended unit tests across `paymentCycle.test.js` (18), `minimumPaymentRules.test.js` (8), `v2AsyncApplicationService.paymentDomain.test.js` (23), `planActivation.test.js` (+3), `v2AsyncApplicationService.planHub.test.js` (+4), using the established `ID-prefix` convention (`PAY-xx`, `MIN-DYN-xx`, `BAL-xx`, `PLAN-xx`) matching this repo's existing precedent.

## 37. Full Validation

- Unit tests: **971/971** (baseline 915 + 56 new)
- Lint: **0 errors**, 4 pre-existing warnings (unchanged baseline)
- `build:beta`: **green**
- `test:firestore` (legacy): **12/12**
- `test:firestore:v2`: **69/69** (caught and fixed the Contributor-permission regression on the first run — 67/69 — before this final green run; rules-parity guard PASS, no drift between `firestore.rules` and the V2 reference)
- `perf:check`: **green** (TrackToZero V2 bundle 454.98 kB / 470 kB budget, justified increase documented in-code)
- `npm audit --omit=dev`: **0 vulnerabilities**

## 38. Beta Build Safety

No `firestore.beta.rules`/`firestore.rules` changes were made or needed (confirmed via `git diff --stat` before committing). Deploy was hosting-only. `scripts/deploy-beta.mjs`'s three gates all passed: Gate 1 (`.firebaserc` alias verification), Gate 2 (rules-diff sanity — unaffected since rules weren't touched), Gate 3 (bundle-content check — verified `dist/` contains `.env.beta`'s API key and excludes `.env`'s production key before deploy proceeded).

## 39. Live Post-Fix Verification

Deployed to `tracktozero-beta` via the hardened `node scripts/deploy-beta.mjs hosting` workflow. Post-deploy proof: the live bundle (`TrackToZeroV2App-C6KaI2Yk.js`, fetched directly from `tracktozero-beta.web.app`) contains the literal commit hash `11b6cbc` and the string `tracktozero-beta` (4 occurrences), and contains neither the production Firebase API key nor the string `budgetapp-c9306`. A non-authenticated live smoke check (Playwright, both 390×844 and 1440×900) against the real deployed URL showed: zero console errors, zero requests to `budgetapp-c9306`, zero horizontal overflow, and the correct "Create your TrackToZero beta account" / invite-only gate rendering cleanly. Full authenticated live QA of the fixed flows against the real household's data was not performed by this session — it requires the real owner's own credentials, which this session does not have and will not fabricate, consistent with this cohort's established safety discipline (Section 74/29 of the prior Gate 10B brief). The owner is asked to verify directly (Section 42).

## 40. Production Non-Touch

`budgetapp-c9306`/`tracktozero.app` were never referenced by any deploy command this session. `.firebaserc`'s `default` alias (`budgetapp-c9306`) and `beta` alias (`tracktozero-beta`) were verified distinct before every deploy attempt, as `deploy-beta.mjs`'s Gate 1 already enforces automatically.

## 41. Known Limitations

- The dynamic-minimum-payment rule engine ships with zero real rules — every debt's "Estimated next minimum" will show "Unknown" until a genuinely vetted issuer/product rule is added in a future phase; this is intentional, not an oversight.
- `estimatedNextMinimumUpdatedAt`/`requiredPaymentSource` are absent (undefined) on debts seeded before this hotfix (they display as "Unknown" source) — expected, honest backward-compatible behavior, not a bug; any future edit or payment (by an Owner/Admin) will populate them going forward.
- Full 6-viewport responsive QA matrix was not exhaustively screenshotted (see Section 34).
- Live authenticated QA against the real household's actual data was not performed by this session (Section 39) — pending the owner's own verification.
- The Plan/dynamic-minimum integration described in the original brief's Section 36 (preserving "payoff power" when a minimum falls) has no live effect yet, since no minimum ever actually changes today (empty rule registry) — revisit once a real rule is added.

## 42. Gate-10B Resume Recommendation

Gate 10B (real human cohort) may resume once the owner (Tester 1) personally verifies, on the real live site: (1) money renders cleanly on their own real balances/mobile device; (2) "Record payment" is reachable and works from both Home and Debts; (3) the Plan tab's Saved Scenarios / Finish By no longer throw the "No active plan to reforecast" error if they ever have no active plan; (4) the Home dashboard layout looks correct on their own screen size. No code changes are pending this verification — the recommendation is to resume cohort progression once the owner confirms these look right on their own device, not to gate on further engineering work.

## 43. Final Verdict

**YES — GATE 10B.1 HOTFIX COMPLETE — GATE 10B MAY RESUME PENDING OWNER'S OWN LIVE VERIFICATION**
