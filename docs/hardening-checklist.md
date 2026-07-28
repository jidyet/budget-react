# Hardening Checklist

## App Stability

- Keep `App.jsx` focused on orchestration, not page logic or utility logic.
- Prefer extracting app-wide behavior into hooks before adding more inline coordinator code.
- After refactors, verify initialization order for:
  - derived account data
  - navigation helpers
  - billing helpers
  - upload/export helpers
  - modal and feedback handlers

## Verification Path

Run these before merging larger work:

```bash
npx eslint src --format stylish
npm test
npm run build
npm run perf:check
```

## Runtime Regression Watchlist

- command palette opens and navigates
- dashboard loads without fallback error boundary
- upload page opens and lazy imports resolve
- billing/settings routes still navigate correctly
- mobile shell still scrolls and respects safe areas

## Lint Scope

Use `npx eslint src --format stylish` as the trustworthy app check.

The package script `npm run lint` is still broader than the maintained source scope and can traverse generated directories.

## Next Good Hardening Moves

- narrow `npm run lint` to a repo-safe scope
- add smoke tests for route navigation and lazy pages
- remove remaining hook dependency suppressions where practical
- add CI enforcement for bundle budgets once the team is comfortable with the thresholds
