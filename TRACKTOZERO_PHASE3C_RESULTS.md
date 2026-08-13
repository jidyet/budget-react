# TrackToZero Phase 3c Results

## 1. Status

Completion gate:

**YES — PHASE 3 COMPLETE; PARALLEL 2.0 EXPERIENCE READY FOR MIGRATION PREPARATION**

Branch:

- `phase3c/browser-qa`

Commit:

- Final commit hash is reported in the handoff/final response because embedding a commit's own hash changes that hash.
- Commit message: `Phase 3c: complete browser responsive and accessibility QA`

Summary:

- Real browser QA completed with the Firebase-emulator-backed TrackToZero 2.0 runtime.
- Browser, responsive, accessibility, loading, write, permission, personal workspace, household workspace, and role-state paths were exercised.
- No production deploy, push, migration, production Firebase write, or v2 rules deployment was performed.

## 2. Browser Environment

Browser used:

- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`

Automation/tool used:

- Custom Chrome DevTools Protocol smoke harness:
  - `scripts/phase3c-browser-qa.mjs`
  - `scripts/run-phase3c-browser-qa.mjs`

Runtime:

- Production Vite build served by `npm run preview`.
- Firestore/Auth emulators launched through Firebase CLI.
- Firebase project: `demo-budget-react-v2`.
- Firestore emulator: `127.0.0.1:8080`.
- Auth emulator: `127.0.0.1:9099`.
- `VITE_TRACKTOZERO_V2_ENABLED=true` only for the local QA build.
- `VITE_TRACKTOZERO_V2_REPOSITORY_MODE=firebaseEmulator`.

Viewport sizes verified:

- Desktop: `1440x900`.
- Tablet: `768x1024`.
- Mobile: `390x844`.
- Narrow mobile: `340x844`.

## 3. Home QA

Verified:

- Home loads from Firebase emulator data.
- Workspace and personal/household context are visible.
- Current role is visible in the QA role preview.
- Next-payment action is the dominant Home element.
- Target debt and target reason are readable.
- Total included debt is visible.
- Estimated debt-free date is clearly labeled as estimated.
- Directional plan status is visible and text-based.
- Scenario/improvement prompt is secondary.
- Planning disclaimer is visible.
- Unknown APR warning appears in the household path.
- Excluded mortgage does not distort the core payoff journey.
- Loading state displays a loading message instead of false `$0 debt` or premature empty-plan content.

## 4. Debts QA

Verified:

- Debt cards are readable on desktop/mobile.
- Balance, APR, required payment, due day, owner label, inclusion state, and current target are visible.
- Unknown APR is explicitly shown.
- Household owner labels fit the layout in the smoke-tested viewports.
- Add Debt, Record Payment, and Confirm Balance controls have labels.
- PaymentEvent append succeeds and refreshes from emulator readback.
- Contributor can record observations but sees debt-term setup as read-only.
- Viewer remains read-only for payment recording.

## 5. Plan QA

Verified:

- Active strategy is readable.
- Current PlanVersion is visible but not dominant.
- Estimated `$0` date and extra monthly payment are visible.
- Payoff order is understandable.
- Warning list is visible when applicable.
- Scenario preview is visually framed as temporary.
- Reforecast preview shows old vs proposed estimate.
- Reforecast apply persists the next version through the Firebase-backed runtime.
- Contributor/viewer plan management restrictions are visible through user-safe copy.

## 6. Settings / Workspace QA

Verified:

- Workspace switcher works.
- Personal and household workspace identity is clear.
- Current role is visible.
- Household member list is readable.
- Role labels are understandable.
- Restricted states are represented with disabled controls and explanatory copy.
- Member-management redesign was not introduced.

## 7. Workspace Switching QA

Browser smoke executed:

- Personal workspace -> Household workspace.
- Household role changes across Owner/Admin/Contributor/Viewer/Non-member.

Verified:

- Loading transition is understandable.
- Workspace type updates correctly.
- Role updates correctly.
- Debts and active plan context update from emulator readback.
- Request sequencing prevents stale responses from overwriting the current selected workspace.

## 8. Role Walkthrough

Owner:

- Loaded personal workspace.
- Recorded a payment.
- Previewed and applied reforecast.

Admin:

- Switched to household workspace as Admin.
- Loaded active household plan.
- Previewed and applied reforecast.

Contributor:

- Switched to household Contributor.
- Confirmed plan-management restriction copy.
- Recorded a PaymentEvent.
- Confirmed debt-term setup is read-only.

Viewer:

- Switched to household Viewer.
- Confirmed payment recording is read-only.
- Confirmed Unknown APR debt is visible.

Non-member:

- Switched to authenticated emulator UID `seed-outsider`.
- Confirmed workspace financial data is denied by rules.
- Confirmed user-safe error copy is shown.
- Confirmed raw Firebase permission text is not shown in the UI.

## 9. Async State QA

Loading:

- Initial V2 load shows `Loading TrackToZero 2.0`.
- Workspace reads resolve before final Home/Debts/Plan content is shown.

Write pending:

- Record payment, confirm balance, add debt, activate plan, and apply reforecast buttons use action-specific pending text and are disabled while a write is in progress.

Success:

- Successful writes show status text and refresh from repository readback.
- PaymentEvent and reforecast apply were verified in browser.

Failure:

- Non-member access failure leaves prior emulator data authoritative and shows a safe denied-access state.

Permission denied:

- Permission denial is visually distinct from normal loaded state.
- Raw `FirebaseError: Missing or insufficient permissions` is not displayed.

Repository/network error:

- V2 emulator runtime remains fail-closed and shows safe unavailable/error copy when required emulator runtime access cannot be completed.

## 10. Responsive QA

Desktop `1440x900`:

- Home and Plan render without page-level horizontal overflow.

Tablet `768x1024`:

- Home renders without page-level horizontal overflow.

Mobile `390x844`:

- Home and Debts render without page-level horizontal overflow.
- Cards stack logically.
- Forms remain reachable.

Narrow mobile `340x844`:

- Viewer/restricted state renders without page-level horizontal overflow.

## 11. Accessibility QA

Semantics:

- Exactly one `main` landmark verified in checked views.
- Primary navigation uses a semantic `nav` with `aria-label`.
- Sections use visible headings.

Keyboard/focus:

- Controls are native buttons/selects/inputs and remain keyboard reachable.
- No modal/dialog keyboard traps were introduced in this phase.

Forms:

- Browser smoke checks found no unlabeled `input`, `select`, or `textarea` controls in checked views.
- Disabled states are visible and paired with explanatory copy where role-restricted.

Status:

- Plan status uses text and `aria-label`, not color alone.
- Loading, success, and permission-denied states use user-facing text.

Contrast:

- Major text, buttons, badges, warnings, and disabled controls were visually reviewed in browser.
- No formal WCAG certification is claimed.

## 12. Console / Runtime Findings

Found and fixed:

- V2 lazy fallback initially crashed in browser because `LoadingScreen` assumed `palette` was supplied.

Observed:

- Firebase emulator shutdown logs `SocketException: Connection reset` as browser/emulator channels close. This occurs after the QA script exits successfully and is not a user-facing runtime defect.
- Vite still emits the existing large-chunk warning; bundle budgets pass.

## 13. Defects Found and Fixed

### Defect 1 — V2 lazy fallback crash

Symptom:

- Browser showed the legacy app error boundary before V2 rendered.
- Error: `Cannot read properties of undefined (reading 'acD')`.

Root cause:

- `App.jsx` used `<Suspense fallback={<LoadingScreen />}>`; `LoadingScreen` assumed `palette` existed.

Files changed:

- `src/components/feedback/LoadingScreen.jsx`

Fix:

- Added a light-palette fallback through `buildPalette("light")`.

Verification:

- Browser QA now loads V2 instead of the fallback crash.
- `npm test -- --run`, lint, build, emulator tests, perf, audit, and browser smoke pass.

### Defect 2 — Browser emulator runtime needed authenticated app user

Symptom:

- Firebase-emulator browser runtime could not reliably read v2 protected workspace data without signing into the Auth emulator.

Root cause:

- Phase 3b service tests authenticated emulator contexts, but the browser runtime did not yet sign in a matching Firebase client Auth user.

Files changed:

- `src/services/tracktozero/repositoryRuntime.js`
- `src/components/tracktozero/TrackToZeroV2App.jsx`

Fix:

- Added fail-closed Auth emulator sign-in for deterministic seed actors.
- Kept Firebase emulator mode restricted to `demo-budget-react-v2` and required emulator hosts.

Verification:

- Browser smoke reads/writes through Firestore/Auth emulators using authenticated seed users.

### Defect 3 — Browser seed memberships missing active status

Symptom:

- Browser smoke initially reached a safe permission-denied state on first read.

Root cause:

- Browser seeder wrote raw membership fixtures without `status: "active"`, while `firestore.v2.rules` requires active memberships.

Files changed:

- `scripts/phase3c-browser-qa.mjs`

Fix:

- Browser QA seeder writes active memberships.

Verification:

- Browser smoke loads personal/household workspaces and verifies non-member denial separately.

### Defect 4 — QA harness stranded preview child process on Windows

Symptom:

- Browser smoke produced a pass artifact but the wrapper timed out because `npm run preview` child processes remained alive.

Root cause:

- Plain child-process kill did not terminate the Windows process tree.

Files changed:

- `scripts/phase3c-browser-qa.mjs`

Fix:

- Added Windows process-tree cleanup through `taskkill /T /F`.

Verification:

- `node scripts/run-phase3c-browser-qa.mjs` exits successfully.

### Defect 5 — Plan restriction copy missing for non-plan roles

Symptom:

- Contributor/viewer disabled plan controls were present, but explanatory copy was not explicit enough.

Root cause:

- Plan form disabled state did not include role-specific explanation.

Files changed:

- `src/components/tracktozero/TrackToZeroV2App.jsx`

Fix:

- Added: `Your role can view plans, but cannot change payoff plan setup.`

Verification:

- Browser smoke verifies the contributor plan restriction copy.

## 14. Screenshot / Browser Evidence

Local QA artifact:

- `qa-artifacts/phase3c/phase3c-browser-qa.json`

Screenshots captured locally:

- `personal-home-desktop.png`
- `personal-home-mobile.png`
- `personal-home-tablet.png`
- `debts-mobile.png`
- `plan-desktop.png`
- `household-settings-desktop.png`
- `viewer-readonly.png`
- `non-member-denied.png`

The `qa-artifacts/` folder is gitignored and was not committed.

## 15. Browser Smoke Tests

Added:

- `scripts/phase3c-browser-qa.mjs`
- `scripts/run-phase3c-browser-qa.mjs`

Smoke coverage:

- V2 shell loads.
- Firebase-backed Home renders.
- Desktop/tablet/mobile/narrow mobile responsive checks.
- Workspace switch works.
- Payment write works.
- Admin reforecast apply works.
- Contributor restriction works.
- Viewer read-only state works.
- Non-member denied access works.
- No page-level horizontal overflow in checked viewports.
- No raw Firebase permission text leaks to UI.

## 16. Regression Results

Protected prior phases:

- Phase 1 payoff/calculation tests remain green.
- Phase 2 domain/repository tests remain green.
- Phase 2b Firebase repository/rules tests remain green.
- Phase 3 application/status tests remain green.
- Phase 3b Firebase UI/runtime emulator tests remain green.
- Legacy Firestore rules remain green.
- V2 remains feature-flagged off by default.

## 17. Validation Results

Final validation run on `phase3c/browser-qa`:

| Check | Result |
| --- | --- |
| `node scripts/run-phase3c-browser-qa.mjs` | Passed |
| `npm test -- --run` | Passed, 16 files / 113 tests |
| `npm run lint` | Passed with 3 existing React hook dependency warnings |
| `npm run build` | Passed; Vite emitted existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 36/36 v2 emulator tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

Build/perf:

- App entry: `405.55 kB / 425.00 kB`.
- V2 chunk: about `57.14 kB` minified in the latest build output.
- Vendor/parser large-chunk warning remains, but bundle budgets pass.

## 18. Production Safety

Confirmed:

- No production deploy.
- No remote push.
- No production migration.
- No production V2 writes.
- No production Firebase writes.
- No World-1 legacy writes added.
- No `firebase.json` production rules target change.
- No `firestore.v2.rules` deployment.
- `firestore.v2.rules` remains emulator-only.
- V2 remains disabled by default.
- V2 Firebase runtime remains emulator-only/fail-closed.
- No `planned_v` mutation path was reintroduced.

## 19. Deferred Non-Blocking Polish

- Full manual screen-reader pass.
- Broader visual design pass.
- Richer member-management UX.
- More complete create-plan wizard.
- Additional form validation copy beyond the smoke-tested path.
- Formal contrast tooling if desired before public launch.

## 20. Phase 4 Readiness

Phase 3 is now complete from the user-facing/browser perspective.

The parallel TrackToZero 2.0 experience is ready for migration-preparation work, not production cutover.

Phase 4 should still start with:

- Migration preview UI.
- Legacy-to-v2 conversion confirmation.
- Household migration and role mapping.
- Rollback-state design.
- Production Auth/runtime integration design.
- No production v2 writes until migration and rollback are explicitly approved.
