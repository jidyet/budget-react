# TrackToZero Phase 1 Results

## 1. Status

Phase 1 is complete on branch `phase1/engine-extraction`.

Scope honored:

- No TrackToZero 2.0 data model was added.
- No Firestore schema or rules changes were made.
- No navigation/UI redesign was made.
- No persisted storage keys or field names were renamed.
- No remote push was performed.

## 2. Calculation-Service Structure

New pure calculation services:

| File | Purpose |
| --- | --- |
| `src/services/calc/payoffEngine.js` | Pure month-by-month Snowball/Avalanche payoff simulation, scheduled-payment helper, legacy account adapter, and strategy target ordering. |
| `src/services/calc/goalDate.js` | Pure goal-date required-extra solver extracted from `PayoffPage`. |
| `src/services/calc/scenarioComparison.js` | Pure what-if comparison helpers for current-vs-scenario rows, months saved, and interest saved. |
| `src/services/calc/payoffCalculations.test.js` | Golden-master and edge-case coverage for the extracted services. |

Compatibility boundary:

- `src/utils/payoffEngine.js` now re-exports the extracted payoff engine from `src/services/calc/payoffEngine.js`.
- Existing imports from `src/utils/payoffEngine.js` continue to work.
- `PayoffPage` now imports the extracted goal-date and scenario-comparison services instead of owning that math inline.

The calculation services are plain functions: no React state, no Firebase, no persistence writes, and no intentional mutation of caller-owned inputs.

## 3. APR Convention

Boundary decision:

- Legacy UI/account data may still contain APR-like values as `20` or `0.20`.
- The calculation boundary normalizes through the existing `getEffectiveApr()` / `normalizeAprDecimal()` path.
- Inside the payoff simulation state, APR is decimal-form: `0.20` means 20%.

No persisted APR fields were renamed. No stored values were migrated or rewritten.

## 4. `planned_v` Dependency Map

### Writers after Phase 1

| Writer | Path | Notes |
| --- | --- | --- |
| Default record creation | `src/utils/budgetUtils.js` | Initializes `planned_v: 0`. |
| Manual edit panel | `src/components/EditPanel.jsx` | User can enter planned amount manually. |
| Modal edit panel | `src/components/overlays/EditPanelModal.jsx` | User/edit flow can write `planned_v`. |
| Workspace record update sanitizer | `src/hooks/useWorkspaceRecords.js` | Accepts `planned_v` when explicitly passed to `updateRecord()`. |

Removed writer:

- `src/hooks/usePlans.js` no longer has `syncPlannedPayments()`.
- `savePlan()` no longer writes `planned_v`.
- `saveRawPlan()` no longer writes `planned_v`.

### Readers / dependents

| Reader | Purpose |
| --- | --- |
| `src/utils/payoffEngine.js` / `src/services/calc/payoffEngine.js` | Uses `planned_v` as scheduled payment when present. |
| `src/App.jsx` | Uses `planned_v` when estimating planned-or-min payment. |
| `src/pages/AccountsPage.jsx` | Displays planned payment and plan labels. |
| `src/pages/PayoffPage.jsx` | Uses `planned_v` for current payment calculations; strips it for minimum-only baseline comparisons. |
| `src/pages/TrendsPage.jsx` | Uses planned payment in trend/debt calculations. |
| `src/services/aiCoachPayload.js` | Includes planned payment in summarized coach payload. |
| `src/components/bills/UrgentBillBanner.jsx` | Uses planned amount as fallback display amount. |

### Save path before vs now

Before Phase 1:

1. User saved a payoff plan.
2. `usePlans.savePlan()` or `saveRawPlan()` persisted the plan.
3. The same save path also called `syncPlannedPayments()`.
4. `syncPlannedPayments()` wrote `planned_v = min_due_v + plan extra_payment` into live monthly account records through `updateRecord()`.

After Phase 1:

1. User saves a payoff plan.
2. The plan payload is persisted.
3. No account/month record is implicitly mutated.

Compatibility note:

- Existing manually-entered or previously-persisted `planned_v` values still render and calculate as before.
- New plan saves no longer create/update `planned_v` records as a hidden side effect.
- The future compatibility target is an explicit derived view for “plan payment” in legacy bill/debt screens, not a plan-save mutation. That should be handled as a focused follow-up if 1.0 screens need the old “Plan $X” label after new saves.

## 5. Scenario-Isolation Guarantee

What-if/scenario comparison is now isolated in `src/services/calc/scenarioComparison.js`.

Tests assert:

- Running payoff simulation does not mutate account inputs.
- Running scenario comparison does not mutate baseline rows or scenario rows.
- What-if preview functions do not perform persistence.

The only remaining persistence path for applying a what-if is the explicit UI action that calls `saveRawPlan()`; the preview calculation itself is read-only.

## 6. Golden-Master Results

Golden-master fixtures were captured and asserted in `src/services/calc/payoffCalculations.test.js`.

Fixtures:

- Single 0% APR debt.
- Multiple Snowball debts.
- Multiple Avalanche debts.
- Mixed APR debts.
- Negative-amortization behavior.
- Debt payoff with rollover.
- Promotional APR behavior.

Equality result:

- Before/after behavior is preserved for extracted payoff results.
- No payoff output diffs were introduced by extraction.
- No output was classified as `UNINTENTIONAL REGRESSION`.
- No output was classified as `APPROVED EDGE-CASE FIX`.

Characterized current behavior:

- Equal-APR Avalanche ordering is deterministic under the current JavaScript stable sort behavior and preserves input order. No secondary tie-breaker was added.
- Negative-amortization rows show growing remaining debt when payments do not cover interest, but the current engine does not return a warning field. This was not added in Phase 1 because it would be new output capability.

## 7. One-Time Payment and Goal-Date Findings

One-time / lump-sum payment:

- Search did not find an existing one-time payoff scenario equivalent in the current app.
- Phase 1 did not implement one-time payments.
- Extension point: future one-time payment support should plug into the pure calc layer beside recurring-extra scenario inputs, likely in `src/services/calc/scenarioComparison.js` and the payoff simulation input contract.

Goal-date:

- The binary-search goal-date solver was extracted to `src/services/calc/goalDate.js`.
- Feasible and capped/infeasible behavior are covered by deterministic tests.
- Current infeasible behavior returns `additionalNeeded: null` when the capped search cannot find an extra amount below the existing `100000` ceiling. This behavior was preserved.

## 8. Tests and Validation

Validation run on `phase1/engine-extraction`:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 6 files / 50 tests |
| `npm run lint` | Passed with 3 existing React hook dependency warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 rules tests |
| `npm run perf:check` | Passed |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

## 9. Phase 2 / Later Backlog

- Add explicit negative-amortization warning metadata if the product wants warning output.
- Add one-time/lump-sum payment scenario support.
- Add an explicit derived “plan payment” compatibility view for legacy screens if needed, without reintroducing plan-save record mutation.
- Add richer active-plan/version/status contracts in Phase 2.
- Revisit equal-APR tie-breaking only if product wants a documented secondary ordering rule instead of stable input order.

