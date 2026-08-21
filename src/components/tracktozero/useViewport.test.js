import { describe, expect, it } from "vitest";
import { MOBILE_VIEWPORT_QUERY } from "./useViewport.js";

describe("mobile viewport policy", () => {
  it("uses the mobile layout for narrow phones and short landscape phones", () => {
    expect(MOBILE_VIEWPORT_QUERY).toContain("max-width: 640px");
    expect(MOBILE_VIEWPORT_QUERY).toContain("max-height: 560px");
    expect(MOBILE_VIEWPORT_QUERY).toContain("orientation: landscape");
  });
});
