import { getEffectiveApr } from "../../utils/budgetUtils.js";

export const MAX_SIMULATION_MONTHS = 240;

/**
 * Calculation boundary note:
 * Legacy UI/account records may carry APR as either 20 or 0.20. This adapter
 * normalizes through getEffectiveApr before the engine state is created. Inside
 * the simulation state, APR is always decimal-form (0.20 for 20%).
 */
export const getScheduledPayment = (account) => {
  const planned = Math.max(0, Number(account?.planned_v || 0));
  const paid = Math.max(0, Number(account?.paid_v || 0));
  const minimum = Math.max(0, Number(account?.min_due_v || 0));
  return planned > 0 ? planned : paid > 0 ? paid : minimum;
};

export const normalizeLegacyAccountForPayoff = (account, month, year) => ({
  id: account.id,
  name: account.name,
  apr: getEffectiveApr(account, month, year),
  promo_apr: account.promo_apr ?? 0,
  promo_until: account.promo_until ?? "",
  apr_after_promo: account.apr_after_promo ?? account.apr ?? 0,
  scheduled_payment: getScheduledPayment(account),
  min_due: Math.max(0, Number(account.min_due_v || 0)),
  bal: Math.max(0, Number(account.cur_bal || 0)),
});

// UX-4: "custom" is a preview-only pseudo-strategy (never a persisted
// PlanVersion.strategy - PLAN_STRATEGIES stays exactly ["snowball",
// "avalanche"]) that lets a What-If preview force a specific debt to the
// front of the extra-payment queue without pretending it's really Snowball
// or Avalanche. customOrder ranks by array position; any account not in it
// falls back to snowball (smallest-balance) ordering among itself.
export const orderPayoffTargets = (accounts, strategy, customOrder = []) => {
  if (strategy === "custom" && customOrder.length) {
    const rank = new Map(customOrder.map((debtId, index) => [debtId, index]));
    return [...accounts].sort((a, b) => {
      const rankA = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rankB = rank.has(b.id) ? rank.get(b.id) : Infinity;
      return rankA !== rankB ? rankA - rankB : a.bal - b.bal;
    });
  }
  return [...accounts].sort((a, b) => strategy === "snowball" ? a.bal - b.bal : b.apr - a.apr);
};

/**
 * Simulate debt payoff month-by-month.
 *
 * Pure function: plain inputs, plain rows out, no persistence, no React state,
 * and no mutation of the account inputs.
 */
export const payoffSimulate = (
  accounts,
  strategy,
  monthlyExtra,
  perAccountExtra,
  startMonth,
  startYear,
  maxMonths = MAX_SIMULATION_MONTHS,
  customTargetOrder = [],
) => {
  const today = new Date();
  const safeStartMonth = Number.isFinite(Number(startMonth))
    ? Number(startMonth)
    : today.getMonth() + 1;
  const safeStartYear = Number.isFinite(Number(startYear))
    ? Number(startYear)
    : today.getFullYear();
  const state = accounts
    .map((a) => normalizeLegacyAccountForPayoff(a, safeStartMonth, safeStartYear))
    .filter((a) => a.bal > 0);
  if (!state.length) return [];

  const rows = [];
  const startDate = new Date(safeStartYear, safeStartMonth - 1, 1);

  for (let m = 0; m < maxMonths; m++) {
    const active = state.filter((a) => a.bal > 0.01);
    if (!active.length) break;

    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
    let totalInterest = 0;

    active.forEach((a) => {
      const rawApr = getEffectiveApr(a, monthDate.getMonth() + 1, monthDate.getFullYear());
      const monthApr = Number.isFinite(rawApr) ? rawApr : 0;
      a.apr = monthApr;
      const interest = a.bal * (monthApr / 12);
      totalInterest += interest;
      a.bal += interest;
    });

    const rolledOver = state
      .filter((a) => a.bal <= 0.01)
      .reduce((s, a) => {
        const planExtra = Math.max(0, Number(perAccountExtra[a.id] || 0));
        return s + Math.max(a.scheduled_payment, a.min_due + planExtra);
      }, 0);

    let overpaidThisMonth = 0;
    active.forEach((a) => {
      const planExtra = Math.max(0, Number(perAccountExtra[a.id] || 0));
      const base = Math.max(0, Math.max(a.scheduled_payment, a.min_due + planExtra));
      const pay = Math.min(a.bal, base);
      a.bal -= pay;
      if (a.bal <= 0.01) overpaidThisMonth += base - pay;
    });

    let extraPool = Math.max(0, Number(monthlyExtra || 0)) + rolledOver + overpaidThisMonth;
    const targetOrder = orderPayoffTargets(
      active.filter((a) => a.bal > 0.01),
      strategy,
      customTargetOrder,
    );
    for (const t of targetOrder) {
      if (extraPool <= 0) break;
      const extraPay = Math.min(t.bal, extraPool);
      t.bal -= extraPay;
      extraPool -= extraPay;
    }

    rows.push({
      month: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      remaining_debt: state.reduce((s, a) => s + Math.max(0, a.bal), 0),
      total_interest: totalInterest,
    });
  }

  return rows;
};
