# TrackToZero V2 — BETA-1: Controlled Beta Environment Discovery + Preparation

## 1. Executive verdict

# YES — BETA ENVIRONMENT PLAN READY — OWNER APPROVAL REQUIRED BEFORE PUSH/DEPLOY

BETA-0's open question is resolved with high confidence: the live `tracktozero.app`/`budgetapp-c9306.web.app` deployment is TrackToZero V2 (not legacy World-1), traced to a build from commit `4dfcef0` ("Reset TrackToZero for clean-slate V2 beta," 2026-08-13), deployed manually roughly 34 seconds after that commit — meaning the live site is real but is missing everything from UX-1 through UX-9, including both defects UX-9 found and fixed. A real, previously-undiscovered architectural constraint was also found: the production fail-closed guard hardcodes the expected Firebase project id, which would block using a newly-created dedicated beta project without a small, deliberately-deferred code change (Section 24). No external writes were performed. One small, safe, local-only runtime change was made (build-commit-hash version plumbing) — see Section 36.

## 2. Repository / RC state

Verified, not assumed:

| Fact | Expected | Actual |
|---|---|---|
| Branch | `phase4/migration-rehearsal` | `phase4/migration-rehearsal` ✅ |
| HEAD (at phase start) | `4715497` | `4715497` ✅ |
| Working tree | clean | clean ✅ |
| Commits ahead of origin | ~11 | 11 ✅ |
| RC tag | `rc/ux9-controlled-beta-f06e803` | present, → `f06e803` ✅ |
| Backup tags | intact | `backup/pre-ux8-progress-service`, `backup/pre-clean-slate-v2-20260813`, both present ✅ |
| Unexpected remote changes | none | none — `git fetch --prune` run read-only, `origin/phase4/migration-rehearsal` unchanged at `25ff83e` |

## 3. Firebase CLI state

- `firebase --version` → `15.11.0`.
- `firebase login:list` → logged in as `chopythique@gmail.com` (the only authenticated account).
- `firebase use` → `budgetapp-c9306` (current active project; matches `.firebaserc`'s sole `default` alias).
- `firebase projects:list` → **8 total projects** on this account: `budgetapp-c9306` (current — this app), plus 7 unrelated apps on the same personal account (`careconnect-3b9c3`, `cookalong-1d7e3`, `pikka-e7bca`, `skillsmateapp`, `tradebot-6d455`, `tradeos-d4d1d`, `yusfulglobal-a12ad`). **No dedicated TrackToZero staging/beta project currently exists.**

## 4. Firebase project inventory

`.firebaserc`:
```json
{ "projects": { "default": "budgetapp-c9306" } }
```
One alias, one project. Classification: **PRODUCTION**. No BETA/STAGING alias exists. No LOCAL/EMULATOR alias exists in `.firebaserc` (emulator/local-beta targeting is handled entirely client-side via env vars and a separately-generated `.firebase-config-v2/firebase.v2-local-beta.json`, never through a `.firebaserc` alias). No ambiguity — everything not local/emulator currently resolves to this one production project.

## 5. Hosting inventory

- `firebase hosting:sites:list` (project `budgetapp-c9306`) → **one site**: `budgetapp-c9306`, default URL `https://budgetapp-c9306.web.app`.
- `firebase hosting:channel:list --site budgetapp-c9306` → **one channel**: `live`, last release **2026-08-13 15:36:33** (local time), never expires. No preview channels exist.
- Custom domain: `tracktozero.app` **does** map to this exact Hosting site — confirmed by DNS (resolves to `199.36.158.100`, a Firebase/Fastly anycast address) and, conclusively, by HTTP response headers: `tracktozero.app` and `budgetapp-c9306.web.app` return **byte-identical `Etag` and `Last-Modified: Thu, 13 Aug 2026 20:36:33 GMT`** (20:36:33 UTC = 15:36:33 local — exact match to the Hosting CLI's release timestamp). No other hosting provider is involved — no `vercel.json`/`netlify.toml` exists anywhere in this repo's history.

## 6. Current live deployment findings

The live page (`curl`'d directly, read-only) is unambiguously TrackToZero-branded: `<title>TrackToZero</title>`, `tracktozero-icon.png`, `app.webmanifest`, description "Track your debt, build your payoff plan, and get to zero." — **not** the legacy World-1 budget app's branding.

## 7. Source-commit traceability

Firebase Hosting serves a built artifact, not a Git ref directly — so this is stated as strong circumstantial evidence, not a Firebase-provided fact:

- The live `index.html`'s `<head>` is a **byte-for-byte match** to `git show 4dfcef0:index.html` (every meta tag, the exact `theme-color: #00c9a7`, title, description, body fallback text) — this exact `theme-color` value was changed by a later commit (`c8561f1`, "UX-1: restore TrackToZero brand and design system," 2026-08-14, present only on the `phase4/migration-rehearsal` line, not `main`), so the live build predates that change.
- The Hosting release timestamp (2026-08-13 15:36:33 local) is **34 seconds after** `4dfcef0`'s own commit timestamp (2026-08-13 15:35:59 local) — consistent with a manual `git commit && firebase deploy` sequence.
- `main`'s tip (`883c1ba`, 2026-08-12 19:48:54) predates `4dfcef0` (2026-08-13 15:35:59) and has no TrackToZero V2 code at all (confirmed in BETA-0) — so `main` cannot be the source of this deploy; the branding and theme-color evidence together rule it out independently of the timestamp argument.

**Conclusion, stated honestly**: the live deployment is a build from commit `4dfcef0` or a build so close to it as to be indistinguishable from the available evidence (no later commit on the `phase4` line before `c8561f1` changed anything `index.html`-visible). It is **not** possible to prove the exact commit with 100% certainty without the literal build artifact's source map or a byte-identical rebuild, which was not attempted (out of scope for a read-only investigation). This is offered as strongly-evidenced, not invented.

**Practical implication**: the live site is a real, working TrackToZero V2 build, but a **very early** one — it predates `UX-0` (2026-08-14, "fix V2 financial truth and state consistency") and everything after it, including all of UX-1 through UX-9. It does not contain either of the two defects UX-9 found and fixed, simply because it doesn't contain any of that later work at all — it has its own, different, earlier set of characteristics that were never audited by UX-9's process.

## 8. Deploy automation findings

`.github/workflows/ci.yml` is the **only** workflow file that has ever existed in this repository's history (confirmed via `git log --all --diff-filter=A -- ".github/workflows/*"`). It runs on push to `main`/`master` and on PRs, and performs lint/unit-test/Firestore-rules-test/build/audit/perf-check only — **no deploy step of any kind**. No GitHub→Firebase Hosting auto-deploy integration exists. No other CI/CD or deploy script (Cloud Build, Vercel, Netlify) was found anywhere in the repo. **Deployment has been, and remains, entirely manual** (a developer running `firebase deploy` locally) — consistent with the single, isolated `live` release found in Section 5 and the 34-second commit-to-deploy gap in Section 7.

## 9. Git remote topology

- One remote: `origin` → `https://github.com/jidyet/budget-react.git`. `origin/HEAD` → `origin/main`.
- Remote branches: `origin/main`, `origin/phase4/migration-rehearsal`, `origin/claude/p0-1-server-entitlements`, `origin/fix/lint-top-files-20260401`. No dedicated beta/release/staging branch exists remotely.
- Local branches include several historical phase branches (`phase1/engine-extraction` through `phase3c/browser-qa`), safety-snapshot branches, and two `claude/` branches from earlier, unrelated security-fix work — none relevant to this phase.
- **Local `main` is 2 commits ahead of `origin/main`** (`883c1ba`, `e5712cf` — a docs commit and a dependency security fix), never pushed. Unrelated to the current stack; noted for completeness, not a concern (both are already the effective fork-base of `phase4/migration-rehearsal`, so this doesn't affect the main-vs-RC analysis below).

## 10. Main vs RC

```
git merge-base main HEAD        → 883c1ba (= local main's own tip)
git rev-list --left-right --count main...HEAD  → 0  61
git diff --stat main...HEAD     → 266 files changed, 45349 insertions(+), 1087 deletions(-)
```

`main` has **zero commits unique to it relative to HEAD** — `phase4/migration-rehearsal` is a strict linear continuation of `main`, never diverged. This means a merge into `main` today would be a clean fast-forward (no conflict risk) — but it is also an enormous single change (266 files). `main`'s own content is pure legacy World-1 (confirmed in BETA-0: no `trackToZeroV2Enabled` flag, no `TrackToZeroV2App` reference exists on `main` at all). Merging now would be conceptually safe from a Git-mechanics standpoint but represents a major, irreversible-in-spirit product decision (making V2 the mainline) that should follow, not precede, the environment/beta decisions this phase is gathering. **Not done; not recommended yet** — see Section 34.

## 11. Environment options

**Option A — Dedicated Firebase beta project.** Separate Auth/Firestore/Hosting/rules/Storage/Functions/App Check from `budgetapp-c9306`. Strongest isolation: a bug, a bad rules deploy, or an accidental production-pointed action during beta literally cannot touch real user data, because there is no real user data in the beta project. Setup cost: one new Firebase project (free tier is sufficient — see Section 24), a new Hosting site, new Auth users, and — critically — a small required code change (Section 24) to stop hardcoding the expected production project id.

**Option B — Separate Hosting site/channel + same Firebase backend.** Only isolates the served build, not the data. Beta testers would authenticate against and write to the **same** Auth/Firestore instance as production. For a financial application, this means a beta bug in rules, ownership logic, or plan math could corrupt real production financial records, or a beta tester could theoretically end up sharing Auth/Firestore infrastructure with real users depending on how workspace isolation holds up under beta-specific load. Setup cost is lower (no new project), but the isolation this buys is cosmetic, not structural.

**Option C — Existing production project with beta-scoped namespace/workspaces.** Same backend as Option B with an added convention (e.g. a `beta:` workspace-id prefix) rather than a separate Hosting site. Every risk of Option B applies, plus the namespace convention is enforced only by discipline, not by Firestore rules or infrastructure — nothing in the current rules model (`firestore.v2.rules`) knows or cares about a "beta" workspace differently from a real one. Weakest isolation of the three.

## 12. Recommended beta environment

**Option A — dedicated Firebase beta project.**

| Criterion | A (dedicated) | B (shared backend, separate site) | C (shared, namespaced) |
|---|---|---|---|
| Data isolation | Structural (separate DB) | None | None (convention only) |
| Security | Cannot cross into prod even if rules are wrong | A rules bug is a prod incident | Same as B |
| Rollback | Delete/reset the whole project, zero prod risk | Data rollback = a real prod data-recovery event | Same as B |
| Cost | Free tier covers a small beta easily | Slightly cheaper (no second project) | Cheapest |
| Setup complexity | Highest (new project, new Auth users, new Hosting, one code change) | Lowest | Low |
| Production parity | High (same rules file, same code) | Highest (literally the same backend) | Highest |
| Auth isolation | Full | None — beta and prod users share one Auth pool | None |
| Firestore isolation | Full | None | Convention-only |
| Rules safety | A beta-project rules deploy cannot affect prod rules | Any rules deploy hits both prod and beta simultaneously (same project) | Same as B |
| Tester management | Clean — beta users only exist in the beta project | Beta users appear in prod Auth console alongside real users | Same as B |
| Accidental-prod-mutation risk | Near zero (different project id, different credentials) | High — a single misdirected write is a real production incident | High |

For a financial application handling real debt/balance data, isolation dominates every other factor here — the setup-complexity cost of Option A is paid once; the risk Options B/C carry is paid every single day the beta runs. **Recommendation: Option A.**

## 13. Data policy

Per explicit product-owner direction: controlled beta starts with **fresh V2 data only**. No legacy Household/bills recovery, no production backup import, no Kristina/Jide debt-recovery reopening. This is directly and structurally guaranteed already: `createTrackToZeroV2Seed()` (synthetic seed data) is only ever invoked in `inMemory` mode (confirmed in BETA-0), and Option A's dedicated project starts genuinely empty with no import/migration path wired to it. No action needed to enforce this beyond not building one.

## 14. Auth requirements

- **Provider**: email/password only. Zero references to `GoogleAuthProvider`, `signInWithPopup`, `signInWithRedirect`, or any other OAuth provider anywhere in the codebase, V2 or legacy.
- **Email verification**: not implemented in V2 (no `sendEmailVerification`/`emailVerified` check anywhere in the V2 auth flow). Acceptable for an invite-gated controlled beta; a gap to close before any open/public signup phase.
- **Password reset**: implemented in `src/firebase.js` (`requestPasswordReset`) but **not wired into TrackToZero V2's UI at all** — `AuthScreen`/`JoinInviteScreen` have no "forgot password" link or handler. **A real gap**: a beta tester who forgets their password has no in-app recovery path today. Flagged for the backlog (Section 38/39), not a hard blocker for a small, closely-supported first cohort, but should be fixed before a larger beta wave.
- **Invitation flow**: an invitee signs up inline (email/password, right there in `JoinInviteScreen`) — no pre-existing account required. Email-match enforcement is doubled: application layer (`acceptMemberInvite` throws on mismatch) and Firestore rules layer (`inviteMatchesSignedInEmail()`), independently proven live during UX-9's wrong-email attack simulation.
- **Authorized domains / redirect URLs**: no code-level dependency found (no `actionCodeSettings`/`continueUrl` usage anywhere, consistent with no OAuth/redirect flows existing). This is governed entirely by each Firebase project's own Auth console "Authorized domains" list — a dedicated beta project will need its own list configured (localhost + the chosen beta URL) independently of any code change.

## 15. Firestore requirements

Full V2 collection/path inventory, from `firestore.v2.rules` and the repository layer (exact patterns, not guessed):

```
workspaces/{workspaceId}
workspaces/{workspaceId}/members/{uid}
member_index/{workspaceId}_{uid}                          — top-level mirror (collectionGroup queries can't be rules-secured under a wildcard parent)
workspaces/{workspaceId}/member_invites/{inviteId}         — inviteId == hash of the raw token
workspaces/{workspaceId}/people/{personId}                 — financial-profile / DATA-HH1
workspaces/{workspaceId}/debts/{debtId}
workspaces/{workspaceId}/debts/{debtId}/payment_events/{eventId}       — append-only
workspaces/{workspaceId}/debts/{debtId}/balance_snapshots/{snapshotId} — append-only
workspaces/{workspaceId}/plans/{planId}
workspaces/{workspaceId}/plans/{planId}/versions/{versionId}                              — immutable
workspaces/{workspaceId}/plans/{planId}/versions/{versionId}/expected_schedule/{checkpointId} — immutable
workspaces/{workspaceId}/scenarios/{scenarioId}
workspaces/{workspaceId}/import_batches/{batchId}
workspaces/{workspaceId}/migration_runs/{runId}
```

A catch-all `match /{document=**} { allow read, write: if false; }` at the end of `firestore.v2.rules` confirms this is the complete set — nothing else is reachable. This is a disjoint document tree from the legacy app's `users`/`households` collections; a dedicated beta project needs only these V2 paths, never the legacy ones.

## 16. Rules deployment model

`firebase.json`'s `"firestore": { "rules": "firestore.rules" }` is the **only** rules file any `firebase deploy` (with no other config) would ever push — this is fixed, not chosen per-environment. `firestore.rules` already contains full, tested V2 protection, including the `debtIdentityUnchanged()` guard added in UX-8.2 — proven by BETA-0's own test run (69/69 against `firestore.rules` itself, not just the `firestore.v2.rules` reference copy). **Not blocked.**

**Important operational finding**: since `.firebaserc` has exactly one alias (`default → budgetapp-c9306`), running `firebase deploy` (in any form) **today, with no `--project` flag, always targets production** — there is currently zero structural protection against accidentally deploying beta-intended changes to `budgetapp-c9306`, because there is nothing else to target yet. Once a beta project exists, `.firebaserc` must gain an explicit new alias (e.g. `beta`), and every future deploy command in the checklist (Section 33) must state its `--project`/alias explicitly — this is called out as a hard requirement, not a suggestion.

## 17. Storage requirements

**None.** Confirmed via grep: zero references to `getStorage`, `firebase/storage`, or `uploadBytes` anywhere in `src/components/tracktozero`, `src/services/tracktozero`, or `src/domain/tracktozero`. PDF/XLSX/CSV import parsing is entirely client-side (in-browser); files are read, parsed into candidates, and discarded — never uploaded to or persisted in Firebase Storage. No bucket is needed for controlled beta.

## 18. Functions / server components

Four Cloud Functions exist in `functions/index.js`: `aiCoachSummary`, `deleteHousehold`, `deleteMyAccount`, `dispatchScheduledReminders`. All four are **legacy World-1 functions** (AI coach summaries, old-household deletion, account deletion, scheduled bill reminders) — none reference TrackToZero V2's domain model, and confirmed via grep that no V2 code (`src/components/tracktozero`, `src/services/tracktozero`) calls `httpsCallable`/`getFunctions` at all. **TrackToZero V2's controlled beta requires zero Cloud Functions.** Whether these legacy functions remain deployed to `budgetapp-c9306` today is a separate, pre-existing operational fact, not something V2 beta depends on either way.

## 19. App Check

**Not implemented anywhere in the codebase** — zero references to `AppCheck`, `app-check`, or `ReCaptcha` in any file. For a small, invite-only controlled beta with a handful of known testers, App Check enforcement is not necessary and enabling it prematurely (before it's ever been implemented and tested) would risk locking out every tester with no fallback. **Recommendation**: do not implement or enable App Check for the controlled-beta phase; revisit once beta moves toward a wider or public audience where bot/abuse traffic becomes a realistic concern.

## 20. Environment variables

Full inventory (names and purpose only — no secret values). V2-specific:

| Variable | Purpose | Default if unset |
|---|---|---|
| `VITE_TRACKTOZERO_V2_REPOSITORY_MODE` | Selects `firebaseEmulator`/`localBeta`/`inMemory`/production | `firebaseProduction` (fail-safe) |
| `VITE_TRACKTOZERO_V2_FIREBASE_PROJECT_ID` | Emulator/local-beta project id override | `"demo-budget-react-v2"` |
| `VITE_TRACKTOZERO_V2_FIREBASE_API_KEY` | Emulator/local-beta fake API key | `"demo"` |
| `VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST` | Firestore emulator `host:port` | `""` → fail-closed throw in emulator/local-beta modes |
| `VITE_TRACKTOZERO_V2_AUTH_EMULATOR_HOST` | Auth emulator `host:port` | `""` → fail-closed throw in local-beta mode |
| `VITE_TRACKTOZERO_V2_SEED_WORKSPACE_IDS` | QA-harness seed workspace picker list | `"personal-seed,household-seed"` (cosmetic) |
| `VITE_TRACKTOZERO_V2_ENABLED` | Master flag: is V2 exposed at all | `true` |
| `VITE_TRACKTOZERO_MIGRATION_ENABLED` | Shows the migration-rehearsal panel in Settings | `false` |

Shared production Firebase config (`src/firebase.js`, used by both legacy and V2 in `firebaseProduction` mode): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (all required — missing any one leaves the app unconfigured, safely refusing to initialize rather than partially connecting), `VITE_FIREBASE_MEASUREMENT_ID` (optional, analytics only). All `VITE_*` variables are compiled into the client bundle by Vite's own design — none of these are or should be treated as secrets (a Firebase web API key is a public client identifier, not a credential); genuine secrets (`OPENAI_API_KEY`, service-account paths) correctly live outside the `VITE_` prefix and never reach the browser bundle.

Legacy-only (not required for V2 beta, not detailed further here): `VITE_STRIPE_*` (7 vars), `VITE_LAUNCH_*` (9 vars, only 2 of which — the two V2 flags above — matter to V2), `VITE_USE_FIREBASE_EMULATORS`, `VITE_FIREBASE_FUNCTIONS_HOST/PORT`.

`VITE_APP_VERSION`/`VITE_APP_BUILD` — shared version-label vars, both optional (fall back to build-time `define`d globals). See Section 22.

## 21. Build modes

Current npm scripts: `dev` (Vite default `development` mode), `dev:v2-local` (`--mode v2-local`, loads `.env.v2-local`), `build`/`preview` (Vite default `production` mode, loads only `.env` per Vite's convention — no `.env.production` file exists). **No beta/staging build mode currently exists** — confirmed, no `beta`/`staging` string appears anywhere in `package.json`. A controlled-beta build today would just be `vite build` in plain `production` mode with whatever `.env` happens to be present at build time, which is not an intentional, reviewable configuration.

**Designed this phase, not yet wired to a real project**: `.env.beta.example` (new, this phase) documents exactly which variables a future beta build needs, mirroring the existing `.env.example`/`.env.v2-local` convention. A `build:beta`/`dev:beta` npm script (`vite build --mode beta` / `vite --mode beta`) does not exist yet and is intentionally not added until a real beta project exists to point it at — adding the script now with nothing behind it would be premature.

## 22. Environment label

**Not yet implemented — designed only.** There is currently no code-level distinction between "true production" and "a beta build" beyond which Firebase project the config happens to point at (both use `firebaseProduction` repository mode identically). Proposed: a new, independent env var `VITE_TRACKTOZERO_V2_ENVIRONMENT_LABEL` (e.g. `beta`), read alongside the existing `getEnvironmentBadge()` pattern in `src/components/tracktozero/layout/environment.js` (which already renders small, restrained badges like "LOCAL BETA"/"QA HARNESS" — never a dominant header) to add a small "Beta" badge in the same visual slot when set. This is deliberately **not implemented in BETA-1**, since it's tightly coupled to Section 24's required code change (both touch the same runtime-mode/config-resolution code) and doing them together, once, when the real target project exists, is safer than two separate speculative changes now.

## 23. Fail-closed guarantees

Proven directly from source (`src/services/tracktozero/repositoryRuntime.js`), all three assertion functions quoted and traced to their call sites:

- **`firebaseEmulator` mode** (`assertTrackToZeroV2EmulatorConfig`): throws unless `projectId === "demo-budget-react-v2"` AND the emulator host is a parseable `host:port` — never falls back to anything.
- **`localBeta` mode** (`assertTrackToZeroV2LocalBetaConfig`): throws unless the emulator project id matches AND **both** the Firestore and Auth emulator hosts are explicit and parseable — independently re-checked a second time inside `createTrackToZeroRepository`'s own `localBeta` branch and a third time inside `getTrackToZeroV2LocalBetaAuth`. The React layer (`TrackToZeroV2App.jsx`) catches any throw here and sets `authState.status = "unavailable"` — it never silently falls through to the production Auth instance.
- **`firebaseProduction` mode** (`assertTrackToZeroV2ProductionConfig`): throws unless the shared production Firestore instance is actually configured AND its project id equals the hardcoded `TRACKTOZERO_V2_PRODUCTION_PROJECT_ID` ("budgetapp-c9306"). Structurally cannot reach `connectFirestoreEmulator`/`connectAuthEmulator` — those calls only exist inside the `firebaseEmulator`/`localBeta` branches of `createTrackToZeroRepository`, unreachable from the production branch.
- **Mode resolution default** (`getRuntimeMode()`): a positive-match allowlist against exactly three named non-production values, with a single unconditional fallthrough to `firebaseProduction` — no unset, empty, or misspelled value can resolve to an emulator mode.

**A beta build can never silently connect to an emulator. A local emulator build can never silently fall back to production.** Both directions proven, both re-confirmed live during UX-9 (a real reload/session test against the actual local-beta emulator). This contract holds today and is not weakened by anything in this phase.

## 24. Beta project creation plan (documented, NOT executed)

1. **Owner approval** for Option A (Section 12) and for creating a new Firebase project.
2. `firebase projects:create <chosen-id>` — a new, empty project on the same Firebase account. Free (Spark) tier is sufficient for a small controlled beta; no billing account required unless Storage/Functions are added later, neither of which V2 beta needs (Sections 17-18).
3. Add a new alias to `.firebaserc` (e.g. `"beta": "<chosen-id>"`) — never remove or touch `"default"`.
4. **Required code change** (deferred to when this step is actually executed, not done in BETA-1): make the expected production project id in `assertTrackToZeroV2ProductionConfig` configurable — e.g. a new env var `VITE_TRACKTOZERO_V2_ALLOWED_PROJECT_ID`, defaulting to the current hardcoded `"budgetapp-c9306"` so existing production behavior is provably unchanged, overridable to the new beta project id for beta builds only. Must ship with its own regression test (the existing fail-closed contract must still throw for any *other* mismatched project id).
5. Enable Firebase Auth, email/password provider, in the new project's console; add the beta URL (Section 25) and `localhost` to Authorized domains.
6. Create the Firestore database (choose a resource location — not currently specified anywhere in the existing production project's config, so this is a genuinely new choice, not a copy of an existing setting).
7. Deploy `firestore.rules` to the new project **only** (`firebase deploy --only firestore:rules --project <beta-alias>`), never omitting `--project`.
8. Create a Hosting site under the new project (`firebase hosting:sites:create <site-id> --project <beta-alias>`).
9. Wire up App Check: **skip**, per Section 19's recommendation.
10. Populate the real `.env.beta` (gitignored) from `.env.beta.example`, using the new project's real config values.
11. `npm run build -- --mode beta` (once the script exists), `firebase deploy --only hosting --project <beta-alias>`.
12. Smoke test (Section 33's checklist).
13. Rollback: `firebase hosting:rollback --project <beta-alias>` if the release itself is bad; see Section 31 for the data-vs-code rollback distinction.

Owner-approval-required steps are 1 and, implicitly, any step that follows from approving Option A at all (2 onward).

## 25. Hosting / URL strategy

| Option | Tester clarity | Isolation | SSL/domain setup | Auth authorized domains | Accidental SEO exposure | Rollback |
|---|---|---|---|---|---|---|
| `beta.tracktozero.app` | High — looks intentional, memorable | Full (Option A) | Requires a DNS record + domain verification in the new project | One clean addition | Low if `noindex` is set | Independent of production DNS |
| `tracktozero-beta.web.app` (or similar `.web.app`/`.firebaseapp.com` default) | Medium — clearly a beta/dev-looking URL | Full (Option A) | Zero setup — Firebase provisions this automatically | One clean addition | Low if `noindex` is set | Independent |
| Firebase preview channel on the existing site | Low — long, ugly, temporary-looking URL; also implies Option B/C (same project), which this report does not recommend | None (shares prod backend unless paired with Option A, which preview channels don't structurally require) | Zero setup | N/A — same project as prod | Low (channels expire) | Trivial, but doesn't matter much since it's not the recommended data-isolation path |

**Recommendation**: `beta.tracktozero.app` if the domain-verification step is acceptable to the owner (best tester-facing clarity, still fully isolated under Option A); otherwise the auto-provisioned `.web.app` URL for the new beta project is a perfectly safe fallback with zero DNS work. Do not use a Hosting preview channel for this, since it does not deliver the data isolation Section 12 recommends.

## 26. Indexing / public access

No `robots.txt` currently exists in this repo (`public/robots.txt` absent). Recommendation for the beta site specifically: add a `noindex, nofollow` `robots.txt` (or an `X-Robots-Tag: noindex` Hosting header rule in that project's `firebase.json`) so the beta URL doesn't get crawled/indexed while it's a small controlled cohort. This is a two-line static file, not a system to build. Access itself should remain invite-only (Section 27) rather than relying on non-indexing as an access control — non-indexing only prevents casual discovery, not direct-link access, which is expected and fine for a controlled beta.

## 27. Tester access model

**Recommendation: invite-only, allowlisted emails**, matching the architecture that already exists: V2's Household invite flow already enforces exact-email-match acceptance (Section 14), which naturally extends to "only people the owner explicitly invited into a workspace can use the beta" — no new access-control system is needed. For the very first cohort, this likely means the owner personally creating a Personal workspace (or a small number of Household workspaces) and sending each tester a real invite link, exactly as the existing flow already works. Public/open signup is not recommended for the initial controlled beta given the unresolved Section 14 gaps (no password reset, no email verification) — those are more tolerable risks in a small, personally-known cohort than in an open signup pool.

## 28. Observability

Current state: a top-level `AppErrorBoundary` (in `src/main.jsx`) wraps the entire app — including TrackToZero V2 — and catches render crashes, showing a friendly fallback screen instead of a blank page. Its `componentDidCatch` only calls `console.error` — **no remote error-reporting service is wired up** (no Sentry, no Firebase Crashlytics, no structured Cloud Logging, no analytics/`gtag` of any kind found anywhere in the codebase). This means the team currently has zero visibility into a beta tester's crash or error unless that tester manually reports it. **This is a real, identified gap for BETA-2/BETA-3** — not fixed here, per the instruction not to add tooling unless absolutely required for a small, closely-supported first controlled cohort (where direct tester-to-owner communication can substitute for automated monitoring in the very first phase).

## 29. Privacy-safe logging contract (for when observability tooling is added)

**Must never be logged**: debt balances or any financial figures unless explicitly aggregated/sanitized; account numbers; raw statement/PDF/spreadsheet text; uploaded file contents; raw `ImportCandidate` payloads; invite tokens (raw or hashed); passwords; Auth credentials/ID tokens; any complete financial record payload.

**Safe to log**: release version + commit (Section 30), route/screen name, an error code or category (not the raw error message if it could echo back user-entered financial text), operation category (e.g. "debt-create", "import-commit"), a workspace-scoped opaque identifier (the workspace id itself, never a person's name/email), browser/device class, environment label (beta/production), timestamp. This mirrors the sanitization discipline already proven in `getUserSafeTrackToZeroError` (BETA-0 Section 24) — extend that same philosophy to any future remote logging, don't invent a new one.

## 30. Build version identification

**Implemented this phase** (small, safe, local-only — see Section 36): `vite.config.js` now derives a best-effort short git commit hash at build time (`git rev-parse --short HEAD`, wrapped in try/catch so a shallow checkout with no `.git` history never fails the build, just yields an empty string) and exposes it via the existing `__APP_VERSION__`/`__APP_BUILD__` `define` pattern as a new `__APP_COMMIT__`. `src/config/appMeta.js` gained an `APP_COMMIT` export (empty string when unavailable — never a fabricated placeholder). TrackToZero V2's Settings screen now shows a `Build:` line right next to the existing `Data mode:` line, e.g. `1.0.0 • 4715497` — no secrets, no git branch name, no author info, just version + short commit hash. This lets a tester or support engineer state exactly which release candidate they're on. Verified end-to-end: a fresh production build's bundle contains the literal string `4715497` (the commit this phase started from).

## 31. Rollback design

**Hosting rollback**: `firebase hosting:rollback --project <beta-alias>` (or the Firebase console's release history) returns to the immediately prior Hosting release for that project/site — fast, safe, code-only.

**Rules rollback**: re-deploy the prior `firestore.rules` content (the file itself is Git-tracked, so "prior rules" is just an earlier commit's version of `firestore.rules` — `firebase deploy --only firestore:rules --project <beta-alias>` against that checked-out state). There is no separate Firestore rules "version history" UI equivalent to Hosting's; Git is the source of truth for rules rollback.

**Data rollback limitation — stated explicitly**: once real beta users create real workspaces/debts/plans/payments, a **code** rollback (Hosting or rules) does not undo any **data** already written. There is no database-level point-in-time rollback configured for this project (no scheduled Firestore backups were found or set up as part of this phase — that would itself be a real infrastructure decision requiring owner approval, not assumed here). If a bad release corrupts data, the fix is a targeted, manual data-correction script against the specific affected documents, not a rollback button. This is precisely why Option A's full isolation (Section 12) matters: a beta-only data problem is recoverable by simply resetting the beta project; a shared-backend (Option B/C) data problem is not.

## 32. Stop-beta triggers

Any of the following halts the controlled beta immediately (disable the Hosting site or revoke tester access) pending investigation, regardless of how small the cohort is:

- Any evidence of data loss (a debt, balance snapshot, payment event, or plan version disappearing or being overwritten outside its documented append-only/immutable contract).
- Any evidence of cross-workspace access (a user seeing or affecting another workspace's data).
- Any evidence of financial-truth corruption (a missing value silently becoming a confirmed zero, a balance/APR/payment displayed incorrectly, a plan showing numbers that don't match its own frozen snapshot).
- Any evidence of incorrect permission enforcement (a Viewer performing a write, a non-member reading workspace data).
- Any evidence of an unsafe plan activation (an excluded/Needs-review debt entering an authoritative PlanVersion).
- Any evidence of systematic import corruption (a batch of imports producing wrong debts at scale, not an isolated one-off parsing miss).
- Any Auth/invite failure with security implications (a wrong-email acceptance succeeding, an expired/cancelled invite being honored).

## 33. Future deployment checklist (draft only — not executed)

- **Gate 0 — human authorization**: owner approves Option A, the beta project, the URL strategy, and the tester-access model (Section 39).
- **Gate 1 — push/protect RC**: push `phase4/migration-rehearsal` (or the chosen release branch, Section 34) to `origin`; confirm no force-push, no history rewrite.
- **Gate 2 — beta project/site identity**: new Firebase project created, `.firebaserc` alias added, Hosting site created, URL chosen and DNS/domain-verify done if using a custom subdomain.
- **Gate 3 — environment variables**: real `.env.beta` populated from `.env.beta.example`; the Section 24 code change (configurable expected-project-id) implemented, tested, and reviewed.
- **Gate 4 — rules validation**: `firestore.rules` re-run through the full test suite one more time against the new project's actual rules deploy (not just the emulator), confirming parity holds post-deploy.
- **Gate 5 — build**: `npm run build -- --mode beta` (or equivalent), full local validation suite green.
- **Gate 6 — rules deploy**: `firebase deploy --only firestore:rules --project <beta-alias>` — explicit `--project`, always.
- **Gate 7 — hosting deploy**: `firebase deploy --only hosting --project <beta-alias>` — explicit `--project`, always.
- **Gate 8 — smoke**: the same real-browser smoke sequence used in BETA-0/UX-9 (sign in → Home → Debts → Plan → Activity → Settings → refresh), run against the live beta URL, not localhost.
- **Gate 9 — security smoke**: a real wrong-email invite-acceptance attempt against the live beta project (mirroring UX-9's live attack simulation), confirming denial in the real deployed environment, not just the emulator.
- **Gate 10 — first tester authorization**: owner sends (or approves sending) the first real invite.

## 34. Git release strategy

**Recommendation: Option B — a dedicated release branch (`beta/v2-controlled`) created from `4715497`, pushed to `origin`, used as the controlled-beta release branch.** Reasoning: Option A (push `phase4/migration-rehearsal` as-is) works but conflates an ongoing feature/rehearsal branch name with a release artifact — future work would keep landing on the same branch a beta deployment reads from, with no clean boundary. Option C (merge into `main`) is mechanically safe (Section 10: a clean fast-forward) but is a much bigger decision than a controlled beta needs to make right now — it declares V2 the permanent mainline before the beta itself has run, which this report has no basis to recommend yet. A dedicated `beta/v2-controlled` branch gives a stable, clearly-named target for the deployment checklist (Section 33) without foreclosing the `main`-merge decision, which can be made later once the beta has actually validated the product. **Not created or pushed in BETA-1** — this is a recommendation for Gate 1, pending owner approval.

## 35. RC tag strategy

Current: `rc/ux9-controlled-beta-f06e803` (untouched, still points at `f06e803`). **Not creating** an additional `rc/beta0-4715497` tag this phase — BETA-0's own reconciliation already produced no code changes (it was audit-only), so `f06e803` and `4715497` represent the same certified code state plus documentation; a second RC tag would add a distinction without a difference. If BETA-1's own small runtime change (Section 36) is committed, the resulting new HEAD is a genuinely new, distinct state worth its own marker — see the tag created in Section 36's commit step.

## 36. Local changes made

Small, safe, local-only, do not bind to any real cloud project:

- `vite.config.js` — added a best-effort git-commit-hash `define` (`__APP_COMMIT__`), wrapped in try/catch, empty-string fallback.
- `src/config/appMeta.js` — added `APP_COMMIT` export (additive only; existing `APP_VERSION`/`APP_BUILD`/`APP_VERSION_LABEL` behavior unchanged).
- `src/components/tracktozero/TrackToZeroV2App.jsx` — Settings screen gained one new `Build:` display line next to the existing `Data mode:` line.
- `.env.beta.example` — new template documenting the future beta build's required environment variables, with an explicit inline note about the Section 24 code-change dependency (so it's not mistaken for a ready-to-use config).

No cloud project was created, no `.firebaserc` alias was added, no deploy was performed, no Auth/Firestore/Hosting/rules configuration was touched in any real Firebase project.

## 37. Test results

Full validation suite re-run after the Section 36 changes:

| Check | Result |
|---|---|
| Unit tests | 841/841 passed (56 files) |
| Lint (full repo) | 0 errors, 4 pre-existing documented warnings, no new ones |
| Build | success — verified the built bundle contains the correct commit hash (`4715497`) |
| Legacy Firestore rules | 12/12 passed |
| Firestore V2 rules (both files, parity) | 69/69 passed each; `Rules parity guard: PASS`, zero drift |
| perf:check | 8/8 budget lines PASS |
| npm audit --omit=dev | 0 vulnerabilities |

No regressions from the BETA-0 baseline anywhere. One transparency note: the very first invocation of `npm run test:firestore:v2` during this validation pass exited non-zero mid-stream with truncated output (no failing subtest visible before truncation); an immediate re-run with output redirected to a log file came back 100% clean (69/69 both suites, parity PASS) with zero code changes in between. This reads as a one-off local emulator-startup timing flake, not a regression — recorded here rather than silently retried and hidden, per the "don't hide failed journeys" discipline this project already follows.

## 38. Blockers

**Zero blockers to completing BETA-1's own deliverables** (discovery, planning, documentation, safe local scaffolding). One **conditional** blocker is documented for the *next* phase: Option A cannot actually be executed until the Section 24 code change (configurable expected-production-project-id) is implemented and tested — this is not a blocker to BETA-1 itself, which explicitly defers that change.

## 39. Human decisions required

Only items genuinely requiring the product owner:

1. **Approve Option A** (dedicated Firebase beta project) as the environment strategy, or direct a different choice.
2. **Approve the proposed Git release strategy** — a new `beta/v2-controlled` branch from `4715497` — or direct a different one (push `phase4/migration-rehearsal` as-is, or merge to `main`).
3. **Approve the first push** of the V2 release stack to a remote branch (nothing has been pushed by any phase so far).
4. **Approve Hosting/rules deployment** in the next phase, once a beta project exists.
5. **Approve the beta URL/domain strategy** — `beta.tracktozero.app` (requires domain verification) vs. an auto-provisioned `.web.app` URL.
6. **Approve the tester-access model** — invite-only via the existing Household/Personal invite flow, and who the first cohort actually is.

## 40. Next-phase recommendation

Once items 1-6 above are approved, the next phase (BETA-2) should: implement the Section 24 code change with full test coverage, create the approved beta Firebase project and Hosting site, wire the real `.env.beta`, execute the Section 33 checklist through Gate 8 (stopping short of inviting real testers until a human explicitly authorizes Gate 10), and produce its own results doc proving each gate passed with live evidence — following the same discipline this phase and UX-9 already established.
