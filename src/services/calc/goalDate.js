export const formatGoalMonth = (value) => {
  if (!value) return "";
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
};

export const calculateGoalDatePlan = ({
  goalDate,
  goalDebtId = "",
  scenarioAccounts = [],
  included = [],
  extraMap = {},
  planMonthlyExtra = 0,
  planMonthlyDebtPayment = 0,
  planStrategy = "avalanche",
  selMonth,
  selYear,
  payoffSimulate,
}) => {
  if (!goalDate) return null;
  const [goalYearRaw, goalMonthRaw] = goalDate.split("-");
  const goalYearNum = Number(goalYearRaw);
  const goalMonthNum = Number(goalMonthRaw);
  if (!Number.isFinite(goalYearNum) || !Number.isFinite(goalMonthNum)) return { valid: false, reason: "invalid" };
  const targetRowCount = ((goalYearNum - selYear) * 12) + (goalMonthNum - selMonth) + 1;
  if (targetRowCount <= 0) return { valid: false, reason: "past" };
  const targetLabel = formatGoalMonth(goalDate);

  const goalAccounts = goalDebtId
    ? scenarioAccounts.filter((a) => String(a.id) === goalDebtId)
    : included;
  if (!goalAccounts.length) return { valid: false, reason: "no_accounts" };

  const goalExtraMap = goalDebtId ? { [goalDebtId]: Number(extraMap[goalDebtId] || 0) } : { ...extraMap };
  const goalBaseMonthlyExtra = goalDebtId ? 0 : Number(planMonthlyExtra || 0);

  const goalBaselineRows = payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra, goalExtraMap, selMonth, selYear);
  const baselineFinishesOnTime = goalBaselineRows.length > 0 && goalBaselineRows.length <= targetRowCount;
  const baselineProjectionRow = goalBaselineRows[targetRowCount - 1] || goalBaselineRows[goalBaselineRows.length - 1] || null;
  const baselineRemainingAtGoal = baselineFinishesOnTime ? 0 : Math.max(0, Number(baselineProjectionRow?.remaining_debt || 0));
  const configuredFinishMonth = goalBaselineRows[goalBaselineRows.length - 1]?.month || "n/a";

  const simulateWithExtra = (additionalExtra) =>
    payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra + additionalExtra, goalExtraMap, selMonth, selYear);

  let additionalNeeded = 0;
  if (!baselineFinishesOnTime) {
    let lo = 0, hi = 250, result = null;
    const finishesByTarget = (rows) => rows.length > 0 && rows.length <= targetRowCount;
    while (hi < 100000 && !finishesByTarget(simulateWithExtra(hi))) hi *= 2;
    if (finishesByTarget(simulateWithExtra(hi))) {
      for (let iter = 0; iter < 30; iter++) {
        const mid = (lo + hi) / 2;
        if (finishesByTarget(simulateWithExtra(mid))) { result = mid; hi = mid; }
        else lo = mid;
      }
    }
    additionalNeeded = result === null ? null : Math.ceil(result);
  }

  const proposedRows = additionalNeeded === null ? [] : simulateWithExtra(additionalNeeded);
  const proposedFinishMonth = proposedRows[proposedRows.length - 1]?.month || configuredFinishMonth;

  const goalCurrentPayment = goalDebtId
    ? (() => {
        const a = goalAccounts[0];
        if (!a) return 0;
        const planned = Math.max(0, Number(a.planned_v || 0));
        const paid = Math.max(0, Number(a.paid_v || 0));
        const min = Math.max(0, Number(a.min_due_v || 0));
        return (planned > 0 ? planned : paid > 0 ? paid : min) + Number(extraMap[String(a.id)] || 0);
      })()
    : planMonthlyDebtPayment;

  return {
    valid: true,
    targetLabel,
    targetRowCount,
    goalDebtId,
    baselineFinishesOnTime,
    baselineRemainingAtGoal,
    configuredFinishMonth,
    additionalNeeded,
    proposedFinishMonth,
    proposedTotalMonthlyPayment: additionalNeeded === null ? null : goalCurrentPayment + (additionalNeeded || 0),
  };
};

