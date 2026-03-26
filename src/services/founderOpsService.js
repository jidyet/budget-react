const STORAGE_KEY = "hb_founder_ops_v1";

export const TRIAGE_GUIDE = [
  {
    label: "Critical now",
    detail: "Crash, data loss, auth failure, save failure, or blocked household flow.",
  },
  {
    label: "Fix soon",
    detail: "Confusing flow, wrong numbers, broken copy, or a feature that feels unreliable.",
  },
  {
    label: "Polish later",
    detail: "Visual rough edges, spacing, microcopy, or low-risk friction.",
  },
];

export const STATUS_FLOW = [
  "new",
  "reviewing",
  "planned",
  "fixed",
  "closed",
];

export const getDefaultFounderOpsState = () => ({
  feedbackSentCount: 0,
  lastFeedbackAt: null,
});

export const readFounderOpsState = () => {
  if (typeof window === "undefined") return getDefaultFounderOpsState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultFounderOpsState();
    const parsed = JSON.parse(raw);
    return {
      feedbackSentCount: Number.isFinite(Number(parsed?.feedbackSentCount)) ? Number(parsed.feedbackSentCount) : 0,
      lastFeedbackAt: parsed?.lastFeedbackAt || null,
    };
  } catch (error) {
    console.error("read founder ops state error", error);
    return getDefaultFounderOpsState();
  }
};

export const recordFeedbackSent = () => {
  const current = readFounderOpsState();
  const next = {
    feedbackSentCount: current.feedbackSentCount + 1,
    lastFeedbackAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("save founder ops state error", error);
    }
  }
  return next;
};

export const buildReleaseNotesDraft = ({ appVersionLabel, launchFlags }) => {
  const lines = [
    `Release ${appVersionLabel}`,
    "",
    "What changed",
    "- Smoothed the daily dashboard flow",
    "- Kept premium features open for testers",
    "- Added clearer support, privacy, and feedback paths",
    "",
    "Launch status",
    `- Billing live: ${launchFlags?.billingEnabled ? "yes" : "no"}`,
    `- Tester mode: ${launchFlags?.testerMode ? "on" : "off"}`,
    `- Soft launch prompts: ${launchFlags?.softLaunchEnabled ? "on" : "off"}`,
  ];
  return lines.join("\n");
};

export const buildSupportSnapshot = ({
  appVersionLabel,
  supportEmail,
  launchFlags,
  softLaunchSummary,
  feedbackSentCount,
}) => {
  const lines = [
    `Version: ${appVersionLabel}`,
    `Support: ${supportEmail}`,
    `Feedback from this device: ${feedbackSentCount}`,
    `Launch pulse: ${softLaunchSummary}`,
    `Billing live: ${launchFlags?.billingEnabled ? "yes" : "no"}`,
    `Tester mode: ${launchFlags?.testerMode ? "on" : "off"}`,
    `Soft launch prompts: ${launchFlags?.softLaunchEnabled ? "on" : "off"}`,
  ];
  return lines.join("\n");
};
