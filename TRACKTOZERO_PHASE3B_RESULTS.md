# TrackToZero Phase 3b Results

## 1. Status

Completion gate:

**PARTIAL — FIREBASE-BACKED V2 RUNTIME PROVEN IN EMULATOR; BROWSER VISUAL WALKTHROUGH STILL BLOCKED**

Branch:

- `phase3b/firebase-ui-runtime`

Scope completed:

- Connected the TrackToZero 2.0 shell to an async repository/runtime boundary.
- Added a fail-closed Firebase-emulator repository mode.
- Added Firebase-backed application-service tests for the v2 UI/runtime path.
- Proved v2 Home, Debts, Plan, PaymentEvent, BalanceSnapshot, Scenario, and Reforecast flows against the Firestore emulator using `firestore.v2.rules`.
- Proved role behavior for Owner/Admin/Contributor/Viewer/non-member through authenticated emulator contexts.
- Preserved World 1 / legacy app behavior and production safety boundaries.

Not done:

- No production migration.
- No production v2 writes.
- No v2 rules deployment.
- No remote push.
- No legacy 1.0 retirement.
- No browser visual walkthrough, because the in-app browser connector was unavailable (`agent.browsers.list()` returned `[]`).

## 2. Runtime Boundary

Added:

- `src/services/tracktozero/repositoryRuntime.js`
- `src/services/tracktozero/v2AsyncApplicationService.js`

Runtime modes:

- `inMemory`
- `firebaseEmulator`

Production safety:

- Firebase runtime mode is fail-closed.
- Firebase v2 runtime requires demo project id `demo-budget-react-v2`.
- Firebase v2 runtime requires `FIRESTORE_EMULATOR_HOST` / `VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST`.
- No production Firebase config is used by the v2 emulator runtime.
- `firebase.json` production Firestore rules target remains unchanged.

## 3. UI Runtime Changes

Updated:

- `src/components/tracktozero/TrackToZeroV2App.jsx`

Behavior:

- The v2 shell now uses the async application service.
- Repository creation is centralized in the runtime factory.
- Loading and safe error states were added.
- Writes show in-progress/success/error state and refresh from repository readback after completion.
- Scenario preview is still read-only.
- Reforecast preview is read-only; apply persists a new plan version and advances the active plan pointer.

Default remains safe:

- `VITE_TRACKTOZERO_V2_ENABLED` defaults to off.
- `VITE_TRACKTOZERO_V2_REPOSITORY_MODE` defaults to `inMemory`.

## 4. Repository Additions

Updated:

- `src/services/repositories/tracktozeroRepositories.js`
- `src/services/repositories/firebaseTrackToZeroRepository.js`

Added repository capabilities:

- `listPaymentEvents(workspaceId, debtId)`
- `activatePlan(...)` on the in-memory repository
- `reforecastActivePlan(...)` on both in-memory and Firebase repositories

Firebase reforecast behavior:

- Runs in a Firestore transaction.
- Verifies `Workspace.activePlanId`.
- Verifies `PayoffPlan.activeVersionId`.
- Fails if the next PlanVersion already exists.
- Creates PlanVersion N+1.
- Advances `PayoffPlan.activeVersionId`.
- Preserves PlanVersion N.

## 5. Firestore Emulator Runtime Proof

Added:

- `tests/firestore.v2.ui-runtime.test.js`

The test proves:

- Firebase-backed Home loads domain state through repository readback.
- Active plan context resolves through `Workspace.activePlanId -> PayoffPlan.activeVersionId -> PlanVersion`.
- Unknown APR warnings surface.
- Excluded mortgage debt is not included in the core payoff date.
- Firebase `Timestamp`/Firestore types do not leak into domain/UI snapshots.
- Owner/Admin can create debts.
- Contributor/Viewer/non-member debt writes are denied.
- Owner/Admin/Contributor can append PaymentEvents.
- Viewer/non-member PaymentEvent writes are denied.
- BalanceSnapshot appends preserve older snapshots and refresh status.
- Viewer BalanceSnapshot writes are denied.
- Plan create/activate uses active pointers.
- Contributor plan creation is denied.
- Scenario preview performs zero Firestore writes.
- Reforecast preview performs zero Firestore writes.
- Reforecast apply creates version N+1 and preserves version N.
- Unauthorized reforecast attempts leave the active version unchanged.
- Non-members cannot access workspace financial data through the app service.

Important runner fix:

- `scripts/run-firestore-v2-tests.mjs` now runs Node test files with `--test-concurrency=1`.
- Reason: the v2 rules/repository/ui-runtime test files all use the same emulator project and call `clearFirestore()`. Running them concurrently caused fixture wipeouts and false permission/read failures.

## 6. Browser Visual Walkthrough

Attempted through the available browser-control skill.

Result:

- Browser connector was unavailable.
- `agent.browsers.get("iab")` returned `Browser is not available: iab`.
- `agent.browsers.list()` returned `[]`.

Therefore, no visual browser walkthrough or screenshot QA was completed in this pass.

## 7. Validation

Final validation run on `phase3b/firebase-ui-runtime`:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 16 files / 113 tests |
| `npm run lint` | Passed with 3 existing warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 36/36 v2 emulator tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

Build/perf notes:

- App entry remains within budget: about `405.54 kB / 425.00 kB`.
- V2 shell remains lazy-loaded as its own chunk, about `55.39 kB` minified in the latest build.
- Existing large chunk warning remains for vendor/parser chunks, but bundle budget check passes.

## 8. Production Safety Confirmations

Confirmed:

- No production deploy.
- No remote push.
- No production v2 writes.
- No migration.
- No `firebase.json` change to deploy `firestore.v2.rules`.
- No legacy monthly record writes added.
- No `planned_v` mutation path reintroduced.
- V2 remains feature-flagged and off by default.

## 9. Remaining Phase 3b / Phase 4 Work

Still needed:

- Browser visual walkthrough when the in-app browser connector is available.
- Firebase-backed UI walkthrough with an actual browser session, including loading/error/write states.
- Real Firebase Auth integration for non-test users before any production v2 write path.
- Legacy Preview display surface using read-only adapters.
- Migration preview UI.
- Household member-management polish.
- Full accessibility/mobile visual QA.

Recommended next step:

- Treat the Firebase-backed application/runtime path as technically proven in emulator, but do not mark the user-facing Phase 3b experience fully complete until browser visual QA is possible.
