import { describe, expect, it } from "vitest";
import { getWorkspacePresentation } from "./workspacePresentation.js";

describe("getWorkspacePresentation (UX-6.2)", () => {
  it("uses individual voice for a Personal workspace", () => {
    expect(getWorkspacePresentation({ type: "personal" })).toMatchObject({
      isHousehold: false,
      debtHeading: "My debt",
      planHeading: "My payoff plan",
      nextMoveEyebrow: "Your next move",
    });
  });

  it("uses collective voice for a Household workspace", () => {
    expect(getWorkspacePresentation({ type: "household" })).toMatchObject({
      isHousehold: true,
      debtHeading: "Our debt",
      planHeading: "Household payoff plan",
      nextMoveEyebrow: "What's next for your household",
    });
  });

  it("defaults to Personal voice when workspace is missing/unknown, rather than throwing", () => {
    expect(getWorkspacePresentation(undefined).isHousehold).toBe(false);
    expect(getWorkspacePresentation({}).isHousehold).toBe(false);
  });
});
