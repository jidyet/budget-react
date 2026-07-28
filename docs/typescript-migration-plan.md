# TypeScript Migration Plan

## Goal
Introduce TypeScript gradually without blocking day-to-day React work.

## Recommended Order

1. Start with utility and config files.
2. Migrate reusable hooks with stable inputs/outputs.
3. Migrate shared components with straightforward props.
4. Migrate page components.
5. Migrate `App.jsx` last, after coordinator extraction settles further.

## Best First Targets

- `src/config/*`
- `src/utils/*`
- `src/hooks/useAppFeedback.js`
- `src/hooks/useAppNavigation.js`
- `src/hooks/useAppDataIO.js`

These files have clearer boundaries than the legacy app coordinator.

## Suggested Rollout

- enable `allowJs` first
- add `tsconfig.json` with `noEmit`
- migrate a few leaf files to `.ts` / `.tsx`
- add type-checking to CI after a small stable slice is converted

## What To Avoid

- converting `App.jsx` too early
- mixing broad refactors with type migration in one PR
- introducing strict mode errors everywhere at once

## Definition Of Done For A First TS Slice

- file compiles with `tsc --noEmit`
- no runtime behavior changes
- prop and return types are explicit enough to help the next refactor
