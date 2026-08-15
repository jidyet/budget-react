# TrackToZero — REVIEW-1C Results

Review everything → save reviewed changes once → skip missing information for later.

## 1. Starting repo state

- Branch: `phase4/migration-rehearsal`
- Starting HEAD: `db7211f` (REVIEW-1C batch-grid implementation from the immediately preceding turn — see below)
- Working tree clean at start of this pass.

This pass follows a prior REVIEW-1C implementation (commit `db7211f`) that used an
**all-at-once batch grid** (every open item rendered inline in one scroll). The user
supplied a second, more detailed REVIEW-1C spec describing an **item-by-item wizard**
(Previous/Next/jump-to-item/filter tabs) as the intended interaction model, and asked
for the Review Center to be rebuilt to match it. This document describes that rebuild.
The underlying service layer (`saveReviewSession`, `skipAllOpenReviews`, idempotency,
partial-failure isolation, stale-review protection) was already correct from the prior
pass and did not need to change — this was a UI/UX rework on top of it.

## 2. Final repo state

- Branch: `phase4/migration-rehearsal`
- Final HEAD: see git log after commit (this doc is written just before the commit
  that includes it).
- Working tree: clean after commit.
- Pushed: yes.

## 3. Review architecture discovered (reused, not rebuilt)

- **Domain layer** — `src/services/tracktozero/reviewDomain.js`: `REVIEW_TYPES`,
  `REVIEW_RESOLUTION_TYPES`, `REVIEW_STATUS` (open/resolved/dismissed),
  `evaluateReviewSignals`, `getReviewItemStatus`, `toReviewItem`, shared selectors
  (`getOpenReviewItems`, `getBlockingReviewCount`, etc.), and REVIEW-1C's own
  presentation-layer additions: `isDeferred`, `getNeedsAttentionItems`, `getLaterItems`,
  `getActionableOpenCount`, `getDeferredBlockingCount`.
- **Application service** — `src/services/tracktozero/v2AsyncApplicationService.js`:
  the REVIEW-1A per-item resolution primitives (`resolveAsExistingDebt`,
  `resolveAsNewDebt`, `resolveBalance`, `resolveApr`, `resolveMinimumPayment`,
  `resolveDueDate`, `resolveOwner`, `resolveBusinessScope`, `resolveDebtClassification`,
  `dismissDuplicate`, `addHistoricalSnapshot`, `deferReview`) plus the REVIEW-1C
  orchestration layer (`saveReviewSession`, `skipAllOpenReviews`) added in the prior
  pass. `commitImportBatch` is the two-phase resolve-then-commit primitive that gives
  match decisions their atomicity and stale-review protection.
- **UI** — `src/components/tracktozero/review/`: `ReviewCard.jsx`, `ReviewDetail.jsx`
  (still used standalone, tested independently; no longer wired into `ReviewCenter`),
  `ReviewSessionCard.jsx` (one item's full staged-answer form — reused as-is by the
  wizard), `ResolvedHistory.jsx`, `HomeQuickCheck.jsx`, and `ReviewCenter.jsx` (rebuilt
  this pass).

No second review system, candidate model, or reconciliation collection was created.
Every mutation still flows through the existing REVIEW-1A primitives.

## 4. What REVIEW-1C changed (this pass)

`ReviewCenter.jsx` was rewritten from an all-at-once grid into an item-by-item wizard:

- **Filter tabs**: `Needs review (N)` / `Skipped for later (N)` / `Resolved (N)` /
  `All (N)`, each with a truthful count derived from the shared `ReviewSnapshot`.
- **Wizard navigation**: `Item X of N`, `Previous`/`Next` buttons (disabled at the
  queue's boundaries), and a `Jump to item` `<select>` — applies to both the
  "Needs review" and "Skipped for later" tabs, which share the same
  `ReviewSessionCard`-based staged-editing view.
- **Staged answers survive navigation**: `staged` state is keyed by item id and lives
  above the wizard's current-item pointer, so moving to Item B and back to Item A
  preserves A's in-progress edits (proven in browser QA — see §14).
- **"Resolved" tab**: read-only, reuses the existing `ResolvedHistory` component.
- **"All" tab**: three grouped, clickable jump-lists (Needs review / Skipped for
  later / Resolved) so the user can see everything and jump into any open/deferred
  item directly.
- **Sticky summary bar**: `N ready` / `N skipped for later` / `N still need a decision`
  badges, recomputed from live state (never hard-coded), plus `Skip all for now` and
  `Save what I know`.
- **Pre-save confirmation summary** (new — Part 15): clicking `Save what I know` opens
  a `Ready to save?` dialog listing exactly what will happen — new debts, existing-debt
  updates, a confirmed-balance total, duplicates resolved, exclusions, how many items
  will still need one more decision, and per-field "still unknown" counts (APR/minimum/
  due date/owner) — before the single explicit `Confirm and save` actually calls
  `saveReviewSession`.
- **Unsaved-session protection** (new — Part 19): a `beforeunload` listener warns
  before an accidental refresh/close discards an in-progress, unsaved review session.
  This covers refresh/close-tab, the highest-value case; in-app tab navigation
  (clicking Home/Debts) is not intercepted, since the app's nav is a simple state
  switcher, not a router with navigation guards — adding that would be a materially
  larger change than this phase's scope. Noted as a limitation (§23).
- `ReviewDetail.jsx`'s "Finish this" drawer is no longer wired into `ReviewCenter` —
  the wizard's "Skipped for later" tab now serves that purpose directly (navigate to
  the item, it's the same staged-editing view, staging and saving a terminal decision
  correctly un-defers it). `ReviewDetail.jsx` itself is untouched and still covered by
  its own tests.

New pure module: `src/components/tracktozero/review/reviewSessionSummary.js` —
`getTerminalEntry`/`buildPreSaveSummary`, extracted out of `ReviewCenter.jsx` so it's
independently unit-testable (and so the component file only exports the component,
per React Fast Refresh's export-shape lint rule).

## 5. Review-session model

A review session is: open `ReviewCenter` → work through the "Needs review" queue one
item at a time (or jump around) → stage whatever's known on each item → optionally
switch to "Skipped for later" to revisit something you deferred earlier → click
`Save what I know` once → confirm the pre-save summary → the approved items commit.
Nothing is authoritative until that one explicit confirm.

## 6. Save-once semantics

One user-level commit intent (`Save what I know` → `Confirm and save`) triggers exactly
one call to `service.saveReviewSession(workspaceId, flatStagedAnswers)`. Internally that
walks each staged answer sequentially (not parallel — Part 52, bounded Firestore load),
calling the same named REVIEW-1A resolution primitive each staged action already maps
to, then commits each affected `ImportBatch` at most once (not once per candidate).
The user never presses Save more than once per session.

## 7. Skip-for-later semantics

- **Individual**: `Leave for later` on any item calls `deferReview` immediately (it's
  already zero-mutation and safe to fire without waiting for the batch Save).
- **All at once**: `Skip all for now` (behind a confirmation dialog) calls
  `skipAllOpenReviews`, which defers every currently open item one at a time via the
  same `deferReview` primitive.
- A deferred item is still `REVIEW_STATUS.open` (reviewDomain.js `getReviewItemStatus`)
  — deferring never confirms, resolves, or dismisses anything. It just moves the item
  from the "Needs review" tab to "Skipped for later," where it stays fully visible and
  editable, never hidden or deleted.

## 8. Required vs optional field behavior

Unchanged from REVIEW-1A/1B, reused as-is:

- `apr = null` / `aprStatus = "unknown"` remains valid, explicit, non-blocking-enough
  to leave a candidate open without forcing a value.
- Missing minimum payment / due date remain missing (never `$0`, never fabricated).
- A staged field-only answer (`resolveBalance`/`resolveApr`/`resolveMinimumPayment`/
  `resolveDueDate`/`resolveOwner`) never by itself closes a review item — it narrows a
  signal (see `evaluateReviewSignals`), but `getReviewItemStatus` only returns
  `resolved` for a mutation type once `committedOutcome` exists, or for a dismissing
  type once decided. This is why the pre-save summary (§ above) distinguishes items
  with a **terminal** staged answer (new/existing/dismiss-duplicate/exclude) from items
  with only a **field-level** staged answer, which still show as "needs one more
  decision" even though the field itself will be saved.

## 9. New-debt behavior

`resolveAsNewDebt` + `commitImportBatch` creates exactly one `Debt` + one opening
`BalanceSnapshot`, atomically, only after the user's explicit staged decision is saved.
An un-staged/un-approved candidate creates neither. Unchanged from REVIEW-1A.

## 10. Existing-debt behavior

`resolveAsExistingDebt` updates only the fields the reviewer explicitly accepted (via
the diff checkboxes in `ReviewSessionCard`'s match section) plus records the new
confirmed balance as a `BalanceSnapshot`. Unrelated fields are untouched. Unchanged
from REVIEW-1A.

## 11. BalanceSnapshot behavior

Unchanged from REVIEW-1A: a `BalanceSnapshot` is only created as part of an
update-existing or create-new commit, never merely because an unrelated field (APR,
owner, due date) was staged and saved. Historical statements go through
`addHistoricalSnapshot`, which records the older observation without touching the
debt's current balance. Previous snapshots are never overwritten.

## 12. Idempotency / recovery

Reused, not reimplemented, from the prior pass:

- `saveReviewSession` double-click safety verified by a direct regression test
  (`v2AsyncApplicationService.reviewSession.test.js`).
- A partial-batch failure (one candidate fails, another succeeds) is isolated per
  candidate by `commitImportBatch`; the failed one stays open/retryable, the succeeded
  one is not rolled back.
- Stale-review protection (fingerprint captured at decision time, checked at commit
  time) prevents a decision from silently overwriting a debt that changed in the
  meantime.
- A bug found and fixed in the prior pass — `commitImportBatch` incorrectly marking an
  entire multi-candidate `ImportBatch` "committed" as soon as zero *attempted*
  candidates failed (silently ignoring undecided ones) — remains fixed and covered by
  a regression test; this wizard's multi-item queues depend on that fix (resolving one
  item must never lock the others).

## 13. Review-count definition (documented, one definition app-wide)

The nav badge and Home's "Quick Check" both read `reviewSnapshot.actionableCount`
(`getActionableOpenCount` in `reviewDomain.js`) — open items that are **not** deferred.
`blockingCount` (used for Home's plan-trust state) is deliberately **not** filtered by
deferred status: a blocking review that was skipped must still keep the plan's momentum
untrusted, so Home separately surfaces `deferredBlockingCount` to say so honestly
("N items were saved for later and still affect your payoff plan") rather than pretend
nothing is blocking.

## 14. Home/Debts/Review consistency

Verified live in browser QA: after a save, the nav Review badge count updates without
a page reload, the "Needs review" tab's queue count updates, resolved items appear
under "Resolved," and Home's total-debt figure reflects the newly-updated balance.

## 15. Authorization / security

Unchanged from the prior pass, still enforced identically for the new UI (it calls the
same service methods): workspace-scoped membership checks in `getWorkspaceContext`,
role checks via `hasPermission(membership, "manageDebts")` on every resolution
primitive, and `saveReviewSession`/`skipAllOpenReviews` never grant a mutation to an
actor whose per-item call fails permission — a failure is reported, not silently
retried with elevated access. Cross-workspace and viewer-role denial covered by
`v2AsyncApplicationService.reviewSession.test.js`.

## 16. Firestore / rules changes

None. No rules file was touched this pass. `test:firestore:v2`'s rules-parity guard
(identical suite against `firestore.rules` and `firestore.v2.rules`) still passes.

## 17. Tests and exact results

- `npx vitest run`: **493 passed / 493**, 37 files (11 new tests this pass: 2 wizard
  render/nav tests + 9 `buildPreSaveSummary` categorization tests, in
  `reviewUi.test.js`; the rest are the 482 carried over unchanged from the prior pass).
- `npm run lint`: 0 errors, 3 pre-existing unrelated warnings (`App.jsx`,
  `useAccounts.js`, `useInstallPrompt.js`).
- `npm run build`: succeeds.
- `npm run test:firestore`: **12 passed / 12**.
- `npm run test:firestore:v2`: **51 passed / 51**, rules parity guard PASS.
- `npm run perf:check`: all bundle budgets pass (the V2 app bundle actually shrank,
  215.39 kB → 203.11 kB, since the wizard renders one item at a time instead of every
  open item's full form at once).
- `npm audit --omit=dev`: 0 vulnerabilities.

## 18. Browser QA

Real Playwright session against `emulators:v2` + `dev:v2-local`, synthetic 3-row CSV
(one possible-match candidate, one missing-balance candidate, one clean/unmatched
candidate) plus one manually-added debt. Verified, zero console errors throughout:

- Landed on "Needs review," `Item 1 of 3`, correct tab counts.
- Staged a match decision on Item 1, `1 ready` badge updated live.
- `Next` → Item 2, staged a balance field.
- `Next` → Item 3 (the known pre-existing no-match gap, §22).
- **Jumped back to Item 1 via the jump-to-item select — its staged "Update this debt"
  selection was still there**, proving staged answers survive navigation (Part 5).
- `Save what I know` → pre-save summary dialog showed the correct truthful breakdown
  ("1 existing debt will be updated," "Confirmed balances recorded: $11,880.00,"
  "2 items still need one more decision," "APR: still unknown on 1 item") →
  `Confirm and save` → post-save summary ("2 updates saved. 1 still needs
  information.") — correctly distinguishing the *field* that saved (the balance) from
  the *item* that stayed open (no terminal decision yet).
- `Leave for later` on the remaining item → "Skipped for later" tab showed it, with
  the blocking warning callout when applicable.
- `Skip all for now` → confirmation dialog → confirmed → items moved to "Skipped for
  later."
- "All" tab showed three correctly-grouped, clickable lists.
- "Resolved" tab showed history correctly.
- Responsive: 1440/1024/768/375, zero horizontal overflow at any width.

One real (pre-existing, not newly introduced) bug was reconfirmed during this pass and
is discussed in §22 rather than fixed, since fixing it is a taxonomy-level change to
`evaluateReviewSignals` that's out of scope here.

## 19. Accessibility

- Filter tabs use `role="tablist"`/`role="tab"`/`aria-selected`.
- Position indicator (`Item X of N`) is `aria-live="polite"`.
- `Jump to item` is a labeled `<select>` via the existing `Field` component (explicit
  `<label htmlFor>`).
- Previous/Next buttons use native `disabled` at queue boundaries (never just visually
  dimmed).
- Status is never color-only: every stat badge (`Ready`/`Skipped`/`Still need a
  decision`) carries its own text, and the "still needs a decision" tone only shifts to
  warning when the count is nonzero, never relying on color alone to convey it.
- The pre-save and skip-all dialogs reuse the existing `ConfirmationDialog`/`Modal`
  primitives (`role="dialog"`, `aria-modal`, labelled title) — no new modal pattern
  introduced.

Full mobile hardening remains a later phase (UX-8), consistent with the deferred-work
list below; nothing here introduces new mobile breakage (verified at 375px).

## 20. Performance

No new per-item Firestore listeners were introduced — the wizard renders one
`ReviewSessionCard` at a time from data already in the shared `ReviewSnapshot`/
`WorkspaceSnapshot` (same query pattern as before). `saveReviewSession` remains
sequential/bounded (Part 52), not parallel, keeping Firestore write load predictable
regardless of session size. No new indexes required.

## 21. Files changed (this pass)

- Rewritten: `src/components/tracktozero/review/ReviewCenter.jsx`
- New: `src/components/tracktozero/review/reviewSessionSummary.js`
- Modified: `src/services/tracktozero/reviewCopy.js` (wizard-nav + pre-save-summary
  copy additions; one pluralization/truthfulness copy fix made during QA)
- Modified: `src/components/tracktozero/review/reviewUi.test.js` (1 test updated to
  match the new sticky-bar copy, 11 new tests added)

## 22. Known limitations

- **Pre-existing gap, not introduced or fixed this pass**: an import candidate with
  zero review signals — genuinely new, unambiguous, no existing-debt match
  (`evidence.reconciliation.classification === "no_match"`) — has no actionable
  "confirm as new debt" control in the wizard, because `evaluateReviewSignals` never
  flags `noMatch` as a `matchDecision` signal, so `ReviewSessionCard`'s `hasMatch` gate
  never renders a section for it. Confirmed identical in the untouched `ReviewDetail.jsx`
  single-item drawer, so this is not a REVIEW-1C regression. The only action available
  for such an item today is `Leave for later`. Recommend a small, deliberate follow-up
  (either treating `noMatch` as its own always-actionable "confirm new debt" signal, or
  an explicit product decision on how these should surface) rather than expanding this
  phase's scope to fix it.
- In-app navigation away from Review Center (clicking Home/Debts/etc. with unsaved
  staged answers) is not intercepted — only browser refresh/close is guarded via
  `beforeunload`. A full in-app navigation guard would require changes to the app
  shell's nav dispatch beyond this phase's scope.
- The pre-save summary's "confirmed balance total" only reflects items with a staged
  **terminal** decision (new/existing); it deliberately excludes historical-snapshot
  balances (which explicitly should never look like current confirmed balances) and
  anything without a terminal decision, per the "never fold unresolved/skipped into a
  confirmed total" rule.

## 23. Deferred work — DATA-HH1

Not started. No Kristina/Babajide-style identity matching, no alias inference, no
imported-name-to-UID mapping, no automatic membership creation, no invitation
acceptance. Owner resolution is exactly as it was: verified member / Joint / Unassigned
only, with `ownerSuggestion` preserved as raw, non-authoritative parser evidence.

## 24. Deferred work — UX-4 / UX-2.1 / UX-5 / UX-6

None of these were touched:

- No Plan-page redesign (My Plan hub, What If, Finish By, saved scenarios, new
  strategy-comparison UI) — UX-4.
- No donut/pie charts, trajectory graphics, momentum bars, or new Home insight tabs —
  UX-2.1.
- No import/upload/parser-presentation redesign beyond the minimum Review Center
  wiring already in place — UX-5.
- No invite/accept/resend/cancel-invitation or household member administration —
  UX-6.

---

```text
DATA-HH1 NOT IMPLEMENTED
UX-4 NOT IMPLEMENTED
UX-2.1 NOT IMPLEMENTED
UX-5 BROAD POLISH NOT IMPLEMENTED
UX-6 NOT IMPLEMENTED
NO PRODUCTION DEPLOYMENT
NO REAL FINANCIAL DATA USED
```

**NEXT: DATA-HH1 — imported person identities + owner mapping**
