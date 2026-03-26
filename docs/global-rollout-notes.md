# Global Rollout Notes

This app is designed to stay manual-first and easy to understand across regions.

## What stays true

- Solo mode stays fully usable.
- Shared household mode stays optional.
- Spreadsheet import and statement upload stay supported.
- The app does not require bank sync.

## Copy approach

- Use short, plain-English wording.
- Prefer region-neutral phrases where possible.
- Avoid hardcoded launch copy spread across many files.

## Current rollout-ready structure

- Launch-facing trust and support copy is centralized in `src/config/launchCopy.js`.
- Help, privacy, beta, onboarding, and upload wording now reuse shared launch copy.
- Region-specific brand names remain only where they are actual providers or user data.

## Future-ready notes

- If broader localization is needed later, expand `launchCopy.js` into a full text dictionary.
- Keep new smart-sync work optional so manual and spreadsheet workflows stay first-class.
- Avoid making households feel like enterprise workspaces. Keep them simple and human.
