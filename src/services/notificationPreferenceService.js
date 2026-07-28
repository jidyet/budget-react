export const DEFAULT_REMINDER_PREFERENCES = {
  dueSoon: true,
  checkIn: true,
  milestones: true,
  householdUpdates: true,
  cadence: "gentle",
  morningHour: 8,
  weeklySummaryDay: "monday",
  weeklySummaryHour: 8,
  installNudgesDismissed: false,
  launchPrompts: true,
  reviewPrompts: true,
};

export function normalizeReminderPreferences(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    dueSoon: input.dueSoon !== false,
    checkIn: input.checkIn !== false,
    milestones: input.milestones !== false,
    householdUpdates: input.householdUpdates !== false,
    cadence: ["gentle", "weekly", "off"].includes(input.cadence) ? input.cadence : "gentle",
    morningHour: Number.isFinite(Number(input.morningHour)) ? Math.max(6, Math.min(10, Math.round(Number(input.morningHour)))) : 8,
    weeklySummaryDay: ["sunday", "monday"].includes(String(input.weeklySummaryDay || "").toLowerCase())
      ? String(input.weeklySummaryDay).toLowerCase()
      : "monday",
    weeklySummaryHour: Number.isFinite(Number(input.weeklySummaryHour)) ? Math.max(6, Math.min(10, Math.round(Number(input.weeklySummaryHour)))) : 8,
    installNudgesDismissed: !!input.installNudgesDismissed,
    launchPrompts: input.launchPrompts !== false,
    reviewPrompts: input.reviewPrompts !== false,
  };
}
