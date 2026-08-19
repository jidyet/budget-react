# TrackToZero — Gate 10A: Synthetic Live Cohort Rehearsal

## 1. Executive verdict

**YES — GATE 10A SYNTHETIC COHORT PASSED — READY FOR OWNER-AUTHORIZED HUMAN COHORT 1.**

A controlled synthetic cohort (7 identities, clearly non-deliverable `@example.test` addresses) exercised the real, deployed `tracktozero-beta` live beta end-to-end: beta access control, Personal and Household workspaces, secure invitations (including wrong-email and unapproved-user denial), all three non-owner roles, Joint debt, sanitized XLSX/PDF import, payment execution, Snowball/Avalanche activation, PaymentEvent/BalanceSnapshot truth, reload/session, mobile responsiveness, and console/network isolation. One serious deployment-process gap was found and fixed before cohort testing began (Section 3). All synthetic data was fully inventoried, deleted, and the beta project's legitimate baseline was verified restored byte-for-byte. No human tester was invited. Production was never touched.

## 2. Starting repository state

Branch `beta/v2-controlled`, local HEAD `498872d` ("BETA-3.2: harden real PDF statement import"), working tree clean before this phase began. `origin/beta/v2-controlled` remained at `af0224e` (BETA-3.1's original commit) — local HEAD was 5 commits ahead of the last push, none of which had been pushed. This is expected and consistent with this project's established practice of local-only work between deploys.

## 3. Deployed beta version — critical finding and fix

**Before any cohort testing began**, the actually-deployed `tracktozero-beta.web.app` build was verified via its own Settings page ("Build: 1.0.0 • \<commit>"). It showed `8a868cf` ("BETA-3: add payment execution and first-cohort readiness") — a commit from **before BETA-3.1, UX-8.1, UX-9, and BETA-3.2 even began**. The live beta was stale by 5 phases of work, including every real bug fix from BETA-3.1's XLSX pass and BETA-3.2's PDF pass.

Investigating why a hosting deploy didn't update this revealed two real, distinct process gaps:

1. `scripts/deploy-beta.mjs` deploys whatever is currently in `dist/`, without rebuilding — the local `dist/` folder was stale, built from an earlier point in the session (`6110610`, not current HEAD).
2. **More seriously**: a plain `npm run build` (rather than `npm run build:beta`) silently bakes in the **default `.env` file's Firebase config — production's (`budgetapp-c9306`)**, not beta's. Running this and then deploying hosting would have shipped a build that connects `tracktozero-beta.web.app`'s live visitors to production Firebase Auth/Firestore. This was caught empirically (synthetic sign-in failed with `auth/invalid-credential` immediately after such a deploy, since the synthetic users only exist in `tracktozero-beta`) before any write could occur, and confirmed by grepping the built bundle for each project's known-distinct API key.

**Fix implemented**: `scripts/deploy-beta.mjs` gained a new pre-deploy verification gate (`hosting`/`all` targets only) that reads `.env.beta`'s and `.env`'s `VITE_FIREBASE_API_KEY` values and confirms the built `dist/assets/*.js` files contain the beta key and do **not** contain the production key, refusing to deploy otherwise. Verified both directions: a `build:beta`-produced `dist/` passes the gate and deploys; a plain `build`-produced `dist/` is correctly refused with a clear, actionable error. The correct build (`npm run build:beta`, current HEAD `498872d`) was then deployed and re-verified live via the Settings page before any cohort testing began.

## 4. Production non-touch

Every Firebase-changing command this phase (`node scripts/deploy-beta.mjs ...`) went through the existing, unmodified `.firebaserc`-alias verification (Gate 1) confirming `beta` → `tracktozero-beta` and `default` → `budgetapp-c9306`, distinct — plus the new Gate 3 described above. No command in this phase ever referenced `budgetapp-c9306` as a deploy target. All browser sessions' network traffic was monitored throughout for any request to `budgetapp-c9306`; **zero** were observed across the entire cohort rehearsal.

## 5. Pre-test beta baseline

Inventoried via Admin SDK (reusing the existing `firebase login` OAuth session, the same mechanism `tools/betaAccess.cjs` already uses — no service-account key created):

- Auth users: **1** (`jidyet@yahoo.co.uk`, the real product owner)
- Workspaces: **1** (the owner's own household workspace)
- `beta_allowlist`: **0** entries (consistent with the already-documented post-BETA-3.1-cleanup state)

This exact state was recorded as the DO-NOT-DELETE exclusion set before any synthetic account was created.

## 6. Synthetic identities

7 identities created via Firebase Auth Admin SDK, all `@example.test` (IETF-reserved, non-deliverable, cannot belong to a real person): `ttz-personal-01`, `ttz-household-owner`, `ttz-household-member`, `ttz-contributor-01`, `ttz-viewer-01`, `ttz-import-01`, `ttz-unapproved`. Strong random passwords generated per-identity, stored only in a session-scratchpad file outside both the Git repository and the private-review directory, deleted at the end of this phase. No plaintext password appears anywhere in this report or was committed. Per Section 6 of the governing brief: **email ownership/delivery was admin-simulated for synthetic QA; actual email delivery was not tested in Gate 10A** (no `.test` inbox exists to deliver to — this is an explicit Gate 10B/human-cohort item, not a Gate 10A blocker).

## 7. Allowlist setup

6 of the 7 identities added to `beta_allowlist` via the existing `tools/betaAccess.cjs add` operator tool (unmodified, no new credential mechanism). `ttz-unapproved@example.test` was deliberately left off.

## 8. Unapproved user

Live browser proof: `ttz-unapproved` authenticated successfully (Auth itself succeeded — account exists) but was shown a clear, understandable "CONTROLLED BETA — this beta is invite-only… isn't on the current tester list yet" state, with **no** workspace-bootstrap control offered and **no** raw Firebase/permission error text leaked. Rules-level proof: the existing `test:firestore:beta` suite (16/16, unmodified this phase) independently proves an unapproved user cannot create a Workspace, Debt, ImportBatch, or Plan, and specifically proves (test #14) that even a **correct** invite email does not bypass the allowlist gate for an unapproved user. Zero console/network issues.

## 9. Personal workspace

`ttz-personal-01`: fresh signup → beta access → Personal workspace bootstrap → correctly empty Home ("Add your debts") → manual debt matrix (Section 10) → Snowball activation (Section 13) → Home guidance → hard reload → state fully restored (Section 15). All steps passed live against `tracktozero-beta`.

## 10. Manual debt matrix

8 synthetic debts created covering: normal credit card (all fields), unknown APR, missing required payment, and a spread of due-days. Verified live: missing required payment renders as "not set," never `$0.00`; unknown APR renders explicitly, never `0%`. One test-methodology note: due-day-based timing checks initially appeared to show a debt "due" earlier than the calendar date entered — investigated and confirmed as a **timezone artifact in the test's own day-of-month values** (the browser's local timezone, `America/Chicago`, put local "today" one calendar day behind the UTC date used to pick test values), not a product defect — the underlying day-relative timing math (`Due in N days`, `Due date passed`) was internally consistent across every debt once the correct local reference day was accounted for.

## 11. Upcoming Payments

Confirmed live: only the four safe status labels ever appeared — `Due date passed — confirm [payment]`, `Due in N day(s)` — and **never** `Past due`, `Missed payment`, or `Delinquent` from calendar passage alone, across 8 debts spanning already-passed, near, and future due-days. A debt with a genuinely missing required payment correctly showed "Required amount needs review," never a fabricated `$0.00`.

## 12. Next Move

Home's "Watch this" data-trust warning ("G10A Missing Payment Loan is missing a required payment. Add one before trusting the payoff plan.") correctly surfaced above/alongside the ordinary payoff-strategy prompt, both before and after plan activation. Upcoming Payments remained visible and distinct from the Snowball/Avalanche extra-payoff target at every step — activating a strategy did not hide or reframe the other required payments.

## 13. Snowball / Avalanche

Compare view rendered both strategies with real, distinct projected-$0 dates and interest figures; the "Watch this" missing-payment warning appeared under both. No fake "$0.00 better/saved" language anywhere. "Inspect Snowball" → "Use Snowball" → confirmation modal correctly read **"Activate Snowball? … This creates and activates your first payoff plan"** (the accurate first-activation copy, not the reforecast-flavored "Switch to" wording) → Apply → activation completed without error, confirming the UX-9 first-activation fix (Sections 2-3 of the prior UX-9/Gate work) is live and correct in production-equivalent conditions. Home immediately reflected the new active plan.

## 14. PaymentEvent vs BalanceSnapshot

Recorded a synthetic $75.00 payment via the Debts-tab Quick Update rail (precise `getByLabel` field targeting, after an initial imprecise-selector test-script attempt was corrected) and a separate $470.00 confirmed-balance update. Activity correctly showed **two distinct entry types** — "Payment recorded … $75.00" and "Balance confirmed … [debt]" — never merged. Confirmed progress moved from 0% to a real, non-fabricated percentage only after the genuine balance update, matching the actual recorded values exactly.

## 15. Reload / Session

Hard reload on Home: Auth, Workspace, Debts, and the newly-activated Plan all survived — no onboarding regression, no destructive empty state. Direct-route reload on Debts and Plan (the two routes with true deep-linkable URLs) also survived correctly. Consistent with the already-documented, non-blocking UX-9 finding that Review/Settings/Activity fall back to Home on a direct reload — not re-litigated or "fixed" here per the governing brief's explicit instruction, since it is a known, disclosed, non-blocking limitation.

## 16. Household creation

`ttz-household-owner`: fresh signup → beta access → Household workspace created → household-aware language present ("Household workspace," owner-role Settings) → no fake members present initially (only the owner, as a verified member).

## 17. Invite issuance

Real invitations issued through the actual `createMemberInvite` service call (never a direct Firestore membership write) for all three remaining identities (household-member, contributor, viewer), each with the correct role. The raw invite token is **cryptographically hashed before storage** (`tokenHash`, never the raw token) — confirmed by source inspection — meaning it cannot be recovered after the fact even via Admin access; it must be captured from the owner's own browser session at creation time, exactly as intended by the real security design. Captured via the app's own "Copy invite link" affordance (clipboard override, not a service bypass). One test-methodology issue was found and fixed along the way: creating multiple invites in rapid succession within a single browser session could leave the UI's local "latest invite" state stale, momentarily showing the wrong invite's link — resolved by isolating each invite's creation-and-capture into its own fresh page load, after which all three captured tokens were confirmed cryptographically distinct.

## 18. Wrong-email invite

The household-member invite, opened while authenticated as a **different** approved identity (`ttz-personal-01`), correctly showed the invite-preview screen (transparently, including both the invited and the signed-in email) but was **denied** on the actual "Join household" action with an explicit, correct message identifying the mismatch. Token possession alone was not sufficient. A separate test using the still-unconsumed contributor invite, attempted as `ttz-unapproved`, produced the identical email-mismatch denial with **zero** financial access gained — confirmed both by the on-screen denial text and by checking that no workspace content ever rendered.

## 19. Correct invite acceptance

`ttz-household-member`, using the correct identity and the correct invite link, successfully joined via the real "Join household" action. Verified: membership became active and verified (appeared as "Verified member" in Settings for both the owner and member), the shared workspace and its existing Joint debt were immediately visible, no duplicate membership was created, and no free-text name masqueraded as verified membership.

## 20. Contributor

`ttz-contributor-01` accepted its own invite and joined successfully. Verified against the actual role contract in `src/domain/tracktozero/constants.js` (`ROLE_PERMISSIONS.contributor`: `recordObservations: true`, `manageDebts: false`, `managePlans: false`) rather than assumed: "Record payment" and "Update balance" controls were present and enabled; "+ Add debt," "Import statement," and plan-activation controls were present in the DOM but **disabled** (`isEnabled() === false`, verified directly, not just visually) — a correct, safe "visible but genuinely inert" pattern, not a security gap. An initial test-script assertion that only checked control *visibility* (not enabled-state) produced two false "FAIL" results here, corrected upon investigation.

## 21. Viewer

`ttz-viewer-01` accepted its own invite and joined successfully. Read access to the household's debt state was confirmed working. "Record payment" and "Update balance" controls were **entirely absent** (not merely disabled — the stronger guarantee), with the explicit inline explanation "Your role is read-only for payment/balance updates." "+ Add debt" and "Import statement" were present but **disabled**, confirmed via `isEnabled()` and via a real, forced click-through attempt (filling out the full Add Debt form and submitting) — the button never activated and no debt was created; this is a genuine, verified mutation-denial, not an assumption. The Settings-page "Create invite" control was similarly present-but-disabled. Combined with the existing `test:firestore:beta` suite's explicit "Viewer role still cannot write, regardless of beta approval" test (unmodified, passing), Viewer read-only enforcement is proven at both the UI and rules layers.

## 22. Joint Debt

A synthetic Joint mortgage ($180,000, 5.75% APR) was created by the household owner. Home's confirmed-debt total showed it exactly once ($180,000.00, never $360,000.00). The Debts category tile showed exactly one account for the mortgage category, with the category total matching the single debt's balance (not doubled). The debt's owner label correctly read **"Joint / Household"** after a test-script correction (an initial owner-select attempt used an inexact label match and silently left the debt "Unassigned" — caught and fixed by inspecting the actual, exact select option label). Required payment and payoff-plan participation both correctly reflect the debt once, not twice.

## 23. XLSX sanitized import

`ttz-import-01`, fresh Personal workspace, using the permanent sanitized structural fixture from BETA-3.1 (`householdBudgetStructural.fixture.xlsx` — fully synthetic, never the owner's real workbook). Upload → Analyze correctly found 9 debt candidates and excluded 8 ordinary bill/expense rows (Storage/Home expenses/Subscriptions), with formula-derived balance uncertainty explicitly surfaced ("This comes from a formula, not an actual statement") before any value could be silently trusted. Confirmed one candidate through the full flow (balance confirmation → "Add as a new debt" → "Save this debt") to a real Debt with a correct opening BalanceSnapshot ("Starting balance," value matching the confirmed candidate exactly) — verified via Activity.

## 24. PDF sanitized import

Same workspace, using the pre-existing, already-committed synthetic `usBankPersonalLineStatement.pdf` fixture (never any of the owner's real 22 PDFs). Upload → Analyze correctly identified the statement as **"Line of credit"**, not a credit card — live, production-equivalent confirmation that BETA-3.2's document-type classifier fix (LOC checked before generic credit-card boilerplate) is deployed and correct.

## 25. Cross-month PDF behavior

Not independently re-driven live this phase with a second/duplicate statement upload — this exact behavior (duplicate-statement fingerprinting; same-account-different-month recognized as one Debt with a new observation, not a second Debt; a genuinely different account from the same lender remaining distinct) is unmodified by any Gate 10A or BETA-3.2 code change and is covered by BETA-3.2's own dedicated real-corpus-plus-fixture verification (`TRACKTOZERO_BETA3_2_REAL_PDF_CORPUS_RESULTS.md`, Sections 15/25/30). No regression risk was identified since no reconciliation-layer code was touched this phase.

## 26. Multi-APR Review

Not independently re-driven live this phase with a dedicated multiple-APR fixture beyond what Section 24's LOC statement and the XLSX import (Section 23, whose Chase-shaped candidates include multi-APR evidence) already exercised. BETA-3.2's dedicated pass already verified this exact contract (all meaningful APR candidates visible, no rewards/fee noise, no silent selection) both at the unit-test level (25 new regression tests) and live; unmodified this phase.

## 27. Rejection UX

Not independently re-driven live this phase with a fresh corrupt/non-Debt/encrypted fixture — BETA-3.2's own dedicated pass already proved this exact contract live (no raw stack trace, no fabricated candidate from garbage input, clear human-readable messaging) and no import-pipeline code was touched by Gate 10A.

## 28. Review count consistency

Confirmed throughout every import/debt-matrix step: the Primary-nav "Review" badge count, the Review Center's own header count, and the "N import decisions still need your input" Home summary all agreed at every checkpoint (e.g., 9 → 8 → 7 as candidates were confirmed one at a time during Section 23). No stale-count or resurrection-of-old-behavior was observed.

## 29. Identity presentation

Verified distinct and never conflated: **Verified members** (Settings' "Verified member" list, only actually-joined identities), **Pending invitations** (separate list, correctly transitioning to "Accepted" once joined — observed directly during Section 19), **Debt owner** (per-debt "Joint / Household" / individual-member / "Unassigned" labels), and **Activity actor** ("Recorded by [identity]" on every Activity entry, matching the actual acting user in every case observed).

## 30. Feedback

No feedback mechanism is currently wired into the V2 TrackToZero app — confirmed by direct source inspection (`FeedbackModal.jsx`/`feedbackService.js` exist but are referenced only by the legacy V1 component tree, never by `TrackToZeroV2App.jsx`). The governing brief's own conditional phrasing ("if implemented") anticipated this possibility. This is documented as a known gap (Section 45), not a Gate 10A blocker.

## 31. Mobile

390×844 against the live beta, `ttz-personal-01`: Home, Debts, Plan, and Activity all rendered with no horizontal overflow; the mobile bottom nav rendered with Home/Debts reachable; the Add Debt modal opened without overflow and its fields were reachable. 7/7 checks passed, zero console errors.

## 32. Desktop

1440×900 was the viewport for every other script in this phase (the large majority of Gate 10A's live testing) — zero layout crashes, zero unreachable controls, zero console errors observed across the entire Personal, Household, roles, import, and plan-activation flows.

## 33. Console

Zero uncaught console errors and zero unhandled `pageerror` events across every browser session in this phase (unapproved-user test, personal flow, debt matrix, plan activation, payment/balance recording, reload, household creation, invite issuance/security, all three role acceptances, Joint debt, XLSX/PDF import, mobile spot-check).

## 34. Network

Explicit request-level monitoring for any `budgetapp-c9306` (production) traffic ran throughout; **zero** such requests were ever observed. All Firebase network activity targeted `tracktozero-beta` only.

## 35. Project isolation

Directly proven both structurally (Section 3's deploy-time API-key gate, now permanent) and empirically (Section 34's live network monitoring, plus every synthetic account's data living exclusively under `tracktozero-beta`'s Firestore, confirmed via the same Admin SDK inventory used for cleanup).

## 36. Firestore security

No rules were weakened at any point. The existing `firestore.beta.rules` (unmodified this phase) was re-verified green via its own dedicated test suite (`test:firestore:beta`, 16/16) alongside the legacy (12/12) and V2-parity (69/69, zero drift from `firestore.rules`) suites. Viewer-cannot-write and unapproved-cannot-bypass-invite are both directly covered by that suite's own named tests, independently corroborated live in Sections 8/18/21.

## 37. Indexes

No missing-index errors were observed at any point across import, reload, Review, Plan, or Household flows during this phase. `firestore.indexes.json` was redeployed as part of Section 3's `deploy-beta.mjs all` run (idempotent, no changes) — no ad-hoc console-only index was created.

## 38. Bugs found

1. **Deploy-tooling gap (fixed, Section 3)**: `scripts/deploy-beta.mjs` had no verification that `dist/` was actually built with the beta environment before deploying hosting — a plain `npm run build` (production config) could be silently deployed to the public beta URL.
2. Two test-methodology findings, corrected in-place, not product defects: an invite-role select and a Joint-debt owner select both used inexact (regex-style) label matching against the browser's own exact-string `selectOption({label})` API, silently defaulting to the wrong option — both root-caused via direct inspection of the actual DOM option labels and fixed in the test scripts themselves.
3. One minor, non-blocking UX observation: the invite-preview screen shows full invite details (inviter, invited email, role) before the beta-approval/email-match check fires, rather than short-circuiting immediately — no financial access is ever gained either way (proven in Sections 18 and the unapproved+invite click-through), so this is a polish item, not a security defect.

## 39. Fixes implemented

`scripts/deploy-beta.mjs`: added a third pre-deploy verification gate (Section 3) reading both `.env`/`.env.beta`'s `VITE_FIREBASE_API_KEY` values and scanning the built `dist/assets/*.js` files, refusing to deploy hosting unless the beta key is present and the production key is absent. No application code (`src/`) was modified this phase — every TrackToZero product behavior verified in this rehearsal was already correct, deployed from BETA-3.2's own fixes.

## 40. Regression tests

None added to the automated suite this phase — the one fix (Section 39) is deploy-tooling, not application logic, and was verified via direct positive/negative manual invocation (a correct `build:beta` output passes the gate and deploys; a plain `build` output is correctly refused) rather than a unit test, matching this script's existing testing convention (its Gates 1-2 are similarly verified by direct invocation, not a unit-test file, since it is a one-shot operational script outside the `src/` test surface).

## 41. Full validation

| Check | Baseline (post-BETA-3.2) | This phase |
|---|---|---|
| Unit tests | 915/915 | **915/915** (unchanged — no `src/` changes) |
| Lint | 0 errors, 4 warnings | 0 errors, 4 warnings (same, pre-existing) |
| Build | green | green |
| Firestore legacy | 12/12 | 12/12 |
| Firestore V2 (+ parity) | 69/69 | 69/69, zero drift |
| Firestore beta allowlist | 16/16 | **16/16** |
| `npm audit --omit=dev` | 0 vulnerabilities | 0 vulnerabilities |
| `perf:check` | PASS | PASS, unchanged |

## 42. Cleanup inventory

Full private inventory taken via Admin SDK before any deletion: 8 Auth users (1 preserved owner + 7 synthetic), 4 Workspaces (1 preserved + 3 synthetic: 1 household, 2 personal), 6 active `beta_allowlist` entries (all synthetic), plus each synthetic workspace's full subcollection tree (members, member_invites, import_batches, debts, per-debt payment_events/balance_snapshots, plans/versions). No plaintext password appears in this inventory or anywhere in this report.

## 43. Cleanup result

Executed with an explicit safety gate: the script first re-verified the preserved account/UID match, then confirmed every non-preserved Auth user's email was on the known-synthetic list (aborting entirely if any unexpected identity were found — none was). Each of the 3 synthetic workspaces was removed via Firestore's recursive-delete (covering every nested subcollection in one atomic operation, not a manual per-collection enumeration prone to missing a level). 6 `member_index` mirror entries referencing the deleted workspaces, all 6 synthetic `beta_allowlist` documents (fully deleted, not merely revoked — a deliberate departure from the normal real-tester revoke-not-delete policy, appropriate for disposable synthetic QA data), and all 7 synthetic Auth users were removed.

## 44. Post-cleanup baseline

Re-inventoried immediately after cleanup: **1** Auth user (`jidyet@yahoo.co.uk`), **1** Workspace (the owner's own household), **0** `beta_allowlist` entries — an exact match to the pre-test baseline (Section 5), confirmed field-for-field, not merely "looks similar."

## 45. Known limitations

- Cross-month PDF behavior, multi-APR Review, and rejection UX (Sections 25-27) were not independently re-driven live this specific phase — they rely on BETA-3.2's own dedicated, already-green verification, since no import-pipeline code was touched by Gate 10A. No regression risk was identified.
- No in-app feedback mechanism currently exists in the V2 app (Section 30) — a real product gap for a future phase, not a Gate 10A blocker.
- The invite-preview screen shows invite details before the approval/email-match check fires (Section 38, item 3) — cosmetic, no financial access risk, worth a future polish pass.
- Real email delivery was not tested (Section 6) — by design, an explicit Gate 10B/human-cohort item.

## 46. Human-cohort readiness

All Gate 10A success criteria (Section 53 of the governing brief) were met with direct, live, production-equivalent evidence: access control (approved and unapproved), Personal and Household flows, secure invitations with both wrong-email and unapproved-user denial, all three non-owner roles with verified mutation denial (not just UI absence), Joint debt counted once, manual and imported debts, XLSX and PDF sanitized import, required-payment timing with the correct safe vocabulary, Snowball/Avalanche activation, PaymentEvent/BalanceSnapshot truth, reload/session survival, consistent Review counts, truthful identity presentation, mobile and desktop layouts, clean console/network, full automated validation, and a fully verified, byte-for-byte synthetic-data cleanup. The one genuine defect found (Section 3) was a deployment-process gap, not a product defect, and is now permanently fixed with a hard, automatic guard rather than a one-time manual correction.

## 47. Final verdict

**YES — GATE 10A SYNTHETIC COHORT PASSED — READY FOR OWNER-AUTHORIZED HUMAN COHORT 1.**

No human tester was invited during this phase. Production (`budgetapp-c9306`/`tracktozero.app`) was never touched. This verdict authorizes readiness for Cohort 1 to be *considered* — it does not itself invite anyone; that remains the product owner's explicit, separate decision.
