# TrackToZero V2 — UX-1 Brand + Design System Results

## Status

UX-1 implementation is complete on branch `phase4/migration-rehearsal`.

Completion gate:

**PARTIAL — BRAND, DESIGN SYSTEM, APP SHELL, AND AUTOMATED REGRESSION COMPLETE; LOCAL BROWSER VISUAL QA BLOCKED BY UNAVAILABLE BROWSER SURFACES**

Scope honored:

- No Home command-center redesign.
- No Debts portfolio redesign.
- No Plan journey redesign.
- No Import Review redesign beyond preserving existing behavior.
- No production deploy.
- No production Firebase writes.
- No migration work.

## Brand Audit

Hard gate result: **A — original brand assets found**.

| Asset | Path / evidence | Type | Status | Action |
| --- | --- | --- | --- | --- |
| Wordmark system | `src/config/brand.js`, `src/components/ui/BrandLockup.jsx` | Code wordmark | Authentic existing TrackToZero brand | Reused in V2 `BrandMark`; no fake logo invented. |
| Palette | `src/config/brand.js`, `src/config/palette.js` | Brand colors / app palette | Authentic existing source of truth | Bridged into V2 `--ttz-*` tokens. |
| App icon | `public/tracktozero-icon.png` | PNG favicon/app icon | Authentic existing asset | Kept in `index.html`. |
| Root image | `track_to_zero.png` | PNG image asset | Likely legacy/brand asset | Documented; not stretched into shell because code wordmark is cleaner/responsive. |
| Theme color | `index.html` | Browser theme metadata | Was mismatched | Updated to brand blue `#18a7e1`. |
| Fonts | Existing app build output / brand typography usage | Font infrastructure | Already supported | Centralized as V2 font tokens; no new heavy UI framework added. |

Repository and git-history searches covered `tracktozero`, `track-to-zero`, `logo`, `brand`, `wordmark`, `favicon`, `icon`, `theme`, `primary`, and `accent` across filenames/content/history. The selected source of truth is the existing `src/config/brand.js` + `src/config/palette.js` brand system.

## Design Tokens

Added `src/components/tracktozero/theme.js`.

It bridges `buildPalette("light")` into V2 CSS custom properties:

- `--ttz-brand-primary`
- `--ttz-brand-secondary`
- `--ttz-brand-accent`
- semantic status tokens
- app/surface/background tokens
- text/border/shadow/radius/spacing/container/z-index/font tokens

Status-tone mapping is centralized and truthful:

- `ahead`, `on_track` → success
- `slightly_behind`, `needs_review` → warning
- `needs_balance_update`, `insufficient_data` → info
- `critical` → danger

## Formatting

Added `src/components/tracktozero/formatting.js`.

Centralized presentation-only helpers:

- `formatMoney`
- `formatPercent`
- `formatShortDate`

These do not alter financial truth or underlying values.

## UI Primitives

Added/refactored reusable components under `src/components/tracktozero/ui/`:

- `Button`
- `IconButton`
- `Card`
- `MetricCard`
- `Badge`
- `StatusBadge`
- `OwnerBadge`
- `Callout`
- `WarningCallout`
- `InfoCallout`
- `DangerCallout`
- `EmptyState`
- `LoadingState`
- `Skeleton`
- `ErrorState`
- `ProgressBar`
- `Tabs`
- `FilterChip`
- `Field`
- `Input`
- `MoneyInput`
- `DateInput`
- `Select`
- `Checkbox`
- `Modal`
- `Drawer`
- `ConfirmationDialog`

## App Shell

Added/refactored layout components under `src/components/tracktozero/layout/`:

- `AppShell`
- `BrandMark`
- `TopBar`
- `PrimaryNav`
- `WorkspaceIdentity`
- `UserMenu`
- `EnvironmentBadge`
- `PageContainer`
- `PageHeader`
- `SectionHeader`
- `QaHarnessControls`

`TrackToZeroV2App.jsx` is now wrapped with `AppShell` + `PageContainer`. The old dominant QA-style header/navigation was removed from the primary shell. Workspace/role preview controls remain available only as a secondary QA panel in non-real-auth runtimes.

## UX-0 Preservation

The visual layer consumes authoritative UX-0 values. It does not recalculate:

- debt totals
- plan status
- progress
- owner eligibility
- workspace type

`StatusBadge` reads the centralized `STATUS_TONE` map and cannot render a critical status as green.

## Tests Added

Added/updated:

- `src/components/tracktozero/formatting.test.js`
- `src/components/tracktozero/ui/primitives.test.js`
- `src/components/tracktozero/ui/StatusBadge.test.js`
- `src/components/tracktozero/layout/environment.test.js`
- `src/components/tracktozero/layout/shell.test.js`

Focused design-system validation passes: **5 files / 37 tests**.

## Validation Snapshot

Completed:

| Check | Result |
| --- | --- |
| Focused design-system tests | Passed, 5 files / 37 tests |
| Full unit suite | Passed, 27 files / 334 tests |
| `npm run lint` | Passed with the same 3 existing hook warnings |
| `npm run build` | Passed with existing large-chunk warning |
| `npm run perf:check` | Passed |
| `npm audit --omit=dev` | Passed, 0 vulnerabilities |
| `npm run test:firestore` | Passed, 12/12 legacy rules tests |
| `npm run test:firestore:v2` | Passed; production/reference V2 parity guard passed |

Existing lint warnings:

- `src/App.jsx`: missing `setUser` dependency warning.
- `src/hooks/useAccounts.js`: missing `defaultOwnerLabel` dependency warning.
- `src/hooks/useInstallPrompt.js`: missing `enabled` dependency warning.

These warnings pre-date UX-1 and were not changed in this phase.

## Browser QA

Local V2 dev server started successfully at `http://127.0.0.1:5184/`.

Browser visual QA could not be completed in this session:

- Browser connector result: `No browser is available`.
- Troubleshooting guidance was checked after the browser failure.
- No installed Chrome/Edge headless binary was visible from the local machine paths checked.
- Playwright/Puppeteer are not installed in the repository, and no new QA dependency was added just to force a visual pass.

Therefore desktop/tablet/mobile browser screenshot QA remains blocked and should be rerun when a browser surface is available. The implementation is not being represented as visually QA-passed.

## Production Safety

- Production touched: **NO**
- Deployed: **NO**
- Production migration: **NO**
- Production Firebase writes: **NO**
- `firebase.json` production rules target changed: **NO**

## Current Conclusion

UX-1 implementation and automated validation are complete. The remaining open item is browser visual QA across desktop/tablet/mobile because no browser automation or installed headless browser was available in this session.
