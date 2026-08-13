import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories.js";
import { FirebaseTrackToZeroRepository } from "../repositories/firebaseTrackToZeroRepository.js";
import { createTrackToZeroV2Seed } from "./v2SeedData.js";

export const TRACKTOZERO_V2_REPOSITORY_MODES = Object.freeze({
  inMemory: "inMemory",
  firebaseEmulator: "firebaseEmulator",
});

export const TRACKTOZERO_V2_EMULATOR_PROJECT_ID = "demo-budget-react-v2";
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

export const createTrackToZeroRepository = ({
  mode = TRACKTOZERO_V2_REPOSITORY_MODES.inMemory,
  firestoreInstance = null,
  firebaseConfig = null,
  emulatorHost = "",
} = {}) => {
  if (mode === TRACKTOZERO_V2_REPOSITORY_MODES.inMemory) {
    return new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  }
  if (mode !== TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) {
    throw new Error(`Unknown TrackToZero v2 repository mode: ${mode}`);
  }

  const projectId = firebaseConfig?.projectId || TRACKTOZERO_V2_EMULATOR_PROJECT_ID;
  assertTrackToZeroV2EmulatorConfig({ projectId, emulatorHost, mode });
  if (firestoreInstance) return new FirebaseTrackToZeroRepository(firestoreInstance);

  const parsed = parseEmulatorHost(emulatorHost);
  const appName = `tracktozero-v2-${projectId}`;
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
