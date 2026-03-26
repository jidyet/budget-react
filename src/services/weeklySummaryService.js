export const buildWeeklySummary = ({
  workspaceMode = "solo",
  progress,
  momentum,
  dueSoon = [],
  activity = [],
}) => {
  const remainingCount = dueSoon.length;
  const actorLine = workspaceMode === "household"
    ? (activity[0]?.title || "You're both moving.")
    : "You kept things moving.";

  let title = "This week";
  let body = actorLine;
  if (momentum?.weeklyHandled >= 3) {
    title = "Good week";
    body = `${momentum.weeklyHandled} things moved. ${remainingCount > 0 ? `${remainingCount} left.` : "You're on track."}`;
  } else if (momentum?.weeklyHandled > 0) {
    title = "Still moving";
    body = `${momentum.weeklyHandled} things moved this week. ${remainingCount > 0 ? `${remainingCount} left.` : "Nice work."}`;
  } else if (remainingCount > 0) {
    title = "One small action";
    body = `${remainingCount} still left. One check today is enough.`;
  }

  return {
    title,
    body,
    chips: [
      { id: "week-paid", label: "Moved this week", value: String(momentum?.weeklyHandled || 0) },
      { id: "week-down", label: "Paid down", value: progress?.totalReductionLabel || "$0" },
      { id: "week-left", label: "One thing left", value: remainingCount > 0 ? String(remainingCount) : "On track" },
    ],
  };
};
