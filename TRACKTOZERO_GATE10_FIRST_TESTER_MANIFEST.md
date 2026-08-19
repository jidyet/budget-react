# TrackToZero — Gate 10: First Tester Cohort Manifest

**Do NOT commit real tester emails to this file, ever.** This manifest documents the *mechanism and process* for authorizing Cohort 1, not the people. As of this writing, zero real testers have been invited, approved, or contacted.

## 1. Status

| Item | Status |
|---|---|
| Server-enforced beta access control | Live on `tracktozero-beta`, verified (16/16 emulator tests + live Gate-10 QA — see `TRACKTOZERO_BETA3_PAYMENT_EXECUTION_AND_COHORT_READINESS_RESULTS.md` Sections 3.4–3.5) |
| `beta_allowlist` current contents | **Empty** (confirmed via `node tools/betaAccess.cjs list` immediately before this manifest was written) |
| Real testers invited | **Zero** |
| Real tester emails added to the allowlist | **Zero** |
| Public/self-serve signup | Closed (proven live — an unapproved signup is shown an invite-only screen and is denied at the rules level even if it bypasses the UI) |

## 2. How to authorize Cohort 1 (once the owner decides to proceed)

1. The owner supplies tester emails **outside of this repository** (chat, a password manager, a ticket — never a file that gets committed).
2. For each tester, run: `node tools/betaAccess.cjs add <exact-invite-email> --cohort 1`
3. Send the invite through TrackToZero's own existing household-invite mechanism (for a household tester) or simply share the sign-up URL directly (for a personal-workspace tester) with instructions to sign up using **exactly** the allowlisted email — see `TRACKTOZERO_BETA_TESTER_GUIDE.md`, which is written to be handed to them directly.
4. Confirm with `node tools/betaAccess.cjs list` that the entry shows `status=active`.
5. If a tester needs to be removed at any point: `node tools/betaAccess.cjs remove <email>` (revokes immediately, no deploy required, preserves an audit trail rather than deleting the record).

## 3. Proposed cohort composition (roles, not people)

See `TRACKTOZERO_BETA3_PAYMENT_EXECUTION_AND_COHORT_READINESS_RESULTS.md` Section 4.6 for the full A–E role breakdown (personal/straightforward, household owner, household invitee, import-heavy, mobile-first). 3–5 people total; roles may be combined for a smaller cohort.

## 4. What must be true before any real email is added here or to the allowlist

- [x] Payment execution layer implemented and tested.
- [x] Server-side access control implemented, tested, and live-verified against the real deployed environment.
- [x] The one defect live QA found is fixed, tested, and re-verified.
- [x] Full automated validation suite green.
- [x] Tester guide, incident severity model, stop-beta procedure, and rollback documentation all written.
- [x] All synthetic QA data cleaned up; `beta_allowlist` confirmed empty.
- [ ] **Explicit owner authorization to proceed with Cohort 1** — not granted as part of this phase; this manifest exists so that authorization, when given, has a ready mechanism to act on immediately.

## 5. Explicitly not done in this phase

No real tester was invited. No real tester email was added to `beta_allowlist`. No real tester email appears anywhere in this manifest, the results report, the tester guide, or any commit in this phase.

## 6. REAL-WORKBOOK IMPORT GATE (BETA-3.1)

Gate 10 was held after the above was already complete, pending a mandatory real-world import truth test against the product owner's own household workbook. Full detail: `TRACKTOZERO_BETA3_1_REAL_WORKBOOK_IMPORT_RESULTS.md`.

| Item | Status |
|---|---|
| Real XLSX tested | **YES** — the product owner's actual private workbook, twice (before/after fix), live against `tracktozero-beta` |
| Raw workbook committed | **NO** — remains at a private, untracked path outside this repository |
| Production used | **NO** — every command this phase targeted the explicitly-verified `tracktozero-beta` literal project id only |
| Real workbook persisted as authoritative Debt | **NO** — confirmed via direct Firestore inspection; the only Firestore trace it ever left (one `import_batches` document, containing candidate data since Review must survive a reload) was deleted along with the synthetic QA workspace that created it |
| Sanitized regression fixture | **YES** — `src/services/adapters/__fixtures__/householdBudgetStructural.fixture.xlsx`, fully synthetic, committed |
| Workbook structural parser verified | **YES** — master sheet, formula-derived monthly sheets, Balance Tracker, Bank Holidays, all confirmed against the real file's actual structure |
| Formula provenance verified | **YES** — including a real cross-sheet-formula-to-blank-cell bug found and fixed |
| Repeated month dedupe verified | **YES** — entity-key consolidation correctly reduces 12-13 sheet-sources to one candidate per real account |
| Structural row exclusion verified | **YES** — zero section-heading/subtotal rows leaked into candidates or non-debt items, both before and after fixes |
| Recurring non-debt exclusion verified | **YES** — 412 real bill/expense rows correctly excluded every pass |
| Business debt classification verified | **YES** — genuine business credit retained (scope-flagged), ordinary business bills excluded |
| Due-date mapping verified | **YES** — `Due Date` used, `Adj Due Date` confirmed never used, plus a new bare-day-of-month fix |
| Payment timing verified | **YES** — re-verified end-to-end through the sanitized fixture and the deterministic 2026-08-18 as-of date |
| **Gate-10 import status** | **PASS** |

Five real, generalized bugs were found and fixed this phase (owner-suggestion false positive, cross-sheet-formula-derived 0% APR, bare-day-of-month due date, present-but-empty APR cell counted as evidence, and a Review-UI "$0.00"-for-unresolved-balance display bug) — see the dedicated report for full detail. Zero real tester emails were requested, added, or discussed at any point during this sub-phase either.

## 7. REAL PDF CORPUS GATE (BETA-3.2)

Gate 10 was held again pending a mandatory real-world PDF statement corpus truth test against every real credit-card/line-of-credit statement in the owner's private review directory. Full detail: `TRACKTOZERO_BETA3_2_REAL_PDF_CORPUS_RESULTS.md`.

| Item | Status |
|---|---|
| All discovered PDFs tested | **YES** — 22 of 22, enumerated via a direct filesystem listing, not assumed |
| Real PDFs committed | **NO** — remain at a private, untracked path outside this repository |
| Real PDF data written to production | **NO** — no cloud-changing command targeted anything other than the local Firestore/Auth emulator this phase |
| Real financial candidates authoritatively persisted | **NO** — the bulk "add/confirm" action was never invoked at any point during browser QA |
| Lender detection verified | **YES** — 7/7 issuers correctly identified after fixes (was 5/7 before; two lenders — Discover, Navy Federal — came back with an empty creditor name before this phase's fixes) |
| Product/debt type verified | **YES** — all 3 US Bank "Personal Line" statements corrected from `credit_card` to `line_of_credit`, verified live in the Review UI |
| Balance extraction verified | **YES** — the single highest-impact fix this phase (a digit-by-digit spaced-character rendering bug) restored balance extraction for an entire lender family (4 files) that previously came back completely blank |
| Minimum-payment extraction verified | **YES** — correct throughout; genuinely absent on 2 sparse files, never fabricated as $0 |
| Due-date extraction verified | **YES** — fixed for the same lender family; correct throughout after fixes |
| Multi-APR handling verified | **YES** — a rewards/cashback/fee-percentage false-positive bug fixed, cutting one lender's inflated APR-candidate count from 10-11 to 4-5 |
| Same-lender multi-account behavior verified | **YES** — US Bank's 3 distinct real products (personal/LOC/business) remained correctly distinct throughout |
| Cross-month account grouping verified | **YES** (via existing, unmodified account-matching logic — no code in that layer was touched this phase; full persistence-level re-verification performed with the sanitized fixture, not the real corpus) |
| Duplicate statements verified | **YES** (pre-existing logic, unaffected and unmodified this phase) |
| Non-debt rejection verified | **N/A this corpus** — every real file in this specific corpus genuinely is a debt statement; the underlying gap (no dedicated non-debt detector for PDFs) is real, pre-existing, and disclosed as a known limitation, not hidden |
| Unsupported PDF rejection verified | **YES** (pre-existing password/corrupt/image-only handling, re-confirmed via source review, unmodified this phase) |
| Sanitized regression fixtures added | **YES** — 25 new tests, including newly-activated end-to-end coverage of 3 previously-orphaned, already-committed synthetic binary PDF fixtures |
| Full validation | **PASS** — 915/915 unit (up from 890/890), 12/12 + 69/69 Firestore rules (unaffected), 0 lint errors, build/perf/audit green |
| **Gate-10 PDF-corpus status** | **PASS** |

Eight real, generalized bugs were found and fixed this phase (a `parseStatement` early-exit that discarded all enrichment on a narrow initial check; digit-spaced-character PDF rendering breaking currency/date extraction; a parent-company footer mention winning lender detection over the statement's own brand; a document-type check-order bug that let generic "credit card" boilerplate outrank genuine line-of-credit evidence, plus an adjacent "Revolving Line of Credit" credit-limit-label false positive caught during verification; a whole-document APR sweep counting rewards/fee percentages as APR evidence; unsupported 2-digit-year dates across the entire date-extraction pipeline; and a combined "Opening/Closing Date" range picking the wrong date) — see the dedicated report for full detail. Two additional lower-severity owner-name boilerplate false positives were also fixed. Zero real tester emails were requested, added, or discussed at any point during this sub-phase either.

## 8. GATE 10A — SYNTHETIC LIVE COHORT

A production-like live rehearsal against the real deployed `tracktozero-beta.web.app` using a controlled 7-identity synthetic cohort (`@example.test`, never real testers). Full detail: `TRACKTOZERO_GATE10A_SYNTHETIC_COHORT_RESULTS.md`.

| Item | Status |
|---|---|
| Synthetic cohort created | **YES** — 7 identities, Firebase Auth Admin SDK, no service-account key created |
| Unapproved-user denial verified | **YES** — UI-level (clear invite-only state, no workspace bootstrap) and rules-level (`test:firestore:beta`, 16/16, including the correct-email-but-unapproved case) |
| Personal flow verified | **YES** — signup → beta access → bootstrap → empty Home → 8-item debt matrix → Snowball activation → reload |
| Household flow verified | **YES** — creation, household-aware language, owner membership |
| Secure invitation verified | **YES** — issued through the real `createMemberInvite` service call; raw token confirmed hashed before storage (never directly recoverable, by design) |
| Wrong-email denial verified | **YES** — token alone insufficient; explicit, correct mismatch message; zero financial access gained |
| Contributor verified | **YES** — against the actual `ROLE_PERMISSIONS.contributor` contract; can record payment/balance, cannot manage debts/plans (disabled, not just visually different) |
| Viewer verified | **YES** — read-only confirmed by absent payment/balance controls, disabled add/import controls, and a forced real click-through submission attempt that produced no debt |
| Joint verified | **YES** — counts once in totals, one account tile, correct "Joint / Household" owner label |
| Manual Debt verified | **YES** — 8-item matrix; missing required payment never `$0`; unknown APR never `0%` |
| XLSX sanitized import verified | **YES** — permanent BETA-3.1 fixture; 9 candidates, 8 non-debt excluded, formula-derived balance uncertainty surfaced, one candidate confirmed to a real Debt + opening BalanceSnapshot |
| PDF sanitized import verified | **YES** — pre-existing synthetic fixture; correctly classified "Line of credit," confirming BETA-3.2's classifier fix live |
| Duplicate statement behavior verified | **NOT independently re-driven this phase** — unmodified since BETA-3.2's own dedicated, already-green verification; no import-pipeline code touched by Gate 10A |
| Monthly statement same-Debt behavior verified | **NOT independently re-driven this phase** — same reasoning |
| Required-payment execution verified | **YES** — safe vocabulary only (`Due today`/`Due this week`/`Upcoming`/`Due date passed — confirm`), never `Past due`/`Missed`/`Delinquent`; required payments stayed distinct from the extra payoff target |
| Snowball/Avalanche verified | **YES** — correct ordering/warnings/no fake savings language; first-ever activation completed correctly, confirming the prior UX-9 activation fix live |
| Reload/session verified | **YES** — Home and both true deep-linkable routes (Debts, Plan) survive a hard reload; documented, non-blocking UX-9 route limitation not re-litigated |
| Feedback verified | **NOT APPLICABLE** — no feedback mechanism is currently wired into the V2 app (confirmed via source inspection); a real gap for a future phase, not a Gate 10A blocker |
| Mobile verified | **YES** — 390×844, 7/7 checks, zero overflow, zero console errors |
| Desktop verified | **YES** — 1440×900 was the viewport for the large majority of this phase's testing, zero issues |
| Console/network clean | **YES** — zero console errors throughout; zero requests to `budgetapp-c9306` at any point |
| Production untouched | **YES** — every deploy command verified against `tracktozero-beta` only; see the dedicated report's Section 3 for a serious deploy-tooling near-miss found and permanently fixed before cohort testing began |
| Synthetic cleanup complete | **YES** — full inventory before deletion; recursive workspace deletion; allowlist and Auth user removal; post-cleanup state verified an exact match to the pre-test baseline |
| Human cohort invited | **NO** |
| **Gate 10A status** | **PASS** |

One real defect was found and fixed this phase: a deployment-tooling gap (not a TrackToZero product defect) where `scripts/deploy-beta.mjs` could deploy a `dist/` build accidentally configured with production's Firebase credentials to the public beta URL. A permanent, automatic verification gate was added to the script itself, tested in both directions (correct build passes, incorrect build is refused), before any cohort testing began. Zero real tester emails were requested, added, or discussed at any point during this sub-phase.

## 9. GATE 10B.1 — PAYMENT / PLAN / RESPONSIVE HOTFIX

Real human beta use surfaced genuine product defects (money overflow, missing payment actions, conflated minimum/actual/estimated payment concepts, a P1 plan-activation blocker, a desktop layout stretch bug, an unbounded mobile payment list). Gate 10B cohort progression was paused for this hotfix. Full detail: `TRACKTOZERO_GATE10B1_PAYMENT_PLAN_RESPONSIVE_HOTFIX_RESULTS.md`.

| Item | Status |
|---|---|
| Money overflow fixed | **YES** — verified live-browser at 390×844 with a synthetic $12.3M balance + long lender name |
| Debt payment action | **YES** — direct "Record payment" button added beside "Review & edit" on every debt row |
| Home payment action | **YES** — opens the correct debt's payment form directly, verified end-to-end in a live browser |
| Current-cycle minimum modeled | **YES** — existing `minimumRequiredPayment` field, now with a `requiredPaymentSource` provenance field |
| Actual payment modeled separately | **YES** — unchanged append-only `PaymentEvent[]`, new cycle-aggregation logic |
| Estimated next minimum modeled | **YES** — new fields, architecture only, zero built-in rules (no invented formulas) |
| Dynamic minimum recalculation | **YES** — wired into recordPayment/recordBalanceSnapshot/updateDebt, gated on `manageDebts` |
| APR-alone fake minimum prevented | **YES** — empty rule registry makes it structurally impossible; regression-tested |
| Working balance updates after payment | **YES** — new `resolveWorkingBalance`, verified live |
| Confirmed-vs-working truth preserved | **YES** — `isEstimated` flag, "Estimated" disclosure copy, never presented as lender-confirmed |
| Double-subtraction prevented | **YES** — boundary-based reconciliation, regression-tested (BAL-04/05/06) |
| Paid-off confirmation path | **YES** — new `confirmDebtPaidOff`, explicit checkbox-gated UI, gated on `manageDebts` |
| First Plan activation fixed | **YES** — Saved Scenarios and Finish By now branch to create+activate when no plan is active |
| Plan persists after reload | **YES** — unchanged persistence mechanism, only the routing decision changed |
| Reforecast still works | **YES** — unchanged code path for workspaces with an active plan |
| PlanVersion immutability preserved | **YES** — no change to version-history contracts |
| Desktop Home stretch fixed | **YES** — `alignItems:start`, verified live at 1440×900 |
| Mobile payment-list wall fixed | **YES** — 3-item preview + "View all N", verified live |
| Review count audited | **LEGITIMATE** — 43 current unresolved decisions, all from one fresh, non-stale Excel batch; no counting bug found |
| Contributor permission regression | **FOUND AND FIXED before deploy** — caught by the V2 Firestore emulator suite (67/69 → 69/69) |
| Full validation | **YES** — 971/971 unit, 12/12 legacy rules, 69/69 V2 rules, 0 lint errors, build/perf/audit green |
| Production untouched | **YES** — hosting-only deploy to `tracktozero-beta`, verified via live bundle content |
| Live post-deploy verification | **YES** — deployed commit `11b6cbc` confirmed present in the live bundle; zero production Firebase requests |
| **Gate 10B.1 status** | **COMPLETE** |

Gate 10B (real human cohort) may resume once the owner personally verifies the fixes look correct on their own device against their own real data — no further engineering work is pending this hotfix.
