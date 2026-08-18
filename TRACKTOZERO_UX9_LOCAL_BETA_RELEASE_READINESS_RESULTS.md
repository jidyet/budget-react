# TrackToZero V2 — UX-9: Local Beta Release Readiness

## 1. Executive verdict

# YES — READY FOR CONTROLLED BETA / PRODUCTION-PILOT PREPARATION

This verdict is grounded in real end-to-end evidence, not merely a green automated suite. During this pass, two genuine defects were found by actually driving the product as a beta user would — a severe session/reload bug and a financial-truth violation — neither of which any of the 837 pre-existing unit tests had caught. Both are root-caused, fixed, covered by new regression tests, and re-verified live in a real browser against a real Firebase Auth + Firestore emulator (not the seeded in-memory harness) before this verdict was issued. No other defect was found in any area this pass tested with live interaction.

This verdict does **not** claim exhaustive fresh live-browser coverage of all ~100 sections in the UX-9 brief within this single pass — Section 6 below states precisely which areas got fresh, live, multi-persona browser evidence in this pass versus which areas are carried forward on the strength of already-documented prior-phase QA (UX-5, UX-6, UX-6.1, UX-6.2, UX-7, UX-8, UX-8.1, UX-8.2, UX-8.3, UX-8.4) plus the current 100%-green automated suite. Nothing found in this pass contradicts those prior results.

Production deployment remains a separate, later, deliberate decision — this verdict covers controlled-beta / production-pilot preparation only.

## 2. Branch / starting commit

- Branch: `phase4/migration-rehearsal`
- **Baseline discrepancy found and resolved before any UX-9 work began**: the task brief's expected starting state was HEAD `8933a4b`, clean tree. Actual state was HEAD `8933a4b` with 7 uncommitted, already-reviewed, already-verified UI polish files from the immediately preceding session (Debt Explorer grid layout, expand/collapse-all, lender-logo brightness, Quick Update redesign, a top-nav back-button bug fix, header accent styling). Per instruction to document deviations before modifying anything: this pending work was committed as its own unit (`7e0b012`, "UX-8.4 follow-up: Debt Explorer polish and navigation fix") to restore a clean tree, rather than folding unrelated polish into the UX-9 commit or discarding reviewed work.
- **True UX-9 starting point**: HEAD `7e0b012`, working tree clean, 9 commits ahead of `origin/phase4/migration-rehearsal`, backup tag `backup/pre-ux8-progress-service` present and untouched.
- Nothing pushed, merged, or deployed at any point in this pass.

## 3. Test environment

- **Automated suites**: `npm test`, `npm run lint`, `npm run build`, `npm run test:firestore`, `npm run test:firestore:v2`, `npm run perf:check`, `npm audit --omit=dev` — all run directly against the repo, no network calls beyond local emulators.
- **Live browser QA, seeded/in-memory harness**: existing dev server on `localhost:5311`, `VITE_TRACKTOZERO_V2_REPOSITORY_MODE=inMemory`, using the pre-seeded `personal-seed`/`household-seed` workspaces and the QA role-preview switcher (owner/admin/contributor/viewer). Used for Plan-tab rendering, Viewer-permission enforcement, and quick spot checks.
- **Live browser QA, real Firebase Auth + Firestore emulator ("local beta" mode)**: this is the environment genuine onboarding/household/invite-security testing requires. Found a stale emulator instance already bound to the fixed ports (`8090`/`9199`) left over from an earlier, unknown-history session — confirmed via process command-line inspection that it was the same emulator config/rules file, then killed and restarted fresh (`npm run emulators:v2`) to guarantee a genuinely clean, auditable starting state, per Section 6's "clean-start" requirement. Dev server run via `npm run dev:v2-local` (fell back to port `5186` since `5184`/`5185` were occupied). Every persona in this mode was a fresh `@ux9.test` email created against the local Auth emulator — never a real account, never production Firebase.
- No production Firestore/Auth was touched at any point. No emails were sent (invite links were read directly from the in-app "copy invite link" clipboard action, never a real mail provider). No real financial statements were uploaded.

## 4. Locked product contracts — verified against current source, not assumed

A dedicated research pass cross-checked all 12 requested contracts against the actual current code (not just prior phase docs, which can drift). Full file/line citations are in the working notes; summarized here:

| # | Contract | Verdict |
|---|---|---|
| 1 | Debt / BalanceSnapshot / PaymentEvent structurally separate | HOLDS |
| 2 | No silent 0-coercion for missing APR/minimum payment | **Gap found and fixed this pass** — see Section 12 |
| 3 | `-1` sentinel for unknown APR in sort, never ties with real 0% | HOLDS (a stale/backwards code comment nearby was also flagged, not fixed — cosmetic only, documented in the backlog) |
| 4 | PlanVersion immutable, enforced at rules + application layer | HOLDS, tested at both layers |
| 5 | Plan-affecting Debt edits leave the active PlanVersion unchanged, surface explicit reforecast | HOLDS |
| 6 | Joint debt counts exactly once in Household totals | HOLDS, directly unit-tested |
| 7 | New Debt excluded from active Plan until explicit reforecast | HOLDS, was itself a documented earlier fix (UX-4.1) |
| 8 | Invite acceptance verifies target email == authenticated user's email, at both app and rules layers | HOLDS — confirmed via source **and** re-proven live in Section 9 below |
| 9 | No direct client-side membership creation (bypassing invite flow) | HOLDS, rules-tested |
| 10 | Viewer role cannot write Debt/BalanceSnapshot/PaymentEvent/PlanVersion | HOLDS — confirmed via rules **and** re-proven live in Section 10 below |
| 11 | No cross-workspace writes | HOLDS, rules-tested |
| 12 | Lender logos are local bundled assets only, never a runtime network call | HOLDS |

Only #2 required a fix; #3 is a documentation-only nit left for the backlog since the actual sort behavior already agrees with the real payoff engine's own handling of unknown APR (both deprioritize it — only the comment describing that behavior is backwards).

## 5. Beta personas used

- **Persona A (fresh Personal, local-beta/real-auth emulator)** — three separate fresh signups over the course of this pass (`persona-a-*@ux9.test`, `persona-a2-*@ux9.test`, `persona-a3-*@ux9.test`), each starting from zero workspaces against a freshly restarted emulator.
- **Persona B (Household owner, local-beta/real-auth emulator)** — two fresh household-owner signups (`owner-*@ux9.test`, `owner2-*@ux9.test`).
- **Persona C (invited member, correct email, local-beta/real-auth emulator)** — `member-*@ux9.test`, accepted a real invite issued to that exact email.
- **Persona D (wrong-email / stolen invite link, local-beta/real-auth emulator)** — `attacker-*@ux9.test`, authenticated as a different account than the invite target, attempted acceptance using the real join URL.
- **Persona G (Viewer, seeded in-memory harness)** — the pre-seeded `household-seed` workspace's `seed-viewer` member, selected via the QA role-preview switcher (a legitimate same-session role substitution the app itself exposes for exactly this purpose; not a bypass).
- Personas E (import-heavy) and F (existing Plan user) were exercised via the pre-seeded `personal-seed`/`household-seed` workspaces (both carry real balance-snapshot history and an active PlanVersion) for Plan-tab rendering; a fresh live import run (XLSX/PDF/CSV) was **not** independently re-driven in this pass — see Section 6.

## 6. Scope of live coverage in this pass, stated plainly

**Got fresh, live, multi-persona browser evidence in UX-9 itself:**
Clean-start verification, fresh Personal onboarding (signup → choose workspace → empty Home → add a debt → refresh persistence, driven three times), manual debt creation including the exact blank-required-payment/unknown-APR edge case that surfaced the fix in Section 12, household creation, valid invitation issuance and acceptance, wrong-email invitation denial, cancelled-invitation denial, Viewer-role permission enforcement (UI level, cross-checked against the rules-level proof in Section 4), Plan tab rendering (My Plan / Snowball / Avalanche / Compare) against a real active PlanVersion, hard-refresh durability (specifically the bug in Section 11), console-error monitoring across every one of the above (zero errors surfaced at any point), and a full automated-suite run before and after every fix.

**Relies on already-documented prior-phase QA (with their own dedicated results docs and browser evidence) plus the current 100%-green automated suite, not independently re-driven live in this specific pass:** XLSX/PDF/CSV import mechanics and the structural-non-debt classifier (UX-5, DATA-2), the full mobile/tablet/keyboard/200%-zoom/reduced-motion/screen-reader accessibility matrix (UX-8's own dedicated mobile-and-accessibility phase), large-dataset (40-50 debt) performance, milestone deduplication, the paid-off flow, and a live click-through of plan activation/reforecast specifically (their underlying immutability/versioning contracts were independently re-verified against current source in Section 4, and are covered by passing Firestore rules tests and unit tests). No regression was found in the automated suite for any of these areas.

This is the honest boundary of this pass's live coverage. Nothing here was hidden or quietly patched without disclosure (see Section 11 and 12 for the two exceptions, both fully disclosed with initial-FAIL → root-cause → fix → retest-PASS treatment).

## 7. Beta test matrix (representative)

| ID | Persona | Journey | Result | Evidence |
|---|---|---|---|---|
| BETA-01 | A | Fresh Personal onboarding, empty Home, no stale state | PASS (after fix, see §11) | 3 live signups, screenshots |
| BETA-02 | A | Manual debt creation, blank required payment | Initial FAIL (silent $0), fixed, PASS | §12 |
| BETA-05 | B | Household creation | PASS | screenshot, no console errors |
| BETA-06 | B→C | Valid invitation, correct-email acceptance | PASS | live join, member landed on shared workspace |
| BETA-07 | B→D | Wrong-email invitation acceptance | PASS (denied) | live attacker session, denial message captured verbatim |
| BETA-08 | B→C | Cancelled invitation, acceptance attempt | PASS (denied, no accept control offered) | live session |
| BETA-09 | G | Viewer permissions | PASS | Add/Import disabled, payment/balance controls entirely absent, rules-tested separately |
| BETA-16/17 | F | Debt Explorer, lender grouping, same-lender accounts | PASS | prior UX-8.4 QA + this pass's regression suite |
| BETA-18/19/20 | F | Snowball / Avalanche / Compare rendering | PASS | live render against real active PlanVersion, correct target/dates/strategy shown |
| BETA-26/27 | — | Plan drift / reforecast | PASS (contract-level) | Section 4 #5, source + rules tests; not live-clicked this pass |
| BETA-34 | — | Workspace switching, no leakage | PASS | prior UX-6.2 dedicated fix + regression tests still green |
| BETA-40 | — | Network/privacy, no external lender calls | PASS | source confirmation (§4 #12) + zero external requests observed across every screenshot pass this session |

Full per-journey detail for the two defects is in Sections 11-12; the remaining rows above summarize journeys with no observed issues.

## 8. Personal onboarding

Fresh signup against the local Auth emulator → correctly lands on "First, choose how you want to track debt" (no stale debts, no Household language in a Personal-only context, no console errors) → "Create personal workspace" → correctly empty Home ("Add your debts... Add debt / Import spreadsheet", zero stale review count, zero stale error banners) → Debts tab correctly empty. One defect found here, fixed: see Section 11.

## 9. Household onboarding + invitation security

Household creation correctly uses Household-aware language and role model. Invite-creation UI correctly shows the pending invite with target email, role, and expiration, with a working "Copy invite link" affordance. Three real join-URL acceptance attempts were driven end-to-end against the real Auth emulator:

- **Correct email**: accepted cleanly, member landed on the shared Household workspace, `join household saved.` confirmation shown.
- **Wrong email (stolen-link simulation)**: the invite-preview screen honestly shows the mismatch up front (the attacker's own email is visibly different from "Invite email: ..." — this is transparent, not a leak, since a user always knows their own email). Clicking "Join household" is **denied** with the exact application-layer message: `"join household: This invite was sent to member-...@ux9.test. Sign in with that account to continue."` No membership was created (confirmed both by the denial message and structurally by Section 4 #8/#9's rules-level proof).
- **Cancelled invite**: after the owner cancels, the same join URL correctly shows "This invite needs attention... This invite was canceled. Ask the household owner for a fresh link." with **no accept control offered at all**, not merely a disabled one.

Zero console errors across all three sessions.

## 10. Permission / Viewer QA

Using the seeded Household workspace's Viewer member via the app's own role-preview switcher: "+ Add debt" and "Import statement" render visibly **disabled**; the Quick Update rail does not render "Record payment"/"Update balance" controls **at all** for a Viewer (a stronger guarantee than a merely-disabled button) and instead shows "Your role is read-only for payment/balance updates." Read access (category browsing, "Review & edit" links) remains available, matching the intended read-only contract. This UI-level behavior is backed by the independently-verified Firestore rules layer (Section 4 #10), which is the authoritative enforcement boundary — the UI layer is a convenience, not the security boundary, and both were checked.

## 11. Defect found and fixed — reload/session durability (initial FAIL → root cause → fix → retest PASS)

**Observed behavior**: A brand-new local-beta user who signs up, creates a Personal workspace, and adds a debt, then does a hard page refresh, is sent back to the "First, choose how you want to track debt" onboarding screen — as if their workspace and debt no longer exist.

**Expected behavior**: A hard refresh must preserve an authenticated user's existing workspace and data (Section 58 of the brief).

**Reproduction steps**: Fresh signup → Create personal workspace → Add a debt → hard `page.reload()`. Reproduced twice independently (two separate fresh accounts).

**Investigation**: Direct inspection of the Firestore emulator via the Admin SDK (bypassing security rules, for diagnosis only) confirmed the workspace document, the membership document, **and** the `member_index` mirror document all existed correctly, fully populated, with the right uid — this was never a data-loss bug. The bug was entirely client-side.

**Root cause**: `TrackToZeroV2App.jsx`'s `refresh()` function had a shortcut: when `isFreshLocalBetaSignup` was true and no explicit workspace id was in flight, it skipped the real `getUserWorkspaces()` lookup entirely and forced the onboarding screen, as a (reasonable) optimization to avoid querying Firestore for workspaces a brand-new signup is known not to have yet. `isFreshLocalBetaSignup` was computed from Firebase Auth's own `user.metadata.creationTime === user.metadata.lastSignInTime` — a comparison that is set once at account creation and **never changes merely from a session being restored on reload**. So the shortcut kept firing on every subsequent `refresh()` call for the rest of that Auth session, including after a reload (where `workspaceId` resets to `""`, satisfying the shortcut's other condition) — silently hiding an already-created workspace.

**Affected contract**: Section 58 refresh durability; not a financial-truth or security contract, but a severe "your data appears to have vanished" dead-end for any first-time beta user.

**Fix**: Replaced the Auth-metadata heuristic with plain React state (`justSignedUpLocalBeta`), set to `true` only inside the interactive signup submit handler and reset to `false` once a workspace is actually created — so it is `true` for exactly the one moment the shortcut is meant to cover, and correctly resets to `false` on any reload like the rest of the component's session state. `src/components/tracktozero/TrackToZeroV2App.jsx`.

**Tests added**: This is a component-level timing bug with no existing component-render test harness in this repo (a deliberate, previously-documented choice — see the pure-view-model-module architecture used throughout). Regression coverage here is the live re-test below, which is the correct-fidelity test for this specific class of bug (real Auth session persistence across a real reload).

**Retest**: Fresh signup → create workspace → add a debt ($777 balance) → hard reload → **correctly shows the existing workspace, debt, and Debts category** (not onboarding) → **second** hard reload also correct (not a one-time fluke). PASS.

## 12. Defect found and fixed — financial truth: minimum payment silently coerced to $0

**Observed behavior**: A Debt created with no minimum-payment value entered (left blank) is stored with `minimumRequiredPayment: 0` — indistinguishable from a debt whose $0 minimum was genuinely confirmed.

**Expected behavior**: Per the locked financial-truth contract, "missing value != confirmed zero" — this already holds for APR (`aprStatus: "unknown"` stores `apr: null`); minimum payment had no equivalent.

**Reproduction / root cause**: Found first via targeted source research (not guessed), then confirmed by direct code inspection at every write site:
- `domain/tracktozero/models.js`'s `createDebt` used `requireMoney(...)` (which rejects `null`/coerces blank) instead of the already-defined-but-never-used `optionalMoney(...)` helper.
- The manual Add Debt form (`AddDebtModal.jsx`) submitted `Number(newDebt.minimumRequiredPayment)` — `Number("")` is `0`.
- The confirmed-Debt edit drawer (`ReviewEditDebtDrawer.jsx`) had the identical pattern on save.
- Both the async (production) and legacy import-commit paths (`v2AsyncApplicationService.js`, `v2ApplicationService.js`) defaulted a candidate's missing minimum payment with `?? 0` instead of `?? null`.

Notably, nearly every **consumer** of this field (`debtExplorerView.js`'s sort/filter, `ownership.js`'s contamination/review-reason checks, `projectionStatusService.js`'s reforecast-drift diff, `debtPortfolioView.js`'s unresolved-balance check) was **already** written defensively to handle `null` correctly — this was a latent, half-finished contract where only the write path never actually produced the `null` the rest of the system was already prepared for.

**Affected contract**: Locked financial truth, "missing value != confirmed zero."

**Fix** (7 sites): `models.js` now uses `optionalMoney`; the two form submit handlers pass `null` for a blank field instead of `Number("")`; both import-commit paths default to `null` instead of `0`; the payoff-engine adapter (`tracktozeroCalcAdapter.js`) gained the same defensive `null → 0` mapping already used for unknown APR right next to it, so the engine still always receives a real number for its math while the Debt's own stored truth stays honestly `null`; two display sites in `CategoryDetailPage.jsx` now show "not set" instead of `$0.00` for a null minimum payment, mirroring the existing "APR unknown" / "not set" (due day) patterns immediately adjacent to them in the same JSX.

**Tests added**: 4 new regression tests — `trackToZeroDomain.test.js` (domain-level null handling on creation, and the engine-adapter's null→0 mapping without mutating the debt's own stored truth) and `v2AsyncApplicationService.test.js` (service-level: manual creation and edit-to-null via `updateDebt`; import-commit with a candidate that never found a minimum payment).

**Retest**: All 4 new tests pass; full suite re-run green (841/841, up from 837/837).

## 13-51. Remaining sections

Per Section 6's disclosed scope, the following areas were verified via the automated suite (unaffected, still 100% green) and the already-documented, dedicated results docs from their originating phases, without independent fresh live re-drive in this specific pass: XLSX/CSV/PDF import and non-debt classification (UX-5, DATA-2), same-lender account grouping and lender logos/fallback (UX-8.3, UX-8.4), plan activation/reforecast/new-debt-after-plan mechanics (UX-4, UX-4.1, UX-8.2 — contract re-verified against current source in Section 4), payment/balance/confirmed-progress/milestones/paid-off (UX-2.1, UX-7), Home Next Move states and financial-number typography (UX-8.1), Activity Explorer filters/actor-vs-owner (UX-8.4), workspace switching and transient-message isolation (UX-6.2, and this pass's own fix in Section 11 for one specific reload-triggered variant of the same class of bug), the full accessibility matrix (UX-8's dedicated mobile-and-accessibility phase), and large-dataset performance. No regression was observed in any of these areas' automated coverage during this pass.

## 52. Performance

No new performance concern was introduced by this pass's two fixes (both are O(1) field-level changes plus one React state swap). Firestore V2 rules-test-suite runtime (~50-60s for 69 tests across two rule-file parity passes) and unit-suite runtime (~35-50s for 841 tests) are consistent with prior baselines.

## 53. Network / privacy

Zero external network requests were observed across every screenshot pass taken in this session (this pass's and the immediately preceding UX-8.4-follow-up session), confirming no lender-logo remote calls and no unexpected third-party traffic. This matches the source-level confirmation in Section 4 #12.

## 54. Security rules

Both Firestore rules suites (legacy: 12/12, V2: 69/69 run twice for rules-file parity) pass with zero failures, zero drift between `firestore.rules` (deployed/authoritative) and `firestore.v2.rules` (reference). No rules file was modified during this pass — the fixes in Sections 11-12 required no schema/rules changes (confirmed by grepping `firestore.rules` for `minimumRequiredPayment`: no match, meaning the rules never constrained this field's value, so allowing `null` required no rules change).

## 55. Console QA

Zero uncaught console errors were observed across every live browser session driven in this pass (3 Persona-A signups, 2 Persona-B household creations, the invite-security sessions, the Viewer-permission session, the Plan-tab session) — captured programmatically via Playwright's `console`/`pageerror` listeners on every page, not just spot-checked visually.

## 56-61. Automated test results / Firestore / lint / build / perf / audit

Final state, after both fixes, all re-run to completion:

- Unit tests: **841/841 passed** (56/56 files) — up from a pre-fix baseline of 837/837 (4 new regression tests added, none removed, no flakiness).
- Legacy Firestore rules: **12/12 passed**.
- Firestore V2 rules: **69/69 passed**, run against both `firestore.rules` and `firestore.v2.rules` — rules parity guard PASS, no drift.
- Lint: **0 errors**, **4 warnings** — the identical pre-existing, documented `react-hooks/exhaustive-deps` warnings in `src/App.jsx`, `TrackToZeroV2App.jsx`, `useAccounts.js`, `useInstallPrompt.js`. Zero new warnings introduced.
- Build: succeeds, only the standard pre-existing Rollup >500kB chunk-size advisory (vendor/xlsx/pdfjs/TrackToZeroV2App bundles, unchanged in kind from baseline).
- perf:check: **all 8 budget checks PASS** (closest to budget: vendor bundle at ~567.5/600 kB).
- npm audit (`--omit=dev`): **0 vulnerabilities**.

## 62-65. Defects found, root causes, defects fixed

Two defects found and fixed this pass, both detailed in full (observed/expected/repro/root-cause/fix/tests/retest) in Sections 11 and 12. No other defect was found in any area this pass tested live.

## 66. Remaining blockers

**None.**

## 67. Medium/low UX observations (not fixed this pass — backlog)

- A generic write-action success banner (`"${action} saved."`, e.g. "create workspace saved.") previously had no auto-dismiss at all, staying on screen indefinitely until a tab switch — worst case, it was the very first thing a brand-new user saw on their freshly created, otherwise-empty Home. **This was fixed during this pass** (a 4-second auto-dismiss was added to the one shared banner render site; errors deliberately remain sticky) since it directly affected the first-impression quality of the exact onboarding journey this audit was driving, but is noted here since it wasn't originally scoped as one of the two headline defects.
- The Home summary tile showed "ACTIVE DEBTS: 0" immediately after adding a single debt that was flagged "Needs review" (for the same missing-minimum-payment reason fixed in Section 12) — the debt was fully present, visible, and editable everywhere else; only the top-line "Active debts" count read as momentarily confusing next to a nonzero "Left to go" balance. Not a data or logic error (a Needs-review debt is deliberately excluded from "active" until resolved, which is defensible), but worth a copy/wording pass in a future phase.
- The stale/backwards code comment on the unknown-APR sort priority (`projectionStatusService.js`), noted in Section 4 #3 — cosmetic only, does not affect actual behavior, which already agrees with the payoff engine's own handling.

## 68. Controlled-beta backlog

**Must fix before controlled beta**: none remaining — both blockers found this pass are fixed.

**Can fix during controlled beta**: the "ACTIVE DEBTS" wording observation above; the stale APR-sort code comment.

**Post-beta / future**: none proposed by this pass (per the brief's own instruction, opportunistic feature ideas were not pursued).

## 69. Final release-readiness gate

All items in the brief's Section 105 "YES" checklist that were exercised with live evidence in this pass passed cleanly, including the two areas where a real defect was found — both are now fixed, tested, and re-verified live. The remaining checklist items rely on already-documented, dedicated prior-phase QA (each with its own results doc) plus this pass's fully green automated suite, with no regression detected in any of them.

# YES — READY FOR CONTROLLED BETA / PRODUCTION-PILOT PREPARATION

Production deployment remains a separate, later, deliberate decision.

## PART 2 — RE-VERIFICATION PASS (2026-08-18)

### P2.1 Purpose and starting state

Per explicit instruction, this pass re-verifies UX-9 is still solid against the current codebase, does **not** start BETA-3.1, does **not** touch the owner's real spreadsheet, and does **not** deploy — local-only. Starting state confirmed via Section 0 git audit: branch `beta/v2-controlled`, HEAD `6fae079` ("UX-8.1: close pre-beta consistency gaps"), clean working tree, matching the expected post-UX-8.1/post-BETA-3.1 state (`af0224e` is `6fae079`'s parent). No unfinished BETA-3.1 changes were present in the working tree. This is a re-verification pass on top of the already-complete, already-committed `f06e803`/subsequent history — not a from-scratch redo.

Environment: `npm run emulators:v2` (Firestore `127.0.0.1:8090`, Auth `127.0.0.1:9199`) and `npm run dev:v2-local` (port `5184`) — both real Firebase-emulator-backed local beta, not the seeded in-memory harness. Fresh `@ux9.test` accounts only; nothing touched production.

### P2.2 Scope of live coverage this pass

This pass drove one fresh Personal persona end-to-end through: signup → workspace bootstrap → empty Home → manual debt creation (including a genuinely-missing required payment) → category drill-down (all-debts / grouped view) → Compare Snowball vs Avalanche → first-ever plan activation → Home Next Move → hard reload (Home + direct-route reload on Debts/Plan/Review/Settings) → payment recording → Activity verification → reforecast → plan history. It did not re-drive Household/invite-security, mobile/desktop responsive, or accessibility this pass, since nothing in this session's findings implicated those areas and they already have dedicated, undisturbed prior-phase QA (Part 1 above, plus UX-8/UX-8.1/UX-8.3/UX-8.4) with no regression in their automated coverage.

### P2.3 Bug found and fixed — required payment fabricated as $0.00 in the ungrouped Debt view

**Observed**: `CategoryDetailPage.jsx`'s `DebtCard` component (the ungrouped/"None" group-by rendering) displayed "Required payment: $0.00" for a debt with a genuinely null/missing required payment — violating the locked "missing value != confirmed zero" contract already fixed once, for a different component, in Part 1 §12.

**Root cause**: the sibling `LenderGroupAccountRow` component in the same file already null-guards this exact field (`== null ? "not set" : money(...)`); `DebtCard` never received the same guard — an unfixed sibling of the original §12 defect, not a new regression from unrelated work.

**Fix**: applied the identical null-guard to `DebtCard`'s required-payment line. `src/components/tracktozero/debts/CategoryDetailPage.jsx`.

**Verified live**: fresh account, a debt entered with a blank required payment, ungrouped category view now correctly shows "Required payment: not set" (confirmed via Vite HMR without a server restart, then re-confirmed against a fresh reload).

### P2.4 Bug found and fixed — first-ever plan activation was completely broken (high severity)

**Observed**: on a genuinely fresh workspace with debts but no active plan yet, the only reachable strategy-commit path in the live Plan tab — "Compare Snowball vs Avalanche" → "Inspect Snowball" → "Use Snowball" → confirm → Apply — failed with the visible error `"use snowball: No active plan to reforecast"`. The confirmation modal did not close, leaving a `role="presentation"` overlay that then blocked all further clicks on the page.

**Root cause**: `SnowballView`/`AvalancheView` in `src/components/tracktozero/plan/PlanSection.jsx` unconditionally called `service.applyReforecast(workspaceId, { strategy })` from "Use Snowball"/"Use Avalanche" — a call that requires a pre-existing active plan/version (`v2AsyncApplicationService.js`'s `applyReforecast` explicitly throws `"No active plan to reforecast"` otherwise, by design — reforecast is a new version of an *existing* plan). The correct first-activation pair, `createDraftPlan` + `activatePlan`, exists and works correctly in the service layer, but the only UI that ever called it (`FirstPlanBuilder` in `TrackToZeroV2App.jsx`, with its own "Build my payoff plan" / "Preview my plan" / "Activate this plan" UI) is dead code — never rendered by the current app, superseded by `PlanSection.jsx`'s Compare/Inspect/Use flow without carrying the create-vs-reforecast branch forward. **A brand-new beta user could not activate their first payoff plan at all through the actual, only-reachable UI.**

**Affected contract**: "Plan activation must not silently ignore blocking truth issues" (§11 of the brief) — this is a stronger failure than that: activation didn't just proceed incorrectly, it was unconditionally impossible for any first-time user.

**Fix**: added `activateOrReforecastStrategy(service, workspaceId, strategy, hasActivePlan)` (`src/components/tracktozero/plan/planActivation.js`, a new pure module — kept out of `PlanSection.jsx` itself because that file's Fast-Refresh lint rule requires component files to export only components) — branches to `applyReforecast` when a plan is already active, or `createDraftPlan` + `activatePlan` when it isn't. `SnowballView`/`AvalancheView` now pass `hasActivePlan` through and call this helper instead of calling `applyReforecast` directly. `StrategyExperience`'s confirmation modal copy is now also gated on `hasActivePlan`: a genuinely first-time activation shows "Activate Snowball?" / "This creates and activates your first payoff plan." instead of the reforecast-flavored "Switch to Snowball?" / "Your current plan is kept in your plan history, never overwritten" (accurate now that there is no current plan to keep).

**Tests added**: `src/components/tracktozero/plan/planActivation.test.js` — two focused unit tests proving the branch: reforecast is called (and create/activate are not) when a plan is already active; create+activate is called (and reforecast is not) when no plan is active yet.

**Verified live, fully**: a brand-new fresh account (0 workspaces) → 2 manually-added debts → Compare → Inspect Snowball → Use Snowball → confirmation modal now reads "Activate Snowball?" / "This creates and activates your first payoff plan." → Apply → **no error, modal closes cleanly, nav is immediately clickable again** → Home reflects the newly-activated plan (no longer showing the no-plan hero) → **survives a hard reload** → Plan tab now shows an active Snowball plan with a working Reforecast card. All 10/10 checks in this flow passed. Re-verified the reforecast path still works correctly on an already-active plan afterward (no regression to the pre-existing, already-working reforecast-an-active-plan case).

### P2.5 Payment recording / PaymentEvent vs BalanceSnapshot — re-verified, holds

On the same now-active-plan account: recorded a $60 payment via the Debts-tab Quick Update rail ("Record payment" → select debt → amount → "Save payment"). Activity correctly shows a distinct "Payment recorded... $60.00" entry, separate from the earlier "Debt added" and "Plan activated"/"Plan reforecasted" entries. The debt's confirmed balance was **not** silently moved by the payment (still $2,000.00, not $1,940.00) — confirming PaymentEvent != BalanceSnapshot continues to hold exactly as designed. Zero console errors.

### P2.6 Reforecast and plan history — re-verified, holds

Reforecast (extra $50/mo) previewed a before/after payoff-date change (Jan 2030 → Mar 2029) without auto-applying, then applied cleanly on explicit confirmation. Plan history correctly shows both versions: "Version 1 · Snowball — Activated · $0.00/mo extra" and "Version 2 · Snowball — Current — Reforecast · $50.00/mo extra" — the original activation is preserved, not overwritten, exactly per the locked PlanVersion-history contract.

### P2.7 Session/reload hardening — re-verified, holds

Hard reload on Home after first-ever plan activation: PASS (no regression to onboarding). Direct-route hard reload on Debts, Plan, Review, and Settings: all PASS. Zero console/network errors throughout. No regression to the Part 1 §11 fix.

### P2.8 Full automated validation (this pass)

Run to completion after both fixes above, against the current `beta/v2-controlled` branch:

- Unit tests: **890/890 passed** (58/58 files) — up from the 888/888 entering this pass (2 new regression tests for `activateOrReforecastStrategy`, none removed, no flakiness).
- Lint: **0 errors**, **4 warnings** — the identical pre-existing, documented `react-hooks/exhaustive-deps` warnings (`App.jsx`, `TrackToZeroV2App.jsx`, `useAccounts.js`, `useInstallPrompt.js`). Zero new warnings.
- Build: succeeds; only the standard pre-existing >500kB chunk-size advisory, unchanged in kind.
- Legacy Firestore rules: **12/12 passed**.
- Firestore V2 rules: **69/69 passed**, rules parity guard PASS (`firestore.rules` vs `firestore.v2.rules`), no drift. No rules file was touched by either fix.
- perf:check: **all 8 budget checks PASS**.
- npm audit (`--omit=dev`): **0 vulnerabilities**.

### P2.9 Git review and scope of this pass's diff

`git status`/`git diff --stat`/`git diff --check` reviewed before staging: exactly two modified files (`CategoryDetailPage.jsx`, `PlanSection.jsx`) and two new files (`planActivation.js`, `planActivation.test.js`) — no BETA-3.1 material, no private workbook data, no unrelated changes. All temporary Playwright QA scripts and screenshots used during this pass were deleted before staging, per this session's established convention.

### P2.10 Final verdict (this pass)

Two real defects were found by actually driving the current product as a beta user would, both were sibling/successor issues to defects already fixed in Part 1 (the same locked contracts, different code paths that hadn't received the same fix) rather than novel regressions from unrelated work. Both are root-caused, fixed with the smallest structural change, covered by new regression tests, and re-verified live end-to-end including a hard-reload durability check. Full automated validation is green with no regression. No other defect was found in any area this pass tested with live interaction.

# YES — UX-9 COMPLETE — READY FOR BETA PREPARATION

- Commit: see repository log for `"UX-9: complete local beta release readiness"` immediately following this report update.
- Browser QA: fresh-signup → manual debt entry → first-ever plan activation → payment recording → reforecast → hard reload, all PASS live against the real local-beta Firebase emulator (not the seeded in-memory harness).
- Fresh-user result: PASS (onboarding, empty Home, debt creation, first-plan activation all correct).
- Reload/session result: PASS (Home + 4 direct routes, no regression).
- Bugs found: 2 (required-payment fabrication in `DebtCard`; first-ever plan activation completely broken). Bugs fixed: 2/2.
- Test totals: 890/890 unit, 12/12 + 69/69 Firestore rules (parity confirmed).
- Build/perf/audit: all green, 0 vulnerabilities.
- Production non-touch proof: all work performed against `localhost:5184` / local Firebase emulators (`127.0.0.1:8090`/`9199`) only; no production Firebase project (`budgetapp-c9306`) or `tracktozero.app` was reached at any point this pass.

Production deployment remains a separate, later, deliberate decision. BETA-3.1 was not started during this pass, per instruction.

## PART 3 — BROAD RE-VERIFICATION ON A FRESH EMULATOR (2026-08-18, continued)

### P3.1 Purpose and starting state

Continuing UX-9 per explicit instruction, this pass deliberately covers ground Part 2 disclosed as not independently re-driven: sanitized import/review, household/invite/role safety with real distinct accounts, mobile (390×844) and desktop (1440×900) responsive QA, accessibility smoke, and failure UX — run against a genuinely fresh, empty local-beta emulator. Starting state: HEAD `419794d` ("UX-9: complete local beta release readiness", Part 1+2's commit), clean tree, `localhost:5184` / Firestore `127.0.0.1:8090` / Auth `127.0.0.1:9199`.

**Environment note (not a product defect)**: the prior turn's `TaskStop` calls terminated only the `npm` wrapper processes, not their underlying `java` (Firestore emulator) and `node` (Auth emulator, Vite) child processes — a known Windows process-tree quirk. This caused a port collision on the next `emulators:v2` attempt (`Error: Could not start Authentication Emulator, port taken`) and a `dev:v2-local` fallback to port 5185. The stale `java`/`node` processes were identified via `netstat`/`Get-Process` and force-killed directly; both services were then restarted cleanly on their canonical ports (Firestore 8090, Auth 9199, Vite 5184), confirmed via `netstat` showing no stale listeners and both services responding `200`. The resulting emulator was genuinely fresh/empty (no leftover UX-9 accounts, workspaces, debts, or review items from any prior turn).

### P3.2 Fresh user, empty state, manual debt matrix

Fresh signup on the newly-clean emulator → onboarding correctly shown (no stale/sample/founder data) → Personal workspace → empty Home correctly shows the empty state with no phantom review count, debt total, or active plan. Manual debt matrix (5 debts covering normal APR, 0% APR/no-interest, unknown APR, present/missing required payment, present/missing due date, multiple debt types: credit card, personal loan, auto loan, student loan) all persisted correctly: unknown APR stays unknown (never fabricated as 0%), the explicit 0%-APR debt renders as a real, distinct `0.00%`, and the missing required payment renders as "not set" (never `$0.00`). All local traffic confirmed (zero non-`localhost`/`127.0.0.1` network requests observed). 5/5 checks passed, zero console errors.

### P3.3 Sanitized import / Review — full live drive (new ground this pass)

Uploaded the committed, sanitized `householdBudgetLarge.fixture.xlsx` fixture via Debts → "Import statement" → file select → **Analyze file** (a first attempt without explicitly clicking "Analyze file" correctly produced zero candidates, since analysis genuinely hadn't run yet — a test-script sequencing miss, not a product defect; corrected and re-run). Analysis correctly reported: 24 financial items found → 12 debt candidates, 12 non-debt items excluded (categorized: Unclear 3, Utilities 2, Subscriptions 2, Insurance 2, Storage 1, Savings 1, Income 1, all under "Not debt — we won't add these" / "View excluded items"), 6 "ready" and 6 "needs review". Review Center correctly required an explicit **per-item** decision — there is no "approve all" shortcut; each of the 12 candidates must be individually confirmed, skipped, or given missing information, which is a stronger, more conservative "no unreviewed candidate becomes authoritative Debt" guarantee than initially assumed. For genuinely missing fields, the UI is honest ("We're missing your current balance for this debt" / "We don't know the APR for this debt yet"), never fabricating a value.

Drove one "ready" candidate (Capital One, $1,991.99, 26.40% APR, $65 minimum) through its correct two-step resolution (select "Add as a new debt", then "Save this debt") to a real, persisted Debt: `LEFT TO GO` correctly increased by exactly $1,991.99, `ACTIVE DEBTS` 4→5, the Review queue correctly decremented 12→11 (Home's "12 import decisions" and Review's own count agreed), the debt appeared correctly in its category with the right lender filter option, and Activity correctly recorded a "Debt added... Starting balance $1,991.99" entry — confirming the opening BalanceSnapshot is truthful and matches exactly. The other 11 candidates remained untouched and still pending, confirming nothing was silently promoted. Zero console errors throughout. 6/6 explicit checks passed (after correcting one test-script sequencing bug and one test-script click-order bug, neither a product defect).

### P3.4 Reload/session hardening on an import-heavy account (re-confirmed, holds)

On this richer account state (5 manual + 1 import-confirmed debt, 11 pending Review items): hard reload on Home does not regress to onboarding and correctly preserves the "11 import decisions still need review" prompt. Direct-route reload tested on Debts, Plan, Review, Settings, and Activity — none went blank, none regressed to onboarding, and Review state survived fully intact (still exactly 11 pending, Capital One not reverted). See P3.7 for a more precise finding about which of these routes actually preserve the exact tab position vs. fall back to Home.

### P3.5 Confirmed balance truth / progress (new ground this pass)

Confirmed progress correctly reads exactly `0%` before any real balance snapshot exists (no fabricated progress from the import or manual-entry steps). Recorded a confirmed `$500.00` balance reduction via "Update balance" on the Debts tab; Home's "Confirmed progress" then correctly showed `1%`, `Confirmed reduction $500.00`, exactly matching the real change — no celebration of progress from null/missing data being misread as zero. Also reconfirmed live: "Due date passed — confirm payment"-style restrained language (not "Past Due"/"Missed Payment") is in active use on Home's Upcoming Payments card for a debt whose due date has passed, matching the locked payment-timing contract. 5/5 checks passed.

### P3.6 Household, invitations, and role safety — real distinct accounts (new ground this pass)

Created a fresh household-owner account, added a Joint debt (`P3 Joint Mortgage`, $250,000, 6.2% APR), and issued a real invite to a second fresh account at the **Viewer** role. The invited member signed up separately, opened the real invite link, and correctly saw a mismatch-transparent preview ("Invite email: ..." matching their own signed-in email) before joining. After joining:

- The Joint debt was correctly visible and readable to the Viewer with the exact right balance and category (confirmed by drilling into the Mortgage/Home category, which showed `$250,000.00 total · 1 account` — an initial test-script assertion checking for a literal debt-name string at the wrong list depth was corrected, not a product issue).
- Settings' "Verified members" list correctly showed both the owner and the now-joined Viewer as verified members, while "Pending invitations" correctly transitioned the same entry from "Pending invitation" to "Accepted" — verified membership and invitation history remain visually distinct, per the locked contract.
- The Viewer could **not** mutate: "Record payment"/"Update balance" controls do not render at all (not merely disabled) on the Debts tab quick-update rail; "+ Add debt" is absent; the household's "Create invite" button and its email field are both genuinely disabled (`isEnabled() === false` on both, verified directly, not just visually), accompanied by an explicit "Only owners and admins can invite people." explanation — a defensible, non-trap disabled-with-reason pattern, distinct from (but equally safe as) the fully-hidden pattern used elsewhere in the app. No global service/mutation handle is exposed on `window` for a Viewer to invoke directly, bypassing the UI.
- Joint debt appeared exactly once in the member's "YOUR DEBTS" total ($250,000.00, 1 active debt) — no duplication, corroborating the existing unit-tested "Joint counts once" contract (Part 1 §4 #6) with live evidence.

8/8 checks passed (after correcting two test-script assertions that were checking the wrong UI depth/pattern, described above — neither was a product defect). Zero console errors across both the owner and member browser sessions.

### P3.7 Direct-route reload — a real, non-critical finding

Investigating why some direct-route reloads "passed" only by the weak criterion of "not showing the onboarding string," this pass found and confirmed via source (`TrackToZeroV2App.jsx`'s `navigateTab`/mount-time URL parsing) that **only the Plan and Debts tabs have real, deep-linkable URLs** (`/plan/my-plan`, `/debts`) that survive a hard reload with their exact position intact — confirmed directly via `page.url()` before/after reload. Home, Review, Settings, and Activity have never pushed a distinguishing URL (all collapse to `/`), so a hard reload while on any of those three always lands back on Home, not the tab the user was actually on. This is **pre-existing architecture, not a new regression** — it predates this session's fixes and was not touched by any of them.

This does **not** violate any of the specifically-enumerated CRITICAL session-restoration failure modes (no onboarding redirect, no blank screen, no route loop, no lost `activePlanId`, no destructive empty state, no hydration error) — the underlying data (Review's 11 pending items, the workspace, the debts) all survive correctly and reappear the moment the user manually clicks back to that tab, as directly confirmed in P3.4. Given that fixing this properly would mean adding real routes, `pushState` calls, and mount-time URL parsing for three more tabs — genuinely new feature work, not a "smallest structural fix" to a bug — this pass documents it honestly as a **known limitation** (see P3.9) rather than attempting a partial, scope-creeping fix. Both Part 1 and Part 2's own "direct-route reload... PASS" claims for Review/Settings were technically true under their stated (weaker) criterion but did not verify exact-tab-position preservation; this note corrects that precision for the record without rewriting their original sections.

### P3.8 Responsive (desktop 1440×900 / mobile 390×844) and accessibility smoke — new ground this pass

**Responsive**: no horizontal overflow detected (`document.documentElement.scrollWidth` vs. `clientWidth`) on any of Home/Debts/Plan/Review/Activity/Settings at desktop 1440×900, nor on Home/Debts/Plan/Activity at mobile 390×844. The mobile bottom nav renders and is reachable. The mobile "Add Debt" modal opens without introducing overflow and its form fields are visible/reachable. 13/13 responsive checks passed.

**Accessibility**: keyboard `Tab` correctly moves focus to a real interactive element with a visible focus indicator (`outline: auto`, `1px`); the Add Debt modal correctly exposes `role="dialog"`/`aria-modal` for assistive tech, and its fields resolve via `getByLabel` (real, associated `<label>`s, not placeholder-only). **One genuine finding**: Home has **zero** `<h1>`/`<h2>`/`<h3>` elements — every section title ("YOUR NEXT MOVE", "CONFIRMED PROGRESS", "YOUR DEBTS", etc.) is a styled `<div>` (this codebase's established `TYPE_SCALE.overline`/`cardTitle` pattern), not a semantic heading. A screen-reader user navigating by heading landmark — a very common navigation pattern — would find nothing on the entire page. This is a **real accessibility gap**, but it is a systemic, pre-existing pattern used consistently across the whole app, not a new regression from this session's work; fixing it correctly means auditing and adjusting heading levels across every V2 page, which is genuine design-system-scope work, not a "smallest structural fix." Documented as a known limitation (P3.9), not silently fixed or hidden.

### P3.9 Failure UX (new ground this pass)

Uploaded a genuinely corrupt file (plain text renamed to `.xlsx`) through the real Import flow. The app did not crash, showed no raw stack trace or unhandled-exception UI, and reported a clear, human-readable outcome ("Valid workbook parsed, but no likely debt candidates were found.") with zero fabricated debt candidates and zero console errors. Minor, non-blocking polish note: "Valid workbook parsed" is a slightly generous description for input that was not a real workbook at all (the underlying XLSX library appears to tolerate the bytes rather than hard-erroring) — this has no financial-truth or safety consequence and is not treated as a defect.

### P3.10 Known limitations (new, from this pass)

1. **Direct-route reload only fully preserves tab position for Plan and Debts** (P3.7) — Home, Review, Settings, and Activity fall back to Home on a hard reload instead of restoring their exact position. Pre-existing architecture; no data loss; the CRITICAL session-restoration gate (no onboarding regression, no blank screen, no hydration error) is unaffected. Recommended for a future dedicated routing pass, out of scope for a "smallest structural fix."
2. **No semantic heading hierarchy on Home** (P3.8) — all section titles are styled `<div>`s, not `<h1>`-`<h6>` elements. Systemic, pre-existing pattern across the app. Recommended for a future dedicated accessibility pass.
3. Minor: the invalid-import-file message ("Valid workbook parsed, but no likely debt candidates were found") is slightly generous for non-workbook input (P3.9) — cosmetic only.

None of these are blockers for a controlled beta with a limited, informed tester cohort; all are honestly disclosed rather than fixed under time pressure or silently omitted.

### P3.11 No code changes this pass

Every finding in Part 3 was either (a) a test-script bug corrected in place (wrong selector, wrong click sequence, assertion checking the wrong UI depth — none were product defects, each was verified against the real underlying behavior before being ruled out), or (b) a genuine but out-of-proportion-for-this-pass known limitation, documented above rather than partially fixed. **No source file was modified in Part 3.** The codebase is unchanged from the `419794d` commit.

### P3.12 Full automated validation (re-run, unchanged code)

Re-run in full to confirm nothing regressed and the environment restart left no side effects:

- Unit tests: **890/890 passed** (58/58 files) — identical to Part 2's final count, confirming no drift.
- Lint: **0 errors**, **4 warnings** — the same pre-existing, documented warnings.
- Build: succeeds, same pre-existing >500kB chunk-size advisory.
- Legacy Firestore rules: **12/12 passed**.
- Firestore V2 rules: **69/69 passed**, rules parity guard PASS, no drift.
- perf:check: **all 8 budget checks PASS**.
- npm audit (`--omit=dev`): **0 vulnerabilities**.

### P3.13 Git review

`git status` after Part 3 showed no tracked-file changes beyond this report update — all `.ux9p3-*` temporary Playwright scripts, logs, and screenshots used during this pass were deleted before this check, per this session's established convention. No BETA-3.1 material, no private workbook data, no unrelated files.

### P3.14 Final verdict (Part 3)

Broader live coverage — sanitized import/review end-to-end, household/invite/role safety with real distinct accounts, mobile and desktop responsive QA, accessibility smoke, and failure UX — found no defect requiring a code change. Two genuine, honestly-disclosed, out-of-scope-for-this-pass known limitations were identified (P3.10) and neither blocks controlled-beta readiness. Full automated validation remains fully green and unchanged.

# YES — UX-9 COMPLETE — READY FOR BETA PREPARATION

- Starting commit for this pass: `419794d` ("UX-9: complete local beta release readiness", Part 1+2). No source changes were made in Part 3, so no new commit is required for code — only this report update.
- Broader browser QA: fresh user → manual debt matrix → sanitized import/Review (12 candidates, per-item confirmation, correct Debt + opening BalanceSnapshot) → reload/session hardening → confirmed-balance progress truth → household + real invite + Viewer role safety → responsive (mobile/desktop) → accessibility smoke → failure UX. All PASS, all against the local Firebase emulator only.
- Bugs found requiring a fix this pass: **0**. Known limitations documented, not hidden: 2 (direct-route reload scope, heading hierarchy) plus 1 cosmetic wording nit.
- Test totals: 890/890 unit (unchanged), 12/12 + 69/69 Firestore rules (parity confirmed).
- Build/perf/audit: all green, 0 vulnerabilities.
- Production non-touch proof: all work performed against `localhost:5184` / local Firebase emulators (`127.0.0.1:8090`/`9199`) only; no production Firebase project or `tracktozero.app` was reached at any point.

Production deployment remains a separate, later, deliberate decision. BETA-3.1 was not started during this pass, and the owner's real spreadsheet was not used, per instruction.
