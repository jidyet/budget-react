import { subscribeHouseholdActivity } from "../firebase";

const timeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const toRelativeTime = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Just now";
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMinutes) < 60) return timeFormatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return timeFormatter.format(diffHours, "hour");
  return timeFormatter.format(Math.round(diffHours / 24), "day");
};

export const subscribeFormattedHouseholdActivity = (householdId, callback, maxItems = 12) =>
  subscribeHouseholdActivity(householdId, (items) => callback(items.map(formatHouseholdActivityItem)), maxItems);

export const formatHouseholdActivityItem = (item = {}) => {
  const actor = item.actorLabel || item.actorEmail || "Someone";
  const account = item.accountName || item.statementName || item.planName || item.householdName || item.requestEmail || item.accountId || "the budget";

  const messageMap = {
    "household.created": `${actor} started this household`,
    "member.joined": `${actor} joined the household`,
    "join.requested": `${actor} asked to join`,
    "join.approved": `${actor} let someone in`,
    "join.rejected": `${actor} passed on a join request`,
    "record.updated": `${actor} updated ${account}`,
    "income.updated": `${actor} updated income`,
    "upload.saved": `${actor} brought in a statement`,
    "plan.created": `${actor} made a payoff plan`,
    "plan.updated": `${actor} updated a payoff plan`,
    "plan.deleted": `${actor} deleted a payoff plan`,
    "settings.updated": `${actor} changed the shared setup`,
  };

  return {
    id: item.id,
    type: item.type || "activity",
    title: messageMap[item.type] || `${actor} moved things forward`,
    detail: item.planName || item.householdName || item.statementName || item.monthKey || "You moved forward",
    timestamp: toRelativeTime(item.createdAt),
    raw: item,
  };
};
