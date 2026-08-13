# TrackToZero Phase 3 Results

## 1. Status

Completion gate:

**PARTIAL — CORE EXPERIENCE COMPLETE, PHASE 3b REMAINS**

Branch:

- `phase3/parallel-experience`

Scope completed:

- Feature-flagged parallel TrackToZero 2.0 shell.
- Home / Debts / Plan / Settings v2 information architecture.
- Personal and household seed/test workspaces.
- Role-aware app-service permissions for Owner/Admin/Contributor/Viewer.
- Active-plan context resolved from `Workspace.activePlanId`.
- Next-payment guidance.
- Directional on-track status.
- BalanceSnapshot append flow.
- PaymentEvent append flow.
- Scenario / what-if preview.
- Reforecast preview and apply path creating PlanVersion N+1.
- Warning/trust wrapper around the unchanged Phase 1 engine.
- Repository-boundary read additions needed by the v2 experience.
- Automated tests for the application/status/data-boundary slice.

Not done:

- No production migration.
- No v2 rules deployment.
- No production v2 writes.
- No legacy 1.0 retirement.
- No live Firebase-backed UI runtime wiring.
- No browser visual walkthrough, because the in-app browser connector was unavailable in this session.

No remote push was performed.

## 2. Feature-Flag / Parallel-App Boundary

Added:

- `trackToZeroV2Enabled` in `src/config/launchFlags.js`.
- Environment flag: `VITE_TRACKTOZERO_V2_ENABLED`.

Default:

- `false`.

Behavior:

- When disabled, the existing 1.0 `BudgetApp` renders.
- When enabled, `TrackToZeroV2App` renders as a separate lazy-loaded app shell.
- The v2 shell is code-split into its own production chunk so hidden v2 work does not push the 1.0 App entry over budget.

Regression coverage:

- `src/config/launchFlags.test.js` confirms TrackToZero 2.0 is disabled by default.

## 3. Data Boundary in Practice

Phase 3 implementation uses an explicit v2 seed/test workspace:

- Repository: `InMemoryTrackToZeroRepository`.
- Seed: `src/services/tracktozero/v2SeedData.js`.
- Application layer: `src/services/tracktozero/v2ApplicationService.js`.

Interactive v2 mode writes only to the v2 repository:

- `createNewDebt()`
- `recordPayment()`
- `recordBalanceSnapshot()`
- `createDraftPlan()`
- `activatePlan()`
- `applyReforecast()`

No Phase 3 write path calls legacy monthly records, `planned_v`, `paid_v`, household legacy docs, or `useWorkspaceRecords`.

Legacy Preview mode exists as an application-service mode and is read-only:

- `V2_DATA_MODES.legacyPreview`
- Any attempted write throws before repository mutation.

Automated proof:

- `src/services/tracktozero/v2ApplicationService.test.js` verifies Legacy Preview mode blocks writes and that create/payment/balance actions mutate only the v2 repository state.

## 4. Application Architecture

Flow:

```text
React v2 shell
  -> v2ApplicationService
  -> InMemoryTrackToZeroRepository / repository contract
  -> TrackToZero domain models
  -> Phase 1 calc adapter + payoff engine
  -> projectionStatusService warning/status wrapper
```

React does not call Firestore paths directly. React does not implement payoff math. Permission decisions used by the UI come from the role model and application service, with Firestore v2 rules remaining the server authority for future Firebase-backed runtime.

Repository read additions:

- `listWorkspaces()`
- `listMemberships(workspaceId)`
- `listPlanVersions(workspaceId, planId)`
- `listExpectedCheckpoints(workspaceId, planId, versionId)`

These were added to both:

- `InMemoryTrackToZeroRepository`
- `FirebaseTrackToZeroRepository`

## 5. Navigation / IA

The v2 shell has four primary destinations only:

- Home
- Debts
- Plan
- Settings

The v2 primary navigation does not introduce Bills, Budget, Income, Net Worth, Trends, or Subscriptions.

Legacy 1.0 navigation is untouched when the v2 flag is disabled.

## 6. Workspace Experience

Implemented:

- Workspace switcher.
- Personal seed workspace.
- Household seed workspace.
- Household member/role context.
- Current role selector for testing Owner/Admin/Contributor/Viewer behavior.
- Workspace identity is visible in the v2 header and Settings.

Seed household includes:

- Owner.
- Admin.
- Contributor.
- Viewer.
- Shared debts with owner labels.
- Shared active plan.

## 7. Role-Aware UX

Implemented in app-service permissions:

| Role | Debt terms | Payment / balance observations | Plan management | Member visibility |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes |
| Contributor | No | Yes | No | Yes |
| Viewer | No | No | No | Yes |

UI disables role-prohibited actions, and the application service throws if a prohibited action is attempted.

Automated proof:

- Contributor can record PaymentEvents and BalanceSnapshots.
- Contributor cannot create payoff plans.
- Viewer can view but cannot record payments.

## 8. Home Command Center

Home answers:

- What should I pay next?
- Which debt is targeted?
- Why is it targeted?
- What is the total included debt?
- What is the estimated debt-free date?
- Am I directionally on track?
- What improvement should I consider?

The status badge includes text and color. It does not rely on color alone.

Mortgage behavior:

- The personal seed mortgage is excluded from the core plan/date by default.
- Home uses included debts only for total included debt and projected $0 date.

## 9. On-Track Model

Implemented in:

- `src/services/tracktozero/projectionStatusService.js`

Classification inputs:

- Active included debts.
- Active PlanVersion.
- Expected checkpoints.
- Latest confirmed BalanceSnapshot per included debt.
- Current date.

Centralized thresholds:

```js
{
  staleBalanceDays: 45,
  onTrackDollarTolerance: 50,
  onTrackRatioTolerance: 0.02,
  needsReviewRatio: 0.1
}
```

Statuses:

- `ahead`
- `on_track`
- `slightly_behind`
- `needs_review`
- `needs_balance_update`
- `insufficient_data`

Important caveat:

This is motivational planning guidance, not lender reconciliation. Missing or stale balance data is never called on track.

## 10. Debts Experience

Implemented:

- Debt list with balance, APR/Unknown APR, required payment, due day, owner label, plan inclusion, target indicator.
- Add debt form for permitted roles.
- Record payment form.
- Confirm balance form.
- Mortgage exclusion visible via plan-inclusion text.
- Unknown APR displayed explicitly.

Append-only behavior:

- Balance confirmations create new BalanceSnapshot records.
- Payments create new PaymentEvent records.
- Existing observations are not mutated.

## 11. Payments + Balance Snapshots

PaymentEvent flow:

- Amount.
- Debt.
- Paid date defaults to seed/test `asOf`.
- Actor recorded.
- Source = `manual`.
- Optional notes supported in the application service.

BalanceSnapshot flow:

- Debt.
- Balance.
- Observed date defaults to seed/test `asOf`.
- Actor recorded.
- Source = `manual`.
- Previous snapshots remain preserved.

## 12. Plan Experience

Implemented:

- Active strategy.
- Active PlanVersion number.
- Extra monthly payment.
- Estimated $0 date.
- Payoff order list.
- Warning/trust messages.
- Create + activate plan flow.
- Reforecast preview and apply flow.

Active plan source of truth:

- `Workspace.activePlanId -> PayoffPlan.activeVersionId -> PlanVersion`.

No guessing fallback is used when `Workspace.activePlanId` is absent.

## 13. Scenario / What-If

Implemented:

- Home scenario preview for `+$100/month`.
- Uses Phase 1 scenario comparison service.
- Shows months saved and estimated interest saved.
- Does not mutate workspace, plans, versions, debts, snapshots, or events.

Automated proof:

- Scenario test snapshots plans, versions, and workspace before preview and verifies they are unchanged after preview.

## 14. Reforecast

Implemented:

- Preview creates an in-memory proposed version object only.
- Apply persists PlanVersion N+1.
- Prior PlanVersion remains unchanged.
- PayoffPlan.activeVersionId advances to the new version.
- Workspace.activePlanId remains pointed at the same plan.

Automated proof:

- Reforecast preview does not increase version count.
- Apply increases version count by one.
- Version 1 remains equal to the pre-apply version.

## 15. Warning / Trust Layer

Implemented in:

- `src/services/tracktozero/projectionStatusService.js`

Warnings:

- `negative_amortization`
- `infeasible_goal_date`
- `unknown_apr`
- `missing_minimum_payment`
- `projection_capped`

The Phase 1 engine was not changed:

- No input contract changes.
- No return shape changes.
- No golden-master update.
- Existing payoff tests remain green.

Warnings are generated in a wrapper around the projection result.

## 16. Household Experience

Household is first-class in this Phase 3 slice:

- Household workspace is selectable.
- Members and roles are visible.
- Shared debts show owner labels.
- Shared active plan drives Home/Plan.
- Contributor and Viewer behavior differs.

Still needed in Phase 3b:

- More polished household member-management controls.
- Firebase-emulator-backed UI walkthrough proving UI behavior against v2 rules, not only application-service tests.

## 17. Accessibility / Responsive QA

Implemented basics:

- Semantic `main`, `section`, `nav`, headings.
- Form labels.
- Button text.
- Status badge has text and `aria-label`.
- Responsive CSS grid with `auto-fit`.
- No horizontal financial tables in the v2 shell.

Not fully completed:

- Visual contrast audit.
- Keyboard/focus walkthrough.
- Mobile browser screenshot verification.

Reason:

- The in-app browser connector was unavailable in this session.

## 18. Production Safety

Confirmed:

- V2 disabled by default.
- No migration.
- No production deploy.
- No `firebase.json` change to deploy `firestore.v2.rules`.
- No production v2 writes.
- No legacy write path added.
- No `planned_v` mutation path reintroduced.

## 19. Test Results

Final validation:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 14 files / 104 tests |
| `npm run lint` | Passed with 3 existing warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 28 v2 rules/repository tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

Build/perf note:

- V2 shell is lazy-loaded as `TrackToZeroV2App-*.js`, around 41.90 kB minified.
- App entry remains within budget: 405.54 kB / 425.00 kB.

## 20. Phase 1 / 2 / 2b Regression Results

Phase 1:

- Payoff golden-master tests remain green.
- Scenario/plan-save mutation protections remain green.
- Phase 1 engine contract was not changed.

Phase 2:

- Domain model tests remain green.
- In-memory repository contract remains green.
- Migration adapter tests remain green.

Phase 2b:

- Firebase repository/rules emulator tests remain green.
- `firestore.v2.rules` remains emulator-only.

## 21. Manual Product Walkthrough

Automated service-level walkthrough completed through tests:

- Personal workspace: active plan, next target, scenario preview, reforecast apply, debt/payment/balance append.
- Household workspace: members/roles, shared debts, contributor observation writes, viewer read-only behavior.

Browser visual walkthrough:

- Not completed. The browser-control connector returned `Browser is not available: iab`.

This is the main reason Phase 3 is reported as partial instead of ready.

## 22. Phase 4 Migration Requirements

Before real users enter TrackToZero 2.0:

1. Build Phase 4 migration preview UI.
2. Convert legacy account/month/payoff-plan data into candidate v2 debts/drafts with user confirmation.
3. Migrate household workspaces with role/member mapping.
4. Define rollback window and migration states.
5. Connect v2 UI to FirebaseTrackToZeroRepository in emulator/test mode.
6. Prove no split-brain writes between World 1 and World 2.
7. Re-run household usage counts before cutover.
8. Perform visual QA and accessibility/mobile walkthroughs.

## 23. Known Limitations / Deferred Work

Phase 3b remains:

- Firebase-emulator-backed v2 UI runtime.
- Legacy Preview display surface using read-only adapters.
- Full visual browser walkthrough.
- More refined create-plan wizard.
- Richer debt editing/archive/paid-off flows.
- Better member-management UX.
- Loading/error/permission-denied states backed by async repository calls.
- Local persistence adapter remains deferred.
- More complete responsive/accessibility QA.

