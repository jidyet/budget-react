# TrackToZero V2 — Beta Environment Plan

Concise, operational. Fields not yet owner-approved are marked `PENDING OWNER APPROVAL` — no value below is invented or assumed approved. Full reasoning and evidence: `TRACKTOZERO_BETA1_ENVIRONMENT_DISCOVERY_RESULTS.md`.

| Field | Value |
|---|---|
| Git release branch | `PENDING OWNER APPROVAL` — recommended: new `beta/v2-controlled`, created from `4715497` |
| Release commit | `4715497` (BETA-0 reconciled RC), locally tagged `rc/ux9-controlled-beta-f06e803` (UX-9-certified code state) |
| Firebase project | `PENDING OWNER APPROVAL` — recommended: a new dedicated project (Option A), not `budgetapp-c9306` |
| Hosting site | `PENDING OWNER APPROVAL` — a new site under the new project, created once the project exists |
| Beta URL | `PENDING OWNER APPROVAL` — recommended: `beta.tracktozero.app` if domain verification is acceptable, otherwise the auto-provisioned `.web.app` URL for the new project |
| Auth model | Email/password only (no OAuth exists in the codebase). Invite-only signup via the existing Household/Personal invite flow. No email verification, no password reset currently wired into V2 UI — known gaps, not blockers for a small closely-supported cohort |
| Firestore database | New, empty, in the new beta project — no legacy or production data imported (explicit product-owner direction: fresh V2 data only) |
| Rules file | `firestore.rules` (the only file `firebase deploy` ever uses) — already contains full, tested V2 protection including `debtIdentityUnchanged()`; deploy target must always specify `--project <beta-alias>` explicitly, since `.firebaserc` currently has only one (`default`, production) alias |
| Storage use | None — V2 does not use Firebase Storage; all import parsing is client-side |
| Functions use | None — the 4 existing Cloud Functions are legacy World-1 only, never called by V2 |
| App Check state | Not implemented; recommended to stay off for controlled beta (would risk locking out testers with no fallback) |
| Environment variables | See `.env.beta.example` (this phase) for the full template; real values filled in only once the beta project exists, never committed |
| Tester access model | `PENDING OWNER APPROVAL` — recommended: invite-only, allowlisted via the existing invite-email-match flow; owner decides the first cohort |
| Observability plan | Existing top-level `AppErrorBoundary` catches render crashes app-wide today (console-only, no remote reporting). No remote error/crash monitoring exists yet — acceptable gap for a small, closely-supported first cohort; flagged for BETA-2/BETA-3, not added speculatively here |
| Rollback plan | Hosting: `firebase hosting:rollback --project <beta-alias>`. Rules: re-deploy an earlier Git-tracked version of `firestore.rules`. Data: **no code/config rollback undoes data already written by real beta users** — this is exactly why isolation (a dedicated, resettable beta project) is the recommended strategy, so a bad beta incident is recoverable by resetting the beta project alone, never a production data-recovery event |

## Known, deliberately deferred blocker for the next phase

Today, `assertTrackToZeroV2ProductionConfig` (`src/services/tracktozero/repositoryRuntime.js`) hard-requires the configured Firebase project id to equal the constant `TRACKTOZERO_V2_PRODUCTION_PROJECT_ID` (`"budgetapp-c9306"`) before `firebaseProduction` mode will run at all. This is a deliberate, working fail-closed safety check — not a bug — but it means a **new** dedicated beta project cannot be used yet without a small, carefully-tested code change (making that expected id configurable, with the current value preserved as the unchanged default). This change is intentionally not made in BETA-1; it belongs to whichever phase actually creates and wires up the approved beta project (see the discovery report's Section 24 and the future deployment checklist's Gate 3).

## What has NOT happened

Nothing has been pushed. Nothing has been deployed. No Firebase project has been created. No `.firebaserc` alias beyond the existing `default` exists. No Auth/Firestore/Hosting/rules configuration was touched in any real Firebase project. This plan describes what BETA-2 (or a later phase) will execute once the Human Decisions in the discovery report are resolved.
