import { describe, expect, it } from "vitest";
import { getLaunchFlags } from "./launchFlags";

describe("launch flags", () => {
  it("makes TrackToZero 2.0 the default clean beta experience", () => {
    expect(getLaunchFlags().trackToZeroV2Enabled).toBe(true);
  });

  it("keeps TrackToZero migration tooling disabled by default for production safety", () => {
    expect(getLaunchFlags().trackToZeroMigrationEnabled).toBe(false);
  });
});
