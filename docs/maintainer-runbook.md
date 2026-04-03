# Maintainer Runbook

## Purpose
This project currently uses a lightweight web CI check for the React app:

- `npx eslint src --format stylish`
- `npm test`
- `npm run build`

These are the commands GitHub Actions runs on pushes to `main`/`master` and on pull requests.

## Local Verification
Run these before merging:

```bash
npm ci
npx eslint src --format stylish
npm test
npm run build
```

## Why CI Uses `eslint src`
The repository still contains generated or bulky folders such as `.gradle-home/`, `android/`, and build artifacts. The package script `npm run lint` currently runs `eslint .`, which is broader than the practical app source surface and can crawl those large directories.

Until the lint script is narrowed or the ignore list is expanded, CI intentionally uses:

```bash
npx eslint src --format stylish
```

That keeps CI focused on the app code that we actively maintain.

## Release-Safe Checks
Before a release or larger refactor:

1. Run the standard local verification commands.
2. Confirm the production build still succeeds with `npm run build`.
3. Review the build output for large chunk warnings.
4. Smoke test the main flows:
   - overview/dashboard
   - bills/accounts
   - payoff
   - upload/import
   - settings

## Firebase Notes
The CI workflow does not run deploys and does not require live Firebase credentials. It only validates static linting, unit tests, and production build integrity.

## Follow-Up Improvements
Good next improvements after this runbook:

- narrow `npm run lint` to a repo-safe scope
- add a dedicated Firestore test workflow once emulator coverage is stable
- add branch protection requiring the `CI` workflow to pass
