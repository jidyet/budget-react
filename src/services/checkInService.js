export const buildDailyCheckIn = ({
  workspaceMode = "solo",
  dueSoon = [],
  progress,
  nextMove,
  momentum,
  weeklySummary,
  activity = [],
}) => {
  const firstDue = dueSoon[0];

  if (firstDue) {
    return {
      eyebrow: "Today's focus",
      title: firstDue.d_left === 0 ? "Check this payment" : "One thing left",
      body: firstDue.name,
      detail: firstDue.d_left === 0 ? "Due today" : `Due in ${firstDue.d_left} day${firstDue.d_left === 1 ? "" : "s"}`,
      tone: "accent",
      action: "due-next",
    };
  }

  if (progress?.almostDoneDebt) {
    return {
      eyebrow: "Today's focus",
      title: "You're close",
      body: progress.almostDoneDebt.name,
      detail: "A little more here could clear it.",
      tone: "success",
      action: "payoff",
    };
  }

  if (workspaceMode === "household" && activity[0]) {
    return {
      eyebrow: "Shared progress",
      title: "You're synced",
      body: activity[0].title,
      detail: "You're both moving.",
      tone: "success",
      action: "bills",
    };
  }

  return {
    eyebrow: "Today's focus",
    title: momentum?.onTrack ? "You're on track" : "Keep going",
    body: nextMove?.body || weeklySummary?.title || "One small action today.",
    detail: nextMove?.detail || weeklySummary?.body || "Open the app, check one thing, and move on.",
    tone: momentum?.onTrack ? "success" : "accent",
    action: nextMove?.body ? "payoff" : "bills",
  };
};
