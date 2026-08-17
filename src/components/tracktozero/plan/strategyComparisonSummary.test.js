import { describe, expect, it } from "vitest";
import { describeStrategyComparison } from "./strategyComparisonSummary.js";

describe("describeStrategyComparison", () => {
  it("returns explicit tie language when payoff month and interest match", () => {
    expect(describeStrategyComparison({
      snowball: { monthsToZero: 58, estimatedInterest: 9682.11 },
      avalanche: { monthsToZero: 58, estimatedInterest: 9682.11 },
    })).toContain("same projected payoff date and estimated interest");
  });

  it("treats tiny floating-point interest differences as a tie", () => {
    expect(describeStrategyComparison({
      snowball: { monthsToZero: 58, estimatedInterest: 9682.110001 },
      avalanche: { monthsToZero: 58, estimatedInterest: 9682.11 },
    })).toContain("same projected payoff date and estimated interest");
  });

  it("never emits a $0.00 savings recommendation", () => {
    expect(describeStrategyComparison({
      snowball: { monthsToZero: 58, estimatedInterest: 9682.11 },
      avalanche: { monthsToZero: 58, estimatedInterest: 9682.11 },
    })).not.toContain("$0.00");
  });

  it("keeps meaningful avalanche savings language", () => {
    expect(describeStrategyComparison({
      snowball: { monthsToZero: 60, estimatedInterest: 10200 },
      avalanche: { monthsToZero: 58, estimatedInterest: 9800 },
    })).toContain("Avalanche is projected to save about");
  });
});
