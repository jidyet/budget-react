# TrackToZero V2 — BETA-0 Release Candidate Manifest

This is a machine-readable-by-humans manifest, not a narrative report (see `TRACKTOZERO_BETA0_RELEASE_CANDIDATE_RECONCILIATION.md` for the full audit). Contains no secrets and no private financial data.

## Release candidate

- **Certified commit**: `f06e803e4766ba53099650d60c052d8ae6e41a2d` (short: `f06e803`)
- **Commit message**: `UX-9: complete local beta release readiness`
- **RC tag**: `rc/ux9-controlled-beta-f06e803` → `f06e803` (local-only, not pushed)
- **Branch**: `phase4/migration-rehearsal`
- **Origin baseline**: `origin/phase4/migration-rehearsal` = `25ff83e` ("Add DATA-2 financial-item classification gate + debt document intelligence")
- **Local commits ahead of origin**: 10
- **Working tree at time of BETA-0**: clean

## UX-9 report traceability

`TRACKTOZERO_UX9_LOCAL_BETA_RELEASE_READINESS_RESULTS.md` states its tested/starting baseline as `7e0b012` (the commit immediately before the report itself was written and committed together with the two UX-9 code fixes as `f06e803`). The report cannot self-reference `f06e803` because that hash did not exist until the commit containing the report was created. This manifest is the explicit link: **UX-9's certification applies to `f06e803`**, which is this release candidate.

## Local commit stack (origin..HEAD, oldest first)

| Commit | Message |
|---|---|
| `a6084ac` | Add UX-6.1 full-screen debt workspace, visual category navigation, and import redesign |
| `2f98f6a` | SEC+UX: secure invites, rebuild review, complete household ownership |
| `9ce206b` | UX-7: build home command center and retention loop |
| `5c9ae1c` | UX-8: harden mobile and accessibility experience |
| `2f0083f` | UX-8.1: reconcile pre-beta review and identity consistency |
| `d55cc10` | UX-8.2: align plan previews and editable debt review |
| `db01513` | UX-8.3: add lender identity and final UI polish |
| `8933a4b` | UX-8.4: enhance debt and activity exploration |
| `7e0b012` | UX-8.4 follow-up: Debt Explorer polish and navigation fix |
| `f06e803` | UX-9: complete local beta release readiness |

## Release-relevant reports (tracked, present)

- `TRACKTOZERO_SEC_INVITE_REVIEW2_UX6_2_RESULTS.md`
- `TRACKTOZERO_UX6_1_FULLSCREEN_DEBT_WORKSPACE_RESULTS.md`
- `TRACKTOZERO_UX7_HOME_ACTIVITY_RETENTION_RESULTS.md`
- `TRACKTOZERO_UX8_MOBILE_ACCESSIBILITY_RESULTS.md`
- `TRACKTOZERO_UX8_1_PREBETA_CONSISTENCY_RESULTS.md`
- `TRACKTOZERO_UX8_2_PLAN_TRUTH_EDITABLE_REVIEW_RESULTS.md`
- `TRACKTOZERO_UX8_3_LENDER_IDENTITY_UI_POLISH_RESULTS.md`
- `TRACKTOZERO_UX8_4_DEBT_ACTIVITY_EXPLORER_RESULTS.md`
- `TRACKTOZERO_UX9_LOCAL_BETA_RELEASE_READINESS_RESULTS.md`
- `TRACKTOZERO_CLEAN_SLATE_V2_BETA_RESET_RESULTS.md` (earlier, establishes that TrackToZero V2 is the default app path and that legacy World-1 production data was already wiped)
- `TRACKTOZERO_BETA0_RELEASE_CANDIDATE_RECONCILIATION.md` (this phase's own report)

## Automated validation baseline (re-confirmed this phase, zero drift from UX-9)

| Check | Result |
|---|---|
| Unit tests | 841/841 passed (56 files) |
| Legacy Firestore rules | 12/12 passed |
| Firestore V2 rules (vs `firestore.rules`, production-authoritative) | 69/69 passed |
| Firestore V2 rules (vs `firestore.v2.rules`, reference) | 69/69 passed |
| Rules parity guard | PASS — no drift |
| Lint | 0 errors, 4 pre-existing documented warnings |
| Build | success |
| perf:check | 8/8 budget lines PASS |
| npm audit --omit=dev | 0 vulnerabilities |

## Pre-existing documented lint warnings (all `react-hooks/exhaustive-deps`, none new)

- `src/App.jsx:965` — missing dep `setUser`
- `src/components/tracktozero/TrackToZeroV2App.jsx:956` — unnecessary dep `repository`
- `src/hooks/useAccounts.js:227` — missing dep `defaultOwnerLabel`
- `src/hooks/useInstallPrompt.js:47` — missing dep `enabled`

## Known real lender logos (local bundled assets, `src/assets/lenders/`)

Bank of America, Capital One, Chase, U.S. Bank, Wells Fargo, Discover, Navy Federal, Affirm, SoFi, Citi, American Express (11 total). Provenance documented in `src/assets/lenders/PROVENANCE.md`. All other lenders in the registry (including MOHELA and Firstmark) render the neutral initials fallback — no asset file, no external network request.

## Backup tags

- `backup/pre-ux8-progress-service` (present, untouched)
- `backup/pre-clean-slate-v2-20260813` (present, pre-existing, unrelated to this stack)

## Push / deploy state

- Nothing pushed from this local stack. `origin/phase4/migration-rehearsal` remains at `25ff83e`.
- Nothing deployed as part of this phase or UX-9.
- The RC tag is local-only.
- **Open question, not resolvable from this repository**: which branch/commit Firebase Hosting is actually configured to serve for the production project (`budgetapp-c9306`) is unknown from repo inspection alone — see the reconciliation report's Human Decisions section.
