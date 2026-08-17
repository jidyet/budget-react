import { describe, expect, it } from "vitest";
import { DEBTS_DESTINATIONS, resolveDebtsDestination, buildDebtsPath } from "./debtsRouting.js";

// navigateToDebtsDestination itself (window.history.pushState + a manual
// popstate dispatch) is intentionally untested here, matching its
// planRouting.js precedent - this suite covers only the pure path
// resolution functions, which both accept an explicit pathname and need no
// DOM/jsdom environment (this repo's test suite runs in "node", not jsdom).
describe("debtsRouting (UX-6.1)", () => {
  it("includes the portfolio root plus one entry per debt category", () => {
    expect(DEBTS_DESTINATIONS[0]).toEqual({ key: "all", label: "All debts" });
    expect(DEBTS_DESTINATIONS.length).toBeGreaterThan(1);
  });

  it("resolves the bare /debts path and an unknown slug to the portfolio root", () => {
    expect(resolveDebtsDestination("/debts")).toBe("all");
    expect(resolveDebtsDestination("/")).toBe("all");
    expect(resolveDebtsDestination("/debts/not-a-real-category")).toBe("all");
  });

  it("resolves a real category slug and round-trips through buildDebtsPath", () => {
    expect(resolveDebtsDestination("/debts/credit-cards")).toBe("credit-cards");
    expect(buildDebtsPath("credit-cards")).toBe("/debts/credit-cards");
    expect(buildDebtsPath("all")).toBe("/debts");
  });

  it("tolerates a trailing slash", () => {
    expect(resolveDebtsDestination("/debts/credit-cards/")).toBe("credit-cards");
  });

  it("falls back to 'all' for an unsafe/unrecognized destination passed to buildDebtsPath", () => {
    expect(buildDebtsPath("not-a-real-category")).toBe("/debts");
  });
});
