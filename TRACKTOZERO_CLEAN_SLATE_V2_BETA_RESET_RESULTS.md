# TrackToZero Clean-Slate V2 Beta Reset Results

## 1. Status

**YES — clean-slate reset completed and V2 beta relaunch prepared.**

Production data reset was performed only after the required gates passed:

- Project identity verified as `budgetapp-c9306`.
- Firestore backup completed and verified.
- Firebase Auth export completed and verified.
- Git safety branch/tag pushed before deletion.
- Immediate pre-delete recheck passed.

No unrelated production migration was performed.

## 2. Safety Backup

| Artifact | Result |
| --- | --- |
| Branch safety ref | `origin/phase4/migration-rehearsal` at `724c3f1bca0733e2366dec2130c14d210d59ce86` |
| Backup tag | `backup/pre-clean-slate-v2-20260813` pushed |
| Firestore backup | Completed and verified in private review storage |
| Firestore backup count check | `1374` live docs matched `1374` backup docs |
| Firestore collection-path mismatches | `0` |
| Auth export | Completed and verified in private review storage |
| Auth export count check | `6` live users matched `6` exported users |
| Auth password material | Not included in Admin SDK export |

Private backup artifacts were written outside the repository under the clean-slate reset review folder.

## 3. Production Data Reset

Approved Firestore delete set:

- `feedback`
- `householdDirectory`
- `households`
- `income`
- `records`
- `registry`
- `users`
- `workspaces`

Preserved:

- `config`

Firestore result:

- Top-level delete-set collections verified empty.
- Orphan child docs under approved delete roots were detected by verification and then cleaned.
- Final orphan-child verification passed with zero remaining child docs under approved delete roots.
- `config` remained preserved.

Firebase Auth result:

- `6` users deleted.
- Final Auth user count verified as `0`.

## 4. V2 Relaunch Code Changes

Implemented:

- TrackToZero V2 is now the default app path.
- If V2 is disabled, the app shows a controlled beta-disabled state rather than World-1.
- Production V2 repository mode uses Firebase only when configured for `budgetapp-c9306`.
- Fresh Firebase users bootstrap into an empty V2 personal workspace with owner membership.
- No seed debts or demo plans are loaded in production mode.
- V2 signup/sign-in/sign-out flow added.
- Combined production `firestore.rules` now includes the tested V2 workspace rules while preserving legacy rules.

Still true:

- `firestore.v2.rules` remains an emulator/reference test rules file.
- `firebase.json` still deploys `firestore.rules`.
- No production fake data was created.

## 5. Validation

| Check | Result |
| --- | --- |
| Unit tests | Passed, `17` files / `124` tests |
| Lint | Passed with the same `3` existing hook warnings |
| Build | Passed with existing large-chunk warning |
| Legacy/combined Firestore rules tests | Passed, `12/12` |
| V2 emulator tests | Passed |
| V2 rules smoke against combined `firestore.rules` | Passed, `9/9` |
| Bundle budget | Passed |
| Production dependency audit | Passed, `0` vulnerabilities |

## 6. Production Safety Confirmations

- No functions deploy was performed.
- No broad project wipe command was used.
- Firestore deletion was bounded to the approved delete set.
- Production V2 writes after reset are only available through authenticated users and deployed V2 rules.
- World-1 is not served as the beta kill-switch fallback.

