import { getEffectiveApr } from "../../utils/budgetUtils.js";
import { computeFromRule } from "../../domain/tracktozero/minimumPaymentRules.js";

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
  // GATE-10B.1D: purely additive pass-through, undefined for every existing
  // (non-TrackToZero-V2, or TrackToZero-V2-without-a-confirmed-rule) caller.
  // Only read when payoffSimulateDetailed's useMinimumPaymentRules option is
  // explicitly turned on - see the dynamic-minimum recompute below.
  minimumPaymentRule: account.minimumPaymentRule ?? null,
  aprStatus: account.aprStatus ?? "unknown",
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

// GATE-10B.1D: the ONE simulation loop, shared by payoffSimulate (unchanged
// output, unchanged callers) and payoffSimulateDetailed (adds per-debt
// trajectories/one-time-payments/dynamic minimums via `options`, all
// opt-in). `trackPerDebt: false` (payoffSimulate's path) skips every
// per-debt bookkeeping branch below, so it costs nothing extra over the
// pre-refactor implementation.
//
// One-time-payment ordering is deliberate: `enteringActive`/the break check
// use each month's balances as of BEFORE that month's one-time payment is
// applied - mirroring how a debt already gets fully processed (row pushed,
// per-debt payoff recorded) the exact month an EXTRA-payment payoff zeroes
// it, with the loop only breaking on the NEXT iteration. Without this
// ordering, a lump sum that pays off the last remaining debt would break out
// before ever recording that debt's actual payoff row.
const runSimulationCore = (
  accounts,
  strategy,
  monthlyExtra,
  perAccountExtra,
  startMonth,
  startYear,
  maxMonths,
  customTargetOrder,
  { oneTimePayments = [], useMinimumPaymentRules = false, trackPerDebt = false } = {},
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

  const appliedOneTimePayments = [];
  const skippedOneTimePayments = [];
  const pendingByMonth = new Map();
  for (const payment of oneTimePayments) {
    const debtId = payment?.debtId;
    const amount = Math.max(0, Number(payment?.amount) || 0);
    const month = Number.isFinite(Number(payment?.month)) ? Number(payment.month) : 0;
    if (!debtId || amount <= 0) continue;
    if (!state.some((a) => a.id === debtId)) {
      skippedOneTimePayments.push({ debtId, amount, month, reason: "debt_not_found" });
      continue;
    }
    if (month < 0 || month >= maxMonths) {
      skippedOneTimePayments.push({ debtId, amount, month, reason: "month_out_of_range" });
      continue;
    }
    if (!pendingByMonth.has(month)) pendingByMonth.set(month, []);
    pendingByMonth.get(month).push({ debtId, amount });
  }

  if (!state.length) {
    return { rows: [], perDebtRows: {}, appliedOneTimePayments, skippedOneTimePayments };
  }

  const rows = [];
  const perDebtRows = trackPerDebt
    ? Object.fromEntries(state.map((a) => [a.id, {
        id: a.id, name: a.name, startingBalance: a.bal, rows: [], payoffMonth: null, payoffMonthIndex: null,
      }]))
    : {};
  const startDate = new Date(safeStartYear, safeStartMonth - 1, 1);

  for (let m = 0; m < maxMonths; m++) {
    const enteringActive = state.filter((a) => a.bal > 0.01);
    if (!enteringActive.length) break;

    const duePayments = pendingByMonth.get(m) || [];
    for (const { debtId, amount } of duePayments) {
      const account = state.find((a) => a.id === debtId);
      if (!account || account.bal <= 0.01) {
        skippedOneTimePayments.push({ debtId, amount, month: m, reason: "already_paid_off" });
        continue;
      }
      const applied = Math.min(account.bal, amount);
      account.bal -= applied;
      appliedOneTimePayments.push({ debtId, amount: applied, month: m });
    }

    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
    const active = state.filter((a) => a.bal > 0.01);
    let totalInterest = 0;
    const interestByAccount = new Map();

    active.forEach((a) => {
      const rawApr = getEffectiveApr(a, monthDate.getMonth() + 1, monthDate.getFullYear());
      const monthApr = Number.isFinite(rawApr) ? rawApr : 0;
      a.apr = monthApr;
      const interest = a.bal * (monthApr / 12);
      totalInterest += interest;
      a.bal += interest;
      interestByAccount.set(a.id, interest);

      // GATE-10B.1D: re-derive this account's minimum from its CURRENT
      // simulated balance/APR each month, only when the caller opted in and
      // a human-confirmed rule exists - computeFromRule (see
      // minimumPaymentRules.js) is the exact same, already-tested function
      // the live UI uses; no formula is invented here. Falls back to the
      // existing static min_due whenever the rule can't be evaluated this
      // month (e.g. an interest-inclusive rule while APR is still unknown) -
      // never NaN, never null mid-simulation.
      if (useMinimumPaymentRules && a.minimumPaymentRule) {
        const recomputed = computeFromRule(a.minimumPaymentRule, {
          workingBalanceAmount: a.bal,
          apr: a.apr,
          aprStatus: a.aprStatus,
        });
        if (recomputed != null) {
          a.min_due = recomputed;
          // scheduled_payment is frozen at the ORIGINAL static min_due_v
          // (TrackToZero always passes planned_v/paid_v as 0, so
          // getScheduledPayment resolves to that static value) - the
          // payment-amount formula below takes max(scheduled_payment,
          // min_due), so leaving scheduled_payment untouched would make a
          // recomputed minimum BELOW the static one a no-op, which is the
          // common real case (percentage-of-balance minimums shrink as the
          // balance shrinks). Keeping it in sync with the freshly recomputed
          // number is what makes an opted-in dynamic minimum actually
          // change simulated payment behavior, not just an internal metric.
          a.scheduled_payment = recomputed;
        }
      }
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

    const monthLabel = monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    rows.push({
      month: monthLabel,
      remaining_debt: state.reduce((s, a) => s + Math.max(0, a.bal), 0),
      total_interest: totalInterest,
    });

    if (trackPerDebt) {
      state.forEach((a) => {
        const entry = perDebtRows[a.id];
        if (!entry || entry.payoffMonthIndex != null) return;
        const balance = Math.max(0, a.bal);
        entry.rows.push({ month: monthLabel, balance, interest: interestByAccount.get(a.id) || 0, minimumDue: a.min_due });
        if (balance <= 0.01) {
          entry.payoffMonth = monthLabel;
          entry.payoffMonthIndex = m;
        }
      });
    }

    pendingByMonth.delete(m);
  }

  // GATE-10B.1D: the loop above can end (via the `enteringActive` break)
  // before reaching every scheduled month, if every debt is already paid
  // off - "never silently dropped" means a payment scheduled for one of
  // those never-reached months must still be accounted for. The only way
  // the loop ends early is every debt being gone, so every such payment's
  // target is necessarily already paid off.
  for (const [month, duePayments] of pendingByMonth) {
    for (const { debtId, amount } of duePayments) {
      skippedOneTimePayments.push({ debtId, amount, month, reason: "already_paid_off" });
    }
  }

  return { rows, perDebtRows, appliedOneTimePayments, skippedOneTimePayments };
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
) => runSimulationCore(
  accounts, strategy, monthlyExtra, perAccountExtra, startMonth, startYear, maxMonths, customTargetOrder,
).rows;

/**
 * GATE-10B.1D: same simulation as payoffSimulate, plus per-debt
 * balance/interest/payoff-date trajectories, first-class one-time-payment
 * support, and (opt-in) dynamic per-month minimum-payment re-derivation from
 * each debt's confirmed minimumPaymentRule. `rows` is guaranteed identical
 * to payoffSimulate()'s return for the same core (non-options) arguments -
 * locked by a dedicated cross-mode consistency test.
 */
export const payoffSimulateDetailed = (
  accounts,
  strategy,
  monthlyExtra,
  perAccountExtra,
  startMonth,
  startYear,
  maxMonths = MAX_SIMULATION_MONTHS,
  customTargetOrder = [],
  { oneTimePayments = [], useMinimumPaymentRules = false } = {},
) => {
  const { rows, perDebtRows, appliedOneTimePayments, skippedOneTimePayments } = runSimulationCore(
    accounts, strategy, monthlyExtra, perAccountExtra, startMonth, startYear, maxMonths, customTargetOrder,
    { oneTimePayments, useMinimumPaymentRules, trackPerDebt: true },
  );
  return { rows, perDebt: perDebtRows, appliedOneTimePayments, skippedOneTimePayments };
};
