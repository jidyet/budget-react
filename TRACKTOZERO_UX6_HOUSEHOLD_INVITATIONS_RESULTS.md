# TrackToZero UX-6 Results

## 1. Status

UX-6 household management, secure invitations, join acceptance, and optional account/person connection are implemented on branch `phase4/migration-rehearsal`.

Completion state:

- Core implementation: complete
- App/service/rules parity: complete
- Automated validation: complete
- Real browser walkthrough: complete, August 16, 2026 - full owner-invite -> invitee-accept -> person-connect lifecycle verified in a real browser against the real `v2-local` Firebase emulators, across all 12 required scenarios. Four real defects were found and fixed in the process (see §8).

No production deploy, migration, merge, or push was performed as part of this pass.

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

Re-validated after the browser-QA-driven fixes in §8, August 16, 2026:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 42 files / 614 tests |
| `npm run lint` | Passed with 4 warnings, 0 errors |
| `npm run build` | Passed |
| `npm run perf:check` | Passed |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 63/63, parity guard green against both `firestore.rules` and `firestore.v2.rules` |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Lint warnings still present (all pre-existing, none introduced by this pass):

- `src/App.jsx`: missing `setUser` dependency warning
- `src/components/tracktozero/TrackToZeroV2App.jsx`: unnecessary `repository` dependency warning
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning

## 8. Real Browser QA: Full Invite/Join Lifecycle

Driven with Playwright against `npm run dev:v2-local` (port 5184) + `npm run emulators:v2` (real Firestore/Auth emulators, real security rules) - the actual environment blocker noted in the previous version of this document (`Node runtime v22.14.0 vs required >= v22.22.0`) turned out not to block a Playwright-driven Chromium session, only some other in-app browser tool. Two independent browser contexts (owner, invitee) were used per scenario so auth sessions never crossed.

Synthetic test identities only; nothing production-facing was touched.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Owner creates household, invites by email | Pass - invite appears pending, no membership created yet, zero console errors |
| 2 | Invitee opens invite link while signed out | Pass - shows the invite/sign-in screen, never `PERMISSION_DENIED` |
| 3 | Invite context survives sign-up | Pass - invitee lands on the "Join household" screen immediately after creating their account |
| 4 | Explicit acceptance required | Pass - membership is created only after the invitee clicks "Join household"; verified directly in Firestore that no membership existed beforehand |
| 5 | Reopen the same invite link after acceptance | Pass - safe landing in the workspace, no `PERMISSION_DENIED`, no second membership or `member_index` entry (verified in Firestore) |
| 6 | Email mismatch (signed in as a different account than the invite target) | Pass (after fix) - blocked with "This invite was sent to X. Sign in with that account to continue.", not a generic error |
| 7 | Canceled invite | Pass - blocked with "This invite was canceled. Ask the household owner for a fresh link.", no Join button offered |
| 8 | WorkspacePerson connection - accept | Pass (after fix) - invitee whose name matches an existing unlinked `WorkspacePerson` sees the connect screen and can explicitly link it |
| 9 | WorkspacePerson connection - decline | Pass (after fix) - "Not now" leaves the household membership valid and the `WorkspacePerson` unconnected |
| 10 | `member_index` correctness | Pass - exactly one `member_index` entry per member (owner + 2 invitees = 3), each keyed `{workspaceId}_{uid}`, no duplicates, confirmed by direct Firestore inspection under each user's own restricted read access |
| 11 | Financial-truth isolation | Pass - two debts (500 + 300) created before any invite activity were unchanged (balances, owners) after the full invite/accept/connect/decline sequence, confirmed by direct Firestore inspection |
| 12 | Console status throughout | Pass - zero console errors across every owner and invitee session, every scenario |

### Defects found and fixed during this pass

Real browser QA (not previously performed against this real-auth code path) surfaced four defects, all fixed and covered by the scenarios above:

1. **Invite link lost after creation.** `Settings`'s `latestInvite` (the only place the raw, one-time joinable link is ever available - only the hashed token is persisted) was local component state. Every write action calls `refresh()`, which briefly sets the app into a loading state that unmounts `Settings`, silently destroying the link before an owner could realistically copy it. Fixed by lifting `latestInvite` to `TrackToZeroV2App`, which survives that remount.
2. **Action errors never displayed.** `runAction` reset `writeState.action` to `""` in both its success and failure branches, but `JoinAcceptScreen`/`JoinConnectScreen` decided whether to show `writeState.error` by checking `writeState.action === "<name>"` - a check that was therefore always false by the time an error needed to be shown. Fixed by adding a dedicated `errorAction` field that isn't cleared until the next action starts.
3. **Domain validation messages replaced with a generic fallback.** `getUserSafeTrackToZeroError` unconditionally routed every thrown error through three narrow regexes meant to catch raw Firestore/technical errors, then fell back to a generic "could not complete that action" message for anything else - including already-safe, intentionally-authored validation messages like the email-mismatch text, destroying the one piece of information the user needed. Fixed by trusting any error without a Firebase/Firestore `.code` (which only application-thrown `Error`s lack) verbatim.
4. **WorkspacePerson-connect screen unreachable.** `acceptJoinInvite` deliberately leaves `joinIntent` set while a person-link decision is pending (so the later connect/skip step can still resolve it), but the render gate checking `joinIntent && joinPreviewState.status === "ready"` ran before the `joinAcceptedState.status === "needs_person_link"` gate and kept re-matching on the now-stale preview, making `JoinConnectScreen` completely unreachable regardless of how good a person match was found. Fixed by reordering the gates.

None of these were pre-existing production regressions - all four were latent in UX-6's own not-yet-committed code, invisible without driving the real accept/connect flow in a real browser end to end, which no prior pass had done.

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

UX-6 is functionally implemented and validated through code, repository tests, app-service tests, legacy rules tests, the authoritative v2 Firestore parity suite, and - as of this pass - a full real-browser walkthrough of the household invite/join/person-connect lifecycle against real Firebase Auth and Firestore emulators, with four defects found and fixed along the way. No gaps remain for this slice.
