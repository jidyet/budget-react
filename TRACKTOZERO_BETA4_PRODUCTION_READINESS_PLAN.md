# TrackToZero Beta 4 — Hardening & Production Readiness

## Objective

Prove that the TrackToZero V2 beta is stable, understandable, and safe to promote without changing the financial model or migrating live user data automatically.

## Baseline

- Branch: `beta/v2-controlled`
- Latest math repair: `0456610 fix: align plan status with expected checkpoint month`
- No production deployment, data migration, or production Firestore write is authorized by this phase plan.
- Existing uncommitted typography changes are intentionally separate from the math repair and must be reviewed and committed independently before a beta release candidate is assembled.

## Phase 1 — Release Candidate Hygiene

Goal: create one reviewable beta release candidate.

1. Review the remaining typography/theme changes for scope and responsive behavior.
2. Run focused theme and mobile-navigation tests.
3. Commit only intentional UI changes in a dedicated commit.
4. Confirm a clean working tree and record the release-candidate commit range.

Exit gate: UI changes are committed separately, math repair remains intact, and no unrelated files are included.

## Phase 2 — Full Automated Validation

Goal: prove the release candidate is mechanically sound.

Required checks:

- `npm test -- --run`
- `npm run lint`
- `npm run build`
- `npm run test:firestore`
- `npm run test:firestore:v2`
- `npm run perf:check`
- `npm audit --omit=dev`

Exit gate: all checks pass, aside from explicitly documented pre-existing warnings.

## Phase 3 — Beta Deployment & Acceptance

Goal: verify the deployed beta behaves like the validated release candidate.

1. Deploy only to the beta Hosting target.
2. Verify deployed build identity and feature-flag posture.
3. Complete browser acceptance checks on desktop and phone portrait/landscape.
4. Validate the following journeys:
   - Add and edit debt.
   - Record payment and confirm balance.
   - On-track/ahead/behind status after a matching current-month balance.
   - Snowball, Avalanche, What If, Finish By, and saved-plan flows.
   - Household owner, contributor, viewer, invitee, and invite acceptance flows.
5. Confirm no production Firebase project, production data, or production rules are touched.

Exit gate: beta acceptance is documented with no release-blocking defects.

## Phase 4 — Production Readiness Review

Goal: make an explicit go/no-go decision.

1. Triage and fix beta defects; repeat Phases 2 and 3 for any fix.
2. Review beta error signals and user feedback.
3. Confirm current V2 limitations remain clearly disclosed:
   - projections use monthly APR/12 estimates rather than lender reconciliation;
   - unknown APR/minimums reduce projection accuracy;
   - projections are capped at 240 months;
   - confirmed balances remain the primary observed truth.
4. Confirm no unreviewed migration, Firestore-rule, or data-backfill work is bundled.
5. Obtain explicit release approval before pushing, merging, or deploying production.

Exit gate: approved release candidate, rollback plan, and production deployment authorization.

## Phase 5 — Controlled Production Release

Only after Phase 4 approval:

1. Push approved commits and merge through the production branch.
2. Deploy Hosting intentionally.
3. Run post-deploy smoke checks with production-safe accounts.
4. Monitor errors and retain rollback capability.

## Next Product Phase

After a stable production release, begin opt-in legacy-to-V2 migration onboarding:

- preview converted data;
- require user confirmation;
- keep legacy data readable during the rollback window;
- never perform uncontrolled bidirectional sync.
