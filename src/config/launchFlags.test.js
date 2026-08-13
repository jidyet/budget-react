import { describe, expect, it } from "vitest";
import { getLaunchFlags } from "./launchFlags";

describe("launch flags", () => {
  it("keeps TrackToZero 2.0 disabled by default for production safety", () => {
    expect(getLaunchFlags().trackToZeroV2Enabled).toBe(false);
  });
});
