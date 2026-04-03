# Household Budget (React + Firebase)

## Run locally
1. Install deps: `npm install`
2. Copy env template: `copy .env.example .env` (Windows) or `cp .env.example .env` (macOS/Linux)
3. Fill Firebase values in `.env` (see section below)
4. Start app: `npm run dev -- --host 127.0.0.1 --port 5174`

## Firebase setup
Use values from Firebase Console -> Project settings -> Your apps -> SDK setup and configuration.

Required `.env` keys:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)

Important:
- Restart dev server after editing `.env`.
- In Firebase Authentication -> Settings -> Authorized domains, add:
  - `localhost`
  - `127.0.0.1`

## Firestore security rules (starter)
Use per-user scoped rules in Firebase Console -> Firestore Database -> Rules:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Build
- `npm run build`

## CI
GitHub Actions runs the core web verification path on pushes and pull requests:

- `npx eslint src --format stylish`
- `npm test`
- `npm run build`

Maintainer notes live in [docs/maintainer-runbook.md](docs/maintainer-runbook.md).

## Performance
Bundle budgets are documented in [docs/performance-budgets.md](docs/performance-budgets.md).

Current local check:

- `npm run build`
- `npm run perf:check`
