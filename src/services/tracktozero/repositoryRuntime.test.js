import { describe, expect, it } from "vitest";
import {
  assertTrackToZeroV2EmulatorConfig,
  assertTrackToZeroV2LocalBetaConfig,
  assertTrackToZeroV2ProductionConfig,
  createTrackToZeroRepository,
  getTrackToZeroV2LocalBetaAuth,
  parseEmulatorHost,
  TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
  TRACKTOZERO_V2_PRODUCTION_PROJECT_ID,
  TRACKTOZERO_V2_REPOSITORY_MODES,
} from "./repositoryRuntime";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { FirebaseTrackToZeroRepository } from "../repositories/firebaseTrackToZeroRepository";

describe("TrackToZero v2 repository runtime", () => {
  it("keeps in-memory runtime available for safe local demos and existing tests", () => {
    const repo = createTrackToZeroRepository({ mode: TRACKTOZERO_V2_REPOSITORY_MODES.inMemory });
    expect(repo).toBeInstanceOf(InMemoryTrackToZeroRepository);
    expect(repo.listWorkspaces().length).toBeGreaterThan(0);
  });

  it("parses explicit emulator host config", () => {
    expect(parseEmulatorHost("127.0.0.1:8080")).toEqual({ host: "127.0.0.1", port: 8080 });
    expect(parseEmulatorHost("")).toBeNull();
    expect(parseEmulatorHost("production")).toBeNull();
  });

  it("fails closed for Firebase runtime without the approved emulator config", () => {
    expect(() => assertTrackToZeroV2EmulatorConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator,
      projectId: "budgetapp-c9306",
      emulatorHost: "127.0.0.1:8080",
    })).toThrow(/emulator project/i);
    expect(() => assertTrackToZeroV2EmulatorConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator,
      projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
      emulatorHost: "",
    })).toThrow(/Firebase emulator is required/i);
  });

  it("injects FirebaseTrackToZeroRepository only when emulator config is explicit", () => {
    const fakeDb = { fake: true };
    const repo = createTrackToZeroRepository({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator,
      firestoreInstance: fakeDb,
      firebaseConfig: { projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID },
      emulatorHost: "127.0.0.1:8080",
    });
    expect(repo).toBeInstanceOf(FirebaseTrackToZeroRepository);
  });

  it("fails closed for local-beta mode when the Firestore emulator host is missing", () => {
    expect(() => assertTrackToZeroV2LocalBetaConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
      emulatorHost: "",
      authEmulatorHost: "127.0.0.1:9199",
    })).toThrow(/Firestore emulator host/i);
  });

  it("fails closed for local-beta mode when the Auth emulator host is missing", () => {
    expect(() => assertTrackToZeroV2LocalBetaConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
      emulatorHost: "127.0.0.1:8090",
      authEmulatorHost: "",
    })).toThrow(/Auth emulator host/i);
  });

  it("fails closed for local-beta mode with the wrong project id", () => {
    expect(() => assertTrackToZeroV2LocalBetaConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      projectId: "budgetapp-c9306",
      emulatorHost: "127.0.0.1:8090",
      authEmulatorHost: "127.0.0.1:9199",
    })).toThrow(/local emulator project id/i);
  });

  it("passes local-beta config validation with both emulator hosts set correctly", () => {
    expect(() => assertTrackToZeroV2LocalBetaConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
      emulatorHost: "127.0.0.1:8090",
      authEmulatorHost: "127.0.0.1:9199",
    })).not.toThrow();
  });

  it("localBeta repository creation fails closed without a Firestore emulator host, never silently using production", () => {
    expect(() => createTrackToZeroRepository({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      firebaseConfig: { projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID },
      emulatorHost: "",
    })).toThrow(/Firestore emulator host/i);
  });

  it("localBeta repository creation injects FirebaseTrackToZeroRepository when a fake instance is supplied for tests", () => {
    const fakeDb = { fake: true };
    const repo = createTrackToZeroRepository({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
      firestoreInstance: fakeDb,
      firebaseConfig: { projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID },
      emulatorHost: "127.0.0.1:8090",
    });
    expect(repo).toBeInstanceOf(FirebaseTrackToZeroRepository);
  });

  it("getTrackToZeroV2LocalBetaAuth fails closed without an Auth emulator host, never silently using production", () => {
    expect(() => getTrackToZeroV2LocalBetaAuth({
      firebaseConfig: { projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID },
      emulatorHost: "127.0.0.1:8090",
      authEmulatorHost: "",
    })).toThrow(/Auth emulator host/i);
  });

  it("allows production Firebase runtime only for the approved clean beta project", () => {
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: TRACKTOZERO_V2_PRODUCTION_PROJECT_ID,
    })).not.toThrow();
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: "demo-budget-react-v2",
    })).toThrow(/Production Firebase is not configured/i);
  });

  it("BETA-2: the allowed production project id defaults to TRACKTOZERO_V2_PRODUCTION_PROJECT_ID but is overridable for a dedicated beta project, and still fails closed against anything else", () => {
    // No override supplied: identical to the pre-BETA-2 contract above.
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: TRACKTOZERO_V2_PRODUCTION_PROJECT_ID,
    })).not.toThrow();

    // A dedicated beta project id is accepted ONLY when explicitly passed as
    // the allowed project - it is never implicitly trusted.
    const betaProjectId = "tracktozero-beta-example";
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: betaProjectId,
      allowedProjectId: betaProjectId,
    })).not.toThrow();

    // Once a beta allowedProjectId is set, the REAL production project id no
    // longer passes - proves this never widens what's accepted, only shifts
    // which single id is expected.
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: TRACKTOZERO_V2_PRODUCTION_PROJECT_ID,
      allowedProjectId: betaProjectId,
    })).toThrow(/Production Firebase is not configured/i);

    // A stray/misconfigured third project id is rejected even with an
    // explicit beta allowedProjectId in play.
    expect(() => assertTrackToZeroV2ProductionConfig({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      configured: true,
      projectId: "some-other-project",
      allowedProjectId: betaProjectId,
    })).toThrow(/Production Firebase is not configured/i);
  });

  it("BETA-2: createTrackToZeroRepository's allowedProductionProjectId threads through to the fail-closed check", () => {
    const betaProjectId = "tracktozero-beta-example";
    const fakeDb = { fake: true };
    expect(() => createTrackToZeroRepository({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      firestoreInstance: fakeDb,
      firebaseConfig: { projectId: betaProjectId },
      allowedProductionProjectId: betaProjectId,
    })).not.toThrow();
    expect(() => createTrackToZeroRepository({
      mode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction,
      firestoreInstance: fakeDb,
      firebaseConfig: { projectId: "some-other-project" },
      allowedProductionProjectId: betaProjectId,
    })).toThrow(/Production Firebase is not configured/i);
  });
});
