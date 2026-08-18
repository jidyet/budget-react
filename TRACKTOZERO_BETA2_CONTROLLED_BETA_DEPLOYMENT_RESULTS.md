# TrackToZero V2 — BETA-2: Controlled Beta Environment Deployment

## 1. Executive summary

The controlled beta environment approved in BETA-1 is now live: **https://tracktozero-beta.web.app**, running on a brand-new, fully isolated Firebase project (`tracktozero-beta`) with its own Auth, Firestore, and Hosting — separate from production (`budgetapp-c9306`) in every respect. Deployed from a dedicated `beta/v2-controlled` branch, now pushed to `origin`.

Two real defects were found and fixed along the way — both found by actually deploying and testing against the real project, not by inspection:

1. A second, independently-hardcoded production-project-id gate in `TrackToZeroV2App.jsx` that BETA-2's first code change had missed.
2. A genuine, pre-existing infrastructure gap: this repo never had a `firestore.indexes.json` file, so four composite indexes that production apparently already has (created ad-hoc at some point, never version-controlled) didn't exist on the fresh project, breaking every list-with-ordering query (balance snapshots, payment events, plan versions, expected checkpoints).

Both are fixed, and the fixes are now version-controlled so they benefit any future fresh project too, not just this one.

Production (`budgetapp-c9306`) was not touched in any way — no writes, no rules deploy, no Hosting deploy, no config change.

## 2. What was executed (BETA-1's Gates 1-9)

- **Gate 0 (authorization)**: all six BETA-1 human decisions approved by the product owner.
- **Gate 1 (push/protect RC)**: implemented the deferred configurable-production-project-id code change (2 new regression tests, full suite green), committed, created `beta/v2-controlled` from that commit, pushed to `origin`. `phase4/migration-rehearsal` itself remains local/unpushed, as planned.
- **Gate 2 (project/site identity)**: new Firebase project `tracktozero-beta` created via the Console (Spark/free plan, Google Analytics optional and harmless either way), Firestore (Standard edition) and Authentication (Email/Password only) enabled, default Hosting site auto-provisioned. `.firebaserc` gained a `"beta": "tracktozero-beta"` alias alongside the untouched `"default"`.
- **Gate 3 (environment variables)**: real `.env.beta` populated with the new project's web config (gitignored — `.env.beta` was added to `.gitignore`, since it wasn't previously covered). A `build:beta` npm script (`vite build --mode beta`) added.
- **Gate 4 (rules validation)**: `firestore.rules` — the exact file already proven 69/69-passing and rules-parity-clean in BETA-0 — used unmodified.
- **Gate 5 (build)**: `npm run build:beta`, verified locally (via `vite preview`) before any live deploy.
- **Gate 6 (rules deploy)**: `firebase deploy --only firestore:rules --project beta` — succeeded, targeting `tracktozero-beta` explicitly.
- **Gate 7 (hosting deploy)**: `firebase deploy --only hosting --project beta` — succeeded.
- **Gate 8 (smoke)**: full real-browser journey against the live URL — fresh signup, empty Home, manual debt creation, Home/Settings correctly reflecting it, hard-refresh persistence. All confirmed, zero console errors, zero unexpected network requests.
- **Gate 9 (security smoke)**: household creation, invite issuance, a real wrong-email acceptance attempt (a genuinely different Auth account, not a mocked scenario) correctly denied with the exact application-layer message, and a correct-email acceptance succeeding — all against the real deployed project.
- **Gate 10 (first tester authorization)**: **not done**, exactly as planned — no real tester was invited, no real invitation was sent to anyone outside this testing session.

## 3. Defect 1 — second hardcoded production-project-id gate

**Observed**: after deploying rules and Hosting to the new project, the live site showed "TrackToZero beta is temporarily unavailable / Production Firebase is not configured for this release" instead of the sign-in screen — even though the environment variables were correctly set and `assertTrackToZeroV2ProductionConfig` (the gate fixed in BETA-2's first commit) should have accepted the beta project.

**Root cause**: `TrackToZeroV2App.jsx` had a second, entirely independent readiness check — `const productionReady = getFirebaseStatus().configured && getFirebaseConfig().projectId === "budgetapp-c9306"` — that decides whether the `AuthScreen` renders at all, evaluated *before* any repository is created. This line still hardcoded the literal production project id and was never touched by the first BETA-2 commit, which only fixed `repositoryRuntime.js`'s repository-creation-time gate.

**Fix**: `productionReady` now reads the same resolved `runtime.allowedProductionProjectId` (falling back to the same `TRACKTOZERO_V2_PRODUCTION_PROJECT_ID` default) used everywhere else, so both gates agree. Verified via a fresh local build + `vite preview` before redeploying live.

## 4. Defect 2 — missing Firestore composite indexes

**Observed**: after fixing Defect 1, the live app rendered and fresh signup/onboarding/workspace-creation all worked — but adding a debt failed with a generic "TrackToZero could not complete that action" error, and reloading afterward triggered the same generic failure on the Home snapshot load.

**Root cause, found via temporary diagnostic logging** (added to both `runAction`'s and `refresh()`'s catch blocks, used to capture the real error through two live redeploys, then fully reverted before the final build — confirmed zero trace of it remains): `FirebaseError: The query requires an index`, specifically on the `balance_snapshots` collection, for the query in `listBalanceSnapshots` that orders by two fields (`observedAt`, `id`). A grep across the repository layer found **three more** identically-shaped queries with the same problem: `listPlanVersions` (`versionNumber`, `id`), `listPaymentEvents` (`paidAt`, `id`), `listExpectedCheckpoints` (`period`, `id`). Firestore requires an explicit composite index for any query ordering by more than one field — single-field indexes are automatic, but this repo never had a `firestore.indexes.json` file at all, so a brand-new project has none of the composite indexes that `budgetapp-c9306` evidently accumulated ad-hoc over its lifetime (most likely via someone clicking Firestore's own "create it here" error-message link at some point, never captured in version control).

**Fix**: created `firestore.indexes.json` with all four composite indexes, wired it into `firebase.json` (`"firestore": {"indexes": "firestore.indexes.json"}`), and deployed it (`firebase deploy --only firestore:indexes --project beta`). Composite index builds are not instant — polled until Firestore reported the index ready (confirmed by the exact same query succeeding), then re-verified the full flow end-to-end.

**This is a permanent fix, not a one-off for this project** — any future fresh Firestore project (a second beta environment, a disaster-recovery rebuild of production, a future dedicated test project) will now get these indexes automatically via `firebase deploy --only firestore:indexes`, rather than silently missing them the way `tracktozero-beta` did.

**Not done this phase**: exporting and version-controlling production's own existing (undocumented) indexes. Production wasn't touched at all in BETA-2, and this is worth a deliberate, separate look — noted in Section 8.

## 5. Live verification evidence

All against the real deployed `https://tracktozero-beta.web.app`, not the emulator:

- Fresh signup (`final-smoke-*@ux9.test`) → empty onboarding → Personal workspace → empty Home, zero console errors.
- Manual debt creation ($555.00 test card) → Home correctly shows "You have $555.00 in confirmed debt" → Settings' new `Build:` line correctly shows `1.0.0 • 18ada87` (the commit this specific deployed build was built from) → hard refresh preserves everything, does **not** regress to onboarding (the exact UX-9 defect class, re-confirmed absent here too).
- Household creation → invite creation → a genuinely separate Auth account with the wrong email attempting acceptance → denied with `"join household: This invite was sent to member-...@ux9.test. Sign in with that account to continue."` → a third Auth account with the correct email accepting successfully and landing on the shared workspace.
- Zero console errors and zero unexpected external network requests across every session in this phase.

## 6. Test results (local, before final deploy)

| Check | Result |
|---|---|
| Unit tests | 843/843 passed (56 files) |
| Lint (full repo) | 0 errors, 4 pre-existing documented warnings, no new ones |
| Build (`build:beta`) | success, verified diagnostic code fully absent from the final bundle |

Firestore rules/perf/audit were not re-run in this phase since no rules or dependency changes were made beyond what BETA-2's first commit already validated (12/12 legacy, 69/69 V2 ×2 with parity, all green at that point) — this phase's own correctness proof is the live deployment smoke test itself (Section 5), which is the correct-fidelity verification for "does the real deployed beta work," matching the precedent set in UX-9 for the analogous reload/session defect.

## 7. Current state

- **Live beta URL**: https://tracktozero-beta.web.app (Firebase Hosting default site; no custom domain configured — `beta.tracktozero.app` was the stretch option in BETA-1's URL strategy, not pursued this phase since it requires DNS/domain-verification steps outside a code change).
- **Firebase project**: `tracktozero-beta`, Spark (free) plan, Firestore (Standard edition, `nam5`), Auth (Email/Password only).
- **Git**: `beta/v2-controlled` pushed to `origin`, currently at the same commit as local `phase4/migration-rehearsal` HEAD. `phase4/migration-rehearsal` itself remains unpushed.
- **Production (`budgetapp-c9306`)**: untouched throughout this entire phase.
- **Tester access**: zero real testers invited. All accounts created this phase were synthetic `@ux9.test` addresses for verification only.

## 8. Deferred / not done this phase

- Custom `beta.tracktozero.app` domain (DNS/verification work, not a code change — can be layered on later without disrupting the current `.web.app` URL).
- App Check (per BETA-1's recommendation, deliberately not implemented for a small controlled beta).
- Remote error/crash monitoring (known gap, documented in BETA-1, not needed yet for a closely-supported first cohort).
- Exporting/version-controlling production's own existing Firestore indexes (worth doing so production's index set is finally captured in Git too, but that's a read-only export against production and deserves its own deliberate pass rather than being folded into a beta-environment phase).
- Environment-label badge (`VITE_TRACKTOZERO_V2_ENVIRONMENT_LABEL`) — still just a design in BETA-1's report, not implemented; the `Data mode: Clean V2 beta` / `Build: ...` lines already on the Settings screen serve the same "which environment am I in" need well enough for a first controlled cohort.

## 9. Next steps

Gate 10 (first real tester invitation) is the next real decision point, and it requires explicit owner authorization at the moment it happens — this report does not request or assume it. Beyond that: monitor the first real usage for any of BETA-1's documented stop-beta triggers, and consider the deferred items above as the cohort grows.
