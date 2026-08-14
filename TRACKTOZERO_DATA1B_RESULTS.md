# TrackToZero DATA-1B Results

## 1. Status

DATA-1B implementation is complete on branch `phase4/migration-rehearsal`.

Scope honored:

- No production deploy.
- No production Firebase writes.
- No production migration.
- No Firestore rules deployment.
- No legacy storage/key rename.
- No PaymentEvent fabrication from imports.
- No PlanVersion mutation.

DATA-1A baseline was committed first:

- Commit: `aa6ab96`
- Message: `DATA-1A: add intelligent workbook debt discovery`

## 2. What Changed

Added existing-debt reconciliation for v2 imports:

- New pure matching service: `src/services/tracktozero/debtReconciliation.js`
- New tests: `src/services/tracktozero/debtReconciliation.test.js`

The matcher classifies import candidates as:

- `no_match`
- `possible_match`
- `strong_match`
- `multiple_matches`
- `duplicate_import`

Matching evidence includes:

- Safe account reference / last-4 normalization.
- Creditor normalization including Bank of America/BofA and Firstmark variants.
- Owner/type/balance support signals.
- Conflict concerns such as different safe account references or owner mismatch.
- Field-level reconciliation diff.
- Import fingerprint for duplicate detection.

## 3. Explicit Review Decisions

Added app-service review flow:

- `resolveImportCandidateMatch(...)`

Supported reviewer decisions:

- `update_existing`
- `new_debt`
- `unsure`

Behavior:

- `update_existing` keeps the existing Debt id, appends a new BalanceSnapshot, and applies only explicitly approved metadata fields.
- `new_debt` uses the existing Debt + opening BalanceSnapshot atomic path.
- `unsure` persists the candidate as `needs_information` with open review evidence and performs no authoritative mutation.

## 4. Update Existing Contract

For update-existing import resolution:

- Debt identity is preserved.
- A BalanceSnapshot is appended with source `import`.
- Debt `currentBalance` is updated from the imported confirmed balance.
- Metadata updates are opt-in only.
- No PaymentEvent is created.
- Existing PlanVersions remain immutable.

Repository support added:

- `updateDebtFromImportCandidate(...)` in the in-memory repository.
- `updateDebtFromImportCandidate(...)` in the Firebase repository using a Firestore transaction.

Firebase transaction behavior:

- Reads the existing Debt.
- Verifies the imported snapshot id does not already exist.
- Updates Debt current balance/explicit metadata.
- Creates exactly one BalanceSnapshot.

## 5. Debt Identity Field

Added optional v2 Debt field:

- `accountReferenceSafe`

Reason:

- DATA-1B requires future reimports to match on safe account reference / last-4.

This is a v2 domain field only. No legacy storage fields were renamed or migrated.

## 6. Duplicate Reimport Handling

Duplicate detection uses a fingerprint based on:

- Normalized creditor.
- Safe account reference.
- Statement date.
- Balance.

Duplicate candidates are marked `duplicate_import` / `exact_duplicate` and remain review-only unless the reviewer explicitly resolves them.

## 7. Tests Added / Extended

Added pure matcher coverage for:

- Firstmark workbook/PDF matching.
- Multiple Firstmark loans.
- Same creditor with different account references.
- BofA / Bank of America variants.
- Owner conflict review evidence.
- Duplicate import fingerprints.
- Diff states including changed/missing/conflicting.
- No parser-output mutation.

Extended async app-service coverage for:

- Update existing debt -> BalanceSnapshot only.
- New debt override.
- Unsure / needs-review persistence.
- Duplicate reimport blocked without explicit resolution.
- No PaymentEvent fabrication.
- PlanVersion immutability during import updates.

Extended Firebase emulator repository coverage for:

- Update-existing import transaction writes one BalanceSnapshot.
- Debt count remains unchanged.
- No PaymentEvents are created.

## 8. Validation

Validation run after DATA-1B:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 29 files / 357 tests |
| `npm run lint` | Passed with 3 existing React hook warnings |
| `npm run build` | Passed with existing large-chunk warning |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 48/48 v2 emulator/parity tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

## 9. Production Safety Confirmations

Confirmed:

- No push was performed during implementation.
- No merge was performed.
- No deploy was performed.
- No production migration was performed.
- No production Firebase writes were performed.
- `firebase.json` was not changed.
- `firestore.v2.rules` remains emulator/reference-only.

