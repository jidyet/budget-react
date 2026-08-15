# TrackToZero UX-2.1 Home Momentum Results

## 1. Status

UX-2.1 Home closeout is complete: implemented, browser-verified, and validated.

**CODE COMPLETE / VALIDATION GREEN / BROWSER QA COMPLETE**

This document was updated during a residual-closeout pass on top of the original implementation. That pass found and fixed two real defects that were blocking any real browser rendering of Home (see §4a); once fixed, full browser verification was completed successfully.

## 2. Baseline

- Branch: `phase4/migration-rehearsal`
- Baseline commit at start of the original UX-2.1 implementation pass: `61888b9`
- This residual-closeout pass started with UX-5 already committed separately as `b6a09235d27da1c6f98b5b48f7209dbae3a475e8`
- Scope honored throughout:
  - no UX-5 implementation or regression
  - no UX-6 implementation
  - no UX-7 reminder / retention implementation
  - no production Firebase config changes
  - no production deploy
  - no production migration
  - no real financial data

## 3. What This Closeout Finished

This pass closed the remaining UX-2.1 Home requirements without redesigning Home from scratch.

### Hero / snapshot

- Fixed the Debt Freedom hero metric collision risk by switching the top metrics to a more resilient responsive grid and responsive amount sizing.
- Removed duplicated progress storytelling from the hero.
- Added debt-count context from trusted debt data.
- Kept projected $0 absent until an active plan exists.
- Preserved confirmed progress as confirmed truth only.

### Confirmed Progress

- Kept the progress ring.
- Moved the clearer Starting / Current / Goal framing into the Confirmed Progress card.
- Preserved 0% as an intentional opening state instead of implying fake progress.

### Household Snapshot

- Added a purposeful all-Unassigned household state.
- Assigned breakdown continues to use canonical dynamic owner display.
- Joint remains counted once.
- Unassigned remains shown honestly.

### Debt summary on Home

- Added a compact Your Debts snapshot card.
- Shows debt count / remaining debt.
- Shows highest known APR when available.
- Leaves APR unknown when it is genuinely unknown.

### No-plan Home

- Compare strategies remains the primary CTA.
- Add debt remains the secondary CTA.
- This Month no-plan copy is now intentional and non-fake.
- No-plan Home can show confirmed debt trend when enough confirmed history exists.

### Active-plan Home

- Hero shows confirmed remaining debt, confirmed knocked-out amount, progress %, and projected $0 date.
- This Month now shows current target, planned amount, recorded amount, honest payment status, and next move.
- Added a compact Your Plan card that routes to My Plan instead of duplicating the full plan screen.
- Added projected milestone wording that stays clearly projected.
- Added a shared next-move derivation in the Home view model rather than ad hoc JSX branching.

### Payment vs balance truth

- PaymentEvent does not reduce confirmed debt by itself.
- BalanceSnapshot remains observed-balance truth.
- PlanVersion / ExpectedCheckpoint remains projected truth.
- Added deterministic test coverage for that separation.
- **Verified live in browser this pass** — see §5.

## 4. New / Updated Truth Layer

### Added

- `src/components/tracktozero/home/homeMonthlyStatus.js`
- `src/components/tracktozero/home/homeMonthlyStatus.test.js`

### Centralized behaviors now covered

- no active plan monthly state
- no target state
- no payment expected state
- not recorded
- partially recorded
- recorded
- recorded-more-than-planned
- payment-count accumulation
- same-period vs prior-period event separation
- balance-refresh-needed state after payment without updated balance

## 4a. Bugs found and fixed during residual closeout

The first attempt at live browser verification hung indefinitely with zero console output — the page never finished rendering. Root cause investigation (isolating the app from Playwright/environment noise via a clean `git worktree` at the already-committed UX-5 baseline, then bisecting the actual derivation functions) found two real, independent defects, both pre-existing in this session's Home work and never previously exercised against realistic data:

1. **Infinite loop in `sampleEvenly` (`homeViewModels.js`)** — the trajectory-sampling helper grew a `Set` of picked indices via `while (picked.size < maxPoints) { ratio = picked.size / (maxPoints - 1); picked.add(...) }`. Once a computed index collided with one already in the Set, `Set.add()` was a no-op, so `picked.size` never advanced — which meant the next loop iteration recomputed the *identical* ratio and the *identical* colliding index, forever. This collision isn't a rare edge case: at `picked.size === maxPoints - 1`, `ratio` is always exactly `1`, which always maps to `items.length - 1` — the very last index, already seeded into the Set at the start. So this hung on **every** call where `items.length > maxPoints` (8), including Home's own trajectory chart against any real plan's `expectedCheckpoints` (the seed alone generates 24+). This is why the app appeared to hang completely in the browser: a synchronous infinite loop blocks the render thread, which also blocks Playwright's CDP channel, which is why even basic DOM queries timed out with no console error ever logged. Fixed by deriving each of the fixed `maxPoints` indices from its own loop position `i` (a plain `for` loop, `maxPoints` iterations, always terminates) instead of from the Set's current size.
2. **`ExpectedCheckpoint.period` / `PlanVersion.projectedZeroDate` format mismatch** — three separate call sites assumed these fields were `"YYYY-MM"` strings, but the payoff engine (`payoffEngine.js`'s `payoffSimulate`) has only ever produced `toLocaleDateString("en-US", { month: "short", year: "numeric" })` output, e.g. `"Apr 2027"`. Concretely:
   - `homeViewModels.js`'s `parseMonthLabel` built `` `${value}-01T00:00:00.000Z` ``, which for `"Apr 2027"` produces the invalid date string `"Apr 2027-01T00:00:00.000Z"` — silently `NaN`. This `NaN` then flowed straight into `TrajectoryChart`'s SVG `path`/`circle` coordinates as literal `NaN` attributes (console-visible React/DOM errors, not just a missing value).
   - `homeMonthlyStatus.js`'s `deriveCurrentPlanPeriodStatus` compared `checkpoint.period` directly against a `"YYYY-MM"` key, so the lookup **never matched** — the checkpoint's own `expectedPayment` was silently never used (quietly falling back to the plan's flat extra instead, not a crash, but not the intended per-period behavior either).
   - `HOME_REFERENCE_MONTH` (used for the "X months from now" insight text) was hardcoded as `"2026-08"`, so `monthDiff` against a `projectedZeroDate` like `"Jul 2028"` always returned `null`, silently dropping that detail from the insight card.

   Fixed by correcting `parseMonthLabel` to parse the real `"Mon YYYY"` format, updating `HOME_REFERENCE_MONTH` to match, and adding a parallel `monthLabelToPeriodKey` helper in `homeMonthlyStatus.js` for the checkpoint lookup. `deriveProjectedTrajectory` now drops (rather than emits) any point whose period fails to parse, so a future unexpected shape degrades honestly instead of reintroducing `NaN`.
3. **React key collision in `TrajectoryChart`** (`HomeCommandCenter.jsx`) — a consequence of fix #2 surfacing a second, previously-invisible issue: the "starting baseline" point and a "confirmed" point can legitimately share the same timestamp (the plan's activation date and a debt's balance observation date coincide), and the SVG `<circle>` key was only `` `${point.kind}-${point.at}` `` — both points share `kind: "observed"`. Fixed by including `pointType` and the array index in the key.

None of these three defects were introduced by this closeout pass — all three existed in the original UX-2.1 implementation and simply had never been exercised against real data with more than 8 checkpoints or a coinciding baseline/observation date. They are fixed now, with regression tests (see §6) that specifically use the real `"Mon YYYY"` format so the bug class can't silently return.

## 5. Browser QA (completed this pass)

Real Playwright session against `npx vite --port 5194` in `inMemory` mode (household-seed and personal-seed, both with active plans and real balance-snapshot history). Zero console errors after the fixes in §4a.

- **Active-plan Home** (household workspace): hero (debt remaining, knocked out, progress %, projected $0), This Month card (current target, planned amount, recorded amount, honest "nothing recorded yet" status, due day, next move), Confirmed Progress ring, trajectory chart (solid confirmed line + dashed projected line, no visual artifacts), Household Snapshot (Joint counted once, Unassigned shown honestly), Momentum card, Next Milestone card, and Insight cards all rendered correctly with real seed data (6 household debts spanning multiple owners, Joint, unknown APR, and a mortgage excluded from the core plan).
- **Payment → balance truth loop, verified end to end**:
  1. Captured "Debt remaining" before any action.
  2. Recorded a $150 payment on Priceline Card via Debts → Record Payment. Returned to Home: "Debt remaining" was **unchanged**, "Recorded so far" correctly showed $150.00, Confirmed Progress stayed at 0% (Current === Starting, both $136,347.00) — a PaymentEvent alone did **not** move confirmed debt.
  3. Updated Priceline Card's confirmed balance ($4,100 → $3,950) via Debts → Confirm Balance. Returned to Home: "Debt remaining" correctly dropped by exactly $150 (to $15,497.00 from $15,647.00 for this fixture), "Knocked out" became $150.00, Confirmed Progress's Current balance dropped to $136,197.00, Momentum card correctly reported "Your latest confirmed balance moved down. $150.00 eliminated," and the household breakdown correctly reflected the owner's (Baba's) reduced total — a BalanceSnapshot, and only a BalanceSnapshot, moved confirmed progress.
- **Cross-screen agreement**: Home's active strategy (Snowball), current target (Priceline Card), and projected $0 date (Jul 2028) all matched My Plan's own summary exactly, both reading the same shared `snapshot` fields.
- **Insight text fix confirmed live**: "You've confirmed 0% of this payoff journey... reaching $0 around Jul 2028 (23 months from Aug 2026)" — the parenthetical month count (previously silently dropped by bug #2 above) now renders correctly.

Not separately re-verified live this pass (already covered by the automated Home test suite's `homeState === "no-plan"` branches, and by direct source review of `deriveHomeContext`'s no-plan routing): the dedicated no-active-plan Home state, since both seed workspaces have an active plan and reaching a genuine no-plan state requires either a fresh real signup or direct fixture surgery, out of scope for a focused verification pass.

## 6. Deterministic Coverage Added / Updated

### Home snapshot / hero

- debt count from trusted debt data
- projected $0 present with active plan
- projected $0 absent without active plan
- debt summary card present

### Monthly state

- not recorded
- payment recorded
- multiple payment events same period
- prior-period events ignored
- **new:** checkpoint lookup actually finds this period's `ExpectedCheckpoint` using the engine's real `"Mon YYYY"` period label, and prefers its `expectedPayment` over the plan's flat extra when they differ (regression for bug #2)

### Payment vs balance separation

- PaymentEvent alone does not lower confirmed debt
- new BalanceSnapshot is what updates confirmed debt / knocked-out progress

### Household

- all-Unassigned state
- assigned breakdown
- Joint counted once

### No-plan trend

- no-plan snapshot derives a next move and observed-only trend

### Trajectory / sampling (new, closeout pass)

- `sampleEvenly`/`deriveProjectedTrajectory` never hangs for a real plan's 24+ month `expectedCheckpoints`, and returns at most 8 points (regression for bug #1)
- terminates for checkpoint counts that previously collided exactly on the last index (9, 36, 100)
- every returned trajectory point carries a real, parseable date - never `NaN`
- an unparseable period is dropped rather than producing a broken point

## 7. Validation Results

| Check | Result |
| --- | --- |
| `npx vitest run` | **602 tests passed**, 42 files |
| `npm run lint` | 0 errors, 3 pre-existing unrelated warnings |
| `npm run build` | Success |
| `npm run test:firestore` | **12/12 passed** |
| `npm run test:firestore:v2` | **59/59 passed**, rules parity guard PASS |
| `npm run perf:check` | All bundle budgets PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |

Existing unchanged lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning

## 8. Production Safety

Confirmed:

- no production deploy
- no production migration
- no production Firebase writes introduced by this pass
- no production Firebase config changes
- no Firestore rules deployment
- no real financial data

## 9. Known limitations

- The dedicated no-active-plan Home state was not re-verified live in browser this closeout pass (see §5) — it is covered by the automated test suite and direct source review, but not a fresh screenshot.
- Full UX-8 mobile/responsive/accessibility hardening across the full breakpoint matrix (1440/1366/1280/1024/768/375) was not separately re-walked this pass.
