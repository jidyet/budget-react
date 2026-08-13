import { initializeApp, getApps } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories.js";
import { FirebaseTrackToZeroRepository } from "../repositories/firebaseTrackToZeroRepository.js";
import { createTrackToZeroV2Seed } from "./v2SeedData.js";

export const TRACKTOZERO_V2_REPOSITORY_MODES = Object.freeze({
  inMemory: "inMemory",
  firebaseEmulator: "firebaseEmulator",
});

export const TRACKTOZERO_V2_EMULATOR_PROJECT_ID = "demo-budget-react-v2";

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
  connectFirestoreEmulator(db, parsed.host, parsed.port);
  return new FirebaseTrackToZeroRepository(db);
};
