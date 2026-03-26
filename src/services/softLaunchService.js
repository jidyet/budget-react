const STORAGE_KEY = "hb_soft_launch_state_v1";

const pad = (value) => String(value).padStart(2, "0");

const getDayKey = (value = new Date()) =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

export const getDefaultSoftLaunchState = () => ({
  firstSeenAt: null,
  lastSeenAt: null,
  lastSeenDayKey: "",
  visitCount: 0,
  activeDays: 0,
  welcomeDismissed: false,
  reviewDismissed: false,
  reviewCompleted: false,
  lastPromptAt: null,
});

export const normalizeSoftLaunchState = (value) => {
  const input = value && typeof value === "object" ? value : {};
  return {
    ...getDefaultSoftLaunchState(),
    firstSeenAt: input.firstSeenAt || null,
    lastSeenAt: input.lastSeenAt || null,
    lastSeenDayKey: String(input.lastSeenDayKey || ""),
    visitCount: Number.isFinite(Number(input.visitCount)) ? Number(input.visitCount) : 0,
    activeDays: Number.isFinite(Number(input.activeDays)) ? Number(input.activeDays) : 0,
    welcomeDismissed: !!input.welcomeDismissed,
    reviewDismissed: !!input.reviewDismissed,
    reviewCompleted: !!input.reviewCompleted,
    lastPromptAt: input.lastPromptAt || null,
  };
};

export const readSoftLaunchState = () => {
  if (typeof window === "undefined") return getDefaultSoftLaunchState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSoftLaunchState();
    return normalizeSoftLaunchState(JSON.parse(raw));
  } catch (error) {
    console.error("read soft launch state error", error);
    return getDefaultSoftLaunchState();
  }
};

export const saveSoftLaunchState = (nextValue) => {
  if (typeof window === "undefined") return normalizeSoftLaunchState(nextValue);
  const normalized = normalizeSoftLaunchState(nextValue);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error("save soft launch state error", error);
  }
  return normalized;
};

export const recordSoftLaunchVisit = (previousState) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = getDayKey(now);
  const previous = normalizeSoftLaunchState(previousState);
  const isNewDay = previous.lastSeenDayKey !== todayKey;

  return saveSoftLaunchState({
    ...previous,
    firstSeenAt: previous.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    lastSeenDayKey: todayKey,
    visitCount: previous.visitCount + 1,
    activeDays: isNewDay ? previous.activeDays + 1 : previous.activeDays,
  });
};

export const patchSoftLaunchState = (patch) => {
  const previous = readSoftLaunchState();
  return saveSoftLaunchState({
    ...previous,
    ...patch,
    lastPromptAt: patch?.lastPromptAt || previous.lastPromptAt,
  });
};

export const buildSoftLaunchPrompt = ({
  softLaunchState,
  reminderPreferences,
  pwaInstalled,
  progress,
  milestones = [],
  momentum,
  launchFlags,
}) => {
  if (!launchFlags?.softLaunchEnabled) return null;

  const state = normalizeSoftLaunchState(softLaunchState);
  const launchPromptsEnabled = reminderPreferences?.launchPrompts !== false;
  const reviewPromptsEnabled = reminderPreferences?.reviewPrompts !== false && launchFlags?.reviewPromptsEnabled !== false;

  if (launchPromptsEnabled && !state.welcomeDismissed && state.activeDays <= 2) {
    return {
      kind: "welcome",
      title: "Welcome in",
      detail: pwaInstalled
        ? "You are set. One quick check-in is enough."
        : "Keep this close so tomorrow feels easy too.",
      primaryLabel: pwaInstalled ? "Keep going" : "Add to home screen",
      secondaryLabel: "Not now",
    };
  }

  const positiveMoment =
    (Array.isArray(milestones) && milestones.length > 0) ||
    Number(progress?.totalReduction || 0) > 0 ||
    Number(momentum?.weeklyHandled || 0) > 1;

  if (reviewPromptsEnabled && !state.reviewDismissed && !state.reviewCompleted && state.activeDays >= 3 && positiveMoment) {
    return {
      kind: "review",
      title: "How is it feeling?",
      detail: "A quick note helps us keep the app calm and useful.",
      primaryLabel: "Share feedback",
      secondaryLabel: "Later",
    };
  }

  if (launchPromptsEnabled && reminderPreferences?.checkIn !== false && state.activeDays >= 2 && Number(momentum?.weeklyHandled || 0) === 0) {
    return {
      kind: "return",
      title: "Keep the streak warm",
      detail: "A small check-in today keeps your flow easy tomorrow.",
      primaryLabel: "Open bills",
      secondaryLabel: "Hide",
    };
  }

  return null;
};
