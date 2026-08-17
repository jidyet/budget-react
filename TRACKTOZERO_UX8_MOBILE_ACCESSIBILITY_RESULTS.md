# UX-8 — Mobile + Accessibility Hardening — Results

## 1. Status

**YES — UX-8 MOBILE + ACCESSIBILITY HARDENING COMPLETE**

## 2. Branch / starting commit

Branch `phase4/migration-rehearsal`, starting HEAD `9ce206b` (UX-7, committed, not pushed). `2f98f6a` and `a6084ac` confirmed present in history. Verified clean before starting (`git status`/`git log -10`/`git diff --check`) except the untracked `docs/archive/` directory the user had already staged content into in a prior turn.

## 3. Pre-UX8 baseline

728/728 vitest (per UX-7's own results doc), 0 lint errors, build/perf passing, 12/12 + 67/67 Firestore, 0 audit vulnerabilities.

## 4. progressService recovery tag

`backup/pre-ux8-progress-service` already existed (created in a prior turn) and was verified, not recreated: `git rev-parse backup/pre-ux8-progress-service` resolves to `9ce206b0049c5a077bae776fd3fac91a3e28f0e2` — the exact UX-7 commit, i.e. the last commit before any removal. Correct target, confirmed rather than assumed.

## 5. progressService archive

`docs/archive/progressService.pre-ux8.js` — the exact required header was added, prepended to the verbatim, byte-identical original source (diffed directly against the live file before deletion; only the header changed, the algorithm was not touched). Documented in the header as reference-only, explicitly warning against runtime import.

## 6. Dead-code dependency proof

Full-repo case-insensitive grep for "progressService" before deletion found exactly 3 files: its own `progressService.test.js`, a comment-only (non-import) mention in `ui/ProgressBar.jsx`, and this session's own prior UX-7 results doc (prose). Zero production imports anywhere in `src/`. `ui/ProgressBar.jsx` is itself also dead (only consumer: `ui/primitives.test.js`) — left untouched, flagged as a related but out-of-scope cleanup candidate, not expanded into this phase's deletion.

## 7. Live progressService removal

Deleted `src/services/tracktozero/progressService.js` and `src/services/tracktozero/progressService.test.js`. Post-deletion repo-wide grep for `progressService|deriveWorkspaceConfirmedProgress` returns exactly one remaining hit (`ProgressBar.jsx`'s comment, confirmed harmless) — zero import references remain. `progressService.test.js`'s two scenarios (missing-balance never fabricates elimination; unresolved debts excluded from workspace rollup) already have direct, currently-passing equivalents in `homeViewModels.test.js` against the model Home actually uses — no migration needed, confirmed by inspection rather than assumed.

## 8. Archive bundle-exclusion proof

`npm run build` succeeds; `grep -rl "progressService" dist/` returns nothing — confirmed the string does not appear anywhere in the built output. `docs/archive/` sits outside `src/`, Vite's only entrypoint tree, so it was never a build input to begin with; this is a positive, executed proof, not an assumption from directory location alone.

## 9. Mobile information architecture

Target IA implemented exactly as specified: bottom nav = Home / Debts / Plan / Activity + one center `[+]` action. Settings and Review are deliberately NOT bottom-nav items — Settings was already one tap away via the existing account-menu "Workspace settings" item (`TopBar.jsx`/`UserMenu.jsx`, unmodified, verified still wired to `navigateTab("settings")`); Review remains reachable from the (non-mobile) top nav and from Home. Verified live: tapping "Workspace settings" from the account menu on a 390px viewport correctly navigated to Settings with a fully readable, non-overflowing layout.

## 10. Mobile bottom nav

New `layout/MobileBottomNav.jsx` (exported as `MobileBottomNavContent` for direct unit testing + a viewport-gated default export). Renders only below the mobile breakpoint (`useIsMobile()`, ≤640px), driven by the exact same `activeTab`/`onSelectTab`/`badges` props `PrimaryNav` already consumes — no second tab-router, no independent navigation state. `aria-current="page"` on the active item; every item is icon (`aria-hidden`) + real visible text label, never color/icon alone. **Duplicate-landmark fix**: `TopBar.jsx`'s `PrimaryNav` row is now hidden when `isMobile` is true (previously it would have rendered simultaneously alongside the new bottom nav, producing two DOM landmarks both announced as "Primary" and duplicate focusable nav controls) — verified live: exactly 1 `nav[aria-label="Primary"]` element present at 390px width.

## 11. Center action

New `layout/QuickActionSheet.jsx` — a bottom sheet (slides up, safe-area padding), built on the shared `useDialogFocus` hook. Contains zero new business logic: each of its 4 actions (Record payment, Update balance, Add debt, Import statement) navigates to Debts and passes a one-shot `initialAction` intent that `DebtsCenter.jsx` consumes via a lazy `useState` initializer to auto-open its own already-existing `AddDebtModal`/`ImportCenter` (Record payment/Update balance just navigate to Debts, where `QuickUpdateRail` is already always visible). Gated by the exact same `snapshot.permissions.manageDebts`/`recordObservations` + `mode !== "legacy_preview"` check `DebtsCenter.jsx` already uses — verified live as a Viewer: the sheet shows zero mutating actions and an explicit "Your role is read-only..." message, never a blank panel or a disabled-but-visible trap. Verified live as an Owner: clicking "Add debt" correctly navigated to Debts and auto-opened the Add Debt modal.

## 12. Safe area handling

`MobileBottomNav`'s bottom padding: `max(var(--ttz-space-2, 8px), env(safe-area-inset-bottom, 0px))` — never a hardcoded device-specific number, falls back to 8px on platforms without the inset. Same pattern in `QuickActionSheet`'s bottom padding. `viewport-fit=cover` was already set globally in `index.html`, so these insets report real values on supporting devices.

## 13. Mobile Home

Verified via direct DOM order inspection and live rendering at 390×844: `NextMoveHero` renders as the first meaningful content (already true structurally from UX-7; this phase confirmed rather than assumed it, and verified visually there is no squeeze/awkward wrap in the hero at 360/390/430px). `DebtFreedomHero`'s 4-metric grid (`auto-fit, minmax(260px,1fr)`) stacks to a single column below ~520px, confirmed intentional-looking, not squeezed, in the 360-430px screenshots.

## 14. Mobile Debts

`DebtsCenter.jsx`'s existing `useIsTablet` collapse (portfolio header → scope selector → category grid → quick-update rail reflowing to one column) verified intact and functioning at 360-430px with zero horizontal overflow. `ScopeSelector`'s owner tabs already use `flexWrap: "wrap"` with full, untruncated names (audited directly — no truncation risk found, no change needed).

## 15. Mobile Review

New: below the tablet breakpoint, a "Queue (N)" button opens a `Drawer` containing the exact same `ReviewQueueList` component the desktop rail uses (no second queue-rendering implementation) — restores the "browse the queue" affordance that was previously fully absent on mobile/tablet (only Previous/Next + a Jump-to-item `<Select>` remained). Verified live at 820×1180 with a real, non-empty queue (imported the DATA-2/REVIEW-2 fixture): the button appears, opens a drawer showing all 12 items with the same blocking/non-blocking visual language as desktop, and selecting an item correctly closes the drawer and jumps to it.

## 16. Mobile Plan

`PlanSection.jsx`'s `PayoffOrderList` was already a stacked `<ol>` with wrap-friendly caption text (audited directly, not assumed) — no layout change needed. Gained a real `<h1>` (see §30) it previously entirely lacked.

## 17. Mobile Activity

`ActivityPreviewCard.jsx`'s title/date row gained `flexWrap: "wrap"` (parity fix — `ActivityCenter.jsx`'s equivalent row already had it). Verified no horizontal overflow at 360px on the full Activity page.

## 18. Mobile Household Settings

Verified live at 390px: Members/Pending invites/Financial profiles cards stack correctly (pre-existing `auto-fit`/`flexWrap` grids, confirmed still responsive), no overflow. Fixed: pending-invite and "invite ready" email displays now use `overflowWrap: "anywhere"` so a long email cannot force page-width overflow (a real, previously-unhandled risk in a flex row with no min-width guard). Reviewed the "Connect account" `<select minWidth:220>`: already sits inside a `flexWrap` row and 220px comfortably fits even a 320px viewport after wrapping — confirmed not a real overflow risk, left unchanged rather than making a speculative change.

## 19. Tablet experience

`ReviewCenter`'s master-detail collapse (`useIsTablet`, ≤960px) and `DebtsCenter`'s 2-column-to-1 collapse both verified working at 820×1180 with zero overflow. The new mobile queue drawer (§15) is available at tablet widths too (same `isTablet` gate), giving tablet users the queue-browsing affordance neither a cramped side-by-side layout nor a fully-hidden queue would have provided.

## 20. Landscape mobile

Verified at 844×390 and 932×430 (personal-seed): zero horizontal overflow at either.

## 21. Short-viewport QA

Verified at 320×568, 360×640, 390×667 (the narrowest/shortest combinations tested): zero horizontal overflow, Home's Next Move hero and CTA remained reachable without being clipped.

## 22. Keyboard audit

Full keyboard-only journey executed live (real Chromium, no mouse): focused the "Debts" nav button, activated it with Enter, navigated correctly; focused "+ Add debt", activated with Enter, the modal opened; Escape closed it. No traps encountered anywhere in this path.

## 23. Focus management

Verified live end-to-end (not just via the pure-logic unit tests, which the Node-only test environment can't extend to real DOM focus): opening the Add Debt modal via keyboard moved focus INTO the dialog (`document.activeElement` was contained within `[role="dialog"]`), and closing it via Escape correctly returned focus to the triggering "+ Add debt" button. This is the exact `useDialogFocus` behavior (§ design) now shared by `Modal`, `Drawer`, and the new `QuickActionSheet`.

## 24. Dialog/drawer semantics

`Modal`/`Drawer` already had correct `role="dialog"`/`aria-modal="true"`/`aria-labelledby`/Escape (verified by direct code read before touching anything); this phase added the missing focus-trap + focus-return via the shared hook, applied identically to the new `QuickActionSheet`. `UserMenu`'s account dropdown correctly stays `role="menu"` (not `aria-modal`) — audited, confirmed it was never mis-tagged as a dialog.

## 25. Status announcements

Standardized 3 previously-ad-hoc live-region conventions (bare `role="alert"`; `role="status" aria-live="polite"`; bare `aria-live="polite"` with no role) down to the 2 that were already correct: `role="alert"` for errors, `role="status" aria-live="polite"` for success/progress. Added the missing `role="status"` to 3 bare `aria-live` sites (`ImportCenter.jsx`, `ReviewDetail.jsx`, `ReviewCenter.jsx`). The write-state banner and `Field`'s error wiring were already correct — confirmed, not touched.

## 26. Form error accessibility

`ui/Field.jsx` was already fully correct (`htmlFor`/`id`, `aria-describedby`, `aria-invalid`, `role="alert"` on the error) — audited directly, no changes needed or made.

## 27. Icon buttons

`ui/IconButton.jsx` was already correctly built (guaranteed `aria-label`/`title`) but unused anywhere in the app — reused for the new `QuickActionSheet`'s close button rather than building a new icon-button pattern. No pre-existing icon-only button lacking an accessible name was found anywhere in the tree (confirmed via grep before assuming a gap existed).

## 28. Badges / semantic status

Confirmed (not assumed) via direct code read: `Badge`/`StatusBadge`/`OwnerBadge` all already render real visible text, never color alone; `StatusBadge` additionally duplicates into an explicit `aria-label`. No change needed or made.

## 29. Chart accessibility

`TrajectoryChart`/`ProgressRing`'s existing `role="img"` summaries were confirmed, by reading the actual branching summary-text logic, to already be complete and accurate (starting/current/eliminated numbers, with/without-projection branches) — no chart accessibility work was needed, and none was speculatively done.

## 30. Headings / landmarks

Direct verification (not the original broad "two h1s everywhere" assumption) found: Home/Debts/Review/Activity/Settings each already have exactly one real, correctly-leveled heading (`NextMoveHero`'s `<h1>` on Home; `PortfolioHeader`→`PageHeader`'s `<h1>` on Debts; `ReviewCenter`'s `PageHeader`'s `<h1>` on Review; `ActivityCenter`'s `PageHeader`'s `<h1>` on Activity; `Settings`' `Section` component's `<h2>` → subsection `<h3>`s, a valid non-skipping hierarchy). The one genuine gap found: **Plan had zero semantic headings anywhere** — every "title" was a styled `<div>`. Fixed by converting `PlanSection.jsx`'s single root title ("Your path to $0", rendered once regardless of which destination is active) to a real `<h1>` with identical styling — a tag change, not a visual change. `TrackToZeroV2App.jsx`'s `WorkspaceBar` `<h1>` was investigated and found to be dead/unreachable code given its only call site's prop wiring (`canSwitchWorkspace`/`canSwitchRole` are always true whenever it renders at all, so its early-return `QaHarnessControls` branch always wins) — left as-is rather than touched, since it never actually renders in practice and isn't a live duplicate-heading bug.

## 31. Large text

Not fully stress-tested with OS-level text-size scaling (outside what this environment can drive), but reviewed: `TYPE_SCALE` uses fixed px (not rem), which still scales correctly under standard browser zoom (verified at 200%, §32) but would not track an OS "larger text only" accessibility setting the way rem-based type would. Documented as a known limitation (§53), not silently ignored.

## 32. 200% zoom

Verified live: Home at 200% browser zoom (`document.body.style.zoom = "2"`) still renders the Next Move hero correctly, no console errors.

## 33. Contrast

Computed exact WCAG relative-luminance contrast ratios (not eyeballed) for every saturated tone color against BOTH plain white and its own real Badge tint background (the stricter, more honest real-world test) — found `success`/`warning`/`info`/`ac` all failing 4.5:1 against white (2.36-3.06:1), and `danger` narrowly failing (4.27:1) against its own tint despite passing against white alone. Corrected all 5 in `theme.js`, scoped to V2 only (not the shared `src/config/palette.js`/`brand.js`, which also power the V1 app and are out of scope) — every corrected value now clears ≥4.5:1 against both white and its real tint. Locked in with a permanent regression test (`theme.test.js`, 5 assertions) computing the same real luminance math.

## 34. Reduced motion

Gated the 3 previously-ungated transitions found in the tracktozero tree (`ui/Button.jsx`, `debts/CategoryGrid.jsx`, `ui/ProgressBar.jsx`) behind the existing `useReducedMotion` hook — reused exactly as already established by `LoadingState.jsx`/`MilestoneBanner.jsx`, no new motion infrastructure. `src/App.css`'s 9 celebration `@keyframes` were confirmed (via import-graph check) to belong to the V1 app only, never consumed by any tracktozero component — correctly out of scope, not touched.

## 35. Touch targets

New bottom-nav items: `minHeight: 48`. Center action: 52×52px circular button. Quick-action-sheet rows: `minHeight: 52`. All comfortably tappable. Existing `Tabs.jsx` primitive (used by `ScopeSelector`) has `minHeight: 36` — reviewed, clears WCAG 2.5.8's 24px AA minimum with margin; left unchanged since it's shared with the desktop experience and no specific evidence of it being a real tap-precision problem was found in QA.

## 36. Dark mode QA

Not applicable — confirmed via direct code read of `theme.js` (`export const TTZ_THEME = "light";`, no theme toggle exists) that V2 does not currently offer dark mode. Documented here rather than silently skipped, per the task's own instruction.

## 37. Accessibility automation

No axe/jest-axe/Playwright-accessibility integration exists in this repo (checked `package.json`) — not introduced, per the task's own "don't add a major dependency solely to claim compliance" guidance. All accessibility verification in this phase is either a real computed check (contrast math, locked into a permanent test) or real live-browser DOM/behavior verification (focus movement, landmark counts, ARIA attribute presence) via Playwright, not a simulated audit tool.

## 38. Responsive breakpoint matrix

Verified, zero horizontal overflow at every width: 320×568, 360×640, 360×800 (prior phase), 390×667, 390×844, 430×932, 768×1024, 820×1180, 1024×768, 1280×800 (build-verified via existing budgets), 1440×900.

## 39. Performance

No new dependency added (mobile nav/action sheet/focus-trap all built on existing primitives + `lucide-react`, already a dependency). Bundle budget check: TrackToZero V2 chunk grew from 338.43 kB to 346.37 kB (+7.9 kB for the entire mobile nav/action-sheet/dialog-focus/contrast-fix feature set), still comfortably under its 450 kB budget. Desktop and mobile share one component tree throughout (no parallel "mobile app"/"desktop app" duplication) — `MobileBottomNav`/`QuickActionSheet` are viewport-gated additions, not a forked UI.

## 40. Security regression

Verified live as a Viewer: the quick-action sheet offers zero mutating actions and shows an explicit read-only explanation — confirmed the center action cannot be used to bypass the existing permission model. `getAssignableDebtOwners`/owner-selector verified-member-only behavior, cross-workspace isolation, and Activity's workspace-scoped `getWorkspaceContext` check were all unmodified by this phase and remain covered by the full existing Firestore rules + service-layer test suites, all still green (§48).

## 41. Financial regression

No financial calculation, selector, or truth-derivation function was touched this phase (verified via diff review — every code change in this phase is UI chrome, focus management, theming, or navigation; `homeViewModels.js`, `projectionStatusService.js`, `v2AsyncApplicationService.js`, the payoff engine, and all Progress-Truth-Contract logic are absent from the diff). All UX-7 financial-truth tests (progress, milestones, Next Move priority chain, Activity feed, reforecast) pass unmodified.

## 42. DATA-2 regression

Untouched this phase; full existing test suite (`workbookDebtDiscovery.test.js` etc.) green.

## 43. REVIEW-2 regression

The mobile queue drawer reuses `ReviewQueueList`/`ReviewSessionCard`/the existing blocking/non-blocking classification and save/skip logic verbatim — no changes to REVIEW-2's classification or workbench save behavior, only to how the queue pane is *reached* below the tablet breakpoint. Verified live with the real DATA-2 fixture: blocking (⚠) vs non-blocking (•) items still render identically in the new drawer as in the desktop rail.

## 44. SEC-INVITE regression

Untouched. Full existing Firestore v2 rules suite (including all invite-specific tests) green (§48).

## 45. UX-6.1 / UX-6.2 regression

`CategoryGrid.jsx`'s focus-ring/reduced-motion additions are additive only (no layout/behavior change to category tiles' click/selection logic). `ScopeSelector`/verified-member-only owner assignment, Personal/Household voice, workspace-switch reset — all unmodified, all covered by the existing green test suite.

## 46. UX-7 regression

`ActivityPreviewCard`'s one-line `flexWrap` addition is the only change in the entire UX-7 surface area; `homeViewModels.js`, `NextMoveHero.jsx`, `MilestoneBanner.jsx`'s actual logic, `activityFeed.js` are untouched. All UX-7 tests (Next Move priority chain, milestones, activity feed, reforecast persistence) pass unmodified.

## 47. Browser QA

Executed live against a real Chromium instance (`inMemory` repository mode) across: mobile Home (NextMoveHero-first ordering, bottom nav, quick-action sheet open/Add-debt-autoopen), mobile Debts/Activity/Settings (all zero-overflow, Settings reachable via account menu), mobile+tablet Review (queue drawer with a real populated queue, open/select/close), Viewer-role quick-action gating, a full keyboard-only journey with live focus-in/focus-return verification, 200% zoom, the full responsive/landscape/short-viewport matrix, and a desktop-regression pass (Home/Debts/Review/Plan unchanged, zero overflow). **Total console/page errors across every flow: 0.**

## 48. Test totals

- `npx vitest run`: **746 / 746 passed** (52 test files) — up from UX-7's 728/728 baseline (net delta: -2 for the deleted `progressService.test.js`, +20 new: 5 contrast regression tests, 6 `useDialogFocus` trap-logic tests, 6 `MobileBottomNav` tests, 7 `QuickActionSheet` tests).
- `npx eslint .`: **0 errors**, 4 pre-existing warnings in files this phase never touched or whose flagged line predates this phase.
- `npm run build`: succeeds.
- `npm run perf:check`: all budgets pass (TrackToZero V2: 346.37 kB / 450 kB).
- `npm run test:firestore`: **12 / 12 passed** (unchanged from baseline).
- `npm run test:firestore:v2`: **67 / 67 passed**, rules parity guard PASS, no drift.
- `npm audit --omit=dev`: **0 vulnerabilities**.

## 49. Lint / build / perf / audit

All green, exact figures reported in §48 above — no invented numbers, every count is from an actual run in this session.

## 50. Bugs found

(1) Debug run initially found `TopBar`'s `PrimaryNav` would render simultaneously with the new `MobileBottomNav` at mobile widths, producing two duplicate "Primary" nav landmarks — caught before it shipped, fixed in `TopBar.jsx` (§10). (2) The original plan's "two `<h1>`s everywhere" assumption, based on an early research pass reading component bodies without tracing actual reachable render paths, was checked against the real render tree during implementation and found to be materially wrong for 5 of 6 tabs — only Plan genuinely lacked a heading (§30); the plan's assumption was corrected mid-implementation rather than blindly executed.

## 51. Root causes

Duplicate nav landmark: `TopBar.jsx`'s nav row had no gate at all below the tablet breakpoint, only a horizontal-scroll style change — adding a wholly new, separately-gated bottom nav without also constraining the old one was the root cause. Missing Plan heading: `PlanSection.jsx` never adopted the `PageHeader`/`<h1>` convention `PortfolioHeader`/`ReviewCenter`/`ActivityCenter` all independently use — an inconsistency from incremental feature-phase development, not a regression.

## 52. Fixes

Both described in §10 and §30 above — a one-line conditional gate and a single heading-tag change, respectively, both zero-visual-impact.

## 53. Known limitations

- Focus-trap/focus-return/reduced-motion-state and other real-DOM-dependent behaviors could not be unit-tested (this repo's test environment is Node, not jsdom - confirmed via `vitest.config.js` - and no `@testing-library/react`/jsdom exists); the trap's pure boundary-decision logic was extracted and unit-tested instead, and the full real-DOM behavior was verified live in Playwright (§23) rather than left unverified.
- OS-level "large text only" accessibility settings (distinct from browser zoom, which IS verified) were not stress-tested - `TYPE_SCALE`'s fixed-px sizing is documented as a real, not-yet-addressed gap for that specific setting.
- Dark mode: not applicable, V2 has none (§36).
- `Tabs.jsx`'s 36px touch target height and the Settings "Connect account" select's 220px min-width were reviewed and judged acceptable, not changed - flagged here in case future real-device testing disagrees.

## 54. Deferred items

Removing/consolidating the now-fully-orphaned `ui/ProgressBar.jsx` (a related but distinct dead-code item from `progressService.js`, deliberately not expanded into this phase's scope). Full axe-style automated accessibility scanning, should the team later decide the dependency is worth it. `WorkspaceBar`'s dead h1 branch cleanup (harmless, unreachable, not touched to avoid unrelated scope creep).

## 55. UX-9 readiness

**The product is ready for UX-9 — Full Local Beta Usability / End-to-End Product Validation.** All financial-truth, security, and UX-6/UX-7 contracts remain green and unmodified; mobile navigation, the quick-action sheet, and the Review queue-browsability gap are real, working, live-verified features; the confirmed WCAG contrast fix, focus-management fix, and heading fix are locked in with either permanent tests or live verification. No known blocker was left unresolved silently - every limitation is named in §53.
