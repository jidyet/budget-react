export const DEFAULT_REMINDER_PREFERENCES = {
  dueSoon: true,
  checkIn: true,
  milestones: true,
  householdUpdates: true,
  cadence: "gentle",
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
    installNudgesDismissed: !!input.installNudgesDismissed,
    launchPrompts: input.launchPrompts !== false,
    reviewPrompts: input.reviewPrompts !== false,
  };
}
