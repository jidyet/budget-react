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
