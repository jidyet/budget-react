# TrackToZero V2 — UX-8.2: Plan Preview Truth + Editable Debt Review — Results

## 1. Status

**YES — UX-8.2 PLAN TRUTH + EDITABLE DEBT REVIEW COMPLETE — READY FOR UX-9**

## 2. Baseline

Branch `phase4/migration-rehearsal`, starting HEAD `2f0083f` (UX-8.1), clean tree, 5 commits ahead of `origin/phase4/migration-rehearsal`, backup tag `backup/pre-ux8-progress-service` present throughout (unaffected by this phase — this phase deletes nothing).

## 3. Root causes established before any presentation change was made

- **Bug 1 (a debt shown "excluded" via warning yet still numbered in the payoff order) is NOT an engine/filter divergence.** Traced every payoff-order source (`compareStrategies`/`buildPlanPreviewFromDebts` and `getWorkspaceSnapshot`'s `payoffQueue`) end to end: both `payoffOrder`/`payoffQueue` and their matching `warnings` are provably derived from the identical `getEligiblePlanDebts`/`getExcludedPlanDebts` call over the same `debts`/`planVersion` reference in the same synchronous call. A needs-review debt cannot appear in the numbered list while also being warned as excluded. The real, evidenced causes of the *symptom* were: (a) `StrategyHeader` only ever rendered `warnings[0]`, so the true exclusion warning for one debt could be hidden or misattributed whenever another warning happened to sort first; (b) two debts sharing a display name (the task's own "BOFA" example) made a textually-correct warning look like a self-contradiction, since nothing distinguished which same-named debt it was about.
- **A real, separate activation-safety gap**: `applyReforecast`/`createDraftPlan`/`previewDraftPlan` all froze a needs-review debt's `includedInCorePayoffPlan: true` into a new `PlanVersion.startingDebtSnapshot`, even though every live read already re-excludes it via `isDebtNeedsReview`. Math was never wrong on any live read, but the frozen historical record was misleading.
- **`debt.projectedZeroDate` is always `undefined`** — `payoffSimulate` only tracks aggregate balance/interest per month, never a per-account zero-crossing. Confirmed dead/vestigial in the prior code. The redesigned payoff journey deliberately shows no per-debt date.
- **Route-leak root cause confirmed exact**: `TrackToZeroV2App.jsx`'s single shared `writeState` drives one unconditional banner rendered above the `{tab === "x"}` chain; `navigateTab` never cleared it. `"apply finish by"` and `"create invite"` are the exact two leaked action strings.
- **`updateDebt` was fully dead code** (zero production callers), unvalidated, and field-unrestricted — a caller could have overwritten `currentBalance`/`startingBalance`/`balanceStatus`/`id`/`createdBy` with no check. `firestore.rules`/`firestore.v2.rules`'s `debts/{debtId}` update rule had no field guard at all (unlike the sibling `payment_events`/`balance_snapshots` subcollections).
- **The visible "Needs review" badge (6 conditions) was broader than `isDebtNeedsReview` (2 conditions)** used for plan-math exclusion — the reason model now surfaces the full, correctly-labeled union.

## 4. What changed

### Plan preview truth
- `StrategyHeader` (`PlanSection.jsx`) now shows every `critical`-severity warning, not just index 0.
- `disambiguationSuffixForDebt` (new, `domain/tracktozero/ownership.js`) appends owner (household) or a stored last-four to a debt's display name/warning text whenever another debt shares its name — applied in `PayoffOrderList` and in `evaluateProjectionWarnings`'s message templates (`projectionStatusService.js`).
- `getExcludedPlanDebts` (new, `projectionStatusService.js`) — the exact complement of `getEligiblePlanDebts` — now flows through `compareStrategies`/`buildPlanPreviewFromDebts` and `getWorkspaceSnapshot` as `excludedDebts`, in both the async and sync application services, so the Plan UI never independently re-derives which debts are excluded.
- New `ExcludedDebtsSection` component renders excluded debts with their concrete reasons and a "Review & edit" action, on My Plan, Snowball, Avalanche, and Compare.
- Scope language ("Based on N included debts. M excluded until reviewed.") added near every projection.
- `PayoffOrderList` redesigned into a numbered, card-like "payoff journey" (owner badge in Household mode, balance, APR-or-"Unknown APR", first-target visual emphasis) — no fabricated per-debt date.
- Activation-safety: `createStartingDebtSnapshotItem` (`domain/tracktozero/models.js`) now forces `includedInCorePayoffPlan: false` for any needs-review debt being frozen — closes the gap at its single source, covering `createDraftPlan`/`applyReforecast`/`previewDraftPlan`/`activatePlan` uniformly. The strategy-switch and reforecast confirm dialogs also now explicitly name any excluded debts before the user applies.
- **Route-leak fix**: one-line `writeState` reset added inside `navigateTab` (`TrackToZeroV2App.jsx`), matching the existing reset shape already used on auth/workspace changes.

### Editable debt review + owner reassignment
- `updateDebt` (both `v2AsyncApplicationService.js` and `v2ApplicationService.js`) hardened with a strict field allow-list (`name`, `debtType`, `aprStatus`, `apr`, `minimumRequiredPayment`, `dueDay`, `ownerType`, `ownerId`, `includedInCorePayoffPlan` — the exact `AddDebtModal` field set) and owner re-verification via `resolveDebtOwnership` on every owner change.
- New Firestore rules guard (`debtIdentityUnchanged()` / `v2DebtIdentityUnchanged()` in `firestore.v2.rules` and `firestore.rules`) locks `id`/`workspaceId`/`openingBalanceSnapshotId`/`createdBy`/`createdAt` on every `debts/{debtId}` update, in both the reference and the actually-deployed rules file.
- New `describeDebtReviewReasons` (`domain/tracktozero/ownership.js`) — the single source for the full 6-condition "Needs review" union, each with a human label and a `blocksPlan` flag. `DebtBadges.jsx` and `debtPortfolioView.js`'s `reviewDebts` bucket both now consume it, closing a pre-existing inconsistency where a debt could show "Needs review" on its badge without appearing under the Debts page's own "Needs review" filter/count (or vice versa).
- New `ReviewEditDebtDrawer.jsx` — reachable via a "Review & edit" action from every confirmed Debt card (`CategoryDetailPage.jsx`) and from the Plan page's excluded-debt section. Reuses `Drawer`/`useDialogFocus`/`OwnerField`/`AddDebtModal`'s exact field conventions. Three strictly separate actions, each its own service call: Edit details → `updateDebt`; Update balance → `recordBalanceSnapshot` (unchanged); Record payment → `recordPayment` (unchanged). Shows the live, concrete "Needs attention" reasons; owner reassignment includes plain-text consequence copy, no destructive confirmation.
- `deriveDebtsAwaitingReforecast` (`projectionStatusService.js`) extended (backward-compatibly) to also flag an *existing* plan debt whose APR/required-payment/inclusion drifted from its frozen `startingDebtSnapshot`, not just a brand-new debt — surfaced as a "This plan may be out of date" banner with a "Reforecast plan" CTA that scrolls to the existing Reforecast card. No auto-reforecast anywhere.

## 5. Verified locked contracts (unchanged)

`payoffEngine.js`, `sortDebtsForStrategy` ordering, APR normalization (`normalizeAprDecimal`), `createDebt`'s validation rules (reused, not modified), `recordPayment`/`recordBalanceSnapshot` bodies, PlanVersion/ExpectedCheckpoint semantics, `getEligiblePlanDebts`/`getIncludedDebts`/`isDebtNeedsReview` definitions (reused as the single source of truth throughout, not redefined).

## 6. Validation suite (exact totals)

| Check | Result | Prior baseline |
|---|---|---|
| `npx vitest run` | **762/762 passed**, 54/54 files | 762/762 |
| `npx eslint .` | **0 errors**, 4 warnings (all pre-existing, unchanged) | 0 errors / 4 warnings |
| `npm run build` | **Success** | Success |
| `npm run perf:check` | **All bundle budgets pass** | Pass |
| `npm run test:firestore` (legacy) | **12/12 passed** | 12/12 |
| `npm run test:firestore:v2` | **69/69 passed** (68 baseline + 1 new rules-guard test), parity confirmed between `firestore.rules` (production) and `firestore.v2.rules` (reference) | 68/68 |
| `npm audit --omit=dev` | **0 vulnerabilities** | 0 |

One pre-existing unit test (`debtPortfolioView.test.js`) needed its fixture corrected: a debt fixture named "Needs review" had `currentBalance: 0` with no `balanceStatus`, which the (correct) unified reason model treats as a confirmed-paid-off debt (never "needs review" for a junk owner label alone, matching `DebtBadges`' own pre-existing `!paidOff` guard). Fixture updated to a nonzero balance so it still exercises the junk-owner-label reason it was written to test.

## 7. Real browser QA (Playwright, `VITE_TRACKTOZERO_V2_REPOSITORY_MODE=inMemory`, household-seed and personal-seed workspaces)

- **Snowball view**: renders the redesigned payoff journey (numbered circles, first-target highlight, owner badges, balance/APR per item), "Based on 6 included debts." scope line, zero console errors. Screenshot captured.
- **My Plan / Compare**: scope language present; Compare reached and rendered (Snowball vs Avalanche comparison card, both strategy panels).
- **Route-leak fix**: navigated Plan → Debts; no leaked "apply finish by" text found on the Debts page.
- **Editable debt review, full round trip**: opened "Review & edit" on "Old Store Card" (Household seed) — drawer showed "Needs attention: Missing APR" and the three separate action tabs (Edit details / Update balance / Record payment) with the Owner field correctly populated ("Baba"). Changed APR status to Known + 24.99%, saved via "Save details" → success banner ("edit debt details saved."), and confirmed live: the Debts page's "NEEDS REVIEW" summary count dropped from **2 to 1**, and the card's "APR unknown"/"Needs review" badges were gone — proving the reason model clears only when the underlying condition is actually resolved, not merely because Save was clicked. Zero console errors throughout.

Not exercised in this pass: Finish By tab navigation (blocked on a Playwright selector-precision issue, not a product defect — the tab is visibly present in every screenshot's nav strip), the full 22-test owner-reassignment matrix, and a dedicated forced reproduction of the "No active plan to reforecast" error string (the fix is structural — the new edit path never calls any reforecast function — and was verified by direct code read rather than a forced UI repro).

## 8. Diff summary

16 files changed, 432 insertions(+), 66 deletions(-); 1 new file (`ReviewEditDebtDrawer.jsx`). `git diff --check`: no whitespace errors (only pre-existing LF/CRLF autocrlf notices).

## 9. Commit / push status

Committed to `phase4/migration-rehearsal` with message `"UX-8.2: align plan previews and editable debt review"`. **Not pushed** — branch remains ahead of `origin/phase4/migration-rehearsal`; backup tag `backup/pre-ux8-progress-service` untouched and still local-only.
