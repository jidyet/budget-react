import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService } from "./v2AsyncApplicationService";
import { buildProjectionWithWarnings } from "./projectionStatusService.js";

// GATE-10B.1A: service-level tests for setMinimumPaymentRule and the
// resulting dynamic recalculation. The pure rule math (computeFromRule,
// estimateNextMinimum) is already covered by minimumPaymentRules.test.js -
// this file proves the rule can actually be saved/cleared through the real
// service against the real (in-memory) repository, with correct permission
// gating and correct interaction with the rest of the payment domain.

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

const findDebt = (repository, workspaceId, debtId) => repository.listDebts(workspaceId).find((debt) => debt.id === debtId);

const percentRule = (overrides = {}) => ({
  ruleType: "percentage_of_balance",
  percentageComponent: 0.02,
  ...overrides,
});

describe("setMinimumPaymentRule", () => {
  it("MIN-RULE-03/MIN-CALC-01: saving a valid percentage rule immediately produces a real estimate from the current working balance", async () => {
    const { repository, service } = makeService();
    // household-priceline: currentBalance 4100, no snapshot newer than seed, aprStatus known.
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.03 }));
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(123); // 3% of 4100
    expect(debt.estimatedNextMinimumSource).toBe("issuer_rule_estimate");
  });

  it("MIN-RULE-04: a rule explicitly stamped STATEMENT_TERMS_CONFIRMED is accepted and produces an estimate the same way", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ ruleSource: "STATEMENT_TERMS_CONFIRMED" }));
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumPaymentRule.ruleSource).toBe("STATEMENT_TERMS_CONFIRMED");
    expect(debt.estimatedNextMinimumPayment).not.toBeNull();
  });

  it("MIN-RULE-05: rule provenance persists on the saved Debt", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule());
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumPaymentRule.ruleSource).toBe("USER_CONFIRMED_RULE");
    expect(debt.minimumPaymentRule.ruleType).toBe("percentage_of_balance");
  });

  it("MIN-RULE-06: rule effective date persists", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ effectiveDate: "2026-07-01T00:00:00.000Z" }));
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumPaymentRule.effectiveDate).toBe("2026-07-01T00:00:00.000Z");
  });

  it("MIN-RULE-07: an unsupported/invalid rule is rejected outright - no partial or silently-ignored save", async () => {
    const { repository, service } = makeService();
    await expect(service.setMinimumPaymentRule("household-seed", "household-priceline", { ruleType: "percentage_of_balance" })).rejects.toThrow(/percentageComponent is required/i);
    await expect(service.setMinimumPaymentRule("household-seed", "household-priceline", { ruleType: "not_a_real_type" })).rejects.toThrow();
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumPaymentRule == null).toBe(true); // nothing was saved (seed debts start with the field simply absent, not explicitly null)
  });

  it("MIN-RULE-08: Viewer cannot configure a minimum-payment rule", async () => {
    const { repository } = makeService();
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    await expect(viewerService.setMinimumPaymentRule("household-seed", "household-priceline", percentRule())).rejects.toThrow(/cannot configure a minimum-payment rule/i);
    expect(findDebt(repository, "household-seed", "household-priceline").minimumPaymentRule == null).toBe(true);
  });

  it("MIN-RULE-09: Contributor cannot configure a minimum-payment rule either - recordObservations does not imply manageDebts", async () => {
    const { repository } = makeService();
    const contributorService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-contributor", asOf: V2_TEST_NOW });
    await expect(contributorService.setMinimumPaymentRule("household-seed", "household-priceline", percentRule())).rejects.toThrow(/cannot configure a minimum-payment rule/i);
  });

  it("MIN-RULE-10: configuring a rule never rewrites the historical current-cycle minimumRequiredPayment", async () => {
    const { repository, service } = makeService();
    const beforeMinimum = findDebt(repository, "household-seed", "household-priceline").minimumRequiredPayment;
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.5 })); // deliberately would produce a very different number
    const after = findDebt(repository, "household-seed", "household-priceline");
    expect(after.minimumRequiredPayment).toBe(beforeMinimum); // the statement/user-confirmed current-cycle AMOUNT is what must never move
  });

  it("clearing a rule (the 'Other / I don't know' UI option) reverts the estimate to Unknown", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule());
    expect(findDebt(repository, "household-seed", "household-priceline").estimatedNextMinimumPayment).not.toBeNull();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", null);
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumPaymentRule).toBeNull();
    expect(debt.estimatedNextMinimumPayment).toBeNull();
    expect(debt.estimatedNextMinimumSource).toBe("unknown");
  });
});

describe("dynamic recalculation with an active rule", () => {
  it("MIN-CALC-01/02: balance decreases -> estimate falls; balance increases -> estimate rises (via real recordPayment/recordBalanceSnapshot)", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 })); // 2% of 4100 = 82
    let debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(82);

    await service.recordPayment("household-seed", "household-priceline", { amount: 1100, paidAt: "2026-08-14T00:00:00.000Z" }); // working balance 4100 -> 3000
    debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(60); // 2% of 3000

    await service.recordBalanceSnapshot("household-seed", "household-priceline", { balance: 5000, observedAt: "2026-08-16T00:00:00.000Z" }); // a confirmed HIGHER balance
    debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(100); // 2% of 5000 - rose, no one-direction-only bug
  });

  it("MIN-CALC-03: recording a payment alone (no confirmed-balance change otherwise) triggers a fresh recalculation reflecting the new working balance", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    expect(findDebt(repository, "household-seed", "household-priceline").estimatedNextMinimumPayment).toBe(82); // 2% of 4100
    await service.recordPayment("household-seed", "household-priceline", { amount: 50, paidAt: "2026-08-14T00:00:00.000Z" });
    const after = findDebt(repository, "household-seed", "household-priceline");
    expect(after.estimatedNextMinimumPayment).toBe(81); // 2% of (4100-50=4050) = 81 - proves the payment alone triggered a real recalculation
  });

  it("MIN-CALC-04: a new confirmed BalanceSnapshot triggers recalculation even with no PaymentEvent involved", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    await service.recordBalanceSnapshot("household-seed", "household-priceline", { balance: 2000, observedAt: "2026-08-15T00:00:00.000Z" });
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(40); // 2% of 2000
  });

  it("MIN-CALC-05: a new statement-confirmed current-cycle minimum does not overwrite or get overwritten by the independent estimate", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    const estimateAfterRule = findDebt(repository, "household-seed", "household-priceline").estimatedNextMinimumPayment;
    // A new real statement arrives confirming this cycle's actual minimum - an independent fact.
    await service.updateDebt("household-seed", "household-priceline", { minimumRequiredPayment: 147.22 });
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumRequiredPayment).toBe(147.22);
    expect(debt.requiredPaymentSource).toBe("user_confirmed");
    expect(debt.estimatedNextMinimumPayment).toBe(estimateAfterRule); // untouched - not a recalculation trigger
  });

  it("MIN-CALC-06: multiple payments evolve the working balance and the estimate correctly, each landing exactly once", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    await service.recordPayment("household-seed", "household-priceline", { amount: 40, paidAt: "2026-08-14T00:00:00.000Z" });
    await service.recordPayment("household-seed", "household-priceline", { amount: 60, paidAt: "2026-08-15T00:00:00.000Z" });
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(80); // 2% of (4100-40-60=4000) = 80
  });

  it("MIN-CALC-07: a new confirmed snapshot after payments does not double-subtract them from the estimate's working-balance basis", async () => {
    const { repository, service } = makeService();
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    await service.recordPayment("household-seed", "household-priceline", { amount: 100, paidAt: "2026-08-14T00:00:00.000Z" }); // working balance 4000
    await service.recordBalanceSnapshot("household-seed", "household-priceline", { balance: 4000, observedAt: "2026-08-16T00:00:00.000Z" }); // lender confirms exactly that
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.estimatedNextMinimumPayment).toBe(80); // 2% of 4000, not 2% of (4000-100)
  });

  it("MIN-CALC-10: the current-cycle minimum never moves no matter how many times the estimate recalculates", async () => {
    const { repository, service } = makeService();
    const originalMinimum = findDebt(repository, "household-seed", "household-priceline").minimumRequiredPayment;
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    await service.recordPayment("household-seed", "household-priceline", { amount: 100, paidAt: "2026-08-14T00:00:00.000Z" });
    await service.recordBalanceSnapshot("household-seed", "household-priceline", { balance: 9000, observedAt: "2026-08-16T00:00:00.000Z" });
    const debt = findDebt(repository, "household-seed", "household-priceline");
    expect(debt.minimumRequiredPayment).toBe(originalMinimum);
  });
});

describe("Plan integration - GATE-10B.1A Section 21/26", () => {
  // household-seed's real active Plan projection uses PlanVersion.
  // startingDebtSnapshot, frozen at the last activation/reforecast - the
  // dynamic estimate/rule fields are deliberately NEVER read by
  // buildProjectionWithWarnings, so configuring/changing a rule cannot
  // silently shrink or reallocate the user's intended payoff contribution
  // (the exact "payoff power" risk Section 21 warns about) because nothing
  // wires it in to threaten in the first place. This is proven directly
  // against the real projection function, not asserted by absence alone.
  it("MIN-PLAN-01/02: an active Debt's estimatedNextMinimumPayment/minimumPaymentRule have zero effect on the projection - PlanVersion, projected $0 date, and payoff order/target are all unaffected by configuring a rule", async () => {
    const { service } = makeService();
    const before = await service.getWorkspaceSnapshot("household-seed");
    const baselineProjection = JSON.stringify(before.activeContext.version);
    const baselineOrder = before.payoffQueue.map((debt) => debt.id);
    const baselineZeroDate = before.projectedZeroDate;
    const baselineTargetId = before.targetDebt?.id;

    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule({ percentageComponent: 0.02 }));
    await service.recordPayment("household-seed", "household-priceline", { amount: 500, paidAt: "2026-08-14T00:00:00.000Z" }); // moves working balance/estimate

    const after = await service.getWorkspaceSnapshot("household-seed");
    // The active PlanVersion (frozen at last activation) is byte-identical - a live payment/rule never mutates persisted plan history.
    expect(JSON.stringify(after.activeContext.version)).toBe(baselineProjection);
    // The projected payoff date and payoff ORDER/target this plan is aiming at are unaffected by the new rule/estimate - payoffQueue entries
    // naturally carry the new schema fields once a debt is saved (an unrelated, benign side effect of the schema addition, proven inert for
    // actual payoff math by the direct buildProjectionWithWarnings test below), so only order/target/date are compared here, not full object equality.
    expect(after.projectedZeroDate).toBe(baselineZeroDate);
    expect(after.payoffQueue.map((debt) => debt.id)).toEqual(baselineOrder);
    expect(after.targetDebt?.id).toBe(baselineTargetId);
  });

  it("MIN-PLAN-01 (direct): buildProjectionWithWarnings produces identical output for two debt sets differing ONLY in estimatedNextMinimumPayment/minimumPaymentRule", () => {
    const baseDebt = {
      id: "d1", workspaceId: "ws", name: "Card", status: "active", debtType: "credit_card",
      currentBalance: 4100, aprStatus: "known", apr: 0.28, minimumRequiredPayment: 130,
      includedInCorePayoffPlan: true, balanceStatus: "confirmed",
    };
    const planVersion = {
      id: "v1", planId: "p1", workspaceId: "ws", versionNumber: 1, strategy: "avalanche",
      asOf: V2_TEST_NOW, startingDebtSnapshot: [], extraMonthlyPayment: 100, createdBecause: "activation",
    };
    const withoutEstimate = buildProjectionWithWarnings({ debts: [baseDebt], planVersion, startMonth: 8, startYear: 2026 });
    const withEstimate = buildProjectionWithWarnings({
      debts: [{ ...baseDebt, estimatedNextMinimumPayment: 999, estimatedNextMinimumSource: "issuer_rule_estimate", minimumPaymentRule: { ruleType: "fixed_amount", fixedFloor: 999 } }],
      planVersion,
      startMonth: 8,
      startYear: 2026,
    });
    expect(withEstimate.projection).toEqual(withoutEstimate.projection);
    expect(withEstimate.warnings).toEqual(withoutEstimate.warnings);
  });

  it("MIN-PLAN-04: the active PlanVersion remains immutable after configuring a rule and recording payments", async () => {
    const { repository, service } = makeService();
    const priorVersion = repository.getPlanVersion("household-seed", "household-plan", "household-version-1");
    await service.setMinimumPaymentRule("household-seed", "household-priceline", percentRule());
    await service.recordPayment("household-seed", "household-priceline", { amount: 200, paidAt: "2026-08-14T00:00:00.000Z" });
    expect(repository.getPlanVersion("household-seed", "household-plan", "household-version-1")).toEqual(priorVersion);
  });
});
