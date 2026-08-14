import { isBalanceUnresolved } from "../../domain/tracktozero/ownership.js";

// THE single source of "how much of this debt has actually been paid off"
// (UX-0 Part 14) - later Home/retention UI must consume this rather than
// compute its own version, so "amount eliminated" can never be fabricated
// from a failed import, a parser guess, or an unconfirmed candidate.
//
// debt.startingBalance is the CONFIRMED opening balance (required at debt
// creation, always backed by an atomic opening BalanceSnapshot - see
// createDebtWithOpeningSnapshot). If the debt's balance is currently
// unresolved (e.g. a later import overwrote it with a failed/missing
// capture), there is no trustworthy "latest" figure, so eliminated is
// explicitly null rather than a guess - never treat a missing-data 0 as if
// $10,000 had been paid off.
export const deriveConfirmedProgress = (debt, latestSnapshot) => {
  const openingBalance = Number(debt?.startingBalance || 0);
  if (isBalanceUnresolved(debt)) {
    return { confirmed: false, openingBalance, latestConfirmedBalance: null, eliminated: null };
  }
  const latestConfirmedBalance = Number(latestSnapshot?.balance ?? debt?.currentBalance ?? 0);
  return {
    confirmed: true,
    openingBalance,
    latestConfirmedBalance,
    eliminated: Math.max(0, openingBalance - latestConfirmedBalance),
  };
};

// Workspace-level rollup: sums eliminated amounts only across debts whose
// progress is actually confirmed. A debt with an unresolved balance
// contributes nothing to this sum (not $0 eliminated, not its opening
// balance eliminated) - it is simply excluded, and callers can inspect
// unresolvedDebtIds to know why the total might look incomplete.
export const deriveWorkspaceConfirmedProgress = (debts = [], latestSnapshotsByDebt = {}) => {
  let openingBalance = 0;
  let latestConfirmedBalance = 0;
  let eliminated = 0;
  const unresolvedDebtIds = [];

  for (const debt of debts) {
    const progress = deriveConfirmedProgress(debt, latestSnapshotsByDebt[debt.id]);
    if (!progress.confirmed) {
      unresolvedDebtIds.push(debt.id);
      continue;
    }
    openingBalance += progress.openingBalance;
    latestConfirmedBalance += progress.latestConfirmedBalance;
    eliminated += progress.eliminated;
  }

  return { openingBalance, latestConfirmedBalance, eliminated, unresolvedDebtIds };
};
