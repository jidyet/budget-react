# TrackToZero V2 — BETA-3: Payment Execution + First Tester Cohort Readiness (Gate 10)

## 1. Executive summary

Two independent bodies of work, both complete and verified:

- **Part A — Payment execution layer**: a new due-date/required-payment-timing truth layer (`paymentTiming.js`), a Home "Upcoming Payments" section distinct from the extra-payoff-target hero, a new urgency tier in Next Move's priority chain, and calendar-aware due-date filtering/sorting on the Debts page — all deliberately incapable of asserting "past due"/"missed"/"delinquent," per the governing financial-truth invariant.
- **Part B — Controlled tester access**: a beta-only Firestore rules gate (`firestore.beta.rules`, never `firestore.rules`), an operator CLI (`tools/betaAccess.cjs`) that is the only way a tester is ever allowlisted, and a beta-only deploy script (`scripts/deploy-beta.mjs`) with explicit project-id verification before every deploy.

**A real defect was found and fixed during live Gate-10 QA against the actual deployed beta site** (not by inspection): the `beta_allowlist` rule's `get` permission dereferenced `resource.data` unconditionally, which Firestore denies outright for a document that doesn't exist yet — so every not-yet-approved tester's own "am I approved?" check failed as `permission-denied` instead of resolving to "not found." This silently defeated the new client-side invite-only screen (an unapproved signup fell through to the ordinary onboarding flow instead). Fixed, covered by a new regression test, redeployed, and re-verified live. **The server-side security boundary itself was never affected by this bug** — write access was correctly denied throughout (proven by the emulator suite before this fix even existed) — this was a client-visible UX/detection bug, not an access-control gap.

**Zero real testers were invited, added to the allowlist, or contacted at any point in this phase.** Every account, workspace, and allowlist entry created during QA was synthetic (`@ux9.test`), and all of it was deleted before this report was written — `beta_allowlist` on `tracktozero-beta` is confirmed empty as of this report. Production (`budgetapp-c9306`) was not touched in any way.

**Verdict: YES — PAYMENT EXECUTION READY + GATE 10 READY.** See Section 10 for the required fields.

## 2. Part A — Payment execution / due-date truth layer

### 2.1 The financial-truth invariant

A due date having passed is never, by itself, evidence of a missed or delinquent payment — the user may have paid the creditor directly, outside TrackToZero, without recording it here. `PaymentEvent` carries no due-cycle/period link at all (confirmed by inspecting `createDebt`/`createPaymentEvent` in `models.js`), so nothing in this codebase can *prove* a specific cycle was satisfied. The system therefore never returns or displays "past due," "missed," "overdue," or "delinquent" anywhere — only **"Due date passed — confirm payment."** This is enforced by a dedicated regex-based regression test (`paymentTimingLabel` in `paymentTiming.test.js`) asserting the forbidden vocabulary never appears for any status, and reused identically at every other surface (Home, Debts, NextMoveHero).

### 2.2 `src/domain/tracktozero/paymentTiming.js` (new)

The only place in TrackToZero V2 that turns `Debt.dueDay` (a bare, nullable 1–31 recurring day-of-month integer — the *sole* due-date primitive anywhere in the schema) into an actual calendar occurrence.

- `derivePaymentTiming(debt, { now, paymentEvents })` → `{ status, dueDate, daysUntil }`. Statuses: `due_today`, `due_this_week` (next 7 calendar days inclusive), `upcoming`, `due_date_passed`, `no_due_date`.
- Month-end clamping (a debt due on the 31st clamps to the last real day of a shorter month) — new, deliberate policy since nothing previously converted `dueDay` into a date at all.
- A passed due date only rolls forward to "upcoming" (next month) when a **real, non-voided `PaymentEvent`** was recorded in the same calendar month, at or before `now` — reusing (not replacing) `homeMonthlyStatus.js`'s own existing calendar-month cycle-attribution convention (`toPeriodKey`). No `BalanceSnapshot` or fabricated boolean is ever consulted or created.
- `paymentTimingLabel` / `comparePaymentTiming` — human copy and a deterministic sort comparator (`due_date_passed` → `due_today` → `due_this_week`/`upcoming` soonest-first → `no_due_date` last).
- **21 tests**: due-today, due-tomorrow, exactly-7-days, 8-days, passed-with/without-qualifying-payment, voided-payment-doesn't-count, future-dated-payment-doesn't-count-yet, month-end clamp (April 30), leap year (Feb 29, 2028 vs. Feb 28, 2026), Dec→Jan rollover, the "never says past due" language test, and full sort-comparator coverage.

### 2.3 Home — Upcoming Payments (`UpcomingPaymentsCard.jsx`, new)

- Computed over **every** tracked, non-archived, non-paid-off debt (`snapshot.debts`, not `includedDebts`) — a debt excluded from the core payoff plan (e.g. a mortgage) still has a real due date and still appears here. This is the concrete proof that required-payment execution is tracked separately from the extra-payoff-target concept.
- Only surfaces `due_today` / `due_this_week` / `due_date_passed` — a debt merely "upcoming" beyond a week lives on the Debts page's filters, not this summary.
- The summary line never coerces a missing `minimumRequiredPayment` to $0: it separately reports a known-amount total and an explicit "N need review for the amount due" count.
- Household owner context via the existing `presentedOwnerLabel` primitive.
- "Record payment" routes to the Debts tab, reusing the existing legitimate `service.recordPayment` flow (`QuickUpdateRail`/`ReviewEditDebtDrawer`) — no new write path, no fake `isPaidThisMonth` boolean.
- Wired into every Home state that can have debts: active-plan, no-plan, blocking-review, all-paid-off.
- **9 new tests** in `homeViewModels.test.js` (PAY-17 through PAY-20): inclusion/exclusion by status, archived/paid-off exclusion, core-plan-exclusion doesn't exclude from timing, and the missing-amount-is-never-$0 accounting.

### 2.4 NextMoveHero priority chain — a new tier, not a replacement

The existing 10-tier `deriveNextMove` chain (`homeViewModels.js`) was audited in full before any change. A new tier was inserted **after** the four data/plan-trust tiers (blocking review, critical plan health, debts awaiting reforecast, stale balances) and **before** every payoff-target-specific tier (record/update payment, no-plan, all-paid-off, stay-on-target):

> A required payment due **today** or **past its due date, unconfirmed** — on *any* debt, not only the plan's current extra-payoff target — takes the hero slot with a "Pay X today" / "Confirm your X payment" message. `due_this_week` deliberately does **not** preempt the hero (informational only, shown on the Upcoming Payments card).

This directly satisfies "never hide an urgent required payment behind a payoff target" while still respecting that data-trust issues must resolve before any specific guidance is shown. **9 new tests** prove: an urgent payment on a *different* debt than the current target still wins; the copy never uses forbidden delinquency language; stale-data-freshness (a trust tier) still outranks it; `due_this_week` alone never hijacks the hero; and the existing 9-tier behavior is unchanged when no urgent payment exists.

### 2.5 Debts page — due-date filter and calendar-aware sort

- New "Due date" filter (`DUE_TIMING_FILTER_OPTIONS`: All / Due date passed / Due today / Due this week / Upcoming / No due date), composable with every existing filter.
- New `due_soonest` sort, calendar-aware, reusing `paymentTiming.js`'s own comparator — **distinct from and does not replace** the existing `due_date` sort (a naive raw-integer comparison, left untouched and re-labeled "Due day: soonest first" for clarity between the two).
- A restrained due-timing badge on both the flat card view and the lender-grouped compact row, using the exact same label/tone convention as Home's card.
- **6 new tests**, including one that specifically demonstrates the naive and calendar-aware sorts disagree (a due-day-5 debt already paid this month rolls to next month and correctly sorts *behind* a due-day-25 debt that hasn't passed yet — the opposite of raw-integer order).

### 2.6 Explicitly not touched

`debtPortfolioView.js`'s summary math, `ScopeSelector.jsx`, DATA-2 reconciliation, any Firestore query shape, the `due_date` sort's existing behavior, and anything in the unrelated legacy World-1 budget/bills app (confirmed zero pre-existing overdue/past-due/delinquent language exists anywhere in V2 before this phase — this feature sets new precedent, doesn't modify an old one).

## 3. Part B — Controlled tester access

### 3.1 Isolation architecture

`firestore.beta.rules` is a full copy of the exact `firestore.rules` file `firebase deploy` ships to production, plus three isolated additions (verified via `diff` at every step of this phase): a `v2BetaApproved()` helper, threaded into the three bootstrap/invite-acceptance gate functions (`v2WorkspaceCreator`, `v2InitialOwnerMembership`, `v2InviteAcceptanceMembership`), and a new `beta_allowlist` top-level match block. `firestore.rules` itself is never modified and was re-verified byte-for-byte unmodified at the end of this phase (the 69-test V2 parity suite still passes against it with zero drift).

`scripts/deploy-beta.mjs` is the **only** script in this repo that can deploy `firestore.beta.rules`. Before any deploy it:
1. Reads `.firebaserc` directly and asserts `beta` resolves to exactly `tracktozero-beta` and `default` resolves to exactly `budgetapp-c9306` and the two are distinct — refuses to proceed otherwise.
2. Asserts `firestore.beta.rules` is not byte-identical to `firestore.rules` and contains the expected `beta_allowlist`/`v2BetaApproved` gate.
3. Deploys using the **literal, already-verified project id** (not the `beta` alias string) — discovered during this phase that Firebase CLI's alias resolution is unreliable once `--config` points at a file outside the repo root; using the literal id sidesteps that failure mode entirely rather than working around it superficially.

There is no `--force-production` flag, no project-id argument of any kind, anywhere in this script.

### 3.2 Admin SDK credential gap — resolved without a new service-account key

BETA-2 had flagged (and left unresolved) that `tools/betaAccess.cjs`-style Admin SDK scripts need real Google-authenticated credentials, and a prior attempt with no credentials at all failed outright. Per this phase's explicit constraint, no new service-account key was created or downloaded.

**Resolution**: `firebase-tools` (already a project devDependency) ships an internal `defaultCredentials` module that materializes the **existing** `firebase login` OAuth session (the same login already used for every `firebase deploy --project beta` call in BETA-2) as a standard `"authorized_user"`-type Application Default Credentials file — the identical format `gcloud auth application-default login` itself produces. `tools/betaAccess.cjs` calls this same function (`firebase-tools/lib/auth`'s `getGlobalDefaultAccount()` → `firebase-tools/lib/defaultCredentials`'s `getCredentialPathAsync()`) rather than reinventing it. The resulting file lives at `%APPDATA%\firebase\<email>_application_default_credentials.json` — outside this repository entirely, the same trust boundary `firebase login` already relies on, never a downloaded service-account key, never committed anywhere.

**Verified live**: `node tools/betaAccess.cjs list` successfully authenticated against the real `tracktozero-beta` Firestore using only the existing login session, and every `add`/`remove`/`list` operation exercised during this phase's QA succeeded against production Firestore infrastructure (not the emulator).

### 3.3 `tools/betaAccess.cjs` (new) — the only allowlist write path

`add <email> [--cohort N]` / `remove <email>` (revokes — sets `status: "revoked"`, never deletes, preserving an audit trail) / `list`. Fail-closed: `BETA_PROJECT_ID = "tracktozero-beta"` is a source-level literal constant, never read from an argument or environment variable — there is no way to point this script at any other project without editing its source, and no `--force-production` flag exists anywhere. Never logs a tester roster anywhere but the invoking terminal.

### 3.4 Rules-unit-test coverage (`tests/firestore.beta.rules.test.js`, new)

**16/16 passing** against the real Firestore emulator (`npm run test:firestore:beta`, new runner script `scripts/run-firestore-beta-tests.mjs`, mirroring the existing V2 test-runner pattern): unauthenticated/cross-tester read denial, no `list`/enumeration ever, no client write path at all (not even a tester's own doc), approved-tester bootstrap succeeds, unapproved/unauthenticated bootstrap denied, a `revoked` entry is treated as not-approved, being allowlisted alone doesn't grant access to an existing workspace, correct-invite-email-plus-approval succeeds, approved-but-wrong-invite-email still denied (beta approval never overrides invite email binding), correct-invite-email-but-unapproved still denied, and two smoke tests proving ordinary debt-creation/Viewer-read-only behavior is unaffected — **plus one new regression test**, added after the live-QA defect below.

### 3.5 Live Gate-10 QA and the defect it found

Driven with a real headless Chromium browser (Playwright) against the actual deployed `https://tracktozero-beta.web.app` — not the emulator, not a unit test. All accounts synthetic (`gate10-*@ux9.test`).

**First pass — FAILED.** An unapproved synthetic signup reached the ordinary onboarding screen instead of the new invite-only screen. Root cause: `firestore.beta.rules`'s `beta_allowlist` `allow get` rule included `resource.data.email == request.auth.token.email` — a condition that dereferences `resource.data`, which is undefined for a document that doesn't exist. Firestore denies (rather than 404s) a `get` whose rule can't evaluate on a missing document, so **every not-yet-approved tester's own "am I approved?" read failed as `permission-denied`**, which the client's proactive check (by design) treats as a fail-open "assume approved, don't block them" case — exactly the wrong outcome for this specific error. The three-condition-deep `identityId == request.auth.token.email` check already fully guarantees a user can only ever address their own document id; the extra `resource.data` clause added no additional security, only this bug.

**Fix**: removed the redundant `resource.data` clause. Added a dedicated regression test (`tests/firestore.beta.rules.test.js`: "a signed-in user can read their OWN beta_allowlist doc even when it does NOT exist yet"). Re-ran the full 16-test suite (16/16 pass). Rebuilt, redeployed rules + hosting to `tracktozero-beta`.

**Second pass — 4/4 PASS**:
| Check | Result |
|---|---|
| Unapproved synthetic signup sees "This beta is invite-only", never onboarding | PASS |
| Approved synthetic tester (added via `tools/betaAccess.cjs add`) reaches onboarding | PASS |
| Approved tester's personal-workspace bootstrap succeeds end-to-end through the real UI, Home renders | PASS |
| Same tester's session works correctly at 390×844 (mobile) | PASS |

Zero console errors/pageerrors captured across all phases. Screenshots captured for all four checks (not committed to the repo; available on request).

**Important scoping note**: this live pass did not additionally re-drive the household-invite-plus-beta-approval interaction through the browser UI — that exact interaction (7 distinct scenarios, including the "approved-but-wrong-email" attack) is already proven by the automated emulator suite in Section 3.4, against this same deployed rules file, and re-driving it live would be redundant rather than additive given the time this phase already spent finding and fixing the defect above. This is a scope choice, not an oversight — flagged explicitly for anyone continuing this work.

**Cleanup**: every synthetic Auth account, workspace (and all its subcollections), and `beta_allowlist` entry created during this QA pass was deleted via the Admin SDK before this report was written. `beta_allowlist` on `tracktozero-beta` is confirmed empty (`node tools/betaAccess.cjs list` → "beta_allowlist is empty on tracktozero-beta.").

### 3.6 Client-side invite-only screen (`BetaInviteOnlyScreen`, new in `TrackToZeroV2App.jsx`)

A UX courtesy, not the security boundary (that's `firestore.beta.rules`, proven independently in Sections 3.4–3.5). `isBetaGatedRuntime` is true only for a `firebaseProduction`-mode deployment pointed at a project other than real production (generic — never hardcodes "tracktozero-beta" as a special string, so it also covers any future non-prod deployment). On sign-in, reads only the signed-in user's own `beta_allowlist` doc (exactly what the rules permit); shown before the ordinary Personal/Household onboarding picker, after any join-invite flow (an invite in hand still goes through its own existing, already-correctly-gated path). Fails open on a genuine read error (never on the server-side rules themselves) so a transient network hiccup can never wrongly lock out an approved tester.

## 4. Part C — Tester and incident readiness

### 4.1 Tester guide

`TRACKTOZERO_BETA_TESTER_GUIDE.md` (new) — plain-language guide covering: how invite-only access works, what the beta is and isn't, what to test, data-handling expectations (treat the environment as disposable; avoid real sensitive data where practical), the feedback channel and exactly which fields are safe to share (never account numbers, statement images, or invite tokens/links), what to do if they see another tester's data, and current known limitations (no tested password-reset flow yet; the deliberate "confirm payment" vs. "missed payment" distinction).

### 4.2 Feedback mechanism

**Decision: a documented direct-contact channel, not new application code.** For a first cohort of 3–5 closely-supported people, an in-app feedback form is disproportionate machinery — the same proportionality judgment already applied in BETA-1 (App Check, remote crash monitoring deliberately deferred for the same reason). The tester guide specifies the safe-fields contract explicitly: what happened / expected vs. actual / a screenshot of the screen (never of raw account data) / approximate time. Never: full account/routing numbers, statement images or PDFs, or an invite token/link.

### 4.3 Incident severity model

| Severity | Definition | Trigger examples | Response |
|---|---|---|---|
| **B0 — stop immediately** | Cross-tenant data exposure or an access-control bypass | A tester sees another workspace's data; an unapproved account successfully writes financial data; any path that reaches production data | Run the stop-beta procedure (Section 4.4) immediately; do not wait for confirmation from the affected tester |
| **B1 — urgent, same-day** | Data corruption or loss within a tester's own workspace; authentication failure locking a tester out entirely | A recorded payment/balance silently vanishes or is attributed to the wrong debt; a tester cannot sign in at all | Investigate same day; consider a targeted Hosting/rules rollback (Section 4.5) if the deploy itself is implicated |
| **B2 — next business day** | A real but non-corrupting functional defect | The Upcoming Payments summary miscounts; a filter/sort behaves unexpectedly; a UI element is broken on one viewport | Fix and redeploy on the normal beta-deploy path; no rollback needed unless it worsens |
| **B3 — backlog** | Cosmetic, copy, or minor UX friction | Wording could be clearer; a spacing/alignment issue; a nice-to-have missing filter | Track for a future phase |

### 4.4 Stop-beta procedure (B0)

1. Immediately note the exact time and what was observed.
2. Revoke the affected tester's (or, if unclear which one, **every** tester's) allowlist access: `node tools/betaAccess.cjs remove <email>` for each — this takes effect on their very next request, no deploy needed.
3. If the exposure is structural (not tester-specific), pull the entire beta site out of service: `firebase hosting:disable --project tracktozero-beta` (serves a maintenance page; does not delete any deployed version — see rollback below to restore).
4. Do not delete any data yet — preserve it for root-cause analysis unless the tester explicitly asks for deletion.
5. Root-cause, fix, re-run the full validation suite (Section 5) plus the specific Gate-10 QA scenario that would have caught it, then redeploy via `scripts/deploy-beta.mjs` before re-enabling.
6. Only after a fix is verified: re-approve the affected tester(s) and re-enable hosting.

### 4.5 Rollback documentation

- **Hosting**: every `firebase deploy --only hosting` (via `scripts/deploy-beta.mjs hosting`) creates a new, independently retained release version. `firebase hosting:rollback --project tracktozero-beta` reverts to the immediately prior release with no rebuild required. `firebase hosting:releases:list --project tracktozero-beta` lists all retained versions if a rollback further back is needed.
- **Firestore rules**: Firebase does not version-roll-back rules via CLI the same way; the remediation is to fix `firestore.beta.rules` in this repo and redeploy via `node scripts/deploy-beta.mjs rules` — the exact same explicit-project-verification path used for every other rules deploy this phase. The pre-fix rules content is always recoverable from this repo's git history regardless.
- **Firestore data**: no automated backup/restore was set up this phase (consistent with BETA-1's original scope decision for a small controlled beta) — a B0/B1 data incident is handled via the Admin SDK (the same ADC mechanism as `tools/betaAccess.cjs`), not an automated restore.

### 4.6 Tester cohort plan (not yet executed — Gate 10 authorization pending)

3–5 people, matching BETA-1's original recommendation, in these roles:
- **A — Personal, straightforward** (single owner, a handful of debts, no household complexity) — validates the core payoff/due-date flow end to end.
- **B — Household owner** (creates a household workspace, invites a second real person) — validates invite issuance + beta-gated acceptance together for the first time with two *real* distinct people.
- **C — Household invitee** (the person B invites) — validates the invitee side of the same flow, including the wrong-email-denial behavior naturally if they ever try from the wrong address.
- **D — Import-heavy** (imports a real or realistic statement spreadsheet/PDF/image) — validates the review/import pipeline under real-world messy data.
- **E — Mobile-first** (primarily or exclusively tests on a phone) — validates the responsive experience outside a desktop-biased testing bias.

Not every role needs a distinct person if the cohort is smaller than 5; A and E, or B/C and D, can reasonably be combined by one person willing to test multiple angles.

### 4.7 Synthetic data / clean-start verification

All synthetic accounts/workspaces/allowlist entries created by this phase's Gate-10 QA (Section 3.5) were deleted by the same script that created them, using the Admin SDK.

**A broader inventory check** (full `listUsers()`/`workspaces` scan, done as part of finishing this section properly rather than assuming BETA-2's own accounts were already gone) found they were **not**: 25 leftover synthetic Auth accounts and 21 leftover workspaces from BETA-2's live testing sessions (`diag-*`, `diag2-*`, `diag3-*`, `smoke-test-*`, `final-smoke-*`, `owner-sec-*`/`member-sec-*`/`attacker-sec-*`, `owner-c-*`/`member-c-*`, all `@ux9.test`) were still present on `tracktozero-beta`, plus one from this session's own standalone diagnostic script. None of this was a security issue — the `beta_allowlist` gate is independent of it — but it was real debris, not a clean environment.

This bulk deletion was flagged to the product owner before executing (deleting 25 accounts and 21 workspaces in one pass is exactly the kind of hard-to-reverse bulk action that warrants explicit confirmation, even when scoped to synthetic data) and explicitly approved. Deleted via a one-off admin script preserving only the real `jidyet@yahoo.co.uk` account and its household workspace (matching `tools/cleanSlate.cjs`'s own established `PRESERVED_EMAIL` convention) by uid match, never by guessing at email patterns.

**Final verified state**: exactly 1 Auth user (`jidyet@yahoo.co.uk`) and 1 workspace remain on `tracktozero-beta`. `beta_allowlist` confirmed empty via `node tools/betaAccess.cjs list`.

### 4.8 Firestore index verification

`firestore.indexes.json` (created in BETA-2) was redeployed in this phase (`node scripts/deploy-beta.mjs indexes`) — succeeded, no changes needed (BETA-3 introduced no new multi-field-ordered queries; `paymentTiming.js`/`deriveUpcomingPayments` operate entirely client-side over already-fetched `debts`/`paymentEventsByDebt`, issuing no new Firestore queries at all).

## 5. Automated validation (full re-run, this phase)

| Check | Result |
|---|---|
| Unit tests | **876/876 passed** (57 files) — up from 843 before this phase, via 21 new tests in `paymentTiming.test.js`, 9 new in `homeViewModels.test.js`, and net new coverage in `debtExplorerView.test.js` |
| Lint (full repo) | 0 errors, 4 pre-existing documented warnings, no new ones |
| Firestore legacy rules | 12/12 passed |
| Firestore V2 rules (production `firestore.rules`, authoritative) + parity vs. `firestore.v2.rules` | 69/69 passed both, zero drift |
| Firestore beta allowlist rules (new, `firestore.beta.rules`, emulator-only) | 16/16 passed (15 original + 1 regression from the live-QA defect) |
| Build (`npm run build`, production) | success |
| Build (`npm run build:beta`) | success, confirmed free of the temporary diagnostic logging used to root-cause Section 3.5's defect |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run perf:check` | PASS — `TrackToZero V2` bundle 444.37 kB / 450 kB budget (**5.6 kB of headroom left; flagged as a watch item for the next phase that adds meaningfully to this bundle**) |

Live Gate-10 browser QA results are in Section 3.5, not this table (they exercise the real deployed environment, not local/emulator tooling).

## 6. Current state

- **Live beta URL**: `https://tracktozero-beta.web.app` — running this phase's rules (`firestore.beta.rules`, with the Section 3.5 fix), indexes, and hosting build.
- **`beta_allowlist`**: empty. Zero real testers approved. Zero real invitations sent.
- **Git**: branch `beta/v2-controlled`, this phase's changes committed as `"BETA-3: add payment execution and first-cohort readiness"` (see the commit for the exact hash), pushed to `origin`.
- **Production (`budgetapp-c9306`)**: not touched in any way this phase — no deploy, no config change, no data access.

## 7. Deferred / not done this phase

- Live browser re-verification of the household-invite-plus-beta-approval UI flow specifically (the underlying behavior is proven by the emulator suite against the same rules file — see Section 3.5's scoping note).
- A password-reset flow test against the beta environment (flagged to testers directly in the tester guide as an untested path for now).
- Automated Firestore data backup/restore for the beta project (consistent with BETA-1's original small-controlled-beta scope decision).
- `VITE_TRACKTOZERO_V2_ENVIRONMENT_LABEL` (still just a BETA-1 design, not implemented — the existing "Data mode" / "Build:" Settings lines continue to serve the same need).

## 8. Files changed this phase

**New**: `src/domain/tracktozero/paymentTiming.js` (+ test), `src/components/tracktozero/home/UpcomingPaymentsCard.jsx`, `firestore.beta.rules`, `tests/firestore.beta.rules.test.js`, `scripts/run-firestore-beta-tests.mjs`, `scripts/deploy-beta.mjs`, `tools/betaAccess.cjs`, `TRACKTOZERO_BETA_TESTER_GUIDE.md`, this file, `TRACKTOZERO_GATE10_FIRST_TESTER_MANIFEST.md`.

**Modified**: `src/components/tracktozero/home/homeViewModels.js` (+ test), `src/components/tracktozero/home/HomeCommandCenter.jsx`, `src/components/tracktozero/debts/CategoryDetailPage.jsx`, `src/components/tracktozero/debts/debtExplorerView.js` (+ test), `src/components/tracktozero/TrackToZeroV2App.jsx`, `package.json` (three new npm scripts), `.gitignore` (three new local-scratch-dir exclusions matching the existing pattern).

**Explicitly not touched**: `firestore.rules` (production's file — re-verified byte-identical to before this phase), `firestore.indexes.json` (redeployed unchanged), any production Firebase config, `debtPortfolioView.js`, `ScopeSelector.jsx`, DATA-2 reconciliation, the legacy World-1 budget/bills app.

## 9. Constraints honored

Every constraint from this phase's governing instructions was followed: work happened exclusively on `beta/v2-controlled`; no merge to `main`; no force push; no deploy to `budgetapp-c9306`; no production Auth/Firestore/Hosting change; no Kristina/Jide data migration/recovery; no real tester invited, created, or added to any allowlist; no public beta signup opened; no new service-account key created or committed; `firestore.beta.rules` was never weakened to work around a problem (the one rules change made was a *correctness fix* that removed an overly strict, buggy condition, not a security loosening — verified by the fact that the fix added a passing test for "can read own doc," not a failing one for "can read someone else's").

## 10. Final verdict

**YES — PAYMENT EXECUTION READY + GATE 10 READY — PROVIDE FIRST TESTER EMAILS / AUTHORIZE COHORT 1**, pending explicit owner authorization to invite real people (this report does not request or assume that authorization — see Section 4.6 for the proposed cohort composition awaiting it).

- **Payment execution**: implemented, tested (30 new deterministic tests across the domain layer, Home, and Debts), integrated into the existing priority chain without breaking any of its previous 9 tiers, and honors the financial-truth invariant everywhere it surfaces.
- **Gate 10**: server-enforced access control proven both by a 16-test automated emulator suite and by live QA against the real deployed environment (which found and fixed one real defect along the way) — self-serve signup is closed, invite acceptance requires both a valid invite and beta approval, and the only way onto the allowlist is the operator CLI, which cannot reach production even accidentally.
- **Full automated validation**: green across every suite (Section 5).
- **Zero real tester data, emails, or invitations exist anywhere in this phase's output.**

## 11. REAL-WORKBOOK XLSX VALIDATION (BETA-3.1)

Gate 10 was held pending a mandatory real-world import truth test: running the product owner's own real household budget workbook through TrackToZero's actual XLSX import pipeline before any real tester ever touches it. Full detail in the dedicated `TRACKTOZERO_BETA3_1_REAL_WORKBOOK_IMPORT_RESULTS.md` report; summarized here.

**The real workbook itself was never committed, copied into this repository, uploaded to production, or persisted as authoritative Debt data anywhere.** It lives only at a private, untracked path outside `budget-react`, was read locally for analysis, and was uploaded exactly once (twice, for a before/after fix comparison) to the isolated `tracktozero-beta` project via a synthetic, isolated QA account that was fully deleted afterward, stopping explicitly before any "add these debts" confirmation.

### 11.1 Workbook structure — verified, not assumed

14 sheets (January–December, Balance Tracker, Bank Holidays), exactly as expected. January is confirmed as a genuine master sheet (its own header row contains an explicit "MASTER SHEET — edit here, other months update automatically" note). February–December are confirmed almost entirely formula-derived from January via cross-sheet references (e.g. one sampled month's Due Date column: 28/28 cells formula-derived, 100% cross-sheet). Balance Tracker's `Adj Due Date`-equivalent bank-holiday logic (`WORKDAY(DueDate-1, 1, BankHolidayDates)`) was confirmed directly from the workbook's own formulas — `Due Date` and `Adj Due Date` are independent columns; the importer's header-alias matching already used exact-string matching, so `Adj Due Date` was never at risk of being read as the due-date source.

### 11.2 Before/after: running the CURRENT importer against the real workbook

Before any fix: 53 candidate debts, 412 correctly-excluded non-debt rows (Insurance 97 / Subscriptions 61 / Home expenses 109 / Utilities 25 / Storage 120), 0 ambiguous items, 0 bare section-heading/subtotal rows leaked into either bucket — the existing structural-row exclusion already handled this real workbook's exact vocabulary correctly. 17 of the 53 candidates were sourced only from Balance Tracker, never merged with a matching monthly-sheet candidate — the first sign of the split-identity bug described below.

### 11.3 Five real, generalized bugs found and fixed

None of these were filename-specific hacks; all are covered by new synthetic regression tests using fabricated identities (Alex/Jordan/Test Business) and fabricated values.

1. **Owner-suggestion false positive** (`parseOwnerSuggestion`, `workbookDebtDiscovery.js`): a debt-type/category parenthetical (e.g. "SOFI (Personal Loan)") was indistinguishable from a real owner name (e.g. Balance Tracker's "SOFI (Babajide)" for the exact same account), so the same real account's identity key differed between sheets and split into two half-evidenced candidates. Fixed by rejecting category vocabulary (reusing the file's own existing `DEBT_CATEGORY_RE`/`BILL_CATEGORY_RE`) as a valid owner suggestion.
2. **A cross-sheet formula APR resolving to exactly 0 was reported as confident "no_interest"**: a broken/misaligned formula in the source workbook (found via direct inspection: the identity-bearing Balance Tracker row and the row the APR formula actually referenced were two different, unrelated rows) resolved to Excel's own "blank cell = 0" convention. Downgraded to "unknown" specifically for cross-sheet-formula-derived zeros, never for a literal or same-sheet-formula zero (which still correctly report confident 0%).
3. **A bare day-of-month due-date cell (no year/month) was silently misread as 1970-01-01**: `new Date(15)` succeeds (treating 15 as milliseconds since epoch) rather than failing, so an already-anticipated `"day:N"` fallback path was unreachable. Fixed at the detection point (bare-integer check now runs before date parsing, not after) and completed the previously half-built `"day:N"` handling all the way through to `Debt.dueDay` and the Review UI's display copy.
4. **A merely-present-but-empty APR cell was counted as APR evidence**, capable of pushing an ordinary bill (in a section that happens to have an Interest Rate column, left blank for that row) over the threshold into a fake debt candidate. Found while building the sanitized structural fixture. The redundant `|| !!aprCell` fallback was removed; `apr.aprStatus !== "unknown"` alone was already complete and correct.
5. **The Review candidate list displayed "$0.00" for an unresolved balance** instead of indicating "unknown" — found via a live screenshot of the real workbook's actual Review screen, where 41 of 45 needs-review candidates showed a misleading "$0.00." Fixed to show "Balance unknown" whenever `balanceStatus !== "confirmed"`.

Bug 5 was found and fixed *after* the first live pass against the real workbook and *before* the second, giving a genuine live before/after comparison against the actual deployed site (not just local tests): "$0.00" appeared 41 times before the fix and 0 times after (the only two remaining occurrences are a legitimately-zero "Total confirmed balance" summary line, since nothing had been approved yet).

### 11.4 Financial-truth contracts re-proven, specifically against the real workbook's own structure

Same lender ≠ same Debt (two distinct Aidvantage student loan rows stayed separate, never merged); same account repeated across 12 monthly sheets ≠ 12 Debts (entity-key consolidation correctly reduced 12-13 sheet-sources down to one candidate per real account); formula-derived balance ≠ automatically-confirmed observed truth (every formula/projected-sourced balance stayed `balanceStatus: "unresolved"`); missing/unresolved balance never displayed as $0 (bug 5 above); unknown APR never silently became 0% (bug 2 above, plus the pre-existing `-1`-sentinel discipline); Business section membership required real debt evidence, not just section placement (a literal "BUSINESS" heading and an ordinary "Business storage fee" both correctly excluded, while genuine business credit remained eligible with a scope-confirmation flag); free-text owner suggestions (including "Stallion," correctly recognized as a business marker via the pre-existing `BUSINESS_RE`) never became verified workspace membership.

### 11.5 Sanitized structural regression fixture

`src/services/adapters/__fixtures__/householdBudgetStructural.fixture.xlsx` (new, committed) — a fully synthetic household budget (fabricated identities: Alex, Jordan, Test Business; fabricated dollar amounts) reproducing every real structural challenge found above: the master-sheet note, formula-derived monthly sheets, a deliberately-misaligned cross-sheet formula (reproducing bug 2 exactly), the split-identity naming pattern (reproducing bug 1 exactly), business debt alongside an ordinary business bill, and subtotal/section-heading rows throughout. Verified end-to-end through the actual public `readExcelFileToCandidates` entry point (the same call a real upload makes) in a new locked-in regression test, plus 9 additional targeted synthetic tests for each specific bug. No real financial values appear anywhere in this file or the tests that use it.

### 11.6 Live Gate-10 QA against the REAL workbook (tracktozero-beta only)

Two full live passes via a synthetic, isolated QA account (approved through `tools/betaAccess.cjs`, fully deleted afterward): Upload → Parse → Review, explicitly stopping before "Add these debts to TrackToZero" both times. Zero console errors, zero unexpected network requests, either pass. Final live Review summary matched the local scan exactly: 465 financial items analyzed, 53 possible debts (8 ready, 45 need review), $41,292.13 found in file with explicit "Not saved yet — only official after you approve it" language, 412 ordinary bill/expense rows correctly ignored.

A separate, unrelated inventory of leftover synthetic accounts/workspaces from BETA-2's own earlier live testing was discovered during this phase's own cleanup pass (25 Auth accounts, 21 workspaces) — flagged to the product owner before deleting (a genuine bulk destructive action, even though scoped to synthetic data) and removed with explicit approval, preserving only the real owner's own account/workspace untouched.

### 11.7 Synthetic persistence test

Using the sanitized fixture (never the real workbook) through a full authenticated flow: Upload → Parse → Review → Confirm → create real Debts + opening BalanceSnapshots → Home (Upcoming Payments renders) → Debts (no structural/subtotal rows ever appeared as debt cards) → Plan (renders without error) → re-login → hard refresh — data persisted correctly at every step, never regressed to onboarding. Direct Firestore inspection of the resulting Debt documents confirmed real, correct balances/APRs/due-days/business-exclusion, matching what Review had shown. Fully cleaned up afterward (synthetic workspace, debts, balance snapshots, Auth account, allowlist entry all deleted; verified `beta_allowlist` empty and only the real owner's account/workspace remain).

### 11.8 Payment execution integration re-verified

The sanitized fixture's due dates (including the bare-day-of-month case) flowed correctly through `NormalizedImportCandidate → Review → Debt.dueDay → paymentTiming.js → Home's Upcoming Payments`, using the deterministic 2026-08-18 as-of date established in BETA-3. Required-payment timing remained distinct from the extra-payoff-target concept throughout — nothing in this phase's import fixes touched that separation.

### 11.9 Full validation re-run after all fixes

| Check | Result |
|---|---|
| Unit tests | **888/888 passed** (up from 876 pre-BETA-3.1, +12 new tests) |
| Lint | 0 errors, same 4 pre-existing warnings |
| Firestore legacy | 12/12 |
| Firestore V2 (production `firestore.rules`) + parity | 69/69 both, zero drift |
| Firestore beta allowlist | 16/16 |
| Build (production + beta) | both green |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run perf:check` | PASS — TrackToZero V2 bundle 444.60 kB / 450 kB budget (unchanged from before this phase; these were logic fixes, no new dependencies) |
| Live beta console/network | 0 errors, 0 unexpected requests, both real-workbook passes and the persistence test |

### 11.10 Production non-touch proof

`firestore.rules` (production's file) was not modified this phase — re-verified via the same 69-test V2 parity suite passing against it unchanged. No deploy command in this phase targeted anything other than the explicitly-verified `tracktozero-beta` literal project id (`scripts/deploy-beta.mjs`'s existing Gate 1 check). `budgetapp-c9306`/`tracktozero.app` were never referenced by any command executed this phase.

### 11.11 Remaining known limitations (workbook-internal, safely surfaced, non-blocking)

The real workbook's own LINE OF CREDIT section has a genuine row-count mismatch between January (3 accounts) and its own monthly formula template (2 rows before the subtotal) — one real account is only ever sourced from January + Balance Tracker (2-3 sources instead of 12-13), correctly landing as a low-confidence, review-blocking candidate rather than a fabricated high-confidence one. Several same-lender-different-naming-convention pairs remain as separate NEEDS REVIEW candidates by design, since the workbook itself doesn't provide unambiguous cross-sheet identity to merge them safely — per the governing policy, a workbook-internal inconsistency that is safely surfaced as "needs review" is an acceptable outcome, never one that must be silently and confidently resolved.

**Gate 10 import status: PASS.**
