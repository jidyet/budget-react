import { describe, expect, it } from "vitest";
import {
  assertTrackToZeroV2EmulatorConfig,
  createTrackToZeroRepository,
  parseEmulatorHost,
  TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
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
});
