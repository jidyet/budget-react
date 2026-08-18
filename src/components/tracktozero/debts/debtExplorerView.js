// UX-8.4: pure view-model functions behind the Debt Explorer (the
// category → lender → account hierarchy). Extracted out of
// CategoryDetailPage.jsx's inline useMemo pipeline so it can be unit-tested
// directly, matching this codebase's own established pattern
// (debtPortfolioView.js / homeViewModels.js / activityFeed.js /
// projectionStatusService.js are all pure derivation modules consumed by a
// thin component). Nothing here touches payoff math, reconciliation, or
// Firestore - it only re-groups/re-filters/re-sorts debts already fetched
// for display. Grouping is presentation only: it never merges Debt
// documents, balances, payments, or plan positions - every debt keeps its
// own id, balance, and history regardless of which lender/owner bucket it's
// displayed under.

import { debtCategoryGroupFor } from "../../../domain/tracktozero/financialItemTaxonomy.js";
import { filterDebtsByOwnerScope } from "../debtPortfolioView.js";
import { effectiveOwnerType, presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";
import { comparePaymentTiming, derivePaymentTiming } from "../../../domain/tracktozero/paymentTiming.js";

export const resolveDebtBalance = (debt, latestSnapshotsByDebt) =>
  Number(latestSnapshotsByDebt?.[debt.id]?.balance ?? debt.currentBalance ?? 0) || 0;

// The "category total" baseline the Debt Explorer header shows - owner
// scope (the existing, page-level ScopeSelector selection) and category
// match only. Deliberately excludes the Debt Explorer's OWN filters
// (status/plan/quality/lender/balance) so toggling those never silently
// changes the headline total - only switching the owner-scope tab does,
// exactly like the rest of the app already treats that control.
export const scopeToCategory = (allActive, { ownerFilter = "all", categoryEntry = null } = {}) => {
  let list = filterDebtsByOwnerScope(allActive, ownerFilter);
  if (categoryEntry) list = list.filter((debt) => debtCategoryGroupFor(debt.debtType) === categoryEntry.group);
  return list;
};

// UX-6.1's original 3 filters, unchanged, plus 2 new ones (lender, balance
// range). Every filter is independent/composable, applied in a fixed,
// deterministic order - never a fabricated combination matrix.
export const applyDebtExplorerFilters = (debts, {
  statusFilter = "all",
  planFilter = "all",
  qualityFilter = "all",
  lenderFilter = "all",
  balanceFilter = "all",
  dueTimingFilter = "all",
  reviewIds = new Set(),
  paidOffIds = new Set(),
  targetDebtId = null,
  latestSnapshotsByDebt = {},
  paymentEventsByDebt = {},
  now = new Date(),
} = {}) => {
  let list = debts;
  if (statusFilter === "needs_attention") list = list.filter((debt) => reviewIds.has(debt.id));
  if (statusFilter === "paid_off") list = list.filter((debt) => paidOffIds.has(debt.id));
  if (planFilter === "included") list = list.filter((debt) => debt.includedInCorePayoffPlan !== false);
  if (planFilter === "not_included") list = list.filter((debt) => debt.includedInCorePayoffPlan === false);
  if (planFilter === "current_target") list = list.filter((debt) => debt.id === targetDebtId);
  if (qualityFilter === "missing_apr") list = list.filter((debt) => debt.aprStatus === "unknown");
  if (qualityFilter === "missing_minimum") list = list.filter((debt) => debt.minimumRequiredPayment == null || Number(debt.minimumRequiredPayment) <= 0);
  if (qualityFilter === "needs_review") list = list.filter((debt) => reviewIds.has(debt.id));
  if (lenderFilter !== "all") list = list.filter((debt) => getLenderIdentity(debt.name).lenderId === lenderFilter);
  if (balanceFilter !== "all") {
    list = list.filter((debt) => {
      // A balance that can't be resolved at all is never silently treated
      // as $0 - it simply doesn't belong to any non-"all" bucket.
      const hasResolvableBalance = latestSnapshotsByDebt?.[debt.id]?.balance != null || debt.currentBalance != null;
      if (!hasResolvableBalance) return false;
      const balance = resolveDebtBalance(debt, latestSnapshotsByDebt);
      switch (balanceFilter) {
        case "under_500": return balance < 500;
        case "500_2000": return balance >= 500 && balance < 2000;
        case "2000_5000": return balance >= 2000 && balance < 5000;
        case "5000_10000": return balance >= 5000 && balance < 10000;
        case "10000_plus": return balance >= 10000;
        default: return true;
      }
    });
  }
  // BETA-3: calendar-aware due-timing filter - distinct from the naive
  // raw-dueDay `due_date` sort below (unchanged) and from status/plan/
  // quality, which say nothing about a debt's own due date. Reuses
  // paymentTiming.js's derivePaymentTiming so this filter can never drift
  // from the Home Upcoming Payments surface's own definition of "due
  // today"/"due this week"/"due date passed."
  if (dueTimingFilter !== "all") {
    list = list.filter((debt) => (
      derivePaymentTiming(debt, { now, paymentEvents: paymentEventsByDebt?.[debt.id] || [] }).status === dueTimingFilter
    ));
  }
  return list;
};

export const DUE_TIMING_FILTER_OPTIONS = [
  ["all", "Any due date"],
  ["due_date_passed", "Due date passed"],
  ["due_today", "Due today"],
  ["due_this_week", "Due this week"],
  ["upcoming", "Upcoming"],
  ["no_due_date", "No due date"],
];

export const BALANCE_RANGE_OPTIONS = [
  ["all", "Any balance"],
  ["under_500", "Under $500"],
  ["500_2000", "$500 - $1,999"],
  ["2000_5000", "$2,000 - $4,999"],
  ["5000_10000", "$5,000 - $9,999"],
  ["10000_plus", "$10,000+"],
];

// Unknown APR always sorts via a -1 sentinel, never a 0 fallback (the exact
// convention this file inherits from CategoryDetailPage's pre-UX-8.4 sort) -
// a debt with a genuinely unknown APR must never rank as if it were a real
// 0% APR debt on either direction of an APR sort.
const aprSortValue = (debt) => (debt.aprStatus === "unknown" ? -1 : Number(debt.apr || 0));
const requiredPaymentSortValue = (debt) => (debt.minimumRequiredPayment == null ? -1 : Number(debt.minimumRequiredPayment));

export const DEBT_EXPLORER_SORTS = [
  ["payoff_order", "Current payoff order"],
  ["due_date", "Due day: soonest first"],
  ["due_soonest", "Due date: soonest first (calendar-aware)"],
  ["apr_desc", "APR: highest first"],
  ["apr_asc", "APR: lowest first"],
  ["balance_desc", "Balance: highest first"],
  ["balance_asc", "Balance: lowest first"],
  ["required_payment_desc", "Required payment: highest first"],
  ["required_payment_asc", "Required payment: lowest first"],
  ["lender_asc", "Lender: A-Z"],
  ["lender_desc", "Lender: Z-A"],
];

export const sortDebtExplorerDebts = (debts, sort, {
  payoffOrderIndex = new Map(),
  latestSnapshotsByDebt = {},
  paymentEventsByDebt = {},
  now = new Date(),
} = {}) => {
  const sorted = [...debts];
  const lenderName = (debt) => getLenderIdentity(debt.name).canonicalName;
  if (sort === "payoff_order") {
    sorted.sort((a, b) => (payoffOrderIndex.has(a.id) ? payoffOrderIndex.get(a.id) : Infinity) - (payoffOrderIndex.has(b.id) ? payoffOrderIndex.get(b.id) : Infinity));
  } else if (sort === "due_date") {
    sorted.sort((a, b) => (a.dueDay ?? Infinity) - (b.dueDay ?? Infinity));
  } else if (sort === "due_soonest") {
    // Calendar-aware, distinct from the naive raw-dueDay `due_date` sort
    // above - reuses paymentTiming.js's own comparator so due-date-passed
    // debts always lead, then due-today, then soonest-upcoming, with no
    // due date always trailing.
    const timingFor = (debt) => derivePaymentTiming(debt, { now, paymentEvents: paymentEventsByDebt?.[debt.id] || [] });
    sorted.sort((a, b) => comparePaymentTiming(timingFor(a), timingFor(b)));
  } else if (sort === "apr_desc") {
    sorted.sort((a, b) => aprSortValue(b) - aprSortValue(a));
  } else if (sort === "apr_asc") {
    sorted.sort((a, b) => aprSortValue(a) - aprSortValue(b));
  } else if (sort === "balance_asc") {
    sorted.sort((a, b) => resolveDebtBalance(a, latestSnapshotsByDebt) - resolveDebtBalance(b, latestSnapshotsByDebt));
  } else if (sort === "balance_desc") {
    sorted.sort((a, b) => resolveDebtBalance(b, latestSnapshotsByDebt) - resolveDebtBalance(a, latestSnapshotsByDebt));
  } else if (sort === "required_payment_desc") {
    sorted.sort((a, b) => requiredPaymentSortValue(b) - requiredPaymentSortValue(a));
  } else if (sort === "required_payment_asc") {
    sorted.sort((a, b) => requiredPaymentSortValue(a) - requiredPaymentSortValue(b));
  } else if (sort === "lender_asc") {
    sorted.sort((a, b) => lenderName(a).localeCompare(lenderName(b)));
  } else if (sort === "lender_desc") {
    sorted.sort((a, b) => lenderName(b).localeCompare(lenderName(a)));
  }
  return sorted;
};

// Groups by RECOGNIZED lender identity (lenderId), never raw debt.name -
// "Capital One Card" and "Capital One Business" land in one group. A debt
// with no matched lender is never grouped with any other unmatched debt
// (that would falsely imply a shared institution neither may actually
// share) - it comes back in `ungrouped`, rendered individually exactly as
// before. Group order follows first-appearance in the input (i.e. the
// active sort still governs which group appears first).
export const groupDebtsByLender = (debts) => {
  const groups = [];
  const byLenderId = new Map();
  const ungrouped = [];
  for (const debt of debts) {
    const identity = getLenderIdentity(debt.name);
    if (!identity.matched) {
      ungrouped.push(debt);
      continue;
    }
    let group = byLenderId.get(identity.lenderId);
    if (!group) {
      group = { lenderId: identity.lenderId, canonicalName: identity.canonicalName, logoAsset: identity.logoAsset, debts: [] };
      byLenderId.set(identity.lenderId, group);
      groups.push(group);
    }
    group.debts.push(debt);
  }
  return groups.map((group) => {
    const knownAprs = group.debts.filter((debt) => debt.aprStatus !== "unknown").map((debt) => Number(debt.apr || 0));
    return {
      ...group,
      count: group.debts.length,
      total: group.debts.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0),
      highestKnownApr: knownAprs.length ? Math.max(...knownAprs) : null,
    };
  }).concat(ungrouped.length ? [{ lenderId: null, canonicalName: null, ungrouped: true, debts: ungrouped, count: ungrouped.length, total: ungrouped.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0), highestKnownApr: null }] : []);
};

// Groups by the SAME owner identity ScopeSelector/effectiveOwnerType/
// resolveDebtOwnership already use - member uid / person id / joint /
// unassigned. A Joint debt only ever appears in the single "joint" bucket
// (counted once), never duplicated under any member.
export const groupDebtsByOwner = (debts) => {
  const groups = [];
  const byKey = new Map();
  for (const debt of debts) {
    const type = effectiveOwnerType(debt);
    const key = (type === "member" || type === "person") ? `${type}:${debt.ownerId}` : type;
    let group = byKey.get(key);
    if (!group) {
      group = { key, ownerType: type, label: presentedOwnerLabel(debt), debts: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.debts.push(debt);
  }
  return groups.map((group) => ({
    ...group,
    count: group.debts.length,
    total: group.debts.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0),
  }));
};
