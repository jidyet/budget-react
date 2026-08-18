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
      actorUid: debt.createdBy || null,
      ownerName: ownerName(debt),
      ownerId: debt.ownerId || null,
      ownerType: debt.ownerType || null,
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
      actorUid: snapshot.createdBy || null,
      ownerName: ownerName(debt),
      ownerId: debt?.ownerId || null,
      ownerType: debt?.ownerType || null,
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
      actorUid: event.createdBy || null,
      ownerName: ownerName(debt),
      ownerId: debt?.ownerId || null,
      ownerType: debt?.ownerType || null,
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
      debtName: null,
      debtType: null,
      at: version.createdAt,
      title: PLAN_VERSION_COPY[reason] || "Plan updated",
      detail,
      actorName: actorName(version.createdBy),
      actorUid: version.createdBy || null,
      ownerName: "",
      ownerId: null,
      ownerType: null,
      dateLabel: formatShortDate(version.asOf || version.createdAt),
    });
  }

  return entries.sort(byCreatedAtDesc);
};

// ── UX-8.4: Activity Explorer support ───────────────────────────────────
// Day-grouping and "Today"/"Yesterday" labels are deliberately LOCAL-time
// (the viewer's own clock), not UTC like formatShortDate above -
// "Today"/"Yesterday" are inherently a local-time concept for whoever is
// looking at the screen. This is a new, separate helper rather than a
// change to formatShortDate, which keeps its existing UTC behavior for its
// existing callers.
const localDayKey = (isoString) => {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const localDayLabel = (isoString, referenceNow) => {
  const d = new Date(isoString);
  const today = new Date(referenceNow.getFullYear(), referenceNow.getMonth(), referenceNow.getDate());
  const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - entryDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === referenceNow.getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
};

// "2:41 PM" - local time-of-day for a single event row (never a raw
// Firestore/ISO timestamp).
export const formatLocalTimeLabel = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

// Groups already-sorted entries into calendar-day buckets, in the SAME
// order the entries arrived in (so a caller that already sorted newest-
// first or oldest-first controls both the day order and the within-day
// order by sorting before calling this - this function never re-sorts).
export const groupActivityEntriesByLocalDay = (entries, referenceNow = new Date()) => {
  const groups = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = localDayKey(entry.at);
    let group = byKey.get(key);
    if (!group) {
      group = { dayKey: key, dayLabel: localDayLabel(entry.at, referenceNow), entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
};

// UX-8.4: only 4 real event kinds ever exist in this feed (see the 4 push
// loops above) - "Debt details changed" and "Milestones" are deliberately
// NOT offered as filter options anywhere, since no real Activity event
// backs either today (this is documented, not a silent omission).
export const ACTIVITY_EVENT_TYPE_OPTIONS = [
  ["all", "All activity"],
  ["payment_event", "Payments"],
  ["balance_snapshot", "Balance updates"],
  ["debt_created", "Debts added"],
  ["plan_version", "Plan / reforecast"],
];

export const matchesEventType = (entry, eventTypeFilter = "all") =>
  eventTypeFilter === "all" || entry.kind === eventTypeFilter;

// Filters on the raw, stable actorUid - never the resolved display string,
// so a display-name change (or two people sharing a display name) can
// never silently change who a filter matches.
export const matchesActor = (entry, actorFilter = "all") =>
  actorFilter === "all" || entry.actorUid === actorFilter;

// Same owner-scope semantics as the Debt Explorer's filterDebtsByOwnerScope
// (ownership.js's effectiveOwnerType contract) - "joint"/"unassigned" match
// by type, anything else matches by the specific member/person id. Actor
// and owner are independent fields on the same entry and this never reads
// actorUid.
export const matchesOwnerScope = (entry, ownerFilter = "all") => {
  if (ownerFilter === "all") return true;
  if (ownerFilter === "joint" || ownerFilter === "unassigned") return entry.ownerType === ownerFilter;
  return entry.ownerId === ownerFilter;
};

export const matchesDebt = (entry, debtFilter = "all") =>
  debtFilter === "all" || entry.debtId === debtFilter;

export const ACTIVITY_DATE_RANGE_OPTIONS = [
  ["all", "All time"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
];

export const matchesDateRange = (entry, dateRangeFilter = "all", referenceNow = new Date()) => {
  if (dateRangeFilter === "all") return true;
  const entryDate = new Date(entry.at);
  if (Number.isNaN(entryDate.getTime())) return false;
  if (dateRangeFilter === "month") {
    return entryDate.getFullYear() === referenceNow.getFullYear() && entryDate.getMonth() === referenceNow.getMonth();
  }
  const diffDays = Math.floor((referenceNow.getTime() - entryDate.getTime()) / 86400000);
  if (dateRangeFilter === "7d") return diffDays >= 0 && diffDays < 7;
  if (dateRangeFilter === "30d") return diffDays >= 0 && diffDays < 30;
  return true;
};
