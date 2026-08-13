# TrackToZero Phase 1 Follow-up Results

## 1. Status

The derived plan-payment compatibility follow-up is complete on branch `phase1/engine-extraction`.

No push was performed. No Phase 2 data model, Firestore rules/schema work, navigation redesign, household work, field rename, or persisted value migration was introduced.

## 2. Current 1.0 Plan Context

The current 1.0 plan context is held by `usePlans()`:

- `plans`: saved payoff plan list.
- `planId`: selected/saved plan id.
- `savePlan()` and `saveRawPlan()` set `planId` to the saved plan id after persistence.
- `PayoffPage` already receives `plans`, `planId`, and editable `planItems`.

For this follow-up, the derived display uses only an explicit `planId` match:

- If `planId` matches a plan in `plans`, that plan is the current plan context.
- If `planId` is blank or missing, the derivation does not guess first/newest/recent plan.
- Fallbacks then preserve persisted/manual `planned_v`.

## 3. Affected Surfaces

Confirmed surface needing derived plan payment:

| Surface | Decision | Why |
| --- | --- | --- |
| `src/pages/AccountsPage.jsx` | Updated | It renders the user-facing `Plan $X` label from `planned_v`, which previously updated because plan save wrote `planned_v`. |

Deliberately left alone:

| Reader | Decision | Why |
| --- | --- | --- |
| `src/pages/PayoffPage.jsx` | Left alone | It already has explicit current plan state via `planItems`, `planMonthlyExtra`, `planId`, and `plans`; changing `planned_v` reads here risks altering payoff calculations or double-counting. |
| `src/pages/TrendsPage.jsx` | Left alone | Uses `planned_v` for analytics/payment basis, not the restored `Plan $X` label. No unambiguous current-plan display context was present. |
| `src/App.jsx` | Left alone | Uses `planned_v` in aggregate estimated payment logic, not the specific plan label. |
| `src/services/aiCoachPayload.js` | Left alone | Uses `planned_v` as summarized payment input; deriving a plan payment here could change coach payload semantics outside the display fix. |
| `src/components/bills/UrgentBillBanner.jsx` | Left alone | Uses `planned_v` as an amount fallback for urgent bill display, not the plan-save-derived label. |
| Edit panels | Left alone | Manual entry/edit of `planned_v` remains a legitimate persisted/manual use. |

## 4. Recovered Pre-Phase-1 Formula

Recovered from `HEAD^:src/hooks/usePlans.js`, the removed `syncPlannedPayments()` did:

```js
items
  .filter((item) => item.include)
  .map(async (item) => {
    const acct = allAccts.find((a) => String(a.id) === String(item.account_id));
    if (!acct) return;
    const minDue = Math.max(0, Number(acct.min_due_v || 0));
    const extra = Math.max(0, Number(item.extra_payment || 0));
    await updateRecord(String(acct.id), { planned_v: minDue + extra });
  })
```

Exact behavior reproduced:

- Only included plan items count.
- Account match is `String(account.id) === String(item.account_id)`.
- Missing account means no derived value.
- Minimum due is `Math.max(0, Number(account.min_due_v || 0))`.
- Extra payment is `Math.max(0, Number(item.extra_payment || 0))`.
- No rounding.
- Derived amount is `minDue + extra`.
- Excluded/uncovered debts return a sentinel and do not override manual `planned_v`.

## 5. Derivation Function

New file:

- `src/services/calc/planPaymentDerivation.js`

Primary exports:

- `NO_DERIVED_PLAN_PAYMENT`
- `getCurrentPlanFromContext({ plans, planId })`
- `derivePlanPaymentForAccount({ plan, account })`
- `getDisplayPlannedPayment({ plans, planId, account })`

Sentinel behavior:

- `derivePlanPaymentForAccount()` returns `NO_DERIVED_PLAN_PAYMENT` (`null`) when there is no matching included plan item.
- `getDisplayPlannedPayment()` then falls back to persisted/manual `planned_v`.

## 6. Display Precedence

Accounts display now follows:

1. Valid current-plan derived value.
2. Persisted/manual `planned_v`.
3. Existing legacy fallback in the local display calculation.

This is read-time only. It does not write `planned_v`.

Wiring:

- `AppPageContent` passes `plans` and `planId` to `AccountsPage`.
- `AccountsPage` uses `getDisplayPlannedPayment()` for the planned breakdown and `Plan $X` label.

## 7. Mutation Safety

No plan-save mutation was reintroduced:

- `syncPlannedPayments()` remains removed.
- `savePlan()` persists the plan only.
- `saveRawPlan()` persists the plan only.
- No plan-save path writes `planned_v`.

The regression test checks that `src/hooks/usePlans.js` does not contain the removed mutation path and that the same saved/current plan context derives the expected display payment.

## 8. Tests Added

New tests:

- `src/services/calc/planPaymentDerivation.test.js`

Coverage:

- Exact old formula reproduction.
- Numeric coercion and clamping.
- Excluded/uncovered debt sentinel.
- No input mutation.
- No persistence call.
- No-plan fallback to manual `planned_v`.
- Current-plan derived value takes precedence over persisted `planned_v`.
- Excluded debt does not override persisted `planned_v`.
- Explicit current-plan id only; no guessing.
- Integration-level source/view contract: plan-save mutation path absent and current plan derives display value.

Golden-master payoff tests still pass unchanged.

## 9. Validation

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 7 files / 59 tests |
| `npm run lint` | Passed with 3 existing React hook dependency warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 rules tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

## 10. Confirmations

- No `syncPlannedPayments()` was reintroduced.
- No plan-save to record mutation was reintroduced.
- Payoff golden-master results remain unchanged.
- No persisted fields or values were renamed/reformatted.
- No Active Plan lifecycle was invented.
- No Phase 2 work was started.

## 11. Phase 2 Notes

- If Trends, AI Coach, or global aggregates should use active-plan-derived payments, they need a real active-plan lifecycle or explicit selected-plan context first.
- The source-level mutation guard is a pragmatic regression test because the repo does not currently include a React hook testing setup.

