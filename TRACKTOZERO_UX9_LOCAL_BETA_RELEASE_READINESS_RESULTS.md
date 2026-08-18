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
