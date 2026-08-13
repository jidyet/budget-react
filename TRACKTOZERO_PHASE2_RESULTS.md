# TrackToZero Phase 2 Results

## 1. Status

Branch: `phase2/domain-model`

Phase 2 built the TrackToZero 2.0 domain foundation beside the legacy 1.0 app. No production migration, UI redesign, data deletion, deployment, or production Firestore rules change occurred.

Completion gate:

## PARTIAL — CORE COMPLETE, 2b REMAINS

The load-bearing core is implemented and validated: domain model, validation, active-plan semantics, read-only legacy adapters, migration preview, domain-to-calc adapter, expected checkpoints, repository contracts, and isolated v2 rules/emulator tests.

Phase 2b remains for full Firebase-backed repository implementation, local persistence adapter beyond portability proof, richer correction workflows, and migration preview UI/tooling.

## 2. Final 2.0 Domain Model

Implemented under `src/domain/tracktozero/`.

```text
Workspace
|-- Members
|-- Debts
|   |-- PaymentEvents
|   `-- BalanceSnapshots
`-- PayoffPlans
    `-- PlanVersions
        `-- ExpectedSchedule checkpoints
```

Implemented entities:

- Workspace
- WorkspaceMembership
- Debt
- PayoffPlan
- PlanVersion
- ExpectedCheckpoint
- PaymentEvent
- BalanceSnapshot

## 3. Workspace / Household Architecture

Workspace is first-class and may be `personal` or `household`. Both use the same debt, plan, event, and snapshot architecture. Household is not modeled as a bolt-on.

`Workspace.activePlanId` is the authoritative active-plan pointer.

## 4. Household Role Matrix

Implemented roles:

| Role | View | Debts | Events/snapshots | Plans | Members |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Full | Full | Full | Full |
| Admin | Yes | Manage | Create/manage | Manage | Manage non-owner; cannot create/demote Owner |
| Contributor | Yes | No destructive/terms writes | Create PaymentEvents and BalanceSnapshots | No |
| Viewer | Yes | No | No | No | No |

## 5. Debt Contract

Debt fields include:

- `id`, `workspaceId`, `name`, `debtType`, `status`
- `currentBalance`, `startingBalance`
- `aprStatus`, `apr`
- `minimumRequiredPayment`
- `dueDay`
- `ownerId`, `ownerLabel`
- `includedInCorePayoffPlan`
- audit fields

APR statuses:

- `known`
- `unknown`
- `no_interest`
- `promotional`

Unknown APR is represented as `aprStatus: "unknown"` and `apr: null`, not zero.

Mortgage rule: `debtType: "mortgage"` defaults to `includedInCorePayoffPlan: false`.

## 6. PayoffPlan + PlanVersion Contract

PayoffPlan statuses:

- `draft`
- `active`
- `completed`
- `archived`

Multiple drafts are allowed. One authoritative active plan is resolved by:

```text
Workspace.activePlanId -> PayoffPlan.activeVersionId -> PlanVersion
```

PlanVersion is immutable. Reforecast creates a new version.

## 7. ExpectedSchedule Strategy

Implemented compact checkpoint generation in `src/services/adapters/tracktozeroCalcAdapter.js`.

Stored checkpoint fields:

- period
- expected total balance
- optional debt-balance map
- expected target debt id
- expected payment
- projected zero date

Detailed month rows are recomputed from frozen PlanVersion assumptions through the Phase 1 engine.

## 8. PaymentEvent Contract

PaymentEvent includes workspace/debt/plan references, amount, `paidAt`, source, actor, notes, and correction/void metadata placeholders.

Core facts are append-only. Ordinary update of amount/debt/workspace/actor/date is denied by repository contract and v2 rules.

## 9. BalanceSnapshot Contract

BalanceSnapshot is the primary observed truth for v1 progress and includes balance, `observedAt`, actor, source, and optional related payment event.

Core facts are append-only. Corrections are future append/void semantics, not in-place overwrite.

## 10. Persistence Architecture

Implemented:

- `src/services/repositories/tracktozeroRepositories.js`
- `InMemoryTrackToZeroRepository`
- path contract helper `v2Paths`

Firestore namespace:

```text
workspaces/{workspaceId}
workspaces/{workspaceId}/members/{uid}
workspaces/{workspaceId}/debts/{debtId}
workspaces/{workspaceId}/plans/{planId}
workspaces/{workspaceId}/plans/{planId}/versions/{versionId}
workspaces/{workspaceId}/plans/{planId}/versions/{versionId}/expected_schedule/{checkpointId}
workspaces/{workspaceId}/debts/{debtId}/payment_events/{eventId}
workspaces/{workspaceId}/debts/{debtId}/balance_snapshots/{snapshotId}
```

Firebase-backed repository remains Phase 2b.

## 11. Security Rules

New isolated rules file:

- `firestore.v2.rules`

New emulator runner:

- `npm run test:firestore:v2`

Production deployment config still points to `firestore.rules`. The v2 rules are not referenced by `firebase.json`.

Explicit confirmation: production rules were not deployed, and live household access is unchanged.

V2 emulator tests cover unauthenticated denial, non-member denial, viewer read-only, contributor event/snapshot writes, admin financial management with owner protections, owner control, plan-version immutability, expected-schedule immutability, membership bootstrap, self-promotion denial, role-smuggling denial, and payment/snapshot core-field immutability.

## 12. Domain → Calculation Adapter

Implemented in:

- `src/services/adapters/tracktozeroCalcAdapter.js`

The adapter maps `Debt + PlanVersion` to Phase 1 payoff engine inputs. It does not duplicate payoff math.

Tests confirm equivalent domain/legacy portfolios produce equivalent Phase 1 engine results.

## 13. Legacy Read Adapters

Implemented in:

- `src/services/adapters/legacyTrackToZeroAdapter.js`

Read-only conversions:

- Legacy account -> candidate Debt
- Legacy household -> candidate Workspace + memberships
- Legacy saved plan -> candidate draft PayoffPlan

No writes are performed.

## 14. Debt Classification

Implemented:

- Clear Debt
- Not Debt
- Needs Confirmation

Strict migration logic avoids inheriting the legacy model's default “blank means paydown” behavior.

## 15. Migration Preview

`buildMigrationPreview()` produces:

- candidate workspace
- memberships
- candidate debts
- excluded legacy expenses
- ambiguous records
- draft plan candidates
- warnings
- `writesPerformed: 0`

Passing tests prove no write sink is accepted.

## 16. Active-Plan Context

Implemented:

- `resolveActivePlanContext()`
- `activatePlanTransaction()`
- `createReforecastVersion()`

Workspace pointer wins over plan status. Switching active plans demotes the previous plan and sets the pointer/status/version together in the repository operation.

Phase 3 surfaces to adopt this: Home, Plan, Debts, Progress/status, Coach/trends only after explicit active-plan context exists.

## 17. Engine Warning Contract

Designed, not implemented in engine:

```js
warnings: [
  { code, debtId, severity, message }
]
```

Suggested codes:

- `negative_amortization`
- `infeasible_goal_date`
- `unknown_apr`
- `missing_minimum_payment`
- `projection_capped`

These should be produced by future engine/status layers without changing Phase 1 golden masters in Phase 2.

## 18. Local-Mode Strategy

Domain objects and adapters are Firebase-free. The in-memory repository proves portability. Full local persistence repository remains Phase 2b.

## 19. Concurrency / Auditability

Minimal v1 rules:

- PaymentEvents and BalanceSnapshots are append-only observations.
- Actor and timestamps are required.
- Latest snapshot is deterministic by `observedAt`, then id.
- Plan activation uses a transactional repository operation.
- Destructive financial mutations require elevated roles.

Audit fields are present on mutable/created entities.

## 20. Test Results

Validation:

| Check | Result |
| --- | --- |
| `npm test -- --run` | Passed, 8 files / 74 tests |
| `npm run lint` | Passed with 3 existing warnings |
| `npm run build` | Passed; Vite large-chunk warning remains |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed, 9/9 v2 rules tests |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |

Note: Firestore suites must be run sequentially because emulator support ports conflict when run in parallel.

## 21. Phase 1 Regression Check

Confirmed:

- Golden-master payoff tests remain green.
- Scenario isolation tests remain green.
- Plan save still does not write `planned_v`.
- Derived legacy `Plan $X` tests remain green.
- No APR stored-value migration occurred.

## 22. Phase 3 Backlog

- Home/Debts/Plan UI consuming the new active-plan context.
- One-time payment UI.
- Engine warning output implementation.
- User-facing migration preview confirmation.
- Balance/payment entry screens.

## 23. Migration Risks

- Legacy saved plans are draft candidates only.
- Legacy household members map conservatively to contributor unless confirmed.
- Ambiguous account classification requires user confirmation.
- Full Firebase/local repositories must be completed before any migration.
- Production v2 rules must not deploy until migration/rollback plan is approved.

