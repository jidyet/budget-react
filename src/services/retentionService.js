export function buildCelebrationState({ milestones = [], progressScore, workspaceMode, activity = [] }) {
  if (Array.isArray(milestones) && milestones.length > 0) {
    const first = milestones[0];
    return {
      title: first.title || "Nice work",
      detail: first.detail || first.body || "You made progress this month.",
      tone: "success",
    };
  }

  if (progressScore?.score >= 80) {
    return {
      title: "Strong month",
      detail: progressScore.reason || "You are keeping your progress steady.",
      tone: "success",
    };
  }

  if (workspaceMode === "household" && activity.length > 0) {
    return {
      title: "Shared progress",
      detail: "Your household is moving together.",
      tone: "calm",
    };
  }

  return null;
}

export function buildReturnPrompt({ reminderPreferences, pwaInstalled, offlineReady }) {
  if (pwaInstalled) return null;
  if (reminderPreferences?.installNudgesDismissed) return null;
  if (offlineReady) {
    return {
      title: "Add to home screen",
      detail: "Open faster and keep your next check-in close.",
    };
  }
  return null;
}
