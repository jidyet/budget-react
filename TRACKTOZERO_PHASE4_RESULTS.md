# TrackToZero Phase 4 Results

## 1. STATUS

Phase 4A is complete on `phase4/migration-rehearsal`.

No production migration, production v2 writes, rules deployment, merge, push, or deploy was performed.

This completion pass closes the post-review evidence gaps for large synthetic fixtures, explicit projection parity, and migration UX failure-state coverage.

## 2. BRANCH / COMMITS

- Base branch: `phase3c/browser-qa`
- Base commit: `ee2d646 Phase 3c: complete browser responsive and accessibility QA`
- Phase 4A branch: `phase4/migration-rehearsal`
- Phase 4A implementation commit: `9d8740f Phase 4a: prove controlled migration and rollback in emulator`
- Phase 4A completion commit: see current branch HEAD; final hash is reported by Codex after commit.

## 3. COMPLETION GATE

YES — MIGRATION ENGINE AND REHEARSAL READY FOR CONTROLLED PRODUCTION PILOT

This means emulator migration machinery is ready for reviewed pilot preparation only. It does not mean production migration has begun.

## 4. MIGRATION ARCHITECTURE

Phase 4A extends the existing legacy adapter, v2 domain model, and v2 repositories.

Added/updated:

- `src/services/adapters/legacyTrackToZeroAdapter.js`
- `src/services/tracktozero/migrationExecutor.js`
- `src/services/repositories/tracktozeroRepositories.js`
- `src/services/repositories/firebaseTrackToZeroRepository.js`
- `firestore.v2.rules` emulator-only migration-operator controls
- `tests/firestore.v2.migration.test.js`
- `src/services/tracktozero/migrationExecutor.test.js`
- `src/services/tracktozero/migrationUxState.js`

World 1 remains read-only. World 2 writes in this phase are emulator-only through `FirebaseTrackToZeroRepository`.

## 5. SOURCE FINGERPRINT STRATEGY

`buildSourceFingerprint()` hashes only migration-relevant legacy workspace, member, account, and plan fields after deterministic normalization and sorting. It excludes UI display timing and raw Firebase objects.

Execution requires the reviewed source fingerprint to match the current preview fingerprint.

## 6. DATA CLASSIFICATION

Legacy records classify as:

- `clear_debt`
- `not_debt`
- `needs_confirmation`

Execution blocks until `needs_confirmation` is zero.

## 7. WORLD-1 → WORLD-2 FIELD MAP

- Legacy workspace/user/household → Workspace
- Legacy household members → WorkspaceMembership
- Legacy debt-like accounts → Debt
- Legacy current balance → initial BalanceSnapshot
- Legacy saved payoff plans → draft PayoffPlan
- Legacy plan assumptions → draft PlanVersion/checkpoints when safe

## 8. EXCLUDED DATA

Ordinary monthly expenses are excluded from v2 Debts. Income, net worth, generic recurring expenses, `planned_v`, and aggregate `paid_v` are not migrated as financial truth.

## 9. AMBIGUITY HANDLING

Ambiguous records are surfaced in preview and block execution. Explicit reviewer classification can mark them as Debt or Not Debt, producing a new digest.

## 10. PERSONAL MIGRATION

Personal fixture rehearsal covers multiple debts, known APR, unknown APR, mortgage exclusion, ordinary expense exclusion, saved plan as draft, `planned_v`, and `paid_v`.

## 11. HOUSEHOLD MIGRATION

Household fixture rehearsal covers owner/member mapping, shared debt ownership labels, unknown APR, mortgage exclusion, ambiguity, saved draft plan conversion, emulator execution, validation, and rollback.

## 12. ROLE MAPPING

Legacy household owner maps to `owner`. Other active members map conservatively to `contributor`. No admin/additional-owner privilege is inferred.

## 13. LEGACY PLAN HANDLING

Saved legacy plans migrate as `draft` PayoffPlans only. Migration does not set `Workspace.activePlanId` and does not auto-activate legacy plans.

## 14. planned_v HANDLING

`planned_v` is not copied into Debt truth, BalanceSnapshots, PaymentEvents, PlanVersions, or schedules.

## 15. paid_v HANDLING

Aggregate `paid_v` does not manufacture PaymentEvents. Phase 4A preview creates zero PaymentEvents by default.

## 16. INITIAL BALANCE SNAPSHOTS

Each migrated Debt gets an initial BalanceSnapshot using the selected current balance source and migration/import source metadata.

## 17. ZERO-WRITE PREVIEW PROOF

Preview remains read-only, accepts no write sink, returns `writesPerformed = 0`, and is deterministic for stable source plus confirmations.

## 18. PREVIEW DIGEST

Preview digest hashes the reviewed migration plan: source fingerprint, candidate workspace, memberships, debts, snapshots, draft plans, versions, checkpoints, exclusions, ambiguity, ID map, target paths, and migration state.

Execution requires matching confirmed digest.

## 19. CONFIRMATION FLOW

Executor rejects missing explicit confirmation, digest mismatch, fingerprint mismatch, unresolved ambiguity, unauthorized actor, conflicting target docs, and v2-native barrier conflicts.

## 20. MIGRATION JOURNAL/MANIFEST

Migration manifests are stored under `workspaces/{workspaceId}/migration_runs/{runId}` in emulator v2 rules. The manifest records source identity, fingerprint, digest, actor, target path map, planned/completed paths, state, warnings, failures, and rollback eligibility.

## 21. DETERMINISTIC ID STRATEGY

Workspace, Debt, Plan, PlanVersion, BalanceSnapshot, and ExpectedCheckpoint IDs are derived from stable source identity fields and deterministic hashes. Repeated execution creates no duplicates.

## 22. EXECUTION/BATCHING

Execution writes through repository methods in controlled order:

1. Workspace bootstrap
2. Membership bootstrap
3. Manifest progress
4. Debts
5. Initial BalanceSnapshots
6. Draft plans
7. PlanVersions
8. Expected checkpoints
9. Final validation
10. Rollback-eligible completion

## 23. IDEMPOTENCY

Existing matching target docs are accepted. Existing conflicting target docs block execution. A second execution creates no duplicate debts/plans/snapshots.

## 24. PARTIAL FAILURE

Injected partial failure records completed paths in the manifest and marks the run `partial_failed`.

## 25. RESUME

Resume verifies the same digest/fingerprint, skips already-valid completed paths, writes missing paths, validates, and marks rollback available.

## 26. POST-WRITE VALIDATION

Validation compares preview entities against persisted World 2 entities and detects unexpected workspace financial paths.

## 27. PROJECTION PARITY

Draft PlanVersions and ExpectedCheckpoints are derived through the approved Phase 1/2 calculation adapter, not copied from legacy monthly schedules.

PROJECTION PARITY: PASSED.

Automated proof:

- Test file: `src/services/tracktozero/migrationExecutor.test.js`
- Test name: `proves projection parity before vs after persistence migration`
- Compared fields:
  - strategy
  - included payoff-order debt IDs from the PlanVersion starting snapshot
  - months-to-zero
  - projected payoff month
  - estimated total interest
  - final remaining debt
  - first five ExpectedCheckpoint periods, expected total balances, and projected zero date

Both sides run through the trusted Phase 2 calculation adapter / Phase 1 payoff engine. The test reconstructs migrated World-2 debts and PlanVersion from the repository after execution and fails if migration changes financial meaning.

## 28. ROLLBACK

Rollback removes migration-created financial World-2 data before the native-write barrier. It leaves World 1 untouched and preserves the minimal archived workspace/operator membership needed for a readable rollback journal.

## 29. V2-NATIVE WRITE BARRIER

Rollback scans current v2 workspace paths. If an unexpected debt/payment/snapshot/plan/version/checkpoint exists, rollback blocks and marks the manifest `rollback_blocked`.

## 30. SECURITY

`firestore.v2.rules` remains emulator-only. Migration rollback deletes require both Admin+/Owner workspace membership and `trackToZeroMigrationOperator == true`. Normal history deletion remains denied.

## 31. CROSS-WORKSPACE ISOLATION

Tests prove migrating one workspace does not modify unrelated workspaces.

## 32. MIGRATION UX

A narrow migration panel is available only behind `trackToZeroMigrationEnabled`. It lists safe migration states and does not execute production operations.

Automated UX-state coverage was added at the service-state layer:

- Test file: `src/services/tracktozero/migrationExecutor.test.js`
- Test name: `covers loading, preview, confirmation, ready, in-progress, success, rollback, and failure states safely`
- State contract file: `src/services/tracktozero/migrationUxState.js`

Verified states:

| State | Verified |
| --- | --- |
| loading source | Yes |
| preview ready | Yes |
| needs confirmation | Yes |
| ready to migrate | Yes |
| migration in progress | Yes |
| migration failed | Yes; no success, no World-2-authoritative claim, no raw Firebase error |
| validation failed | Yes; no success and no cutover implication |
| migration succeeded | Yes; success only after validation result |
| rollback available | Yes; only when manifest is rollback-eligible |
| rollback blocked | Yes; no destructive rollback action presented |

## 33. PERFORMANCE

Preview uses deterministic in-memory normalization, sorting, and hashing. Emulator rehearsal uses controlled repository writes; no listener/query explosion or one-query-per-field UI loop was introduced.

Large synthetic fixture proof:

- Test file: `tests/firestore.v2.migration.test.js`
- Test name: `Phase 4 large synthetic fixture executes, validates, and rolls back under emulator rules`
- Source records inspected: 120
- Clear debts: 60
- Excluded non-debts: 60
- Needs confirmation before resolution: 10
- Needs confirmation at execution: 0
- Members: 4
- Draft plans: 2
- Initial BalanceSnapshots: 60
- Expected target paths: 153
- Expected World-2 writes including migration manifest: 154
- Actual executor-created target paths: 153
- Validation result: passed
- Rollback result: passed
- World 1 fixture mutation check: unchanged
- PaymentEvents created from `paid_v`: 0
- Mortgage debts excluded from core payoff by default: 10
- Unknown APR debts preserved as unknown: 10

## 34. PRODUCTION SAFETY

Confirmed:

- V2 remains default OFF.
- Migration flag remains default OFF.
- No production migration.
- No production World-2 writes.
- No World-1 writes.
- No production rules deployment.
- `firebase.json` still points to `firestore.rules`.
- `firestore.v2.rules` remains emulator-only.

## 35. VALIDATION RESULTS

- `npm test -- --run`: passed, 17 files / 123 tests.
- `npm run lint`: passed with the same 3 existing React hook warnings.
- `npm run build`: passed with existing large-chunk warning.
- `npm run test:firestore`: passed, 12/12 legacy rules tests.
- `npm run test:firestore:v2`: passed, 39/39 v2 emulator tests.
- `npm run perf:check`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

## 36. PRIOR-PHASE REGRESSIONS

Phase 1 engine tests, Phase 2 domain/adapter/repository tests, Phase 2b Firebase repository/rules tests, Phase 3 app/runtime tests, and legacy rules tests remain green.

## 37. FINDINGS/MISMATCHES

The existing v2 rules deliberately denied deletion of immutable historical docs. Phase 4A added a narrow emulator-only migration-operator delete path for rollback before native writes.

Rollback preserves a minimal archived workspace and operator membership so rollback manifests remain readable. Financial migration-created docs are removed.

## 38. DEFERRED ITEMS

- Production parity still must be reviewed before pilot operations.
- Production observability must be confirmed before cutover.
- Production rules must combine legacy rules plus v2 rules; do not deploy `firestore.v2.rules` alone.
- Real household preview requires attended human review.
- Gate 4 shadow mode must be read-only.

## 39. PRODUCTION PILOT PREREQUISITES

- Review this Phase 4A report.
- Preserve production ruleset and World-1 backup/export.
- Push/back up phase branches.
- Confirm migration operator identity.
- Run Gate 1 read-only preview against the one live shared household.
- Resolve all ambiguity to zero before any production write.
- Deploy additive combined v2 rules only after review.

## 40. PHASE 4B PRODUCTION RUNBOOK

Phase 4B is attended, one gate at a time, and was not executed in Phase 4A.

### Pre-gate — Authorization & backup

Review Phase 4A, preserve the deployed production ruleset, record the current production app version, create an approved World-1 backup/export/checkpoint, and explicitly authorize the production pilot. Do not run production migration from code that exists only on one machine.

### Gate 1 — Read-only real household preview

Run the proven zero-write preview against the one live shared household in `budgetapp-c9306`. Assert `writesPerformed = 0`. Human-review members, roles, debts, exclusions, balances, APR states, mortgage behavior, draft plans, warnings, source fingerprint, and digest. Stop if `needs_confirmation > 0` or mapping is wrong.

### Gate 2 — Deploy additive v2 rules

Deploy rules only after security review. Production rules must combine existing legacy rules plus v2 `workspaces/**` rules. Do not deploy app, migration UI, data, functions, or flags. Verify legacy 1.0 remains healthy and v2 namespace is protected.

### Gate 3 — Create real World-2 copy

Using the reviewed preview, matching fingerprint, matching digest, explicit confirmation, and authorized operator, write Workspace, Memberships, Debts, initial BalanceSnapshots, draft PayoffPlans, PlanVersions/checkpoints, and migration journal to World 2. Never write World 1. Do not auto-activate plans or advance to `v2_native`. Validate preview vs persisted World 2. Roll back if wrong.

### Gate 4 — Read-only production shadow

Enable v2 only for the pilot household in read-only shadow mode. Allow Home/Debts/Plan/Settings reads and projections only. Disable canonical v2 financial writes while World 1 remains authoritative. Flag OFF must return cleanly to 1.0. This is the last fully reversible gate.

### Final source reconciliation

Immediately before cutover, re-read World 1. If the source fingerprint changed since Gate 3, stop and generate a deterministic delta/reconciliation preview. Cutover only after World 2 accurately represents current World-1 state.

### Gate 5 — Authority cutover

After Gates 1-4 pass, shadow is stable, source reconciliation is complete, observability is ready, and the operator explicitly approves, advance migration state to `v2_native`. World 2 becomes canonical; World 1 becomes archive/read-only.

### First supervised v2-native write

After `v2_native`, perform one legitimate real user action, such as a genuine balance confirmation when appropriate. Verify UI → application service → Firebase repository → production rules → persisted readback → UI. After this point, simple rollback to World 1 is no longer lossless.

### World 1 archival

Do not delete World 1. Preserve legacy records through the defined safety period. Phase 5 handles retirement later.

### No global rollout

The one shared household is the pilot. Successful migration of that household does not authorize global rollout.
