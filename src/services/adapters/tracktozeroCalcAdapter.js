import { payoffSimulate } from "../calc/payoffEngine.js";

export const debtToEngineAccount = (debt) => ({
  id: debt.id,
  name: debt.name,
  cur_bal: debt.currentBalance,
  // UX-9: unknown minimum payment (null) must still run through the engine
  // as a real number - mirrors apr_v's own unknown-defaults-to-0 fallback
  // directly below. The Debt's own stored truth stays null/unknown; this
  // is purely the engine-input mapping, same as apr_v already was.
  min_due_v: debt.minimumRequiredPayment == null ? 0 : debt.minimumRequiredPayment,
  planned_v: 0,
  paid_v: 0,
  apr_v: debt.aprStatus === "unknown" ? 0 : debt.apr,
  promo_apr: debt.aprStatus === "promotional" ? debt.apr : null,
  promo_until: "",
  apr_after_promo: debt.aprStatus === "promotional" ? debt.apr : debt.apr,
  // GATE-10B.1D: purely additive pass-through for payoffSimulateDetailed's
  // opt-in useMinimumPaymentRules - every existing caller of this function
  // (simulatePlanVersion/buildExpectedCheckpoints, both non-detailed) is
  // unaffected since payoffSimulate never reads these two keys.
  minimumPaymentRule: debt.minimumPaymentRule || null,
  aprStatus: debt.aprStatus || "unknown",
});

export const planVersionToEngineInput = ({ debts = [], planVersion }) => {
  const includedDebtIds = new Set(
    (planVersion?.startingDebtSnapshot || [])
      .filter((item) => item.includedInCorePayoffPlan)
      .map((item) => item.debtId)
  );
  return {
    accounts: debts.filter((debt) => includedDebtIds.has(debt.id)).map(debtToEngineAccount),
    strategy: planVersion.strategy,
    monthlyExtra: planVersion.extraMonthlyPayment,
    perAccountExtra: {},
  };
};

export const simulatePlanVersion = ({ debts = [], planVersion, startMonth, startYear, maxMonths }) => {
  const input = planVersionToEngineInput({ debts, planVersion });
  return payoffSimulate(input.accounts, input.strategy, input.monthlyExtra, input.perAccountExtra, startMonth, startYear, maxMonths);
};

export const buildExpectedCheckpoints = ({ debts = [], planVersion, startMonth, startYear, maxMonths = 240 }) => {
  const rows = simulatePlanVersion({ debts, planVersion, startMonth, startYear, maxMonths });
  return rows.map((row, index) => ({
    id: `${planVersion.id}-${String(index + 1).padStart(3, "0")}`,
    workspaceId: planVersion.workspaceId,
    planId: planVersion.planId,
    planVersionId: planVersion.id,
    period: row.month,
    expectedTotalBalance: row.remaining_debt,
    expectedDebtBalances: {},
    expectedTargetDebtId: "",
    expectedPayment: planVersion.extraMonthlyPayment,
    projectedZeroDate: rows.at(-1)?.month || "",
  }));
};
