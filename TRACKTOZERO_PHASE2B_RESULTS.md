# TrackToZero Phase 2b Results

## 1. Status

Branch: `phase2/domain-model`

Phase 2b implemented a real Firebase-backed repository for the TrackToZero v2 domain and proved it round-trips correctly through the Firestore **emulator** under `firestore.v2.rules`, using authenticated client-SDK contexts for every authorization assertion. No rule deployment, no production data, no 1.0 UI change, no Phase 3 work.

Completion gate:

## YES — FIREBASE PERSISTENCE PROVEN UNDER V2 RULES

All required conditions hold (see section 14 for the itemized completion-gate checklist; section 15 for the underlying validation run results).

## 2. The Firebase Repository

`src/services/repositories/firebaseTrackToZeroRepository.js` exports `class FirebaseTrackToZeroRepository`, built on the existing `v2Paths` path contract (`src/services/repositories/tracktozeroRepositories.js`, unchanged) and the existing domain factories in `src/domain/tracktozero/models.js` (unchanged, same validation as the in-memory repo).

- **Constructor takes an injected Firestore instance**, never the app's global `db` from `src/firebase.js`. This lets tests point it at `testEnv.authenticatedContext(role).firestore()` for any role, and keeps the v2 repository decoupled from the 1.0 app's Firebase config/init gating.
- **Same method set as `InMemoryTrackToZeroRepository`** wherever the sync/async boundary allows it (see section 9 for the one place it can't): `saveWorkspace/getWorkspace/putWorkspace`, `saveMembership/getMembership`, `saveDebt/listDebts`, `savePlan/getPlan/putPlan/listPlans`, `savePlanVersion/getPlanVersion` + immutable `updatePlanVersion` (throws, no Firestore call), `createPaymentEvent/getPaymentEvent` + immutable `updatePaymentEvent` (throws), `createBalanceSnapshot/listBalanceSnapshots` + immutable `updateBalanceSnapshot` (throws), `createExpectedCheckpoint/getExpectedCheckpoint` + immutable `updateExpectedCheckpoint` (throws), plus the Firebase-only `activatePlan` (section 3).
- **Firebase types are kept strictly at the repository boundary.** A dedicated module, `src/services/repositories/firestoreTimestamps.js`, is the only place that boundary is crossed: `toFirestoreDoc(kind, obj)` / `fromFirestoreDoc(kind, data)` convert ISO-8601 strings (the domain's canonical timestamp representation) to/from Firestore `Timestamp` via an explicit **per-entity field allowlist** — not a blind deep-walk, since fields like `PlanVersion.assumptions` and `ExpectedCheckpoint.expectedDebtBalances` hold arbitrary nested data that must pass through untouched. No `DocumentReference`, `Timestamp`, or other Firebase-specific type is ever returned to a caller.

## 3. Repository-Contract Extensions (both classified as gap-fills, not redesigns)

Two genuine, minimal gaps existed in the Phase 2 repository contract, needed to satisfy this phase's own required checks. Both are purely additive (new methods only; no existing method's behavior changed), verified by re-running the Phase 2 suite immediately after each change — stayed green throughout.

- **`getPaymentEvent(workspaceId, debtId, eventId)`** added to both repositories. Neither repo had any read method for `PaymentEvent` (only `createPaymentEvent`). Needed to prove read-permission is independently correct (a viewer can *read* payment events even though only contributor+ can *write* them) — not provable from `create`'s return value alone.
- **`createExpectedCheckpoint` / `getExpectedCheckpoint` / `updateExpectedCheckpoint`** (throws, matching the other three append-only/immutable entities) added to both repositories. `ExpectedCheckpoint` already had a validated domain factory and an already-defined-but-unused Firestore path (`v2Paths.expectedCheckpoint`), but no persistence at all.

**Classification:** Repository Defect (gap-fill) — the existing domain/security contract already fully specified these entities; only the persistence methods were missing.

## 4. Round-Trip Evidence Per Entity

All proven via the *real repository's* write/read path (not raw `db.doc().set()`), in `tests/firestore.v2.repository.test.js`, against the emulator with `firestore.v2.rules` loaded:

| Entity | Authorized write → read intact | Unauthorized write denied |
|---|---|---|
| Workspace | creator bootstraps + reads back | non-member `getWorkspace` denied |
| Membership | owner invites a non-owner role, reads it back | contributor `saveMembership` denied |
| Debt | admin writes, viewer reads via `listDebts` | contributor `saveDebt` denied |
| PayoffPlan + PlanVersion | admin writes both, viewer reads both | contributor `savePlan` denied |
| PaymentEvent | contributor appends, **viewer independently reads** | viewer `createPaymentEvent` denied |
| BalanceSnapshot | contributor appends (x2), viewer reads via `listBalanceSnapshots` with correct `observedAt`-desc/`id`-desc ordering | viewer `createBalanceSnapshot` denied |
| ExpectedCheckpoint | admin creates, viewer reads | contributor `createExpectedCheckpoint` denied |

The PaymentEvent and BalanceSnapshot cases deliberately use a *different* role for the read than the write, proving read-permission is independently gated (broader than write-permission), not merely inferred from a successful create.

## 5. Transactional Plan-Activation Proof

`FirebaseTrackToZeroRepository.activatePlan({ workspaceId, planId, versionId, actorId, activatedAt })` is a real `runTransaction` — all reads (workspace, target plan, target version, and the conditional previous-active-plan read) happen before any writes, per Firestore's transaction ordering requirement.

- **Successful switch** (`activatePlan succeeds atomically...` test): owner activates plan p1→v1, then switches to p2→v2. Verified afterward: `workspace.activePlanId == "p2"`, `p1.status == "archived"`, `p2.status == "active"` with `activeVersionId == "v2"` — all three documents updated together.
- **Failed switch, no partial state** (`activatePlan denied for an unauthorized role...` test): with p1 already active, a contributor (below Admin+ for both `workspaces/{id}` and `plans/{id}` updates) attempts to activate p2 — `assertFails`. Re-fetched afterward as an authorized viewer: `workspace.activePlanId` is still `"p1"`, `p1.status` is still `"active"`, `p2.status` is still `"draft"` — none of the transaction's writes landed.

## 6. Append-Only / Immutability Proof at the Rules Layer

This proof lives in the **pre-existing, untouched** `tests/firestore.v2.rules.test.js` (`plan versions and expected schedules are historical`, `payment and balance core fields cannot be mutated`) — 9/9 tests still passing, unmodified this phase.

Important, deliberate design point: `FirebaseTrackToZeroRepository.updatePlanVersion` / `updatePaymentEvent` / `updateBalanceSnapshot` / `updateExpectedCheckpoint` all throw **synchronously, with no Firestore call at all** — exactly matching the in-memory repository. This means the repository's own immutability guarantee is enforced client-side (fast-fail, consistent with the sync contract), while the *independent* server-side enforcement is what `firestore.v2.rules.test.js` proves directly against raw documents. Both layers agree; neither is redundant with the other, and this is called out explicitly rather than left implicit.

## 7. Emulator Safety Proof

- Project id: `demo-budget-react-v2` (never the production project id).
- `tests/firestore.v2.repository.test.js`'s `test.before()` **refuses to run** if `FIRESTORE_EMULATOR_HOST` is not set, throwing before `initializeTestEnvironment` is even called. Verified directly: running `node --test tests/firestore.v2.repository.test.js` without the emulator wrapper fails immediately with `FIRESTORE_EMULATOR_HOST is not set - refusing to run.`
- Structural guarantee on top of that explicit check: `@firebase/rules-unit-testing`'s `initializeTestEnvironment` is architecturally incapable of connecting to production Firestore — it only ever accepts a local `host`/`port`, never real GCP project credentials. There is no code path in this test suite that could reach a live database even if the explicit guard were removed.
- `scripts/run-firestore-v2-tests.mjs` (existing, modified only to also run the new test file) starts a real local emulator with a dynamically-chosen free port and sets `FIRESTORE_EMULATOR_HOST` for the child process — this is the only supported way to run the suite (`npm run test:firestore:v2`).

## 8. Security-Test Mechanism

Every authorization assertion (`assertSucceeds`/`assertFails` on a repository method call) uses `testEnv.authenticatedContext(uid).firestore()` — the Firebase **client SDK** with a real per-role auth context — passed into `FirebaseTrackToZeroRepository`'s constructor. The Admin SDK (`firebase-admin`, a devDependency) is never imported or used anywhere in the new code or tests.

The **only** place rules are bypassed is fixture seeding (`seedBaseWorkspace()`, via `testEnv.withSecurityRulesDisabled(...)`) — the library's dedicated escape hatch for test setup, explicitly not the operation under test. No repository method call whose authorization is being asserted ever runs through a rules-bypassing context.

## 9. Repository-Contract Parity

`tests/support/trackToZeroRepositoryContract.js` exports `runTrackToZeroRepositoryContractSuite(...)`, using plain `node:assert/strict` so the identical test bodies run unmodified under both:

- `src/services/repositories/trackToZeroRepositoryContract.vitest.test.js` — `InMemoryTrackToZeroRepository`, via `npm test` (vitest).
- `tests/firestore.v2.repository.test.js`'s `describe("shared repository contract (Firebase-backed)", ...)` block — `FirebaseTrackToZeroRepository` against the real emulator, via `npm run test:firestore:v2`.

Both pass in full: **10/10 behavioral checks** — workspace, membership, debt, plan, plan version (+ immutability), active-plan resolution, active-plan switching, expected checkpoint (+ immutability), payment event, balance snapshot (+ ordering) — against both implementations.

**One deliberate, documented divergence** (see section 10 for why): `switchActivePlan(repo, args)` is an injected function, not a literal shared call. The in-memory entrypoint drives it via the existing `activatePlanTransaction(...)` service function; the Firebase entrypoint drives it via `repo.activatePlan(...)`. The suite proves *behavioral* parity (same outcome for both) rather than literal same-function parity, since the two are not achievable simultaneously (see below).

**One assertion deliberately not shared**: `getWorkspace("missing") === null` is asserted only for the in-memory repository (covered in `src/domain/tracktozero/trackToZeroDomain.test.js`), not in the shared suite. Under a real authorization layer, "the workspace doesn't exist" and "you have no membership in it" are indistinguishable by design — Firestore denies the read outright rather than revealing non-existence to a non-member — so this specific behavior isn't comparable across the two persistence models. This is not a defect; it's documented directly in the shared suite's source.

## 10. Architectural Note: `activatePlan` Is Firebase-Only

`src/services/tracktozero/activePlanService.js`'s `activatePlanTransaction` (Phase 2, untouched) is written for the **synchronous** `InMemoryTrackToZeroRepository` — it calls `repository.getWorkspace(...)` etc. with no `await` and immediately dereferences the return value. Firestore is inherently async, so this function cannot be reused against a Promise-returning repository: calling it would silently produce *wrong* results (a `Promise` object where a plain workspace is expected, `workspace.activePlanId` would be `undefined`, no error thrown) rather than a clean failure.

Rewriting `activatePlanTransaction` and `InMemoryTrackToZeroRepository` to be async would require re-verifying the entire, already-passing Phase 2 suite (`src/domain/tracktozero/trackToZeroDomain.test.js` calls these methods synchronously, e.g. `expect(repo.getWorkspace("w1").activePlanId).toBe("p2")` with no `await`) — out of scope for this phase and against its own "Phase 1 + Phase 2 suite pass" precondition.

**Resolution:** `activePlanService.js` and `InMemoryTrackToZeroRepository` are completely untouched. `FirebaseTrackToZeroRepository.activatePlan(...)` implements the identical business rule (workspace pointer wins; previous plan demoted; new plan activated with its version; all atomic) as a new, Firebase-only async method using a real Firestore transaction. Parity between the two paths is proven behaviorally (section 9), not by code reuse. Classified as a **necessary, additive architectural difference**, not a Repository Defect, Rules Defect, or Product/Architecture Conflict — no domain model, role model, or security contract changed.

## 11. Serialization Boundary

- **Timestamps**: ISO-8601 string (domain) ⇄ Firestore `Timestamp` (storage), via an explicit per-entity field allowlist in `firestoreTimestamps.js` (`TIMESTAMP_FIELDS`), not a deep walk. Verified by dedicated tests (`firestoreTimestamps.test.js`): round-trips exactly, `null`/`undefined`/`""` all normalize to `null` on write and pass through unchanged on read (no coercion to epoch), arbitrary nested objects (`assumptions`, `expectedDebtBalances`) are never touched.
- **IDs**: survive the round trip unchanged — domain entities carry their own `id` field independent of the Firestore document path segment; both are always set to the same value by construction (`v2Paths.*` builders use the same id used in the document body).
- **Return-value shape parity with the in-memory repo** (re-verified against actual in-memory code, not assumed): `save*`/`create*` methods return the object straight from the domain factory (frozen, matching in-memory); `get*`/`list*`/`put*` methods return plain deserialized objects (unfrozen, matching in-memory's `clone()` behavior).
- **Money/numeric values**: untouched by the timestamp conversion layer; Firestore stores/returns JS numbers natively, no precision loss observed across any round-trip test.
- **Arrays/maps** (`PlanVersion.startingDebtSnapshot`, `assumptions`, `ExpectedCheckpoint.expectedDebtBalances`): pass through the allowlist-based conversion untouched, verified directly by `firestoreTimestamps.test.js`.

## 12. Repository ↔ Rules Mismatches

One mismatch surfaced during testing (not a repository or rules defect — a genuine gap in the *test's own fixture design*, corrected before it could mask anything):

- **Self-membership-edit collision**: an early version of the shared contract-suite's "membership" test tried to have the "owner" actor re-create their own already-seeded membership document. `firestore.v2.rules` correctly denies this (`uid != request.auth.uid` guards both membership-update branches — no self-role-editing, even for owners, matching the existing "viewer and contributor cannot self-promote" behavior already proven in `firestore.v2.rules.test.js`). **Classification: none of the three categories** — this was a test-fixture bug (asserting a scenario the security model correctly forbids), fixed by changing the test to create a membership for a *different* uid than the acting owner. No repository or rules code changed as a result.

No Repository Defect, Rules Defect, or Product/Architecture Conflict was found. The one architectural divergence (`activatePlan`, section 10) is additive and documented, not a disagreement between the two layers.

## 13. Isolation Confirmation

- `firebase.json` still references only `firestore.rules` for the `firestore.rules` key; `firestore.v2.rules` is referenced only by `scripts/run-firestore-v2-tests.mjs`'s temp config override, exactly as before this phase. Confirmed by direct inspection — unchanged.
- No code path in `FirebaseTrackToZeroRepository` or its tests writes to any legacy (`households/...`, `budgets/...`, etc.) namespace, or to production Firestore (structurally impossible via `@firebase/rules-unit-testing`, section 7).
- `npm run test:firestore` (legacy v1 rules suite) still passes 12/12, unmodified.

## 14. Completion-Gate Checklist

| Criterion | Evidence |
| --- | --- |
| Firebase repository exists | Section 2 — `src/services/repositories/firebaseTrackToZeroRepository.js` |
| Shared repository-contract suite passes against both implementations | Section 9 — 10/10 against both |
| Every required entity round-trips | Section 4 |
| Authorized operations succeed | Section 4 |
| Unauthorized reads and writes are denied where appropriate | Section 4, section 5 (failed activation) |
| Rule assertions use non-privileged client auth contexts (not Admin SDK) | Section 8 |
| Emulator tests cannot fall back to production (fail-closed guard proven) | Section 7 — explicit guard verified to actually trigger, plus structural guarantee |
| Plan switching is atomic | Section 5 — real `runTransaction`, all reads before all writes |
| Failed plan switching leaves no partial state | Section 5 — explicit re-fetch-and-compare proof |
| Event/snapshot immutability holds at repository AND rules layers | Section 6 |
| PlanVersion immutability holds | Section 6 |
| Firebase types do not leak into domain objects | Section 2, section 11 |
| No unexplained repository↔rules mismatch remains | Section 12 — one mismatch found, explained, and resolved (test-fixture issue, not a repo/rules defect) |
| Production rules/data remain untouched | Section 13 |
| Phase 1 remains green | Section 16 |

All 14 criteria hold. Completion gate: **YES — FIREBASE PERSISTENCE PROVEN UNDER V2 RULES.**

## 15. Validation Results

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 11 files / 92 tests (74 Phase 2 + 6 timestamp-helper + 2 Firebase-repo smoke + 10 in-memory contract-suite) |
| `npm run lint` | Passed, 0 errors, 3 pre-existing warnings (unchanged from Phase 2) |
| `npm run build` | Passed; same pre-existing large-chunk advisory as Phase 2 |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests (unchanged) |
| `npm run test:firestore:v2` | Passed, 28/28 (9 original rules tests, unchanged + 9 new repository round-trip/rules/transaction tests + 10 shared contract-suite tests against the real Firebase repo) |
| `npm run perf:check` | Passed, all bundle budgets |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Firestore suites (`test:firestore`, `test:firestore:v2`) still run sequentially — confirmed no port conflict running both v2 test files together in one emulator session.

## 16. Phase 1 / Phase 2 Regression Check

Confirmed:
- Golden-master payoff tests remain green (unrelated to this phase, untouched).
- All 74 original Phase 2 tests pass unmodified.
- `InMemoryTrackToZeroRepository`'s existing methods are behaviorally unchanged — only new methods (`getPaymentEvent`, `createExpectedCheckpoint`/`getExpectedCheckpoint`/`updateExpectedCheckpoint`) were added.
- `activePlanService.js` is byte-for-byte unchanged.
- The only modification to `src/domain/tracktozero/models.js` and the pre-existing part of `tracktozeroRepositories.js` is adding explicit `.js` extensions to relative import specifiers — required because `node --test` (raw Node ESM, used by the emulator test runner) does not resolve extensionless imports the way Vite/Vitest's bundler-based resolver does. Zero behavioral change; verified by re-running the full Phase 2 vitest suite immediately after, still 74/74 (then 92/92 with additions).

## 17. What Remains (Phase 2c+)

- Full local-persistence repository (offline-first, beyond the in-memory proof-of-concept) — still deferred, unchanged from the Phase 2 report.
- Richer correction workflows for PaymentEvent/BalanceSnapshot (append/void semantics beyond the immutability guarantee already enforced).
- Migration preview UI/tooling — `buildMigrationPreview()` (Phase 2) still produces candidates only; no commit-to-repository step exists yet for either repository.
- `listPaymentEvents` (multi-event listing) was explicitly scoped out this phase — only single-event `getPaymentEvent` was added, since no Task 2/3 requirement needed more than that.
- Engine warning contract (designed in Phase 2, section 17 of that report) — still not implemented.
- Async-ifying `activePlanService.js`/`InMemoryTrackToZeroRepository` to unify the plan-activation code path across both repositories is a real option for a future phase, but was explicitly out of scope here given the risk to the already-passing Phase 2 suite (section 10).
- Phase 3 UI work (Home/Debts/Plan screens consuming the active-plan context) — not started, as scoped.
