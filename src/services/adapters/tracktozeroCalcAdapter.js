import { payoffSimulate } from "../calc/payoffEngine.js";

export const debtToEngineAccount = (debt) => ({
  id: debt.id,
  name: debt.name,
  cur_bal: debt.currentBalance,
  min_due_v: debt.minimumRequiredPayment,
  planned_v: 0,
  paid_v: 0,
  apr_v: debt.aprStatus === "unknown" ? 0 : debt.apr,
  promo_apr: debt.aprStatus === "promotional" ? debt.apr : null,
  promo_until: "",
  apr_after_promo: debt.aprStatus === "promotional" ? debt.apr : debt.apr,
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
