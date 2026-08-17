/**
 * activityFeed.js
 *
 * Derives a human-readable Activity feed purely from records that were
 * already persisted for other reasons (Debt creation, BalanceSnapshot,
 * PaymentEvent, PlanVersion) - there is no dedicated activity/audit
 * collection in this app (confirmed: none exists anywhere in the schema).
 * Nothing here fabricates a timeline entry for anything that wasn't
 * genuinely written to the database.
 *
 * PaymentEvent and BalanceSnapshot are deliberately rendered as two
 * SEPARATE entries, even when a user's real-world action (e.g. "I paid my
 * card and updated the balance") produced both. There is no shared key in
 * the data model that safely correlates one to the other
 * (BalanceSnapshot.relatedPaymentEventId exists on the schema but is never
 * written anywhere in this codebase), so inventing a correlation here would
 * be a guess dressed up as a fact.
 */

import { formatMoney, formatShortDate } from "../formatting.js";
import { presentedOwnerLabel, resolveActorName } from "../../../domain/tracktozero/ownership.js";

const PLAN_VERSION_COPY = {
  activation: "Payoff plan activated",
  reforecast: "Plan reforecasted",
  strategy_change: "Payoff strategy changed",
  debt_added: "Plan updated for a new debt",
  balance_correction: "Plan updated after a balance correction",
};

const byCreatedAtDesc = (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime();

// The immediately-prior version (by versionNumber, within the same plan) -
// used only to render an honest "projected date moved from X to Y" for a
// reforecast entry, and only when both versions actually have a persisted
// projectedZeroDate (see the matching comment in
// v2AsyncApplicationService.js's applyReforecast for why older versions may
// not).
const findPriorVersion = (version, planVersions) =>
  planVersions
    .filter((candidate) => candidate.planId === version.planId && Number(candidate.versionNumber) < Number(version.versionNumber))
    .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0] || null;

export const deriveActivityFeed = (
  { debts = [], balanceSnapshots = [], paymentEvents = [], planVersions = [] } = {},
  { members = [], people = [] } = {}
) => {
  const debtById = new Map(debts.map((debt) => [debt.id, debt]));
  const actorName = (uid) => resolveActorName(uid, { members, people });
  const ownerName = (debt) => {
    const label = presentedOwnerLabel(debt);
    return label && label !== "Unassigned" ? label : "";
  };
  const entries = [];

  for (const debt of debts) {
    if (!debt.createdAt) continue;
    entries.push({
      id: `debt:${debt.id}`,
      kind: "debt_created",
      debtId: debt.id,
      debtName: debt.name || null,
      debtType: debt.debtType || null,
      at: debt.createdAt,
      title: `${debt.name} added`,
      detail: `Starting balance ${formatMoney(debt.startingBalance)}`,
      actorName: actorName(debt.createdBy),
      ownerName: ownerName(debt),
      dateLabel: formatShortDate(debt.createdAt),
    });
  }

  for (const snapshot of balanceSnapshots) {
    if (snapshot.voidedAt) continue;
    const debt = debtById.get(snapshot.debtId);
    // The opening snapshot is created atomically with the debt itself and is
    // already fully represented by the debt_created entry above - showing it
    // again would be a duplicate, not a second real event.
    if (debt?.openingBalanceSnapshotId && snapshot.id === debt.openingBalanceSnapshotId) continue;
    entries.push({
      id: `balance:${snapshot.id}`,
      kind: "balance_snapshot",
      debtId: snapshot.debtId,
      debtName: debt?.name || null,
      debtType: debt?.debtType || null,
      at: snapshot.createdAt,
      title: `${debt?.name || "A debt"} balance confirmed`,
      detail: formatMoney(snapshot.balance),
      actorName: actorName(snapshot.createdBy),
      ownerName: ownerName(debt),
      dateLabel: formatShortDate(snapshot.observedAt),
    });
  }

  for (const event of paymentEvents) {
    if (event.voidedAt) continue;
    const debt = debtById.get(event.debtId);
    entries.push({
      id: `payment:${event.id}`,
      kind: "payment_event",
      debtId: event.debtId,
      debtName: debt?.name || null,
      debtType: debt?.debtType || null,
      at: event.createdAt,
      title: `${debt?.name || "A debt"} payment recorded`,
      detail: formatMoney(event.amount),
      actorName: actorName(event.createdBy),
      ownerName: ownerName(debt),
      dateLabel: formatShortDate(event.paidAt),
    });
  }

  for (const version of planVersions) {
    if (!version.createdAt) continue;
    const reason = version.createdBecause;
    let detail = "";
    if (reason === "reforecast") {
      const prior = findPriorVersion(version, planVersions);
      detail = prior?.projectedZeroDate && version.projectedZeroDate
        ? `Projected payoff moved from ${formatShortDate(prior.projectedZeroDate)} to ${formatShortDate(version.projectedZeroDate)}`
        : "Your plan has been updated.";
    } else if (version.projectedZeroDate) {
      detail = `Projected payoff around ${formatShortDate(version.projectedZeroDate)}`;
    }
    entries.push({
      id: `plan-version:${version.id}`,
      kind: "plan_version",
      debtId: null,
      at: version.createdAt,
      title: PLAN_VERSION_COPY[reason] || "Plan updated",
      detail,
      actorName: actorName(version.createdBy),
      ownerName: "",
      dateLabel: formatShortDate(version.asOf || version.createdAt),
    });
  }

  return entries.sort(byCreatedAtDesc);
};
