import { safeNumber } from "../utils/progressCalculations";

export const buildProgressNotes = ({
  progress,
  milestones = [],
  momentum,
  workspaceMode = "solo",
  activity = [],
}) => {
  const notes = [];

  if (safeNumber(progress?.monthsSooner) > 0) {
    notes.push({
      id: "months-sooner",
      title: progress.monthsSoonerLabel || "Payoff got shorter",
      detail: progress.projectedPayoffDate ? `Projected finish ${progress.projectedPayoffDate}` : "Your payoff path got shorter",
      tone: "good",
    });
  }

  if (safeNumber(progress?.totalReduction) > 0) {
    notes.push({
      id: "paid-more",
      title: "Nice work",
      detail: `${progress.totalReductionLabel || "$0"} down this month`,
      tone: "good",
    });
  }

  if (momentum?.weeklyHandled >= 3) {
    notes.push({
      id: "strong-week",
      title: "Strong week",
      detail: `${momentum.weeklyHandled} things moved this week`,
      tone: "accent",
    });
  }

  const clearedMilestone = milestones.find((item) => /down|cleared|forward/i.test(`${item?.title} ${item?.detail}`));
  if (clearedMilestone) {
    notes.push({
      id: "milestone",
      title: clearedMilestone.title || "One down",
      detail: clearedMilestone.detail || clearedMilestone.body || "A debt or balance moved in the right direction",
      tone: "good",
    });
  }

  if (workspaceMode === "household" && activity.length > 0) {
    notes.push({
      id: "shared-progress",
      title: "Shared progress",
      detail: activity[0]?.title || "Someone in your household updated shared progress",
      tone: "accent",
    });
  }

  if (!notes.length) {
    notes.push({
      id: "keep-going",
      title: "Keep going",
      detail: "One small move is enough today",
      tone: "steady",
    });
  }

  return notes.slice(0, 2);
};
