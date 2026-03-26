export const buildNudges = ({
  dueSoon = [],
  progress,
  momentum,
  activity = [],
  workspaceMode = "solo",
}) => {
  const nudges = [];
  const firstDue = dueSoon[0];

  if (firstDue) {
    nudges.push({
      id: "due-soon",
      label: firstDue.d_left === 0 ? "Check today" : `Due in ${firstDue.d_left}d`,
      detail: firstDue.name,
      tone: "accent",
    });
  }

  if (progress?.almostDoneDebt) {
    nudges.push({
      id: "almost-done",
      label: "You're close",
      detail: progress.almostDoneDebt.name,
      tone: "success",
    });
  }

  if (momentum?.weeklyHandled > 0) {
    nudges.push({
      id: "moving-week",
      label: momentum.weeklyHandled === 1 ? "One left" : `${momentum.weeklyHandled} moved`,
      detail: "Good week",
      tone: "accent",
    });
  }

  if (workspaceMode === "household" && activity[0]) {
    nudges.push({
      id: "shared-update",
      label: "Shared progress",
      detail: activity[0].title,
      tone: "success",
    });
  }

  if (progress?.monthsSooner > 0) {
    nudges.push({
      id: "shorter-path",
      label: progress.monthsSoonerLabel,
      detail: "Path getting shorter",
      tone: "accent",
    });
  }

  if (!nudges.length) {
    nudges.push({
      id: "steady",
      label: "You're on track",
      detail: "Keep going",
      tone: "success",
    });
  }

  return nudges.slice(0, 3);
};
