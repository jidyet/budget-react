import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { db as productionDb, getFirebaseConfig, getFirebaseStatus } from "../../firebase.js";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories.js";
import { FirebaseTrackToZeroRepository } from "../repositories/firebaseTrackToZeroRepository.js";
import { createTrackToZeroV2Seed } from "./v2SeedData.js";

export const TRACKTOZERO_V2_REPOSITORY_MODES = Object.freeze({
  inMemory: "inMemory",
  // Seeded interactive QA harness: auto-signs in as a fixed known actor
  // (seed-owner/seed-admin/...) against a local emulator, with a role/
  // workspace preview switcher. Requires the emulator to already have that
  // actor + seed workspaces (see scripts/run-firestore-v2-tests.mjs's own
  // seeding, or a manual seed script) - it is NOT a fresh-signup flow.
  firebaseEmulator: "firebaseEmulator",
  // Real fresh-user flow (AuthScreen, real signup/login, Personal/Household
  // onboarding, Owner bootstrap) run against LOCAL Firebase Auth + Firestore
  // emulators instead of production. Starts from zero users/workspaces by
  // design - no seeding required or expected. Fails closed: if either local
  // emulator host is missing/unparseable, this mode refuses to fall back to
  // production and surfaces a local configuration error instead.
  localBeta: "localBeta",
  firebaseProduction: "firebaseProduction",
});

export const TRACKTOZERO_V2_EMULATOR_PROJECT_ID = "demo-budget-react-v2";
export const TRACKTOZERO_V2_PRODUCTION_PROJECT_ID = "budgetapp-c9306";
export const TRACKTOZERO_V2_TEST_PASSWORD = "TrackToZero123!";

const connectedFirestoreEmulators = new Set();
const connectedAuthEmulators = new Set();

export const testEmailForActor = (actorId) => `${String(actorId || "").trim()}@tracktozero.test`;

export const parseEmulatorHost = (hostValue = "") => {
  const text = String(hostValue || "").trim();
  if (!text) return null;
  const [host, portText] = text.split(":");
  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port <= 0) return null;
  return { host, port };
};

export const assertTrackToZeroV2EmulatorConfig = ({
  projectId,
  emulatorHost,
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator,
} = {}) => {
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) return true;
  if (projectId !== TRACKTOZERO_V2_EMULATOR_PROJECT_ID) {
    throw new Error("TrackToZero test persistence is unavailable. The Firebase emulator project is required for this environment.");
  }
  if (!parseEmulatorHost(emulatorHost)) {
    throw new Error("TrackToZero test persistence is unavailable. The Firebase emulator is required for this environment.");
  }
  return true;
};

// Fail-closed: BOTH the Firestore and Auth emulator hosts must be explicit
// and parseable, or this throws rather than letting local-beta mode silently
// proceed against (or fall back to) anything else, including production.
export const assertTrackToZeroV2LocalBetaConfig = ({
  projectId,
  emulatorHost,
  authEmulatorHost,
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
} = {}) => {
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.localBeta) return true;
  if (projectId !== TRACKTOZERO_V2_EMULATOR_PROJECT_ID) {
    throw new Error("Local beta configuration error: the local emulator project id is missing or wrong.");
  }
  if (!parseEmulatorHost(emulatorHost)) {
    throw new Error("Local beta configuration error: the local Firestore emulator host is not set. Start it with `npm run emulators:v2` and set VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST.");
  }
  if (!parseEmulatorHost(authEmulatorHost)) {
    throw new Error("Local beta configuration error: the local Auth emulator host is not set. Start it with `npm run emulators:v2` and set VITE_TRACKTOZERO_V2_AUTH_EMULATOR_HOST.");
  }
  return true;
};

export const assertTrackToZeroV2ProductionConfig = ({
  projectId,
  configured,
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
} = {}) => {
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction) return true;
  if (!configured || projectId !== TRACKTOZERO_V2_PRODUCTION_PROJECT_ID) {
    throw new Error("TrackToZero beta is temporarily unavailable. Production Firebase is not configured for this release.");
  }
  return true;
};

export const createTrackToZeroRepository = ({
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.inMemory,
  firestoreInstance = null,
  firebaseConfig = null,
  emulatorHost = "",
} = {}) => {
  if (mode === TRACKTOZERO_V2_REPOSITORY_MODES.inMemory) {
    return new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  }
  if (mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction) {
    const status = getFirebaseStatus();
    const config = firebaseConfig || getFirebaseConfig();
    assertTrackToZeroV2ProductionConfig({
      projectId: config.projectId || status.projectId,
      configured: Boolean(firestoreInstance || productionDb) && status.configured,
      mode,
    });
    return new FirebaseTrackToZeroRepository(firestoreInstance || productionDb);
  }
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator && mode !== TRACKTOZERO_V2_REPOSITORY_MODES.localBeta) {
    throw new Error(`Unknown TrackToZero v2 repository mode: ${mode}`);
  }

  const projectId = firebaseConfig?.projectId || TRACKTOZERO_V2_EMULATOR_PROJECT_ID;
  if (mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) {
    assertTrackToZeroV2EmulatorConfig({ projectId, emulatorHost, mode });
  } else {
    // localBeta: Firestore side of the fail-closed check here; the Auth side
    // is checked independently by getTrackToZeroV2LocalBetaAuth below, since
    // this function only ever touches Firestore.
    if (projectId !== TRACKTOZERO_V2_EMULATOR_PROJECT_ID || !parseEmulatorHost(emulatorHost)) {
      throw new Error("Local beta configuration error: the local Firestore emulator host is not set. Start it with `npm run emulators:v2` and set VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST.");
    }
  }
  if (firestoreInstance) return new FirebaseTrackToZeroRepository(firestoreInstance);

  const parsed = parseEmulatorHost(emulatorHost);
  const appName = mode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta ? `tracktozero-v2-local-beta-${projectId}` : `tracktozero-v2-${projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    || initializeApp({ ...(firebaseConfig || {}), projectId }, appName);
  const db = getFirestore(app);
  const firestoreKey = `${app.name}|${parsed.host}:${parsed.port}`;
  if (!connectedFirestoreEmulators.has(firestoreKey)) {
    connectFirestoreEmulator(db, parsed.host, parsed.port);
    connectedFirestoreEmulators.add(firestoreKey);
  }
  return new FirebaseTrackToZeroRepository(db);
};

export const ensureTrackToZeroV2EmulatorActor = async ({
  actorId,
  firebaseConfig = null,
  emulatorHost = "",
  authEmulatorHost = "",
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.inMemory,
} = {}) => {
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) return null;
  const projectId = firebaseConfig?.projectId || TRACKTOZERO_V2_EMULATOR_PROJECT_ID;
  assertTrackToZeroV2EmulatorConfig({ projectId, emulatorHost, mode });
  if (!parseEmulatorHost(authEmulatorHost)) {
    throw new Error("TrackToZero test persistence is unavailable. The Firebase Auth emulator is required for this environment.");
  }
  const parsedAuth = parseEmulatorHost(authEmulatorHost);
  const appName = `tracktozero-v2-${projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    || initializeApp({ ...(firebaseConfig || {}), projectId }, appName);
  const auth = getAuth(app);
  const authKey = `${app.name}|${parsedAuth.host}:${parsedAuth.port}`;
  if (!connectedAuthEmulators.has(authKey)) {
    connectAuthEmulator(auth, `http://${parsedAuth.host}:${parsedAuth.port}`, { disableWarnings: true });
    connectedAuthEmulators.add(authKey);
  }
  if (auth.currentUser?.uid === actorId) return auth.currentUser;
  const result = await signInWithEmailAndPassword(auth, testEmailForActor(actorId), TRACKTOZERO_V2_TEST_PASSWORD);
  return result.user;
};

// Real-signup auth for local-beta mode: a fresh-user flow (arbitrary email/
// password chosen by whoever is testing, not a fixed known actor) run
// entirely against the local Auth emulator. Fails closed - never falls back
// to production if the emulator host is missing/unparseable - and uses its
// own named Firebase app (see createTrackToZeroRepository's `localBeta`
// branch above) so its signed-in state never collides with the separate
// firebaseEmulator seeded-QA app instance.
export const getTrackToZeroV2LocalBetaAuth = ({
  firebaseConfig = null,
  emulatorHost = "",
  authEmulatorHost = "",
} = {}) => {
  const projectId = firebaseConfig?.projectId || TRACKTOZERO_V2_EMULATOR_PROJECT_ID;
  assertTrackToZeroV2LocalBetaConfig({ projectId, emulatorHost, authEmulatorHost, mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta });

  const parsedAuth = parseEmulatorHost(authEmulatorHost);
  const appName = `tracktozero-v2-local-beta-${projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    || initializeApp({ ...(firebaseConfig || {}), projectId }, appName);
  const auth = getAuth(app);
  const authKey = `${app.name}|${parsedAuth.host}:${parsedAuth.port}`;
  if (!connectedAuthEmulators.has(authKey)) {
    connectAuthEmulator(auth, `http://${parsedAuth.host}:${parsedAuth.port}`, { disableWarnings: true });
    connectedAuthEmulators.add(authKey);
  }

  return {
    auth,
    signup: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
  };
};
