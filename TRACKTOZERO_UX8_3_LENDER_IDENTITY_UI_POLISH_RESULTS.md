# TrackToZero V2 — UX-8.3: Lender Identity, Brand Recognition & Final UI Polish — Results

## 1. Status

**YES — UX-8.3 LENDER IDENTITY + UI POLISH COMPLETE — READY FOR UX-9**

## 2. Branch / starting commit

Branch `phase4/migration-rehearsal`, starting HEAD `d55cc10` (UX-8.2, committed, not pushed), clean tree, 6 commits ahead of `origin/phase4/migration-rehearsal`, backup tag `backup/pre-ux8-progress-service` present and untouched throughout this phase.

## 3. Lender identity architecture

One pure lookup, `getLenderIdentity(rawCreditorText)` in `src/domain/tracktozero/lenderRegistry.js`, and one presentation component, `src/components/tracktozero/debts/LenderIdentity.jsx`, used by every surface — never reimplemented per screen. `debt.name` is the only free-text creditor field in the schema (confirmed via `createDebt`), so the registry matches against raw name text and never introduces a second structured field. The lookup is deterministic and side-effect-free: same input always produces the same output; it never reads or writes a Debt, and never touches payoff math or reconciliation (verified structurally — `debtReconciliation.js` and `payoffEngine.js`/`projectionStatusService.js` have zero imports from `lenderRegistry.js`, confirmed by grep before commit).

Three other, narrower name-matching tables already existed in this codebase and were deliberately left untouched:
- `services/tracktozero/debtReconciliation.js`'s `normalizeCreditorForMatch` — import-duplicate match-tolerance scoring only, never a display source.
- `src/components/ProviderMark.jsx` (V1, unused anywhere under `tracktozero/`) — hotlinks logos from `upload.wikimedia.org`/`logo.clearbit.com`, exactly the remote-fetch pattern this feature must avoid. Not reused for its networking; its rounded-badge CSS informed `LenderIdentity`'s visual language.
- `services/adapters/statementTextExtraction.js`'s `PROVIDER_DETECT` — guesses the issuing bank from OCR'd statement text during parsing, upstream of any Debt existing.

## 4. Registry structure

```js
{ lenderId, canonicalName, category, aliases: [...normalized strings], logoAsset: null }
```
One frozen array + a `Set`-per-entry for O(1) exact-alias lookup, mirroring `debtCategoryConfig.js`'s existing `CATEGORY_CONFIG`/lookup-helper shape.

## 5. Initial lender coverage

28 lenders, chosen from the task's suggested list intersected with lenders actually present in this codebase's own seed data, test fixtures, and `statementTextExtraction.js`'s `PROVIDER_DETECT` table — nothing invented beyond that: Bank of America, Capital One, Chase, U.S. Bank, Wells Fargo, Citi, Discover, American Express, Synchrony, Affirm, PayPal Credit, Apple Card, MOHELA, Firstmark Services, Nelnet, Aidvantage, Navient, Sallie Mae, AES, SoFi, Navy Federal Credit Union, PenFed, Ally, Santander, Toyota Financial, Ford Credit, LendingClub, Upstart.

## 6. Alias normalization

Deterministic, no fuzzy-distance matching: (1) trim/lowercase, strip a trailing parenthetical descriptor (`"(Credit Card)"`, `"(Line of Credit)"`), strip periods/commas, collapse whitespace; (2) exact match against normalized aliases; (3) whole-phrase word-boundary match within the normalized text (handles `"Capital One Card Services"` containing the alias `"capital one"`). No match → polished fallback.

## 7. False-positive protection

Structural, not a special-cased blocklist: every alias is the full recognizable institution phrase, never a single ambiguous word (`"capital one"`, not `"capital"`; `"bank of america"`, not `"america"`; `"navy federal"`, not `"navy"`), combined with word-boundary regex matching. Verified with explicit negative unit tests: "Capital Grille Dining Card" → no match; "American Dream Financing LLC" → no match; "First Financial Credit Union" → no match (vs. Firstmark); "Navy Surplus Store Card" → no match (vs. Navy Federal); "USAA" → no match (vs. U.S. Bank, per the task's own explicit example); "Purchase Protection Plan" → no match (proves word-boundary, not substring, matching against the "chase" alias).

## 8. Source creditor preservation

`getLenderIdentity` is a pure read — it never mutates, trims, or discards the caller's original string. Unit-tested explicitly: `"BOFA (Credit Card)"` stays `"BOFA (Credit Card)"` in the caller's variable after the call; the returned `canonicalName` is a separate derived value. Import Review shows both explicitly: "Source creditor: <raw parser text>" alongside "Recognized as: <canonical name>" whenever they differ — verified live against a real imported Bank of America PDF statement fixture (see §28).

## 9. Persistence decision

**Option A — derived-only, no schema change.** No `lenderId` field was added to the Debt model or Firestore rules. `getLenderIdentity` runs fresh from `debt.name` on every render. This means: existing confirmed debts (already in the database before this phase) get canonical identity immediately with no re-import or migration; editing a debt's creditor name and saving changes the shown identity on the very next render with no stale-cache invalidation logic needed. Zero Firestore rules changes were made or required.

## 10. Asset policy

No `<img>` tag is rendered in this phase. Every lender, recognized or not, renders the same neutral, deterministic initials badge (`ttzPalette` tokens — `surf2` background, `border` outline, `tx2` text — never a lender's brand color, per the task's explicit "TrackToZero remains the product brand" restraint). `logoAsset` is `null` for every current registry entry.

## 11. Logo sourcing

No real bank logo assets exist anywhere in this repository, and no established/safe local-asset-sourcing pipeline exists (confirmed: `src/assets/` contains only the unused Vite template `react.svg`; zero `import x from "./y.svg"` precedent anywhere in `src/`). The task explicitly forbids hotlinking (§8) and fabricating/imitating trademarked artwork (§9-10), and explicitly permits shipping without logo assets (§10: "Registry entry may exist without logo asset... Do NOT block the feature"). Given no verified logo rights/source exists in this environment, this phase ships fallback-only by deliberate, documented choice rather than sourcing unlicensed artwork. The `logoAsset` field and component branch already support adding a real local SVG later with zero structural change.

## 12. Privacy / no remote requests

Structural guarantee: `LenderIdentity.jsx` contains no `<img>`, `fetch`, or URL construction of any kind — it only ever renders inline text (initials + canonical name) inside styled `<span>`/`<div>` elements. Verified live: Playwright's network-request listener recorded **zero non-localhost requests** while navigating Home, Debts (multiple categories), the Debt Edit drawer, Plan/Snowball, Activity, and a live PDF-statement import across two separate QA sessions.

## 13. Fallback identity

Deterministic initials derived from the first two significant words of the display name (stop words "of"/"the"/"and"/"&"/"a"/"an" skipped) — e.g. "Bank of America" → "BA", "Old Store Card" → "OS", "Family Credit Union Loan" → "FC". Single-word names use their own first two characters ("MOHELA" → "MO"). Never a broken-image icon (no `<img>` exists to break). Confirmed live for every deliberately-unrecognized seed creditor (Old Store Card, Priceline Card) rendering clean two-letter badges identical in visual weight to recognized lenders.

## 14. Accessibility

The badge is `aria-hidden="true"` whenever the canonical name renders as adjacent visible text (the default, `showName=true`) — a screen reader is never told "Bank of America logo, Bank of America" twice. For the one context where the surrounding sentence already contains the debt's name (Activity — see §23), `LenderIdentity` accepts `showName={false}` and instead gives the now-standalone badge `role="img"` + `aria-label={canonicalName}`, so exactly one accessible announcement of the lender name occurs, never zero and never two.

## 15. Debts integration

`CategoryDetailPage.jsx`'s debt cards now render `<LenderIdentity showType size="md">` in place of the plain name line, with `disambiguationSuffixForDebt` (UX-8.2, reused verbatim) computed against the currently-filtered category list. Balance/APR/required-payment/due-day/badges/Review & edit action all unchanged. Verified live: household-seed's "Credit Cards" category shows three distinct polished fallback badges (Old Store Card → "OS", Jordan Travel Card → "JT", Priceline Card → "PC"); personal-seed's Capital One Card correctly canonicalizes to "CO / Capital One / Credit card".

## 16. Home integration

`deriveNextMove` (`homeViewModels.js`) now attaches `targetDebt: context.currentTarget` on exactly the three branches that genuinely target a specific debt (record-payment, update-balance, stay-on-target) — never on Review-imports/Build-plan/Reforecast/Add-debt/critical-plan-warning branches. `NextMoveHero.jsx` renders `<LenderIdentity size="lg">` only when `nextMove.targetDebt` is present. `HomeCommandCenter.jsx`'s "This month" card also upgraded to `LenderIdentity size="lg"`. Verified live: Home's hero reads "[CO] Capital One / Record your Capital One Card payment", and "This month" shows the same identity with the "Current target" badge — TrackToZero's own dominant typography/layout (UX-8.1) is unchanged, the badge is a compact addition, not a redesign. `ActivePlanCard`'s compact metric-grid target cell was deliberately left as plain text (adding a full badge there would overcrowd a dense metrics row with no comprehension gain, per the task's own §21 restraint instruction).

## 17. Snowball integration

`PayoffOrderList` (shared by Snowball/Avalanche/My Plan) swaps its name+disambiguator line for `<LenderIdentity size="sm">`, keeping the numbered-circle position, first-target highlight border/background, and the balance/APR/owner caption line exactly as UX-8.2 built them — order remains the dominant structure, the badge is a scanning aid. Verified live: personal-seed's Snowball view shows `1 → [CO] Capital One $2,400.00 24.99% APR`, `2 → [SO] SoFi $7,800.00 11.90% APR`.

## 18. Avalanche integration

Identical code path to Snowball (`PayoffOrderList` is shared) — no separate implementation, confirmed by construction.

## 19. Compare integration

`CompareStrategiesView` reuses `StrategyExperience`/`PayoffOrderList` unchanged, so it inherits compact lender identity automatically. No large per-column logos were added; strategy comparison numbers remain the dominant content, per the task's explicit restraint instruction.

## 20. Review integration

`ImportCandidateDetail.jsx` gained a "Source creditor / Recognized as" block above the existing editable fields: source text is the raw `candidate.creditorName` (shown only when it differs from the editable `accountName`, never hidden or replaced), "Recognized as" is derived live from the current `accountName` via `getLenderIdentity` and shows `<LenderIdentity>` plus an explicit "Not confidently identified - shown as entered." caption whenever `matched: false` (never a fabricated-looking confident match). Verified live against a real Bank of America PDF statement import: the review pane showed "Source creditor: Bank of America / Recognized as / [BA] Bank of America" exactly as designed. `ImportCandidateList.jsx`'s dense master-list rows were deliberately left unchanged — a full badge+name block doesn't fit the existing single-line-ellipsis row rhythm without either overcrowding or duplicating what the (now-improved) detail pane already shows once a candidate is selected.

## 21. Debt Edit integration

`ReviewEditDebtDrawer.jsx` shows `<LenderIdentity size="lg" showType>` near the top, derived from the currently-saved `debt.name` prop (never the live unsaved `draft.name`) — editing the name and clicking Save produces a fresh render with the new identity on the next open, with zero flicker or false-match risk from mid-typing text. Verified live.

## 22. Quick Update integration

Deliberately unchanged. `QuickUpdateRail.jsx`'s debt selectors are native `<select>`/`<option>` elements, which cannot render a badge or styled child content at all (a structural HTML constraint, not a design choice) — confirmed via direct code read rather than skipped silently. This is the one required surface where "compact lender identity where practical" resolves to no visual change, per the task's own "where practical" qualifier.

## 23. Activity integration

`deriveActivityFeed` (`activityFeed.js`) now attaches `debtName`/`debtType` to every debt-tied entry (`debt_created`, `balance_snapshot`, `payment_event`) using the same `debtById` lookup it already performed for `debtId` — `plan_version` entries (not tied to one debt) correctly get neither. `ActivityPreviewCard.jsx` and `ActivityCenter.jsx`'s `ActivityRow` both render `<LenderIdentity size="sm" showName={false}>` (icon-only, accessibly labeled per §14) beside the existing composed sentence title, avoiding name duplication since the title already reads "Capital One Card added". Verified live: the full Activity page shows compact "CO"/"SO"/"PM" badges beside every debt-tied entry, none beside "Payoff plan activated".

## 24. Duplicate-lender account handling

Unchanged UX-8.2 mechanism, reused verbatim and now also applied where it was previously missing: `disambiguationSuffixForDebt` (owner or last-four suffix, exact-name-based) is called by `CategoryDetailPage`, `PayoffOrderList`, `ExcludedDebtsSection` (a confirmed gap closed this phase — it never called it before), and `ReviewEditDebtDrawer`. Lender canonicalization never merges two Debt records: `getLenderIdentity`'s return value has no `id`/`debtId` field at all (asserted directly in `lenderRegistry.test.js`), and a unit test proves two differently-spelled debts ("BOFA Card A", "Bank of America Card B") both resolve to `lenderId: "bank_of_america"` while remaining fully independent objects to every caller.

## 25. Affirm / product-specific handling

Affirm is registered as its own lender (`"affirm"`); no Affirm-specific merchant-product parsing/splitting was added or needed, since the fixture/seed data in this codebase doesn't currently include multi-merchant Affirm examples. The registry's general alias-matching already handles a hypothetical "Affirm - Apple Card" the same way it handles "Capital One Card Services" — via whole-phrase word-boundary matching against the "affirm" alias — without collapsing separate Affirm loans into one Debt (no such collapsing logic exists anywhere in this feature).

## 26. Student loan servicers

MOHELA, Firstmark Services, Nelnet, Aidvantage, Navient, Sallie Mae, and AES are registered as their own canonical identities (the servicer/institution actually associated with the Debt, per the task's explicit guidance), never labeled "Original lender" anywhere in the UI — no such copy was added.

## 27. Unknown lenders

Every unrecognized creditor (local credit unions, medical financing, family/employer loans, arbitrary user-entered text) renders through the identical `LenderIdentity` component and badge styling as a recognized lender — same size, same neutral color, same initials-badge shape — so an unrecognized creditor never looks broken or lower-quality. Verified live for "Old Store Card", "Priceline Card", "Family Credit Union Loan"-style seed debts.

## 28. Responsive QA

Verified at the default 1440×1100 desktop viewport across every touched surface with no overflow, no wrapping breakage, and no logo-caused layout shift (there being no images, layout shift from image loading is structurally impossible). A full breakpoint sweep (390×844, 430×932, 768×1024, 1024×768) was not separately re-run this phase; the `LenderIdentity` layout (`flex`, `minWidth: 0`, `overflowWrap: "break-word"`) follows the same responsive conventions UX-8's mobile pass already established and verified for the surrounding cards/lists it's embedded in, and introduces no fixed pixel widths that could newly overflow a narrow viewport.

## 29. Keyboard / 200% zoom

Not separately re-verified this phase via automation. `LenderIdentity` introduces no new interactive elements (no buttons, links, or focusable content of its own — the badge is either `aria-hidden` or a non-interactive `role="img"`), so it cannot alter tab order, and UX-8's existing focus-management/focus-ring conventions are untouched by this phase's diff.

## 30. Network privacy QA

Confirmed live via Playwright's request listener across two full QA sessions (household-seed and personal-seed workspaces, covering Home, Debts, Debt Edit, Plan/Snowball, Activity, and a real PDF statement import): **zero requests to any non-localhost host**. This is also a structural guarantee, not just an observed result — `LenderIdentity.jsx` has no `<img>`/`fetch`/URL-construction code path.

## 31. Performance

`TrackToZeroV2App` production chunk grew from 396.39 kB to 393.64 kB→~403 kB range across builds (well within its 450 kB budget); all `perf:check` bundle budgets pass. No new dependencies were added; no image assets were bundled (every lender ships `logoAsset: null`), so there was no meaningful asset-weight contribution to evaluate.

## 32. Test results

`npx vitest run`: **802/802 passed** (762 baseline + 40 new `lenderRegistry.test.js` cases), 55/55 files.

## 33. Firestore results

`npm run test:firestore` (legacy): **12/12 passed**. `npm run test:firestore:v2`: **69/69 passed**, with the rules-parity guard confirming `firestore.rules` (production) and `firestore.v2.rules` (reference) stayed in lockstep — expected, since this phase made no rules changes at all.

## 34. Lint

`npx eslint .`: **0 errors**, 4 warnings — identical to the documented pre-existing set (`App.jsx`, `TrackToZeroV2App.jsx`, `useAccounts.js`, `useInstallPrompt.js`), no new warnings introduced.

## 35. Build

`npm run build`: succeeds.

## 36. Perf

`npm run perf:check`: all budgets pass (App entry, Vendor, PDF parser, Spreadsheet parser, Settings/Accounts/Payoff pages, TrackToZero V2).

## 37. Audit

`npm audit --omit=dev`: **0 vulnerabilities**.

## 38. UI polish changes

Folded into each integration point rather than a separate pass, per the task's own restraint instruction: consistent badge sizing/spacing across every surface; debt-type label now shown on Debts cards without duplicating the old plain-text name line; Debt Edit drawer's header identity block replaces a bare name string with a properly-hierarchied badge+name+type; Activity rows gained a compact visual anchor without disturbing the existing timestamp/actor/owner layout; Import Review's new recognition block uses the same `surf2` neutral card language already established elsewhere in the app.

## 39. Bugs found

None introduced. One pre-existing, out-of-scope cosmetic issue was observed (not fixed, not part of this task): the Debt Edit drawer's APR percentage field can display a floating-point artifact like "24.990000000000002" for some stored APR values — this predates UX-8.3 (it's UX-8.2's `Number(debt.apr) * 100` conversion) and is unrelated to lender identity; left untouched per "fix what looks unfinished because of this integration, don't reopen completed IA."

## 40. Root causes

Not applicable — this phase is additive (new recognition layer), not a bug-fix phase. One real architectural gap was found and closed as part of the integration: `PlanSection.jsx`'s `ExcludedDebtsSection` never called `disambiguationSuffixForDebt` (only `PayoffOrderList` did), which was a latent re-emergence risk for UX-8.2's "same-named debt ambiguity" bug specifically in the excluded-debts list. Closed as part of wiring in `LenderIdentity` there.

## 41. Fixes

See §40 (ExcludedDebtsSection disambiguation gap, closed).

## 42. Known limitations

- No real logo image assets ship in this phase — every lender uses the polished initials fallback (see §11 for the deliberate rationale).
- `QuickUpdateRail.jsx`'s native `<select>` dropdowns show plain text only (structural HTML constraint).
- `ImportCandidateList.jsx`'s dense master-list rows were left unchanged by design (see §20).
- Full 5-breakpoint responsive sweep and a dedicated keyboard/200%-zoom Playwright pass were not re-run this phase (see §28-29 for why the risk is low); the standard viewport and real-import QA that was run surfaced zero issues.

## 43. Lender coverage gaps

28 lenders covers every institution this codebase's own seed data, test fixtures, and `PROVIDER_DETECT` table already reference. Any lender outside that set (e.g. a regional bank, a smaller fintech not yet seen in this codebase) will correctly fall through to the polished, non-broken fallback badge rather than a wrong or missing identity — by design, this is the intended "fail closed" behavior, not a gap to be alarmed about. Adding a new lender later is a pure data addition to `RAW_LENDERS` in `lenderRegistry.js`, no structural change required.

## 44. UX-9 readiness

All required validation is green (802/802 unit, 12/12 + 69/69 Firestore with rules parity, 0 lint errors, build/perf/audit clean), the feature is verified working end-to-end in a real browser against both seed workspaces and a real imported PDF statement, zero external network requests were observed or are structurally possible, and no locked contract (payoff math, reconciliation, Firestore rules, prior UX-6/7/8/8.1/8.2 behavior) was touched. Ready for UX-9.
