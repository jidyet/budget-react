export const NO_DERIVED_PLAN_PAYMENT = null;

export const getCurrentPlanFromContext = ({ plans = [], planId = "" } = {}) => {
  if (!planId) return null;
  return plans.find((plan) => String(plan?.id) === String(planId)) || null;
};

/**
 * Reproduces the removed pre-Phase-1 syncPlannedPayments formula without
 * writing to records:
 *
 * included item + matching account -> Math.max(0, Number(min_due_v || 0)) +
 * Math.max(0, Number(extra_payment || 0))
 *
 * Returns NO_DERIVED_PLAN_PAYMENT when the plan/account pair is not covered so
 * callers can fall back to persisted/manual planned_v.
 */
export const derivePlanPaymentForAccount = ({ plan = null, account = null } = {}) => {
  if (!plan || !account || !Array.isArray(plan.items)) return NO_DERIVED_PLAN_PAYMENT;
  const item = plan.items.find((candidate) =>
    candidate?.include && String(candidate.account_id) === String(account.id)
  );
  if (!item) return NO_DERIVED_PLAN_PAYMENT;
  const minDue = Math.max(0, Number(account.min_due_v || 0));
  const extra = Math.max(0, Number(item.extra_payment || 0));
  return minDue + extra;
};

export const getDisplayPlannedPayment = ({ plans = [], planId = "", account = null } = {}) => {
  const plan = getCurrentPlanFromContext({ plans, planId });
  const derived = derivePlanPaymentForAccount({ plan, account });
  if (derived !== NO_DERIVED_PLAN_PAYMENT) return derived;
  return Math.max(0, Number(account?.planned_v || 0));
};

