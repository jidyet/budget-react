# TrackToZero Phase 4B Gate 3R Recovery Results

## 1. Status

YES — Gate 3 root cause is fixed in emulator; production recovery action is required before retry.

This pass did not retry production Gate 3, did not clean production data, did not deploy rules, did not deploy the app, did not enable v2, and did not start Gate 4.

## 2. Root Cause

The migration executor wrote candidate memberships in the order supplied by the production source. The production-shaped member order can place a non-owner member before the owner member.

The previous bootstrap sequence was:

1. Create v2 Workspace root.
2. Create memberships in source order.
3. Create/update the migration manifest only after the workspace and actor membership both existed.

When the first membership in source order was a contributor, Firestore rules correctly denied the membership create because no owner membership existed yet. Since the manifest was not written until after owner membership existed, the failure left one unjournaled Workspace root.

## 3. Exact Denied Operation

Denied operation category:

- `create` on `workspaces/{workspaceId}/members/{memberUid}`
- The denied document was a non-owner membership attempted before the owner membership existed.

Authenticated state:

- Signed-in migration actor had the migration-operator custom claim.
- The actor was the approved owner in the reviewed migration preview.
- The target workspace root had just been created.
- No owner membership existed yet.
- No migration manifest existed yet.

Rules predicate that was false:

- Non-owner member creation requires existing owner authority via `isOwner(workspaceId)`.
- `isOwner(workspaceId)` requires an active owner membership.
- That membership had not been created yet because member ordering was source-dependent.

## 4. Why Phase 4A Tests Did Not Catch It

The existing emulator fixtures listed the owner first in `legacyMembers`. That meant the old ordered sequence created owner membership before contributor membership, so the permission path passed.

The production-shaped case used a member order where contributor came first and owner second. That exact ordering was not previously covered.

## 5. Production-Shaped Emulator Reproduction

Added an emulator regression test with:

- Empty target workspace.
- No target memberships.
- No migration manifest.
- Authenticated owner with `trackToZeroMigrationOperator: true`.
- Candidate membership order: contributor first, owner second.

The test first reproduces the old denial by directly running:

1. `saveWorkspace(...)`
2. `saveMembership(contributor-first-member)`

That direct old-shaped sequence is denied by `firestore.v2.rules`.

The same production-shaped preview then succeeds through the corrected `executeMigrationPreview(...)` path.

## 6. Defect Classification

Defect class:

- Migration executor write-order defect.
- Migration bootstrap atomicity / manifest timing defect.

No normal user permission rule was the root cause. Firestore correctly denied a non-owner membership before owner authority existed.

## 7. Fix

The executor now bootstraps a migration in this order:

1. Validate the actor is the deterministic Workspace owner for initial bootstrap.
2. Atomically create:
   - Workspace root.
   - Actor owner membership.
   - Migration manifest in `in_progress`.
3. Write remaining memberships after owner authority exists.
4. Write debts, balance snapshots, draft plans, plan versions, and expected checkpoints.
5. Validate persisted state.
6. Mark the manifest `rollback_allowed`.

The executor no longer depends on source member order.

## 8. Rules Changes

Changed `firestore.v2.rules` only. These rules remain emulator-only and were not deployed.

Added narrow bootstrap helpers using Firestore after-state checks:

- `workspaceCreatedByAfter(...)`
- `ownerMembershipAfter(...)`
- `isBootstrapMigrationRun(...)`

The migration manifest `create` rule now permits a migration-operator bootstrap only when the same atomic write batch also creates the deterministic workspace and actor owner membership.

Normal role behavior is unchanged:

- Owner/Admin management remains unchanged.
- Contributor remains observation-only.
- Viewer remains read-only.
- Non-members remain denied.
- Migration operator did not become unrestricted admin.

## 9. Repository / Executor Changes

Repository changes:

- Added `saveMigrationBootstrap(...)` to the in-memory v2 repository.
- Added `saveMigrationBootstrap(...)` to the Firebase v2 repository using a Firestore write batch.

Executor changes:

- Actor owner membership is selected explicitly by `actorId`.
- Non-owner memberships are written only after owner authority exists.
- Workspace + actor owner membership + manifest are committed as one bootstrap unit.
- If an unjournaled bootstrap root exists before a retry, the executor blocks and requires supervised recovery.

## 10. Bootstrap Ordering

Corrected ordering:

```text
atomic bootstrap batch
  -> Workspace root
  -> Actor owner membership
  -> migration_runs/{migrationRunId} in_progress
then
  -> remaining memberships
  -> debts
  -> balance snapshots
  -> draft plans
  -> plan versions
  -> expected checkpoints
  -> validation
  -> migration manifest rollback_allowed
```

## 11. Manifest Timing

The manifest is now created during bootstrap, not after source-ordered memberships.

This minimizes the dangerous state:

```text
production v2 document exists
+
no migration journal exists
```

For corrected empty-target runs, the first committed migration state is journaled and recoverable.

## 12. Failure Atomicity / Recovery

For an empty target:

- Workspace + owner membership + manifest either all commit together or none commit.
- An injected failure immediately after bootstrap leaves a `partial_failed` manifest with completed paths.
- No debts, snapshots, plans, versions, checkpoints, or payment events are created in that early-failure test.

For the existing production orphan:

- Because the orphan was created by the old sequence before any manifest existed, normal rollback cannot account for it.
- It requires a separate supervised surgical cleanup before another Gate 3 retry.

## 13. Orphan Workspace State

Read-only production inspection found:

- Exactly one v2 Workspace root.
- Workspace hash matches the failed Gate 3 target hash: `c5e3870ab943`.
- No child collections were present.
- No memberships.
- No debts.
- No snapshots.
- No plans.
- No versions.
- No checkpoints.
- No payment events.
- No migration manifest.
- No v2-native state.

Exact orphan path identified for supervised cleanup:

```text
workspaces/workspace-bac80eda
```

## 14. Recommended Orphan Cleanup

Classification:

SAFE DELETE BEFORE RETRY.

Recommended production recovery action, to be run later as a separately authorized supervised action:

1. Re-read `workspaces/workspace-bac80eda`.
2. Verify the workspace ID hash is `c5e3870ab943`.
3. Verify the root document content matches the failed bootstrap Workspace candidate.
4. Verify there are still no child collections/subdocuments.
5. Delete exactly this document:

```text
workspaces/workspace-bac80eda
```

6. Re-read and verify the document no longer exists.
7. Re-run Gate 3 preflight before retrying migration.

Do not use broad recursive deletion.

## 15. Emulator Rehearsal

The corrected emulator migration rehearsal passed:

- Empty target.
- Authenticated migration operator.
- Production-shaped contributor-first member ordering.
- Atomic bootstrap.
- Complete migration writes.
- Validation successful.
- Manifest reaches `rollback_allowed`.
- `activePlanId` remains safe / unset.
- PaymentEvents remain zero where expected.

The large synthetic migration fixture also still executes, validates, and rolls back.

## 16. Rollback

Rollback passed in the v2 emulator suite.

Verified:

- Rollback requires migration-operator authorization.
- Rollback removes migrated debts/plans and related expected v2 artifacts.
- Manifest moves to `rolled_back`.
- Rollback remains blocked after unrelated v2-native writes.

## 17. Native-Write Barrier

Native-write barrier remains intact.

The existing test still proves rollback is blocked after a native/unrelated v2 debt is written into the migrated workspace.

## 18. Security Regression

V2 security regression passed:

- Owner approved actions unchanged.
- Admin approved actions unchanged.
- Contributor cannot manage debts/plans and can only append allowed observations.
- Viewer remains read-only.
- Non-member access is denied.
- Migration operator gains only the narrow bootstrap capability required for migration journaling.

## 19. Full Validation

Validation results:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 17 files / 123 tests |
| `npm run lint` | Passed with 3 existing hook warnings |
| `npm run build` | Passed with existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 41 v2 emulator tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

## 20. Production Safety

Confirmed:

- No production migration retry.
- No production cleanup.
- No production v2 financial writes.
- No World-1 writes.
- No rules deploy.
- No app deploy.
- No V2 flag enablement.
- Gate 4 not started.
- `firestore.v2.rules` remains emulator-only.

Read-only production inspection was used only to classify the orphan.

## 21. Exact Steps Required Before Gate-3 Retry

Before retrying Gate 3:

1. Review and merge this Gate 3R fix.
2. Deploy the corrected combined Firestore rules in a supervised Gate 2-style rules deployment.
3. Verify the active production rules digest after deploy.
4. Perform the supervised orphan cleanup for exactly `workspaces/workspace-bac80eda`.
5. Verify the orphan root no longer exists and no child data was present before deletion.
6. Re-run Gate 3 preflight and confirm target existing count is zero.
7. Re-run source fingerprint and preview digest checks.
8. Only then retry Gate 3.
