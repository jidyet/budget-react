import { describe, expect, it } from "vitest";
import { getEnvironmentBadge } from "./environment.js";
import { TRACKTOZERO_V2_REPOSITORY_MODES } from "../../../services/tracktozero/repositoryRuntime.js";

describe("getEnvironmentBadge: the one place environment copy is decided (UX-1 Part 28)", () => {
  it("production shows no emulator/test terminology at all", () => {
    expect(getEnvironmentBadge(TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction, "normal")).toBeNull();
  });

  it("localBeta shows a small honest LOCAL BETA label", () => {
    expect(getEnvironmentBadge(TRACKTOZERO_V2_REPOSITORY_MODES.localBeta, "normal")).toEqual({ label: "LOCAL BETA", tone: "info" });
  });

  it("firebaseEmulator (seeded QA harness) is distinguished from localBeta", () => {
    const badge = getEnvironmentBadge(TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator, "normal");
    expect(badge.label).toBe("QA HARNESS");
  });

  it("inMemory shows a neutral test-workspace label", () => {
    const badge = getEnvironmentBadge(TRACKTOZERO_V2_REPOSITORY_MODES.inMemory, "normal");
    expect(badge.label).toBe("TEST WORKSPACE");
  });

  it("legacy_preview snapshot mode is called out even outside firebaseEmulator", () => {
    const badge = getEnvironmentBadge(TRACKTOZERO_V2_REPOSITORY_MODES.inMemory, "legacy_preview");
    expect(badge.label).toBe("READ-ONLY PREVIEW");
  });
});
