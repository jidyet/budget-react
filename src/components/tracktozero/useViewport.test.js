import { describe, expect, it } from "vitest";
import { MOBILE_VIEWPORT_QUERY, NARROW_PHONE_QUERY, SHORT_LANDSCAPE_QUERY } from "./useViewport.js";

describe("mobile viewport policy", () => {
  it("uses the mobile layout for narrow phones and short landscape phones", () => {
    expect(MOBILE_VIEWPORT_QUERY).toContain("max-width: 640px");
    expect(MOBILE_VIEWPORT_QUERY).toContain("max-height: 560px");
    expect(MOBILE_VIEWPORT_QUERY).toContain("orientation: landscape");
  });

  it("keeps narrow phone navigation distinct from the short-landscape layout", () => {
    expect(NARROW_PHONE_QUERY).toBe("(max-width: 640px)");
    expect(SHORT_LANDSCAPE_QUERY).toBe("(max-height: 560px) and (orientation: landscape)");
  });
});
