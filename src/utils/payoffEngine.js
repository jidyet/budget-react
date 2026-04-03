import { getEffectiveApr } from "./budgetUtils";

export const MAX_SIMULATION_MONTHS = 240;

const getScheduledPayment = (account) => {
  const paid = Math.max(0, Number(account?.paid_v || 0));
  const minimum = Math.max(0, Number(account?.min_due_v || 0));
  return paid > 0 ? paid : minimum;
};

/**
 * Simulate debt payoff month-by-month.
 *
 * @param {object[]} accounts    - allAccts-shaped objects with cur_bal, min_due_v, paid_v, promo fields
 * @param {string}   strategy    - "avalanche" | "snowball"
 * @param {number}   monthlyExtra - extra lump sum applied each month after minimums
 * @param {object}   perAccountExtra - map of account id → extra payment amount
 * @param {number}   startMonth  - 1-based month to begin simulation from
 * @param {number}   startYear   - full year
 * @param {number}   maxMonths   - simulation cap (default MAX_SIMULATION_MONTHS)
 * @returns {{ month: string, remaining_debt: number, total_interest: number }[]}
 */
export const payoffSimulate = (
  accounts,
  strategy,
  monthlyExtra,
  perAccountExtra,
  startMonth,
  startYear,
  maxMonths = MAX_SIMULATION_MONTHS,
) => {
  const today = new Date();
  const safeStartMonth = Number.isFinite(Number(startMonth))
    ? Number(startMonth)
    : today.getMonth() + 1;
  const safeStartYear = Number.isFinite(Number(startYear))
    ? Number(startYear)
    : today.getFullYear();
  const state = accounts
    .map((a) => ({
      id: a.id,
      name: a.name,
      apr: getEffectiveApr(a, safeStartMonth, safeStartYear),
      promo_apr: a.promo_apr ?? 0,
      promo_until: a.promo_until ?? "",
      apr_after_promo: a.apr_after_promo ?? a.apr ?? 0,
      scheduled_payment: getScheduledPayment(a),
      bal: Math.max(0, Number(a.cur_bal || 0)),
    }))
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

    active.forEach((a) => {
      const base = Math.max(0, a.scheduled_payment + Number(perAccountExtra[a.id] || 0));
      const pay = Math.min(a.bal, base);
      a.bal -= pay;
    });

    let extraPool = Math.max(0, Number(monthlyExtra || 0));
    const targetOrder = [...active]
      .filter((a) => a.bal > 0.01)
      .sort((a, b) => strategy === "snowball" ? a.bal - b.bal : b.apr - a.apr);
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
