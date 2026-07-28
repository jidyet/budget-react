/* global require, process, exports */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const serverTimestamp = () => FieldValue.serverTimestamp();

const parseFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const safeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const todayKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
};

const isCoachEnabled = () => parseFlag(process.env.AI_COACH_ENABLED, false);
const isTesterOnly = () => parseFlag(process.env.AI_COACH_TESTER_ONLY, true);
const maxDailyRequests = () => {
  const next = Number(process.env.AI_COACH_MAX_DAILY_REQUESTS || 5);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : 5;
};
const DEFAULT_REMINDER_PREFERENCES = {
  dueSoon: true,
  checkIn: true,
  cadence: "gentle",
  morningHour: 8,
  weeklySummaryDay: "monday",
  weeklySummaryHour: 8,
};

const normalizeReminderPreferences = (value = {}) => ({
  dueSoon: value?.dueSoon !== false,
  checkIn: value?.checkIn !== false,
  cadence: ["gentle", "weekly", "off"].includes(String(value?.cadence || "").toLowerCase())
    ? String(value.cadence).toLowerCase()
    : DEFAULT_REMINDER_PREFERENCES.cadence,
  morningHour: Number.isFinite(Number(value?.morningHour))
    ? Math.max(6, Math.min(10, Math.round(Number(value.morningHour))))
    : DEFAULT_REMINDER_PREFERENCES.morningHour,
  weeklySummaryDay: ["sunday", "monday"].includes(String(value?.weeklySummaryDay || "").toLowerCase())
    ? String(value.weeklySummaryDay).toLowerCase()
    : DEFAULT_REMINDER_PREFERENCES.weeklySummaryDay,
  weeklySummaryHour: Number.isFinite(Number(value?.weeklySummaryHour))
    ? Math.max(6, Math.min(10, Math.round(Number(value.weeklySummaryHour))))
    : DEFAULT_REMINDER_PREFERENCES.weeklySummaryHour,
});

const getLocalParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    weekday: String(parts.weekday || "").toLowerCase(),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    monthKey: `${parts.year}-${parts.month}`,
  };
};

const daysUntilDue = (dueDay, localParts) => {
  const day = Number(dueDay || 0);
  if (!Number.isFinite(day) || day <= 0) return null;
  const daysInMonth = new Date(Date.UTC(localParts.year, localParts.month, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInMonth);
  const todayUtc = Date.UTC(localParts.year, localParts.month - 1, localParts.day);
  const dueUtc = Date.UTC(localParts.year, localParts.month - 1, clampedDay);
  return Math.round((dueUtc - todayUtc) / 86400000);
};

const getBillCycleValues = (bill = {}) => {
  const monthlyDue = safeNumber(bill?.min_due_v ?? bill?.budgeted_min ?? 0);
  const paidThisCycle = safeNumber(bill?.paid_v);
  return {
    monthlyDue,
    paidThisCycle,
  };
};

const isMonthlyBill = (bill = {}) =>
  bill?.startsOverMonthly === true || String(bill?.billType || "").toLowerCase() === "monthly";

const isBillPaidOff = (bill = {}) =>
  !isMonthlyBill(bill) && safeNumber(bill?.cur_bal) <= 0.009;

const isBillCoveredThisCycle = (bill = {}) => {
  if (isBillPaidOff(bill)) return true;
  const { monthlyDue, paidThisCycle } = getBillCycleValues(bill);
  if (monthlyDue <= 0) return bill?.is_paid === true || paidThisCycle > 0;
  return bill?.is_paid === true || paidThisCycle >= monthlyDue;
};

const isBillOpenThisCycle = (bill = {}) =>
  !(isBillPaidOff(bill) || isBillCoveredThisCycle(bill));

const buildReminderMessage = (snapshot = {}) => {
  const checkIn = snapshot?.dailyCheckIn || {};
  const title = String(checkIn?.title || "TrackToZero check-in").trim();
  const body = String(checkIn?.detail || checkIn?.body || "Open the app and check one thing.").trim();
  return { title, body };
};

const buildWeeklyMessage = (snapshot = {}) => {
  const weekly = snapshot?.weeklySummary || {};
  const title = String(weekly?.title || "Your weekly summary").trim();
  const body = String(weekly?.body || "Open TrackToZero to see what moved this week.").trim();
  return { title, body };
};

const getDueReminderCandidates = (snapshot = {}, localParts) =>
  (Array.isArray(snapshot?.accounts) ? snapshot.accounts : [])
    .map((account) => ({
      ...account,
      d_left: account?.d_left == null ? daysUntilDue(account?.due_day, localParts) : Number(account.d_left),
    }))
    .filter((account) => isBillOpenThisCycle(account))
    .filter((account) => account.d_left === 0 || account.d_left === 1);

const markReminderSent = async (uid, key, payload = {}) => {
  const ref = db.doc(`users/${uid}/notification_log/${key}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      uid: String(uid),
      key,
      ...payload,
      createdAt: serverTimestamp(),
    });
    return true;
  });
  return result;
};

const sendPushToUser = async (uid, payload, dedupeKey, metadata = {}) => {
  const shouldSend = await markReminderSent(uid, dedupeKey, metadata);
  if (!shouldSend) return false;

  const devicesSnap = await db.collection(`users/${uid}/devices`).get();
  const tokens = devicesSnap.docs
    .map((doc) => String(doc.data()?.token || "").trim())
    .filter(Boolean);
  if (!tokens.length) return false;

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: Object.fromEntries(
      Object.entries(payload.data || {}).map(([key, value]) => [key, String(value)])
    ),
    android: {
      priority: "high",
      notification: {
        channelId: "default",
      },
    },
  });

  const invalidTokens = [];
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = String(item.error?.code || "");
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (invalidTokens.length) {
    await Promise.all(
      devicesSnap.docs
        .filter((doc) => invalidTokens.includes(String(doc.data()?.token || "").trim()))
        .map((doc) => doc.ref.delete())
    );
  }

  return response.successCount > 0;
};

const pickTopAccounts = (accounts = []) =>
  accounts
    .map((account) => ({
      name: String(account?.name || "Debt"),
      owner: String(account?.owner || "Unassigned"),
      category: String(account?.category || ""),
      billType: String(account?.billType || "paydown"),
      startsOverMonthly: account?.startsOverMonthly === true,
      balance: safeNumber(account?.balance),
      apr: safeNumber(account?.apr),
      minDue: safeNumber(account?.minDue),
      paidAmount: safeNumber(account?.paidAmount),
      plannedPayment: safeNumber(account?.plannedPayment),
      dueDay: safeNumber(account?.dueDay),
      monthlyInterest: safeNumber(account?.monthlyInterest),
      principalReduction: safeNumber(account?.principalReduction),
      isPaid: account?.isPaid === true,
      dueSoon: account?.dueSoon === true,
      needsUpdate: account?.needsUpdate === true,
      coveredThisMonth: account?.coveredThisMonth === true,
      almostDone: account?.almostDone === true,
    }))
    .filter((account) => account.balance > 0 || account.plannedPayment > 0 || account.monthlyInterest > 0 || account.billType === "monthly")
    .sort((left, right) => (right.monthlyInterest - left.monthlyInterest) || (right.apr - left.apr) || (right.balance - left.balance))
    .slice(0, 6);

const pickLargestBalances = (accounts = []) =>
  accounts
    .map((account) => ({
      name: String(account?.name || "Debt"),
      owner: String(account?.owner || "Unassigned"),
      billType: String(account?.billType || "paydown"),
      balance: safeNumber(account?.balance),
      apr: safeNumber(account?.apr),
      minDue: safeNumber(account?.minDue),
    }))
    .filter((account) => account.balance > 0)
    .sort((left, right) => (right.balance - left.balance) || (right.apr - left.apr))
    .slice(0, 3);

const buildPromptPayload = (payload = {}) => ({
  askType: String(payload?.askType || "overview"),
  askSubType: String(payload?.askSubType || ""),
  monthKey: String(payload?.monthKey || ""),
  workspaceMode: String(payload?.workspaceMode || "solo"),
  householdSummary: {
    enabled: payload?.householdSummary?.enabled === true,
    memberCount: safeNumber(payload?.householdSummary?.memberCount),
  },
  accounts: pickTopAccounts(Array.isArray(payload?.accounts) ? payload.accounts : []),
  largestBalances: pickLargestBalances(Array.isArray(payload?.largestBalances) ? payload.largestBalances : payload?.accounts),
  billMix: payload?.billMix || null,
  billsSummary: payload?.billsSummary || null,
  overviewSummary: payload?.overviewSummary || null,
  payoffSummary: payload?.payoffSummary || null,
  trendSummary: payload?.trendSummary || null,
  coachState: payload?.coachState || null,
});

const SYSTEM_PROMPT = [
  "You are AI Debt Coach for TrackToZero, a debt payoff and budgeting app.",
  "Use ONLY the provided app data.",
  "Do not invent balances, dates, totals, or calculations.",
  "Do not give legal, tax, credit repair, or professional financial advice.",
  "Be supportive, plainspoken, and concise.",
  "TrackToZero has three bill types. Respect them strictly.",
  "Pay down over time: balance goes down until it reaches zero and it can be a payoff priority.",
  "No-interest payment plan: balance still goes down over time, but it is usually less urgent than debt growing with interest.",
  "Monthly bill: starts over each month. Talk about whether it is covered this month or still needs attention. Never call a monthly bill paid off forever.",
  "The accounts array is a focused subset for explanation, not necessarily the full balance ranking.",
  "Only call something a largest balance, highest balance, or biggest balance if it appears in largestBalances.",
  "Explain the numbers as a read of the user's current app data, not as hidden calculations.",
  "Do not describe current-month interest, balances, minimums, or due items as forecasts unless the provided data explicitly says they are projected.",
  "When discussing trends, make it clear you are summarizing the current month's balances, payments, and due data shown in the app.",
  "Only describe a future payoff date or payoff projection if it is explicitly included in payoffSummary.",
  "Use plain language like covered this month, starts over each month, pay down, almost finished, due soon, no-interest plan, and next step.",
  "Give one short summary, up to three short bullets, one main insight, one short why-this-matters explanation, and one clear next best step.",
  "Avoid generic advice. Make the next step specific to the provided data.",
  "If coachState.limitations contains warnings, mention that the recommendation is limited and explain what is missing in plain language.",
  "If data is missing, say so clearly.",
  "Return JSON only in this exact shape:",
  '{"headline":"short title","summary":"1-3 short sentences","bullets":["short bullet","short bullet"],"mainInsight":"one short key insight","whyThisMatters":"one short explanation","nextStep":"one clear next step","confidence":"high | medium | low","disclaimer":"short safety line"}',
].join(" ");

const COACH_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    bullets: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 3,
    },
    mainInsight: { type: "string" },
    whyThisMatters: { type: "string" },
    nextStep: { type: "string" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    disclaimer: { type: "string" },
  },
  required: ["headline", "summary", "bullets", "mainInsight", "whyThisMatters", "nextStep", "confidence", "disclaimer"],
};

const getPagePrompt = (payload = {}) => {
  switch (payload.askType) {
    case "bills":
      return [
        "Bills page: focus on what needs attention now.",
        "Prioritize due soon bills, unpaid items, owner corrections if relevant, and monthly bills that still need to be covered this month.",
      ].join(" ");
    case "payoff":
      return [
        "Payoff page: focus on what to pay first and why.",
        "Explain how monthly bills differ from debt that gets paid down over time.",
        "Explain why a no-interest plan is less urgent than debt that is growing with interest when the data supports that.",
      ].join(" ");
    case "trends":
      return [
        "Trends page: explain whether progress looks real this month, whether interest is slowing things down, and whether monthly bill coverage looks stable.",
      ].join(" ");
    case "overview":
    default:
      return [
        "Overview page: summarize what needs attention now, what changed this month, and one next action.",
      ].join(" ");
  }
};

const getAskSubTypePrompt = (payload = {}) => {
  const askSubType = String(payload?.askSubType || "");
  if (!askSubType) return "";
  const mapping = {
    overview_focus: [
      "Answer as an overview focus question.",
      "Prioritize the one thing that needs attention first right now.",
      "Do not spend the response mostly on what changed or long-term forecasting.",
    ].join(" "),
    overview_change: [
      "Answer as a this-month change question.",
      "Center the response on what changed this month in balances, payments, due items, or momentum.",
      "Lead with the change before giving the next step.",
    ].join(" "),
    overview_track: [
      "Answer as an on-track question.",
      "Say clearly whether the user looks on track right now and what is helping or threatening that path.",
    ].join(" "),
    bills_attention: [
      "Answer as a bills attention question.",
      "Focus on unpaid, due soon, overdue, uncovered monthly bills, and owner or update issues.",
      "Name the highest-attention bill or bill group first.",
    ].join(" "),
    bills_due_soon: [
      "Answer as a due-soon question.",
      "Focus tightly on due soon and overdue bills and the order to handle them now.",
      "Do not drift into general payoff strategy unless it directly follows the due items.",
    ].join(" "),
    bills_monthly_coverage: [
      "Answer as a monthly-coverage question.",
      "Focus only on monthly bills that start over each month.",
      "Explain which monthly bills look covered and which still need attention this month.",
      "Do not talk about monthly bills as debts to eliminate forever.",
    ].join(" "),
    payoff_priority: [
      "Answer as a payoff priority question.",
      "Identify the clearest debt to pay first and use the supplied payoff data to explain why.",
      "Monthly bills should only be mentioned as bills to keep covered first, not as the long-term payoff target.",
    ].join(" "),
    payoff_reason: [
      "Answer as a why-this-bill-first question.",
      "Explain why the current target matters more than the user's other debts or no-interest plans.",
      "Be explicit about whether the driver is interest cost, payoff speed, promo timing, or almost-finished progress.",
    ].join(" "),
    payoff_extra: [
      "Answer as an extra-payment question.",
      "Focus on what adding more money would help most and where the extra money should go first.",
      "Connect the answer to the current payoff target or current payoff plan if available.",
    ].join(" "),
    trends_progress: [
      "Answer as a progress-is-it-real question.",
      "Explain whether the current trend data shows real movement or only small cosmetic change.",
      "Mention whether balances are truly going down and whether monthly bills are staying covered.",
    ].join(" "),
    trends_drag: [
      "Answer as a what's-slowing-me-down question.",
      "Focus on the biggest drag on momentum, especially interest-heavy debt, uncovered monthly bills, or weak principal reduction.",
    ].join(" "),
    trends_balance_up: [
      "Answer as a why-did-my-balance-go-up question.",
      "Focus on likely causes shown in the supplied app data, such as balance increases, interest drag, new unpaid bills, or missing updates.",
      "Do not claim a cause that is not supported by the payload.",
    ].join(" "),
  };
  return mapping[askSubType] || "";
};

const collectTextChunks = (value, chunks) => {
  if (typeof value === "string" && value.trim()) {
    chunks.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextChunks(item, chunks));
    return;
  }
  if (!value || typeof value !== "object") return;

  if (typeof value.text === "string" && value.text.trim()) chunks.push(value.text.trim());
  if (typeof value.output_text === "string" && value.output_text.trim()) chunks.push(value.output_text.trim());
  if (typeof value.value === "string" && value.value.trim()) chunks.push(value.value.trim());

  if (value.text && typeof value.text === "object") collectTextChunks(value.text, chunks);
  if (value.output_text && typeof value.output_text === "object") collectTextChunks(value.output_text, chunks);
  if (value.content) collectTextChunks(value.content, chunks);
  if (value.message) collectTextChunks(value.message, chunks);
  if (value.refusal) collectTextChunks(value.refusal, chunks);
};

const extractOutputText = (responseJson = {}) => {
  const chunks = [];
  collectTextChunks(responseJson.output_text, chunks);
  collectTextChunks(responseJson.output, chunks);
  collectTextChunks(responseJson.content, chunks);
  collectTextChunks(responseJson.message, chunks);
  return chunks.join("\n").trim();
};

const summarizeResponseShape = (responseJson = {}) => ({
  id: responseJson?.id || null,
  model: responseJson?.model || null,
  status: responseJson?.status || null,
  outputTextType: typeof responseJson?.output_text,
  outputCount: Array.isArray(responseJson?.output) ? responseJson.output.length : 0,
  outputTypes: Array.isArray(responseJson?.output) ? responseJson.output.map((item) => item?.type || "unknown").slice(0, 5) : [],
});

const parseCoachJson = (rawText = "") => {
  const cleaned = String(rawText || "").trim();
  if (!cleaned) throw new Error("Empty AI response.");
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const candidate = fenced?.[1] || cleaned;
  const parsed = JSON.parse(candidate);
  return {
    headline: String(parsed?.headline || "AI Debt Coach"),
    summary: String(parsed?.summary || "I could not summarize this yet."),
    bullets: Array.isArray(parsed?.bullets)
      ? parsed.bullets.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
      : [],
    mainInsight: String(parsed?.mainInsight || parsed?.bullets?.[0] || "Your current data points to one clear area to focus on next."),
    whyThisMatters: String(parsed?.whyThisMatters || parsed?.bullets?.[1] || "This matters because the way you handle the next move can change how fast progress shows up."),
    nextStep: String(parsed?.nextStep || "Review your latest balances and due dates."),
    confidence: ["high", "medium", "low"].includes(String(parsed?.confidence || "").toLowerCase())
      ? String(parsed.confidence).toLowerCase()
      : "medium",
    disclaimer: String(parsed?.disclaimer || "I used only the current data shown in your app. This is not financial, tax, or legal advice."),
  };
};

const fallbackCoach = () => ({
  headline: "AI Debt Coach",
  summary: "I could not finish a full summary right now, but your current debt picture is still available in the app.",
  bullets: [
    "Review the highest-interest debt first.",
    "Check whether your planned payment is beating monthly interest.",
    "Update any balance that looks out of date before trusting the trend.",
  ],
  mainInsight: "Your next move is still easier to judge from the current numbers already shown in the app.",
  whyThisMatters: "A fresh balance, due date, or payment update can change what deserves your attention first.",
  nextStep: "Open your payoff or trends view and confirm your latest balances.",
  confidence: "low",
  disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
});

const limitedCoachFromState = (payload = {}) => {
  const reason = Array.isArray(payload?.coachState?.limitations) ? payload.coachState.limitations[0] : "";
  if (reason === "only_monthly_bills") {
    return {
      headline: "Mostly monthly bills right now",
      summary: "Most of your current items start over each month, so this is a coverage-first recommendation.",
      bullets: [
        "Monthly bills should be covered this month.",
        "They are not debts to pay off forever.",
      ],
      mainInsight: "Monthly bills should be treated as covered this month, not paid off forever.",
      whyThisMatters: "Once monthly bills are covered, extra money can go toward debt that actually goes down over time.",
      nextStep: "Cover any monthly bills that still need attention this month, then open Payoff for your debt priorities.",
      confidence: "medium",
      disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
    };
  }
  return {
    headline: "AI Debt Coach",
    summary: String(payload?.coachState?.message || "Your data is still too limited for a full recommendation."),
    bullets: [
      "The recommendation is limited by missing data.",
      "Updating bills and balances will improve guidance.",
    ],
    mainInsight: "A full recommendation needs enough current bill and balance detail to compare your options safely.",
    whyThisMatters: "Without that detail, the safest next step is to improve the data before acting on advice.",
    nextStep: "Update your bills, balances, and due dates, then ask AI Coach again.",
    confidence: "low",
    disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
  };
};

const userUsageRef = (uid, day) => db.collection("aiCoachUsage").doc(`${uid}_${day}`);

const chunkRefs = (refs = [], size = 400) => {
  const chunks = [];
  for (let index = 0; index < refs.length; index += size) {
    chunks.push(refs.slice(index, index + size));
  }
  return chunks;
};

const deleteRefsInChunks = async (refs = []) => {
  if (!refs.length) return;
  for (const group of chunkRefs(refs)) {
    const batch = db.batch();
    group.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const resetUserToSolo = async (uid) => {
  if (!uid) return;
  await Promise.all([
    db.doc(`users/${uid}/meta/app`).set({
      activeHouseholdId: "",
      householdSetupDone: true,
      workspaceMode: "solo",
      pendingHouseholdId: "",
      pendingHouseholdName: "",
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    db.doc(`registry/${uid}`).set({
      activeHouseholdId: "",
      workspaceMode: "solo",
      lastSeenAt: serverTimestamp(),
    }, { merge: true }),
  ]);
};

const deleteMonthSubtreeAdmin = async (monthDocRef) => {
  const [accountsSnap, uploadsSnap] = await Promise.all([
    monthDocRef.collection("accounts").get(),
    monthDocRef.collection("uploads").get(),
  ]);
  await deleteRefsInChunks([
    ...accountsSnap.docs.map((docSnap) => docSnap.ref),
    ...uploadsSnap.docs.map((docSnap) => docSnap.ref),
    monthDocRef,
  ]);
};

const scanHouseholdMembershipsForUser = async (uid) => {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return { memberships: [], joinRequests: [] };

  const householdsSnap = await db.collection("households").get();
  const membershipChecks = householdsSnap.docs.map(async (householdDoc) => {
    const householdId = String(householdDoc.id || "");
    const [memberSnap, joinRequestSnap] = await Promise.all([
      db.doc(`households/${householdId}/members/${safeUid}`).get(),
      db.doc(`households/${householdId}/joinRequests/${safeUid}`).get(),
    ]);

    return {
      householdId,
      membership: memberSnap.exists
        ? {
            householdId,
            ref: memberSnap.ref,
            data: memberSnap.data() || {},
          }
        : null,
      joinRequest: joinRequestSnap.exists
        ? {
            householdId,
            ref: joinRequestSnap.ref,
            data: joinRequestSnap.data() || {},
          }
        : null,
    };
  });

  const results = await Promise.all(membershipChecks);
  return {
    memberships: results.map((entry) => entry.membership).filter(Boolean),
    joinRequests: results.map((entry) => entry.joinRequest).filter(Boolean),
  };
};

const buildHouseholdInviteRefs = async (householdId, extraUserIds = []) => {
  const safeHouseholdId = String(householdId || "").trim();
  if (!safeHouseholdId) return [];

  const [userDocsSnap, registrySnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("registry").get(),
  ]);

  const userIds = Array.from(
    new Set([
      ...userDocsSnap.docs.map((docSnap) => String(docSnap.id || "")),
      ...registrySnap.docs.map((docSnap) => String(docSnap.id || "")),
      ...(Array.isArray(extraUserIds) ? extraUserIds.map((value) => String(value || "").trim()) : []),
    ].filter(Boolean))
  );

  return userIds.map((targetUid) => db.doc(`users/${targetUid}/invites/${safeHouseholdId}`));
};

const deleteHouseholdCascade = async (householdId) => {
  const safeHouseholdId = String(householdId || "").trim();
  if (!safeHouseholdId) {
    throw new HttpsError("invalid-argument", "Household ID is required.");
  }

  const householdRef = db.doc(`households/${safeHouseholdId}`);
  const householdSnap = await householdRef.get();
  if (!householdSnap.exists) {
    throw new HttpsError("not-found", "Household not found.");
  }

  const [membersSnap, joinRequestsSnap, monthsSnap, plansSnap, activitySnap, dashboardSnap, metaSnap] = await Promise.all([
    householdRef.collection("members").get(),
    householdRef.collection("joinRequests").get(),
    householdRef.collection("months").get(),
    householdRef.collection("payoff_plans").get(),
    householdRef.collection("activity").get(),
    householdRef.collection("dashboard").get(),
    householdRef.collection("meta").get(),
  ]);

  const memberIds = membersSnap.docs.map((docSnap) => String(docSnap.id || ""));
  const requestIds = joinRequestsSnap.docs.map((docSnap) => String(docSnap.id || ""));
  const affectedUsers = Array.from(new Set([...memberIds, ...requestIds].filter(Boolean)));
  const inviteRefs = await buildHouseholdInviteRefs(safeHouseholdId, affectedUsers);

  for (const uid of affectedUsers) {
    await resetUserToSolo(uid);
  }

  for (const monthDoc of monthsSnap.docs) {
    await deleteMonthSubtreeAdmin(monthDoc.ref);
  }

  await deleteRefsInChunks([
    ...membersSnap.docs.map((docSnap) => docSnap.ref),
    ...joinRequestsSnap.docs.map((docSnap) => docSnap.ref),
    ...plansSnap.docs.map((docSnap) => docSnap.ref),
    ...activitySnap.docs.map((docSnap) => docSnap.ref),
    ...dashboardSnap.docs.map((docSnap) => docSnap.ref),
    ...metaSnap.docs.map((docSnap) => docSnap.ref),
    ...inviteRefs,
    db.doc(`householdDirectory/${safeHouseholdId}`),
    householdRef,
  ]);

  return {
    householdId: safeHouseholdId,
    affectedUsers: affectedUsers.length,
  };
};

const removeUserFromHouseholdCascade = async (householdId, uid) => {
  const safeHouseholdId = String(householdId || "").trim();
  const safeUid = String(uid || "").trim();
  if (!safeHouseholdId || !safeUid) return;

  const householdRef = db.doc(`households/${safeHouseholdId}`);
  const memberRef = householdRef.collection("members").doc(safeUid);
  const [householdSnap, memberSnap] = await Promise.all([householdRef.get(), memberRef.get()]);
  if (!householdSnap.exists || !memberSnap.exists) return;

  const household = householdSnap.data() || {};
  const nextIds = Array.isArray(household.memberIds)
    ? household.memberIds.map(String).filter((id) => id !== safeUid)
    : [];

  const batch = db.batch();
  batch.delete(memberRef);
  batch.set(householdRef, {
    memberIds: nextIds,
    memberCount: nextIds.length,
    updatedAt: serverTimestamp(),
    updatedBy: safeUid,
    updatedByLabel: "Account deleted",
  }, { merge: true });
  batch.delete(db.doc(`users/${safeUid}/invites/${safeHouseholdId}`));
  await batch.commit();
  await resetUserToSolo(safeUid);
};

const isAppAdmin = async (uid) => {
  const snap = await db.doc("config/admins").get();
  const uids = Array.isArray(snap.data()?.uids) ? snap.data().uids.map(String) : [];
  return uids.includes(String(uid));
};

const enforceUsageLimit = async (uid) => {
  const usageRef = userUsageRef(uid, todayKey());
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const current = safeNumber(snap.data()?.count);
    if (current >= maxDailyRequests()) {
      return { allowed: false, count: current };
    }
    tx.set(usageRef, {
      uid: String(uid),
      day: todayKey(),
      count: current + 1,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { allowed: true, count: current + 1 };
  });
  if (!result.allowed) {
    throw new HttpsError("resource-exhausted", "AI Coach daily limit reached.");
  }
  return result.count;
};

exports.aiCoachSummary = onCall({ region: "us-central1", timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to use AI Coach.");
  }
  if (!isCoachEnabled()) {
    throw new HttpsError("failed-precondition", "AI Coach is disabled.");
  }
  const uid = String(request.auth.uid);
  const founderAccount = request.auth.token?.founderAccount === true;
  const adminAccess = await isAppAdmin(uid);
  if (isTesterOnly() && !founderAccount && !adminAccess) {
    throw new HttpsError("permission-denied", "AI Coach is in tester access only.");
  }

  const payload = buildPromptPayload(request.data || {});
  if (payload?.coachState?.ready === false) {
    return { coach: limitedCoachFromState(payload) };
  }
  if (!payload.accounts.length) {
    throw new HttpsError("invalid-argument", "AI Coach needs at least one debt with balance data.");
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing");
    throw new HttpsError("failed-precondition", "AI Coach is not configured yet.");
  }

  await enforceUsageLimit(uid);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: [SYSTEM_PROMPT, getPagePrompt(payload), getAskSubTypePrompt(payload)].filter(Boolean).join(" "),
        reasoning: { effort: "minimal" },
        text: {
          format: {
            type: "json_schema",
            name: "ai_debt_coach_response",
            schema: COACH_RESPONSE_SCHEMA,
            strict: true,
          },
        },
        max_output_tokens: 400,
        input: JSON.stringify(payload),
      }),
    });

    if (!response.ok) {
      const failureText = await response.text();
      console.error("AI Coach OpenAI request failed", { status: response.status, body: failureText.slice(0, 500) });
      await db.collection("aiCoachLogs").add({
        uid,
        askType: payload.askType,
        monthKey: payload.monthKey,
        workspaceMode: payload.workspaceMode,
      accountCount: payload.accounts.length,
      success: false,
      error: `openai_${response.status}`,
      createdAt: serverTimestamp(),
    });
      return { coach: fallbackCoach() };
    }

    const responseJson = await response.json();
    const rawText = extractOutputText(responseJson);
    if (!rawText) {
      console.error("AI Coach OpenAI response had no extractable text", summarizeResponseShape(responseJson));
      return { coach: fallbackCoach() };
    }
    const coach = parseCoachJson(rawText);

    await db.collection("aiCoachLogs").add({
      uid,
      askType: payload.askType,
      monthKey: payload.monthKey,
      workspaceMode: payload.workspaceMode,
      accountCount: payload.accounts.length,
      success: true,
      createdAt: serverTimestamp(),
    });

    return { coach };
  } catch (error) {
    console.error("AI Coach failed", error);
    await db.collection("aiCoachLogs").add({
      uid,
      askType: payload.askType,
      monthKey: payload.monthKey,
      workspaceMode: payload.workspaceMode,
      accountCount: payload.accounts.length,
      success: false,
      error: String(error?.message || error),
      createdAt: serverTimestamp(),
    });
    if (error instanceof HttpsError) throw error;
    return { coach: fallbackCoach() };
  }
});

exports.dispatchScheduledReminders = onSchedule(
  { schedule: "every 60 minutes", timeZone: "UTC", region: "us-central1", memory: "256MiB" },
  async () => {
    const usersSnap = await db.collection("users").get();
    const now = new Date();
    const results = {
      users: usersSnap.size,
      morning: 0,
      weekly: 0,
      due: 0,
    };

    for (const userDoc of usersSnap.docs) {
      const uid = String(userDoc.id || "");
      if (!uid) continue;

      const reminderSnap = await db.doc(`users/${uid}/meta/reminders`).get();
      if (!reminderSnap.exists) continue;
      const snapshot = reminderSnap.data() || {};
      const prefs = normalizeReminderPreferences(snapshot?.reminderPreferences || {});
      if (prefs.cadence === "off" && prefs.dueSoon === false && prefs.checkIn === false) continue;

      const localParts = getLocalParts(now, snapshot?.timezone || "UTC");
      const dailyHours = Array.from(new Set([prefs.morningHour, 12, 18])).filter((hour) => hour === localParts.hour);
      if (!dailyHours.length && !(localParts.weekday === prefs.weeklySummaryDay && localParts.hour === prefs.weeklySummaryHour)) {
        continue;
      }

      if (prefs.checkIn && localParts.hour === prefs.morningHour) {
        const message = buildReminderMessage(snapshot);
        const sent = await sendPushToUser(
          uid,
          {
            title: message.title,
            body: message.body,
            data: { type: "morning_check_in" },
          },
          `morning-${localParts.dateKey}`,
          { type: "morning_check_in", dateKey: localParts.dateKey }
        );
        if (sent) results.morning += 1;
      }

      if (prefs.cadence !== "off" && localParts.weekday === prefs.weeklySummaryDay && localParts.hour === prefs.weeklySummaryHour) {
        const weeklyMessage = buildWeeklyMessage(snapshot);
        const sent = await sendPushToUser(
          uid,
          {
            title: weeklyMessage.title,
            body: weeklyMessage.body,
            data: { type: "weekly_summary" },
          },
          `weekly-${localParts.dateKey}`,
          { type: "weekly_summary", dateKey: localParts.dateKey }
        );
        if (sent) results.weekly += 1;
      }

      if (prefs.dueSoon && dailyHours.length) {
        const dueCandidates = getDueReminderCandidates(snapshot, localParts);
        for (const account of dueCandidates) {
          const dueType = account.d_left === 0 ? "due_today" : "due_tomorrow";
          const sent = await sendPushToUser(
            uid,
            {
              title: account.d_left === 0 ? `${account.name} due today` : `${account.name} due tomorrow`,
              body: `Minimum payment: $${safeNumber(account.min_due_v).toFixed(2)}`,
              data: { type: dueType, accountId: account.id || "" },
            },
            `${dueType}-${localParts.dateKey}-${account.id}`,
            { type: dueType, dateKey: localParts.dateKey, accountId: String(account.id || "") }
          );
          if (sent) results.due += 1;
        }
      }
    }

    console.log("dispatchScheduledReminders", results);
  }
);

exports.deleteHousehold = onCall({ region: "us-central1", timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete a household.");
  }

  const householdId = String(request.data?.householdId || "").trim();
  if (!householdId) {
    throw new HttpsError("invalid-argument", "Household ID is required.");
  }

  const memberSnap = await db.doc(`households/${householdId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data()?.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the household owner can delete the household.");
  }

  const result = await deleteHouseholdCascade(householdId);
  return { ok: true, ...result };
});

exports.deleteMyAccount = onCall({ region: "us-central1", timeoutSeconds: 90, memory: "512MiB" }, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete your account.");
  }

  try {
    console.log("deleteMyAccount:start", { uid });
    const { memberships, joinRequests } = await scanHouseholdMembershipsForUser(uid);
    console.log("deleteMyAccount:membership-scan", {
      uid,
      memberships: memberships.length,
      joinRequests: joinRequests.length,
    });

    const ownerMemberships = [];
    for (const membership of memberships) {
      const data = membership?.data || {};
      if (data.role !== "owner") continue;
      const householdId = String(membership?.householdId || "");
      if (!householdId) continue;
      const membersForHousehold = await db.collection(`households/${householdId}/members`).get();
      if (membersForHousehold.docs.some((memberDoc) => String(memberDoc.id) !== uid)) {
        ownerMemberships.push(householdId);
      }
    }

    if (ownerMemberships.length) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot delete while other members exist."
      );
    }

    const deletedHouseholds = [];
    for (const membership of memberships) {
      const data = membership?.data || {};
      const householdId = String(membership?.householdId || "");
      if (!householdId) continue;
      if (data.role === "owner") {
        console.log("deleteMyAccount:delete-owned-household", { uid, householdId });
        try {
          await deleteHouseholdCascade(householdId);
        } catch (error) {
          if (error instanceof HttpsError) {
            throw error;
          }
          console.error("deleteMyAccount:delete-household-failed", {
            uid,
            householdId,
            code: error?.code || null,
            message: error?.message || String(error),
          });
          throw new HttpsError("internal", "Failed to delete household.");
        }
        deletedHouseholds.push(householdId);
        continue;
      }
      console.log("deleteMyAccount:leave-household", { uid, householdId });
      await removeUserFromHouseholdCascade(householdId, uid);
    }

    await deleteRefsInChunks(joinRequests.map((request) => request.ref));

    const [monthsSnap, payoffPlansSnap, invitesSnap] = await Promise.all([
      db.collection(`users/${uid}/months`).get(),
      db.collection(`users/${uid}/payoff_plans`).get(),
      db.collection(`users/${uid}/invites`).get(),
    ]);
    console.log("deleteMyAccount:user-data-scan", {
      uid,
      months: monthsSnap.size,
      payoffPlans: payoffPlansSnap.size,
      invites: invitesSnap.size,
    });

    for (const monthDoc of monthsSnap.docs) {
      await deleteMonthSubtreeAdmin(monthDoc.ref);
    }

    await deleteRefsInChunks([
      ...payoffPlansSnap.docs.map((docSnap) => docSnap.ref),
      ...invitesSnap.docs.map((docSnap) => docSnap.ref),
      db.doc(`users/${uid}/meta/app`),
      db.doc(`users/${uid}`),
    ]);

    const adminConfigSnap = await db.doc("config/admins").get();
    const currentAdminUids = Array.isArray(adminConfigSnap.data()?.uids)
      ? adminConfigSnap.data().uids.map(String)
      : [];
    if (currentAdminUids.includes(uid)) {
      await db.doc("config/admins").set({
        uids: currentAdminUids.filter((entry) => entry !== uid),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    await db.doc(`registry/${uid}`).set({
      uid,
      deleted: true,
      deletedAt: serverTimestamp(),
    }, { merge: true });

    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      console.error("deleteMyAccount:auth-delete-failed", {
        uid,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw new HttpsError(
        "failed-precondition",
        "Account deletion could not finish at the sign-in step. Please try again in a moment."
      );
    }

    console.log("deleteMyAccount:complete", { uid, deletedHouseholds });
    return {
      ok: true,
      deletedHouseholds,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("deleteMyAccount:unhandled", {
      uid,
      code: error?.code || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw new HttpsError("internal", "Could not delete your account right now.");
  }
});
