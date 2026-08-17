/**
 * milestones.js
 *
 * Milestone ACHIEVEMENT is always a pure, idempotent function of already-
 * confirmed data (homeContext.progress/paidOffDebts/allDebtsArePaidOff -
 * every one of those already fails closed on unresolved/unconfirmed
 * balances, see homeViewModels.js's Progress Truth Contract). Nothing here
 * ever reads a projection or a plan checkpoint - if achieved now, it's shown
 * as achieved now, and it can never later "un-happen" from correcting a
 * balance, since it's recomputed fresh every render rather than cached.
 *
 * Achievement status itself needs no persistence. Only the CELEBRATION (a
 * one-time restrained banner, not the milestone's presence in a list) needs
 * a "have we already shown this one" flag - see useMilestoneCelebration.js.
 */

import { formatMoney } from "../formatting.js";

const PERCENT_THRESHOLDS = [10, 25, 50, 75, 90];

export const deriveMilestones = (homeContext) => {
  const progress = homeContext?.progress;
  const paidOffDebts = homeContext?.paidOffDebts || [];
  const milestones = [];

  if (progress?.confirmed && progress.eliminated > 0) {
    milestones.push({
      id: "reduction-first",
      title: "First confirmed reduction",
      body: `You've confirmed your first reduction in debt: ${formatMoney(progress.eliminated)} knocked out so far.`,
    });
  }

  if (progress?.confirmed && progress.eliminated >= 1000) {
    milestones.push({
      id: "eliminated-1000",
      title: "$1,000 eliminated",
      body: `You've confirmed ${formatMoney(progress.eliminated)} eliminated from your starting balance.`,
    });
  }

  if (progress?.confirmed) {
    for (const threshold of PERCENT_THRESHOLDS) {
      if (progress.percent >= threshold) {
        milestones.push({
          id: `pct-${threshold}`,
          title: `${threshold}% confirmed`,
          body: `You've confirmed ${threshold}% of your starting balance eliminated.`,
        });
      }
    }
  }

  if (paidOffDebts.length > 0) {
    // paidOffDebts is sorted most-recent-first (see derivePaidOffDebts) - the
    // FIRST debt ever paid off is the last entry in that order.
    const firstPaidOff = paidOffDebts[paidOffDebts.length - 1];
    milestones.push({
      id: "payoff-first",
      title: "First debt confirmed paid off",
      body: `${firstPaidOff.debt.name} is confirmed paid off.`,
    });
  }

  if (homeContext?.allDebtsArePaidOff) {
    milestones.push({
      id: "payoff-all",
      title: "All included debts confirmed at $0",
      body: "Every debt in your active payoff journey is confirmed at $0.",
    });
  }

  return milestones;
};
