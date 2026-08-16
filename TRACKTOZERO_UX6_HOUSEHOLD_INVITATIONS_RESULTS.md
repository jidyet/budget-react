# TrackToZero UX-6 Results

## 1. Status

UX-6 household management, secure invitations, join acceptance, and optional account/person connection are implemented on branch `phase4/migration-rehearsal`.

Completion state:

- Core implementation: complete
- App/service/rules parity: complete
- Automated validation: complete
- Real browser walkthrough: environment-blocked on August 16, 2026

No production deploy, migration, merge, or push was performed.

## 2. Scope Completed

Implemented:

- Secure household invite model with explicit invitation status lifecycle
- Copy-link invitation flow with hashed invite token storage
- Invite acceptance flow gated by signed-in email match
- User workspace discovery through actual memberships instead of deterministic workspace guessing
- Household rename flow in the v2 Settings experience
- Pending invite list and cancel flow in v2 Settings
- Optional `WorkspacePerson` self-link flow after joining
- Household “unlinked financial people” connection tools in v2 Settings
- Firebase repository support for invite read/list/accept/cancel and member lookup by user
- Combined `firestore.rules` parity with `firestore.v2.rules`
- Repository timestamp handling for `memberInvite`

## 3. Data / Domain Changes

Updated domain model:

- `createWorkspace()` now supports optional `name`
- `createWorkspaceMembership()` now supports `acceptedInviteId`
- Added `createWorkspaceInvitation()`

Invitation model fields include:

- `id`
- `workspaceId`
- `workspaceName`
- `emailNormalized`
- `role`
- `status`
- `tokenHash`
- `invitedByUserId`
- `invitedByName`
- `workspacePersonId`
- `createdAt`
- `createdBy`
- `expiresAt`
- `acceptedAt`
- `acceptedByUserId`
- `canceledAt`
- `canceledByUserId`

## 4. Repository / Service Changes

Added or updated in repository/application layers:

- `listMembershipsForUser(uid)`
- `saveMemberInvite(...)`
- `getMemberInvite(...)`
- `listMemberInvites(...)`
- `acceptMemberInvite(...)`
- `cancelMemberInvite(...)`
- `getUserWorkspaces()`
- `getJoinInvitePreview(...)`
- `renameWorkspace(...)`
- `connectWorkspacePersonToMember(...)`

Important repository correction:

- `memberInvite` was added to Firestore timestamp serialization/deserialization so invite timestamps now persist consistently with the rest of the v2 model.

## 5. Firestore Rule Outcome

The authoritative combined `firestore.rules` file now includes the UX-6 invitation/person-link contract, including:

- invite creation by Admin+
- public `get` for invite preview
- member-visible invite listing
- invite acceptance update rules
- membership creation tied to accepted invite
- self-linking an unlinked `WorkspacePerson` to the authenticated member only

Most important result:

The V2 security/atomicity suite passed against both:

- `firestore.rules` (authoritative combined production-shaped rules)
- `firestore.v2.rules` (reference v2 rules file)

That parity guard passed with no drift.

## 6. V2 UI Changes

`TrackToZeroV2App.jsx` now supports:

- join-link detection from URL query state
- signed-out invite preview screen
- signed-in invite acceptance screen
- post-accept person connection screen
- membership-based workspace refresh behavior
- household settings for:
  - workspace rename
  - invite creation
  - invite cancellation
  - copied join link
  - unlinked-person connection

The previous QA-harness-style deterministic workspace assumption for real-auth runtime was removed in favor of membership discovery.

## 7. Automated Validation Run

Validated on August 16, 2026:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 42 files / 614 tests |
| `npm run lint` | Passed with 4 warnings, 0 errors |
| `npm run build` | Passed |
| `npm run perf:check` | Passed |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2 -- tests/firestore.v2.rules.test.js` | Passed, authoritative parity guard green |
| Targeted repository/service tests | Passed, 3 files / 59 tests |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Lint warnings still present:

- `src/App.jsx`: missing `setUser` dependency warning
- `src/components/tracktozero/TrackToZeroV2App.jsx`: missing `joinAcceptedState.workspaceId` and `joinIntent?.workspaceId` callback deps warning
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning

These warnings were not addressed in this UX-6 pass.

## 8. Browser QA Attempt

I attempted a real browser walkthrough using the in-app browser tooling.

Result:

- blocked by local browser runtime bootstrap requirements
- available Node runtime: `v22.14.0`
- required by the browser runtime bridge: `>= v22.22.0`

So browser QA was not skipped; it was attempted and blocked by the local environment.

## 9. Production Safety

Confirmed unchanged:

- no production deploy
- no migration run
- no production v2 writes
- no rules deployment
- no push
- no merge
- no legacy data mutation path reintroduced
- no `planned_v` sync behavior reintroduced

## 10. Net Result

UX-6 is functionally implemented and validated through code, repository tests, app-service tests, legacy rules tests, and the authoritative v2 Firestore parity suite.

The only remaining gap for this slice is a real browser walkthrough after the local Node/browser bridge environment is updated.
