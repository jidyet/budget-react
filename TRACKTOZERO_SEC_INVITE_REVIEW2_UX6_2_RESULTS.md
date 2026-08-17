# SEC-INVITE + REVIEW-2 + UX-6.2 — Results

## 1. Status

Complete. All three workstreams' locked requirements are implemented, tested (automated + real browser QA), and verified. SEC-INVITE's scope turned out to be primarily a hardening/coverage pass rather than a rebuild — the existing invitation architecture was already sound (see §4-14). A small number of items were deliberately assessed as lower-value/heavier-setup and documented rather than implemented (see §45).

## 2. Starting commit

`a6084ac` (UX-6.1) on `phase4/migration-rehearsal`, not pushed. Verified clean worktree, correct branch, and `git diff --check` clean before starting.

## 3. Baseline

Read `TRACKTOZERO_UX6_1_FULLSCREEN_DEBT_WORKSPACE_RESULTS.md` in full. Test baseline going in: 683 vitest / 12 Firestore / 63 Firestore V2 / 0 lint errors / 0 audit vulnerabilities.

## 4. SEC-INVITE threat model

Sixteen attack paths were evaluated against the **existing** invitation architecture (`src/domain/tracktozero/models.js`'s `createWorkspaceInvitation`, `v2AsyncApplicationService.js`'s `createMemberInvite`/`acceptMemberInvite`, `firebaseTrackToZeroRepository.js`'s `acceptMemberInvite` transaction, `firestore.rules`/`firestore.v2.rules`), read directly and traced end to end before any code was changed:

| Threat | Status found |
|---|---|
| Guessing/enumerating invite IDs | **Already mitigated** — doc ID is `SHA-256(32 random bytes)`, not a predictable/sequential value; `list` requires membership |
| Forwarded/stolen invite link | **Already mitigated** — possessing the link/token alone is insufficient; acceptance also requires the authenticated user's server-verified email to match |
| Replay of an already-accepted invite | **Rule logic already present, was untested** — closed with a new regression test (§10) |
| Browser tampering with workspaceId/email/role/ownerId | **Already mitigated** — role comes from the stored invite doc, not client input; email is the server-verified Auth claim, not a form field; workspaceId alone is meaningless without a matching invite |
| Authenticated attacker using someone else's invite | **Already mitigated and tested** (`"invite acceptance is blocked when the authenticated email does not match the invite"`) |
| Direct Firestore membership write bypassing the invite flow | **Already mitigated and tested** (`"raw-email invite creates no access-granting membership"`) |
| Self-elevation to a higher role | **Already mitigated and tested** (`"viewer and contributor cannot self-promote or smuggle role changes"`) |
| Using an invite for a different workspace | **Already mitigated and tested** (`"cross-workspace member insertion is denied"`) |
| Expired invite reuse | **Rule logic already present, was untested** — closed (§10) |
| Cancelled invite reuse | **Rule logic already present, was untested** — closed (§10) |
| Concurrent double acceptance | **Already mitigated** — `runTransaction` + rules' `existsAfter`/`getAfter` cross-checks make membership-creation and invite-consumption atomic |
| Cross-workspace membership creation | Same as above — already mitigated and tested |
| Leaking invite secrets in logs | Raw token only ever appears in the join URL (client-side, in-memory); only the hash is persisted/logged |
| Leaking invite secrets into searchable records | `list` on `member_invites` requires membership; `get` (single doc, ID required) is intentionally public for the pre-auth join-preview screen — this specific boundary (get-yes/list-no) was previously untested, now closed (§10) |
| Invite spam / brute force | **No rate limiting exists** — documented as a production dependency, not implemented (§46) |
| Financial profile used to bypass secure membership | **Already safely scoped** — `connectWorkspacePersonToMember`'s self-service path can only ever target the caller's own uid (app logic + independent rules enforcement); admin-initiated linking requires `manageMembers` |

## 5. Invite architecture

Unchanged from what already existed (confirmed correct, not rebuilt): `createWorkspaceInvitation` (`models.js:66-84`) — `id`, `workspaceId`, `workspaceName`, `emailNormalized`, `role` (enum, owner excluded), `status` (`pending|accepted|canceled|expired`), `tokenHash`, `invitedByUserId`, `createdAt`, `expiresAt`, `acceptedAt`/`acceptedByUserId`, `canceledAt`/`canceledByUserId`.

## 6. Token strategy

`randomInviteToken()` (`v2AsyncApplicationService.js`) generates 32 bytes via `crypto.getRandomValues`, base64url-encoded. `hashInviteToken()` computes `SHA-256` over the raw token. The Firestore document ID **is** the hash (`tokenHash`), never the raw token — the raw token exists only transiently client-side and inside the join URL (`/join?workspace=...&token=...`). This is a materially different, stronger code path than the generic `id(prefix)` helper (`Date.now()+Math.random()`) used elsewhere in the service for non-secret IDs (workspaces, debts, plans) — confirmed by direct reading, not assumed.

## 7. Email binding

Enforced at the Firestore rules layer, the real, un-bypassable boundary for this client-only SPA (no Cloud Function/callable exists in the invite path): `inviteMatchesSignedInEmail` compares `request.auth.token.email` (the server-verified Firebase Auth claim) against `inviteData.emailNormalized`. The app-layer check in `acceptMemberInvite` (`v2AsyncApplicationService.js`) is UX-only (friendlier error before a round-trip); it cannot be weakened without also weakening the rules, which were left untouched. Verified live: creating an invite and then canceling it, and via the rules test suite's `"invite acceptance is blocked when the authenticated email does not match the invite"` test (pre-existing, still passing).

## 8. Role binding

The inviter's chosen role is persisted on the invite document at creation (`createMemberInvite`, restricted to `admin|contributor|viewer`, both app- and rules-enforced). At acceptance, `isInviteAcceptanceMembership`'s rule requires `request.resource.data.role == getAfter(invitePath(...)).data.role` — the membership write must carry exactly the invite's own stored role; nothing client-supplied can override it. `acceptMemberInvite` (service layer) reads `invite.role` itself, never a caller-supplied role parameter.

## 9. Acceptance transaction

`firebaseTrackToZeroRepository.js`'s `acceptMemberInvite` performs the membership write, the `member_index` mirror write, and the invite status update inside one `runTransaction`. This is independently enforced by the rules themselves (`existsAfter`/`getAfter` cross-document checks between the invite and member docs), not merely by client code discipline — a partial/non-atomic write cannot satisfy the rule. Unchanged; verified via the pre-existing `"invited user can accept exactly their own pending invite by creating membership + accepted invite atomically"` test, still passing.

## 10. Replay protection

**New work this phase.** `isInviteAcceptanceUpdate`'s `resource.data.status == "pending"` guard already existed and already blocks a second acceptance attempt against an invite whose status is no longer `"pending"` — but no test exercised it. Added `"replaying an already-accepted invite is denied, including by a different attacker uid"` to `tests/firestore.v2.rules.test.js`, covering both the original invitee attempting a second acceptance and a different attacker uid attempting to claim an already-used invite. Both correctly denied.

## 11. Cancel / expire

Both rule branches (`resource.data.status == "pending"` for cancel-state, `expiresAt > request.time` for expiry) already existed but were untested. Added `"canceled invite cannot be accepted"` and `"expired invite cannot be accepted"` regression tests. Owner/admin cancellation itself (`service.cancelMemberInvite`) was already implemented and unchanged; verified live in the browser (§39) that clicking "Cancel invite" updates the UI from "Pending invitation" to "Canceled" and the Cancel button disappears — backed by the same rules-enforced state transition, not merely a UI hide.

## 12. Membership write barrier

Confirmed via direct rules reading and the pre-existing (still-passing) `"raw-email invite creates no access-granting membership"` test: the `members/{uid}` create rule requires `isInitialOwnerMembership(...) || isInviteAcceptanceMembership(...) || isMigrationOperator(...)` — there is no branch permitting an ordinary signed-in user to write a membership document for themselves or anyone else outside these two paths. No changes made; this was already correct.

## 13. Invite rules / permissions

`member_invites/{id}`: `create` requires `isAdminPlus` (owner/admin only); `get` (single doc by ID) is `true` (the intentional unauthenticated join-preview path); `list` requires `isViewerPlus` (real membership); `update` allows admin-role edits (cancel path) or `isInviteAcceptanceUpdate`; `delete` is always `false` (status-transitioned, never removed). Added `"a single invite is readable by id (unauthenticated join-preview) but the collection cannot be enumerated by a non-member"` to pin the `get`-yes/`list`-no boundary specifically, since it was the one place unauthenticated read access exists at all in this ruleset and had no dedicated test.

## 14. Unconnected financial profile contract

Audited `connectWorkspacePersonToMember` (`v2AsyncApplicationService.js:530-554`) and its rule (`isSelfPersonLink`). Confirmed: a self-service caller (`allowSelfService: true`) can only ever link a profile to `memberUid === actorId` — their own uid, never someone else's; cross-user linking requires `manageMembers` (owner/admin tier) and is independently rules-enforced. Display-name similarity is never used to establish identity (`matchImportedOwnerToIdentity` is explicitly a pre-fill suggestion, never authoritative — re-verified by `resolveDebtOwnership` before anything is persisted). No changes made to this function; it was already safe. Settings UI now additionally labels an unconnected profile with an explicit "Financial profile" badge (§25) so it can never visually pass for a verified member.

## 15. Security test results

`tests/firestore.v2.rules.test.js`: **67 passed** (63 pre-existing + 4 new: expired-invite denial, canceled-invite denial, replay/reuse denial, get-vs-list scoping), run against both `firestore.rules` (production, authoritative) and `firestore.v2.rules` (reference) via `npm run test:firestore:v2` — **"Rules parity guard: PASS — No drift detected"** both times this phase ran the suite. `npm run test:firestore` (legacy V1 rules): **12/12 passed**, unaffected.

## 16. Review queue root-cause analysis

Traced `classifyRow` (`workbookDebtDiscovery.js:289-324`) and `matchSectionHeading` (`financialItemTaxonomy.js`) line by line. Root cause, confirmed via direct code trace (not assumption): a row with **zero** evidence of any kind (no debt-category vocabulary, no bill vocabulary, no balance, no APR) hit `classifyRow`'s final fallback, which returned `CLASSIFICATIONS.uncertain` — a classification that **enters the review queue as a blocking candidate**, not `CLASSIFICATIONS.notDebt` (silently excluded/counted). `matchSectionHeading`'s whitelist (credit cards/student loans/.../business) had no entry for generic top-level workbook words like "household," so a bare "HOUSEHOLD" label fell all the way through to that fallback. `candidateFromGroup` never filtered on `financialItemType` — the only real gate was `classification !== notDebt`, which `uncertain` passes trivially. This exactly explains the reported "HOUSEHOLD — is this a loan you're paying down to $0?" symptom, confirmed via `ReviewSessionCard.jsx`'s `DebtClassificationSubSection` rendering `` `${candidate.accountName} - is this a loan you're paying down to $0?` `` for any `uncertain`/`possible_debt` candidate.

## 17. Exact reproduction counts (not the private, unavailable 52-item dataset — a synthetic fixture reproducing its shape)

No 52-item fixture exists anywhere in the repo (`v2SeedData.js` tops out at 7 debts); the original report is from a real, larger household import not available to reproduce directly. Built `src/services/adapters/__fixtures__/householdBudgetLarge.fixture.{js,xlsx}` — 31 rows: 10 real debts, 9 real bills, 2 genuinely ambiguous items, 7 bare section-heading noise rows (HOUSEHOLD/MISC/OTHER/GENERAL/SUMMARY/NOTES/OVERVIEW), 3 unrecognized placeholder labels (TBD/"Review later"/Placeholder). Ran it through the **actual pipeline** before and after the fix (before-state captured via `git stash` of just the two classification-logic files, not invented):

| | Before fix | After fix |
|---|---|---|
| Total candidates entering the pipeline | **22** | **12** |
| Of those, review-blocking (`uncertain`/`possible_debt`) | **12** | **2** |
| — fake header/placeholder rows among the blocking ones | **10** (HOUSEHOLD, MISC, OTHER, GENERAL, SUMMARY, NOTES, TBD, "Review later", Placeholder, OVERVIEW) | **0** |
| — genuinely ambiguous real items (Car Payment, Fingerhut) | 2 | 2 (unchanged — correctly still reviewable) |
| Non-debt items (excluded, non-blocking) | 9 (bills only — headers weren't even reaching this bucket, they were becoming fake blocking candidates instead) | **12** (9 bills + 3 honestly-labeled `UNKNOWN` placeholders) |

An 83% reduction in review-blocking noise (12→2) on this fixture, with the 2 genuinely ambiguous real items untouched — exactly the "fail closed, don't over-exclude" requirement. Locked into a permanent regression test (`workbookDebtDiscovery.test.js`, "realistic large fixture - exact candidate/non-debt counts...").

## 18. False-candidate fixes

Two changes, both additive/structural, not a bigger blocklist alone:
1. `SECTION_HEADING_MATCHERS` gained one new pattern (`household|misc(?:ellaneous)?|other|general|summary|overview|notes?`) tagged `HEADER_OR_SECTION` — the direct fix for the reported case.
2. `classifyRow`'s zero-evidence fallback now returns `notDebt` (not `uncertain`) when both `debtSignals` and `billSignals` are empty and there's no balance/APR evidence — the structural, whitelist-independent fix (a genuinely new/unanticipated bare label, e.g. "TBD," is caught by this even though it's not in the whitelist; regression-tested explicitly). A real bug was found and fixed while implementing this: the new `HEADER_OR_SECTION` section matches were initially allowed to propagate as `currentSectionLabel` context to child rows, which let `financialItemTypeForNonDebt`'s existing "sectionHint wins" precedence overwrite a real bill's correct type (e.g. "Electricity" under a stray "OVERVIEW" heading was mislabeled `HEADER_OR_SECTION` instead of `UTILITY`) — fixed by excluding `HEADER_OR_SECTION` matches from section-context propagation, mirroring how `subtotalOrSummary` matches were already excluded.

## 19. Non-debt classification

Unchanged in its own right — `financialItemTypeForNonDebt`'s existing vocabulary (savings/income/insurance/subscription/utility/storage/home-expense) still works correctly; verified no regression via the full existing DATA-2 test suite plus the new large-fixture test asserting every real bill keeps its correct specific type. The one true fallback case (zero evidence, zero vocabulary) is now honestly `FINANCIAL_ITEM_TYPES.unknown` rather than silently miscategorized as a generic bill.

## 20. Blocking vs. non-blocking review model

Already existed, was not built this phase: `reviewDomain.js`'s `evaluateReviewSignals` already computes `blocking` per review type, with `getBlockingReviewCount`/`getActionableOpenCount` already wired into `ReviewCenter.jsx` via `getReviewSnapshot`. `reviewCopy.js`'s `getReviewCenterSummary({openCount, blockingCount})` already produces the exact target format. **Verified live**: importing the large fixture showed "12 things need a quick check · 4 affect your payoff plan · 8 can wait" — confirming the root-cause fix (§16-18) is what actually solves the "52 things" overwhelm, since the summary-copy plumbing was already correct and would have faithfully (and honestly) reported "12 blocking" if the fake candidates hadn't been fixed at the source.

## 21. Review workbench redesign

`ReviewCenter.jsx`: added a real, visible queue-list pane (`ReviewQueueList.jsx`, new — compact rows with a blocking/non-blocking icon and issue-count badge, reusing the visual language already established by `import/ImportCandidateList.jsx`) beside the existing detail pane on desktop (`minmax(220px,280px) 1fr` grid, matching the Import Review master-detail pattern from UX-6.1), collapsing to detail-only (keeping the pre-existing Jump-to-item `<Select>`/Previous/Next) below the `useIsTablet` (960px) threshold — the existing staged-answer/save/skip architecture was **not** touched, only the navigation surface around it. `ReviewSessionCard.jsx`: the root card no longer amber-washes the whole item just because something inside is unresolved (`variant={item.blocking ? "warning" : "default"}` → always `"default"`, with a small `"Affects your plan"`/`"Can wait"` badge instead) — this was the actual "orange on orange" fix; the genuinely-unresolved sub-section cards (Balance/APR/etc.) keep their amber styling, since that's correct, targeted signal.

## 22. Multi-APR

Preserved unchanged: `AprSubSection` already showed all meaningful known APR candidates with "Most likely" on the top-ranked one, never silently picking one. Extended with the same balance-type labeling UX-6.1 already added to Import Review's `AprCandidatesField.jsx` (Purchases/Cash advance/Balance transfer/Penalty rate, read from `entry.provenance.matchedText`) — a real double-implementation gap closed, not new logic invented.

## 23. Owner review

`OwnerSubSection` already had the exact three-tier suggestion/match/confirm language the task describes ("Suggested owner: X" / "Possible match... please confirm" / "We couldn't match X to someone in your household"). Its "Confirmed owner" dropdown now consumes the shared `getAssignableDebtOwners` derivation with `<optgroup>` separation ("Verified members" / "Financial profiles (not connected to an account)") instead of one flat, undifferentiated list — closing the same gap fixed in `OwnerField.jsx`/`ScopeSelector.jsx` (§27-28).

## 24. Review resume/persistence

Not touched — `ImportBatch`/candidate persistence, the resumable-import flow, and `ReviewSessionCard`'s staged-answer model were all left exactly as they were. Verified no regression via the full `reviewUi.test.js` suite (43/43 passing) and live browser QA (staged answers, Save this debt, Skip all for now all functioned correctly against the large fixture).

## 25. Personal presentation

`PortfolioHeader.jsx`'s title now reads "My debt" for a Personal workspace (was the workspace-agnostic "What you owe"), via the new shared `getWorkspacePresentation(workspace)` helper. Verified live: switching to `personal-seed` showed "My debt," zero owner-scope chrome (no `ScopeSelector`, which already correctly returns `null` for non-household workspaces — confirmed still correct, not newly built), and no leftover household-specific state (see §36).

## 26. Household presentation

`PortfolioHeader.jsx` reads "Our debt" for a Household workspace. `PlanSection.jsx`'s existing "Your path to $0" title gained a small "Household payoff plan"/"My payoff plan" overline via the same helper, preserving the established brand copy rather than discarding it. Household member breakdown, Joint, category composition, and owner badges were all already correct per the audit (§27) and confirmed unchanged via the full test suite + browser QA.

## 27. Verified member source

Audited and confirmed: `resolveDebtOwnership` (`ownership.js`) already only accepts a verified `WorkspaceMembership` uid or a verified `WorkspacePerson` id, both re-checked against the live active/non-merged lists — never a statement-holder name, `ownerLabel`, free text, unconnected financial profile status, pending invitation, or parsed contact info. This was already correct; **what was missing was UI clarity**, not authorization: `OwnerField.jsx`, `ScopeSelector.jsx`, `ImportCandidateDetail.jsx` (inherits from `OwnerField`), and `ReviewSessionCard.jsx`'s `OwnerSubSection` all previously rendered verified members and financial profiles as one flat, undifferentiated list. New shared `getAssignableDebtOwners({members, people})` (`ownership.js`) — returns `{verifiedMembers, financialProfiles}`, both pre-filtered to active/non-merged, and **never reads a memberInvites list at all**, so a pending invitation cannot leak into either group by construction, not merely by convention. All four consumers now use it, with `<optgroup>`/labeled-section visual separation.

## 28. Owner identity contract

Confirmed via direct code read: authority is durable ID (`ownerId`/`ownerType`), never a display label — `presentedOwnerLabel` reads a stored display string for presentation only and is documented as such; it does not re-resolve against live membership on every read (a removed member's stale label can persist on old debts, a known, pre-existing, and low-severity characteristic, documented in §47, not newly introduced). Renaming a person's display name does not create a new owner (id-based, not name-based) — confirmed by `resolveDebtOwnership`'s existing id-lookup logic, unchanged.

## 29. Joint contract

Confirmed via direct code read across every `ownerType === "joint"` call site (`debtPortfolioView.js`, `homeViewModels.js`, the payoff engine's flat `payoffQueue`): Joint is the sentinel `{ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household"}`, never a real member/person ID, never copied per-person, never modeled by `"Everyone"` or the household's own name. No changes were needed — this was already correct.

## 30. Joint aggregation proof

No double-counting bug found anywhere (§29's audit). Every joint total traced to either a single backend-aggregated scalar (`snapshot.portfolioSummary.jointDebt`) or a single `effectiveOwnerType(debt) === "joint"` filter over the flat debts array — a joint debt appears exactly once in `snapshot.debts` and is counted exactly once by every consumer. Verified live in UX-6.1's original QA (Joint scope showed Personal Loans + Mortgage, matching exactly) and re-confirmed unaffected by this phase's changes via the full `debtPortfolioView.test.js` suite (unchanged, all passing).

## 31. Home changes

None. `home/HomeCommandCenter.jsx`/`homeViewModels.js` were explicitly not touched, per the task's own UX-7 boundary. The audit (done before any code was written) confirmed Home's Personal/Household gating (`isHousehold ? deriveHouseholdBreakdown(snapshot) : null`) was already correct — nothing needed fixing. UX-7 recommendations are in §47.

## 32. Debts / category / owner filter

Fixed the one confirmed bug: `DebtsCenter` now remounts (`key={snapshot.workspace?.id}` at its `TrackToZeroV2App.jsx` call site) on every workspace switch, instead of staying mounted with stale `ownerFilter`/`destination` local state. **Verified live**: set the owner scope to "Baba" in `household-seed`, switched to `personal-seed` — the new workspace rendered cleanly with "My debt," no leftover "Baba" filter chip, no stale scope selector, and the correct 3-category grid for the new workspace's real data. Category + owner composition (e.g. a specific member's Credit Cards) continues to work via the unchanged `filterDebtsByOwnerScope`/`deriveCategoryBreakdown`, both already correct per UX-6.1.

## 33. Add Debt

`AddDebtModal.jsx` (via `OwnerField.jsx`) now shows "Verified members"/"Financial profiles (not connected to an account)" as separate `<optgroup>`s — confirmed live via the exact `<optgroup>` `label` attributes rendering correctly in the browser. Personal-mode behavior (owner defaults to the signed-in user, selector hidden) was already correct, unchanged.

## 34. Quick Update

Not touched — `QuickUpdateRail.jsx` doesn't render any owner chrome (it only ever shows a plain debt-name `<select>` for Record Payment/Update Balance, no owner selection at all), confirmed still correct via the audit and unaffected by this phase's changes.

## 35. Plan

`PlanSection.jsx`'s active-plan payoff-order rendering (`PayoffOrderList`) was already correctly gated on `isHousehold` for the per-debt owner label (confirmed by direct read, both the active view and the strategy preview) — no change needed. Only the page-level heading gained the workspace-voice overline (§26). Payoff engine/ordering logic itself: untouched.

## 36. Workspace switching

Verified live end to end: Personal → Household → Personal. Headings update correctly (My debt ↔ Our debt), owner scope selector appears/disappears correctly, category composition reflects the new workspace's real debts, and — the specific bug this phase fixed — no scope-filter or category-drill-down state carries over from one workspace into the next (confirmed via the `key`-based remount).

## 37. Accessibility

Category tiles, filter controls, and existing accessible primitives (`Field`, `Select`, `FilterChip`) were unchanged. New additions follow the same conventions: `ReviewQueueList` uses `role="list"`/`role="listitem"` and real `<button>` rows (keyboard-focusable, `aria-current` on the active item); `<optgroup>` is native, accessible HTML requiring no extra ARIA; the Confirmed-evidence checklist uses a checkmark glyph paired with text (never color alone). Full axe-level auditing remains deferred to UX-8, per this session's established boundary (consistent with UX-6.1).

## 38. Responsive QA

Verified via real Playwright QA at 375/768/1440px: zero horizontal overflow at any size on both the Debts Command Center and the Review Center. The Review Center's new queue-list pane correctly hides below the 960px tablet threshold (confirmed: `queueListPaneVisible: false` at 375 and 768, `true` at 1440) — matching the task's explicit "do not cram a left queue beside the detail pane at 390px," while the existing Jump-to-item/Previous/Next controls remain available at every size.

## 39. Browser QA

Real Playwright sessions against a fresh `inMemory`-mode dev server, zero console/page errors across every script run this phase. **SEC-INVITE**: created a real invite (`stina0714@test.example`, matching the task's own threat-model example), confirmed "Pending invitation" badge, canceled it, confirmed the UI correctly transitions to "Canceled" and the Cancel button disappears; confirmed "Verified member"/"Financial profile" tier badges render correctly in Settings. **REVIEW-2**: imported the large fixture, confirmed zero fake header candidates reach the queue, confirmed the exact non-debt breakdown (Unclear 3, Utilities 2, Subscriptions 2, Insurance 2, Storage 1, Savings 1, Income 1), confirmed the master-detail queue-list pane, the "12 things need a quick check · 4 affect your payoff plan · 8 can wait" summary, and the Confirmed-evidence checklist all render correctly. **UX-6.2**: confirmed workspace-switch voice/scope/state correctness (§36), confirmed `<optgroup>` separation in Add Debt's owner selector.

## 40. DATA-2 regression

Verified green: `workbookDebtDiscovery.test.js` (21/21, including the 4 new REVIEW-2 tests), `statementCandidateAdapter.test.js`, `statementTextExtraction.test.js`, `financialItemTaxonomy.test.js`, `reviewDomain.test.js` — all passing, no changes to PDF parsing, multi-APR detection, BUSINESS-section secondary classification, same-sheet duplicate handling, or `ImportBatch` metadata persistence.

## 41. Reconciliation regression

`debtReconciliation.js` was not modified this phase. Verified unaffected: the UX-6.1 guardrail tests (incompatible-`debtType` negative weight, Cash+-vs-House-Mortgage denial, genuine same-account match preservation) all still pass in the full suite run.

## 42. Test totals

| Suite | UX-6.1 baseline | After this phase |
|---|---|---|
| `npx vitest run` | 683 | **696 passed** (47 files) |
| `npm run test:firestore` | 12 | **12 passed** |
| `npm run test:firestore:v2` | 63 | **67 passed** |
| `npx eslint .` | 0 errors | **0 errors** (4 pre-existing warnings, unrelated) |
| `npm run build` | succeeds | **succeeds** |
| `npm run perf:check` | 8 budgets, all pass | **8 budgets**, all pass |
| `npm audit --omit=dev` | 0 vulnerabilities | **0 vulnerabilities** |

New: 4 Firestore rules tests (SEC-INVITE), 4 `workbookDebtDiscovery` tests (REVIEW-2 root-cause + large-fixture regression), 6 `ownership.test.js` tests (`getAssignableDebtOwners` + extended junk-label regex), 3 `workspacePresentation.test.js` tests = 13 net new vitest tests (683 → 696) + 4 net new Firestore V2 rules tests (63 → 67).

## 43. Build/lint/perf/audit

All green — see §42 table. `TrackToZeroV2App-*.js` chunk: ~327KB raw (well under its 450KB budget, essentially unchanged from UX-6.1's ~322KB).

## 44. Bugs found

1. **REVIEW-2 root cause** (§16-18): a bare section-label row with zero evidence entered the review queue as a blocking candidate instead of being excluded — the actual subject of this phase.
2. **UX-6.2 workspace-switch state leak** (§32): `DebtsCenter`'s `ownerFilter`/`destination` local state persisted across a workspace switch, producing an empty/wrong category view with no visible cause. Fixed via remount-by-key.
3. **Section-propagation regression, caught during implementation, before commit** (§18): the new generic `HEADER_OR_SECTION` matches initially overwrote real section context, causing real bills to be mislabeled — caught by the large-fixture reproduction script itself, fixed before it ever reached a test run.
4. **Junk-label regex collision, caught during implementation, before commit**: an initial `household`/`joint` bare-word addition to `JUNK_OWNER_LABEL_RE` would have flagged the legitimate `"Joint / Household"` ownerLabel as junk, hiding every joint debt's owner. Caught by a direct regex test before it was committed; fixed by dropping the collision-prone tokens and keeping only unambiguous junk phrases, with a regression test locking in the correct (non-flagged) behavior.

## 45. Known limitations

- A full multi-session, real-Firebase-Auth-emulator browser click-through for SEC-INVITE (sign up as two distinct real users, navigate the actual join link between two browser sessions, observe wrong-email denial and correct-email acceptance in the UI) was not performed. The authorization logic this would exercise is already comprehensively tested at the Firestore rules level with real, differentiated Firebase Auth emulator contexts (`tests/firestore.v2.rules.test.js`, 67/67 passing, including this phase's 4 new tests) — the same underlying enforcement mechanism a UI click-through would ultimately depend on. This was assessed as a high-setup-cost, low-incremental-verification-value step given that boundary is already proven, not as an infeasible one; it remains a reasonable manual QA step if end-to-end UI confidence is wanted beyond the rules-level proof.
- `presentedOwnerLabel` still reads a stored display string rather than re-resolving against live membership on every read (pre-existing, documented, not changed this phase) — a removed member's stale label can persist on old debts' display until that debt is otherwise edited.
- No production rate-limiting or abuse control exists for invite creation/acceptance attempts (§46).
- The "skip all non-blocking for later" scoped bulk action (as opposed to skip-everything) was not implemented — descoped as additive, not load-bearing for this phase's core correctness goals.

## 46. Production security dependencies

- **Firebase App Check**: not enabled, not deployed this phase (per explicit instruction). This is an abuse-prevention layer distinct from authentication/authorization, which remain mandatory and are unaffected by its absence.
- **Invite creation/acceptance rate limiting**: no backend infrastructure for this exists today; not implemented, documented here as a real production gap rather than assumed present.
- Both are genuine pre-production hardening dependencies, not blockers for this phase's correctness goals (which were about the invitation *authorization* model, already proven sound).

## 47. UX-7 Home Command Center recommendations

Based on the current Home screen (observed during this session's browser QA, not redesigned):
- The dominant "Next Move"/"Record your [debt] payment" card is strong and should stay the anchor element of a UX-7 redesign, not be diluted by equal-weight surrounding cards.
- The "Your path to $0" trend visualization renders full-size even with a single confirmed balance snapshot — a compact "more history needed" state (per this task's own §42 suggestion) would read better than a near-empty chart.
- Household storytelling (member breakdown, Joint) currently reads as a secondary card with the same visual weight as other metrics — could be elevated or made more narrative for Household workspaces specifically, now that `getWorkspacePresentation` exists as a foundation to build "Our"-voiced Home copy on.
- No activity timeline or milestone placement exists yet — clean surface for UX-7's dedicated scope.
- Mobile first-action priority (what's the single most important thing to do, above the fold, at 375px) wasn't specifically audited this phase but is worth a dedicated pass in UX-7 alongside the other Home work.
- `presentedOwnerLabel`'s stale-label characteristic (§45) may be worth addressing in the same phase as any Home ownership-display work, if UX-7 touches per-debt owner presentation.

## 48. Next phase readiness

Ready for **UX-7 — Home Command Center 2.0 + Activity + Milestones + Retention Loop**. The foundation this phase adds/confirms that UX-7 can build on: `getWorkspacePresentation` (Personal/Household voice), `getAssignableDebtOwners` (verified-member-only owner derivation, reusable for any new UX-7 owner-facing UI), a corrected review-classification pipeline (so any Home surface reading review counts gets honest numbers), and a workspace-switch-safe `DebtsCenter` pattern (remount-by-key) other stateful tab components can follow if they have the same class of bug. No known blockers.
