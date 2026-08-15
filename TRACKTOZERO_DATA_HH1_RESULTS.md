# TrackToZero — DATA-HH1 Results

Imported person identities + safe debt owner mapping.

## 1. Starting HEAD

`f29102a` — "Build batch Review Center save workflow" (REVIEW-1C wizard), branch `phase4/migration-rehearsal`, working tree clean at start.

## 2. Final HEAD

See git log after the commit accompanying this document (this file is written just before that commit).

## 3. Existing ownership architecture discovered

- `Workspace`/`WorkspaceMembership` — `src/domain/tracktozero/models.js`'s `createWorkspace`/`createWorkspaceMembership`; `MEMBER_ROLES`/`ROLE_PERMISSIONS` in `constants.js`. Loaded once per request via `getWorkspaceContext(workspaceId)` in both application services (`v2AsyncApplicationService.js`, `v2ApplicationService.js`), returning `{ workspace, membership, members, permissions }`.
- `Debt` ownership — `ownerType`/`ownerId`/`ownerLabel` fields, `OWNER_TYPES = ["member", "joint", "unassigned"]`. `src/domain/tracktozero/ownership.js`'s `resolveDebtOwnership({workspaceType, members, actorId, requested})` is the single source of truth turning a requested choice into a verified triple — household `"member"` requires a real, non-removed `WorkspaceMembership.uid`; personal workspaces always resolve to the signed-in actor.
- Import candidates carry `ownerSuggestion` (raw, non-authoritative parser guess) and `ownerType`/`ownerId` (initially `"unassigned"`). `createImportBatch` pre-fills `ownerType: "member"` only on an exact-enough name match (`matchMemberByName`) against real members — always just a convenience pre-fill, re-verified at commit time.
- REVIEW-1A's `REVIEW_TYPES.ownerMatch` flags a review item when `ownerSuggestion` is truthy but `ownerType` stayed unassigned; `resolveOwner` on the review-candidate path validates the same way as `resolveDebtOwnership`.
- `portfolioSummary.js`'s `deriveDebtPortfolioSummary` is the one shared derivation Home/Debts both read for household member/joint/unassigned totals.
- No "person without an account" concept existed anywhere before this phase — a `WorkspaceMembership` was the only way to name someone in a household workspace.

## 4. Person identity model

New entity: **`WorkspacePerson`** (`createWorkspacePerson` in `models.js`), Workspace-scoped:

```
id, workspaceId, displayName, normalizedName, aliases[],
kind ("imported_person" — the only kind ever persisted),
status ("active" | "merged"), workspaceMembershipId (empty unless
explicitly linked later by UX-6), mergedIntoPersonId,
source ("import_confirmed" by default), createdAt, createdBy, updatedAt
```

Stored at `workspaces/{workspaceId}/people/{personId}` (new repository methods `saveWorkspacePerson`/`getWorkspacePerson`/`listWorkspacePersons` on both `InMemoryTrackToZeroRepository` and `FirebaseTrackToZeroRepository`).

`"authenticated_member"` is a real value in `PERSON_KINDS` but is **never persisted as its own document** — an active `WorkspaceMembership` already *is* that identity. It only ever appears as a classification the matching engine returns when it recognizes a real member by name, keeping "person" and "member" as two clearly distinguishable concepts without needing a redundant, syncable copy of every member as a person record too.

## 5. Auth/member/person separation

- `OWNER_TYPES` extended to `["member", "person", "joint", "unassigned"]` — `"member"` is completely untouched (still requires a verified `WorkspaceMembership`); `"person"` is new and requires a verified, non-merged `WorkspacePerson`.
- `resolveDebtOwnership` now accepts an optional `people` array and validates `ownerType: "person"` exactly the way it already validated `"member"` — reject anything not found in the live list, never accept free text.
- `createImportedPerson`/`confirmAlias`/`mergeWorkspacePersons` (the only writers of `WorkspacePerson`) never touch `WorkspaceMembership`, never call any Auth API, never send an invite. Verified directly by a dedicated test ("never creates an Auth account or a WorkspaceMembership - only a financial identity").

## 6. Normalization

`src/domain/tracktozero/personIdentity.js`'s `normalizePersonName` — NFKC-normalize, trim, collapse whitespace, strip light punctuation (`.`/`,`), case-fold. `" KRISTINA   DAVIS "` / `"Kristina Davis"` / `"kristina davis"` all normalize to `"kristina davis"`. Deliberately does **not** attempt to guess that two different full names are related (e.g. "Kristina Davis" and "Kristina Yusuf" are never assumed to be the same person).

## 7. Alias behavior

Aliases are a plain string array on `WorkspacePerson`, added only through the explicit `confirmAlias(workspaceId, personId, aliasRawName)` service call (never inferred). `matchImportedOwnerToIdentity` only treats an alias as a match when it's an exact normalized match against an *already-confirmed* alias — a nickname like "Jide" for "Babajide Yusuf" is never auto-detected; it only resolves once a human has explicitly confirmed that alias once. `confirmAlias` is idempotent (confirming the same alias twice doesn't duplicate it).

## 8. Matching classifications

`matchImportedOwnerToIdentity({ rawName, members, people })` in `personIdentity.js` — deterministic, no LLM, Workspace-scoped (only ever given the current workspace's own members/people):

- **`joint`** — literal "Joint"/"Household" text.
- **`exact`** — reuses the same token-equality definition the pre-existing member pre-fill already used (`namesTokenMatch`, refactored out of the pre-existing `matchMemberByName` so both share one definition of "confident enough to auto-select"), checked against members first, then people.
- **`strong`** — exact match against a person's *confirmed* alias only.
- **`possible`** — an initial + exact-surname heuristic (e.g. "B. Yusuf" ↔ "Babajide Yusuf") — deliberately narrower than "exact," never auto-selected, always requires an explicit "Use NAME" click.
- **`unresolved`** — everything else (e.g. "BJ" — insufficient evidence).

Removed/merged/inactive members and people are never matched.

## 9. Review integration

No second review screen. `ReviewSessionCard.jsx`'s existing `OwnerSubSection` was extended in place:

- Computes the live suggestion via `matchImportedOwnerToIdentity` at render time (never stored on the candidate — pure/derivable, Part 31).
- `exact`/`strong` → "Suggested owner: NAME" text plus a "Use NAME" button.
- `possible` → "Possible match: ... please confirm" plus a "Use NAME" button — visually and behaviorally identical gating to `strong`, never pre-selected.
- The confirmed-owner `<select>` now lists real members **and** existing household people together.
- A "+ Add 'NAME' as a new household person" action creates the person immediately (safe — zero financial mutation) and auto-selects it as the staged owner.
- REVIEW-1C's save-once workflow, pre-save summary, and skip-for-later semantics are completely unchanged — owner is just one more staged field like balance/APR/due-date.

## 10. Debt ownership

Canonical representation unchanged in shape: `Debt.ownerType`/`ownerId`/`ownerLabel`, just with one more valid `ownerType`. `ownerLabel` continues to be computed once by `resolveDebtOwnership` at write time and read everywhere via the existing `presentedOwnerLabel` helper — no second "how do we display an owner" path was introduced (Part 33's "one canonical owner-display path" requirement was already satisfied by the pre-existing design; this phase just extended its one resolver).

## 11. Joint/unassigned behavior

Completely unchanged. `"joint"` and `"unassigned"` are not persisted `WorkspacePerson` records — `resolveDebtOwnership` still returns them exactly as before. Joint debt counts exactly once in every total (unchanged arithmetic in `portfolioSummary.js` — the person/member breakdown is still a separate partition of the same already-summed set, never re-summed).

## 12. Debts/Home integration

- `OwnerField` (shared by manual debt entry and the legacy import-candidate review UI in `TrackToZeroV2App.jsx`) now lists people alongside members, plus its own "+ Add a household person" inline flow.
- The Debts page's "Filter by owner" `<select>` now includes people — the existing filter *logic* (`debt.ownerId === ownerFilter`) needed zero changes since it was already keyed generically off `ownerId`.
- `portfolioSummary.js`'s `deriveDebtPortfolioSummary` now accepts `people` and folds person-owned debts into the same `memberDebt` breakdown array real members already populated — Home's `deriveHouseholdBreakdown` (which just reads `portfolioSummary.memberDebt`) required **zero changes** to pick this up.
- No UX-2.1 visuals added — no charts, no new insight tabs.

## 13. Workspace isolation

`people` are loaded per-workspace via `listWorkspacePersons(workspaceId)`, exactly like `members`. No global identity graph, no cross-workspace lookup path exists anywhere. Verified: the same display name created in two different workspaces produces two independent person records; a person id from workspace A is rejected (`"Owner must be a verified household person"`) when used against workspace B.

## 14. Security

- `createImportedPerson`/`confirmAlias`/`mergeWorkspacePersons` all require `hasPermission(membership, "manageDebts")` — the same owner/admin-only tier as debt/import operations.
- `listWorkspacePersons` requires only workspace membership (view permission) — a viewer can read but never write.
- A total non-member is rejected by `getWorkspaceContext` itself before any person-specific check runs.
- Firestore rules: new `people/{personId}` nested collection in both `firestore.v2.rules` and `firestore.rules`, gated identically to `import_batches`/`debts` (`isViewerPlus`/`isAdminPlus` read/write, `workspaceId`/`id` field-vs-path consistency checks, no delete — a merge sets `status: "merged"` via update so `Debt.ownerId` references never dangle). Rules-parity guard re-confirmed PASS (both rule files behave identically).

## 15. Tests

- `src/domain/tracktozero/personIdentity.test.js` — 16 tests: normalization, all 5 matching tiers against the spec's own examples, duplicate-person/duplicate-member guards.
- `src/domain/tracktozero/ownership.test.js` — 3 new tests for `resolveDebtOwnership`'s `"person"` branch (verified person resolves, unverified/merged person rejected). All 38 pre-existing tests in this file still pass unmodified (the `matchMemberByName` refactor preserved its exact behavior).
- `src/services/tracktozero/v2AsyncApplicationService.person.test.js` — 24 tests: `createImportedPerson` (creation, idempotent dedup, refuses to shadow a real member, never creates Auth/membership), `confirmAlias` (add, idempotent, cross-workspace rejection), `mergeWorkspacePersons` (reassigns debts, merges aliases, idempotent, self-merge rejected), `resolveOwner` accepting a person, import pre-fill (exact pre-fills, possible never auto-assigns, importer-is-never-assumed-owner, Joint text never auto-selects), workspace isolation, and security (owner/admin/viewer/non-member).
- `src/services/tracktozero/portfolioSummary.test.js` — 6 new tests: person-owned debts appear in the same breakdown as members, joint counts once, unassigned tracked separately, a debt whose person was later removed still counts via its frozen `ownerLabel`.
- `src/components/tracktozero/review/reviewUi.test.js` — 4 new tests for the extended `OwnerSubSection` (member+person options, exact-match suggestion text, possible-match confirm button, new-person offer gated on `onCreatePerson` being provided).
- `tests/firestore.v2.rules.test.js` — 4 new tests for the `people` collection (owner/admin write + viewer read-only, contributor denied, non-member/unauthenticated denied, cross-workspace forgery denied).

**Exact results**: `npx vitest run` **546/546 passed**, 40 files (76 new tests total this phase). `npm run lint`: 0 errors, 3 pre-existing unrelated warnings. `npm run build`: succeeds. `npm run test:firestore`: **12/12**. `npm run test:firestore:v2`: **55/55**, rules parity PASS. `npm run perf:check`: all budgets pass. `npm audit --omit=dev`: 0 vulnerabilities.

## 16. Browser QA

Real Playwright session against `emulators:v2` + `dev:v2-local`, a fresh Household workspace, synthetic names only (Babajide Yusuf, B. Yusuf, Jordan Taylor). Verified, zero console errors:

- Manually added a debt, used "+ Add a household person" inline in the Add-Debt form to create "Babajide Yusuf" on the spot, and confirmed the owner selection carried through to the saved Debt (`ownerType: "person"`, correct `ownerLabel`).
- Debts page: owner filter dropdown and household breakdown ("Babajide Yusuf: $500.00") both correctly reflect the new person.
- Uploaded a 3-row CSV (`Babajide Yusuf` exact / `B. Yusuf` possible / `Jordan Taylor` unmatched) and confirmed in Review Center: the exact match pre-filled silently at import time (as designed — same convenience-pre-fill contract the existing member pre-fill already used); the possible match showed "Possible match: ... please confirm" with an explicit "Use Babajide Yusuf" button, never auto-selected; the unmatched name offered "+ Add 'Jordan Taylor' as a new household person," and clicking it correctly staged the new person as the owner.
- Home reflects the correct total debt figure.
- No fake `WorkspaceMembership` ever appeared in the repository; no invitation was created; no Auth user was created from an imported name.

**A real, pre-existing bug was found and fixed during this QA pass** (see §17) — not a regression this phase introduced in isolation, but one this phase's first "create something mid-form, then let the user keep filling out the rest of the form" interaction was also the first to actually exercise.

## 17. Performance

- `people` is loaded once per request inside `getWorkspaceContext` (parallel with `members`, one `listWorkspacePersons` call), never once per Debt.
- Owner resolution in `deriveDebtPortfolioSummary` and the matching engine both use plain array lookups against an already-loaded, small (household-sized) list — no per-debt or per-render Firestore reads.
- **Bug found and fixed**: the Debts page's and Import panel's original `handleCreatePerson` called the app's full `refresh()` after creating a person so the new person would show up everywhere. `refresh()` synchronously sets `snapshot: null` while the fetch is in flight (`setRuntimeState((state) => ({ ...state, status: "loading", ..., snapshot: null }))`), which unmounts the entire tab (since child components require a non-null `snapshot`) and silently discards whatever the user had already typed into the in-progress Add Debt form (or whatever decisions were already made on import candidates in `ImportPanel`). This is pre-existing behavior of `refresh()` itself, not something this phase introduced — the *existing* "Add debt" submit handler was already safe from it purely by coincidence (it calls `setNewDebt(newDebtDraft())` intentionally right before its own `refresh()`, since the form was supposed to clear anyway). DATA-HH1's "create a person without losing the rest of your in-progress form" interaction was the first code path that needed state to survive a refresh, which is what surfaced it. Fixed by following the exact same pattern already used successfully in `ReviewCenter.jsx`: `handleCreatePerson` in both `Debts` and `ImportPanel` now merges the newly-created person into a small local `newlyCreatedPeople` state array instead of calling `refresh()` at all — avoiding the disruptive full reload entirely (and incidentally making it faster, since it skips a full snapshot re-fetch for a change that only adds one small document).

## 18. Accessibility

- Owner field labels are explicit (`Field label="Owner"` / `"Confirmed owner"`), reusing the existing accessible `Field`/`Select` primitives.
- "Possible match" suggestions carry their own text ("Possible match: ... please confirm") — never color-only — and require an explicit click ("Use NAME") to accept, keyboard-reachable like any other button.
- The inline "+ Add a household person" flow is a plain labeled text input + button, keyboard-operable, with a friendly (never raw) error message on failure.
- No new custom widgets were introduced — everything reuses the existing `<select>`/`<input>`/`<button>` patterns already covered by the app's accessibility baseline.

## 19. Files changed

New: `src/domain/tracktozero/personIdentity.js`, `personIdentity.test.js`, `src/services/tracktozero/portfolioSummary.test.js`, `src/services/tracktozero/v2AsyncApplicationService.person.test.js`.

Modified: `src/domain/tracktozero/constants.js` (+`"person"` OWNER_TYPES, `PERSON_KINDS`/`PERSON_STATUSES`), `models.js` (+`createWorkspacePerson`, extended `createDebt` validation), `ownership.js` (+`"person"` branch in `resolveDebtOwnership`, exported `nameTokens`/`namesTokenMatch`), `ownership.test.js`; `src/services/repositories/tracktozeroRepositories.js`, `firebaseTrackToZeroRepository.js`, `firestoreTimestamps.js` (people collection CRUD + path helpers + timestamp fields); `src/services/tracktozero/v2AsyncApplicationService.js` and `v2ApplicationService.js` (both runtimes kept in parity — `people` wired through `getWorkspaceContext`/`getWorkspaceSnapshot`/`createNewDebt`/`commitImportBatch`/`createImportBatch`'s pre-fill; new `listWorkspacePersons`/`createImportedPerson`/`confirmAlias`/`mergeWorkspacePersons`; `resolveOwner` extended), `portfolioSummary.js`; `src/components/tracktozero/review/ReviewSessionCard.jsx` (`OwnerSubSection` extended), `ReviewCenter.jsx` (`people`/`onCreatePerson` plumbing), `reviewUi.test.js`; `src/components/tracktozero/TrackToZeroV2App.jsx` (`OwnerField` extended, both `handleCreatePerson` call sites, owner filter); `firestore.rules`, `firestore.v2.rules`, `tests/firestore.v2.rules.test.js`.

## 20. Known limitations

- **Pre-existing gap, not introduced or fixed this phase** (documented previously in the REVIEW-1C results too): an import candidate with zero review signals — no existing-debt match at all — has no way to be confirmed as a new debt through Review Center's wizard, since `evaluateReviewSignals` never flags a `noMatch` reconciliation classification as needing a decision. This meant every candidate in this phase's browser QA (none of which happened to match an existing debt) stayed at "0 ready" even after their owner was correctly staged — the owner UI itself worked correctly; committing those specific candidates would require the same pre-existing fix already flagged as future work in REVIEW-1C's results, unrelated to person identity.
- No merge UI was built — `mergeWorkspacePersons` exists as tested domain/service support only (per the spec's explicit "if a full merge UX is too large, domain support is sufficient"), reachable only via direct service calls today, not from any screen.
- Aliases can currently only be confirmed via `confirmAlias` at the service layer — there is no dedicated UI action for a user to proactively add an alias to an existing person outside of the review flow's implicit confirmation.

## 21. Explicitly deferred — UX-6 account connection

Not started. `WorkspacePerson.workspaceMembershipId` exists in the schema specifically so a future UX-6 can set it once an explicit, secure invitation-and-acceptance flow verifies that a real account belongs to a given person — but nothing in this phase reads, writes, or infers that field. No email/name/phone-based Auth search, no automatic membership creation, no invitation of any kind was implemented.

---

```text
NO IMPORTED NAME CREATED AN AUTH USER
NO IMPORTED NAME AUTOMATICALLY CREATED A WORKSPACE MEMBERSHIP
NO INVITATION FLOW IMPLEMENTED
NO ACCOUNT CONNECTION IMPLEMENTED
UX-4 NOT IMPLEMENTED
UX-2.1 NOT IMPLEMENTED
UX-5 BROAD POLISH NOT IMPLEMENTED
UX-6 NOT IMPLEMENTED
NO PRODUCTION DEPLOYMENT
NO REAL FINANCIAL DATA USED
```

**NEXT: UX-4 — PLAN HUB**
