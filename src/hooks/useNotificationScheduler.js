import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { removePushDevice, savePushDevice } from "../firebase";
import { isBillOpenThisCycle } from "../services/billModel";
import { fx } from "../utils/budgetUtils";
import { canUseFeature, getUpgradeMessage } from "../utils/planLimits";
import { subscribeFormattedHouseholdActivity } from "../services/householdActivityService";

const isNativePlatform = () =>
  typeof window !== "undefined" && Capacitor.isNativePlatform();

async function showWebNotification(title, options = {}) {
  if (typeof window === "undefined") return false;
  try {
    const serviceWorkerReady =
      navigator.serviceWorker && typeof navigator.serviceWorker.ready?.then === "function"
        ? navigator.serviceWorker.ready
        : null;

    if (serviceWorkerReady) {
      const registration = await serviceWorkerReady;
      if (registration && typeof registration.showNotification === "function") {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch (error) {
    console.error("service worker web notification error", error);
  }

  if (typeof Notification === "function") {
    try {
      new Notification(title, options);
      return true;
    } catch (error) {
      console.error("fallback web notification error", error);
    }
  }

  return false;
}

function reminderStampKey(scope, id) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `budget_reminder_${scope}_${id}_${stamp}`;
}

function shouldDispatchReminder(scope, id) {
  if (typeof window === "undefined") return true;
  const key = reminderStampKey(scope, id);
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, "1");
  return true;
}

function accountReminderId(accountId, kind) {
  const seed = `${accountId}-${kind}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash * 31) + seed.charCodeAt(i)) % 2147480000;
  return Math.max(1, hash);
}

function getClientDeviceId() {
  if (typeof window === "undefined") return "server";
  const key = "tracktozero_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function buildBillActivityNotification(entry = {}) {
  const type = String(entry?.metadata?.type || "");
  const actor = String(entry?.userName || "Someone");
  const billName = String(entry?.metadata?.billName || "").trim();

  switch (type) {
    case "bill.owner_changed":
      return {
        title: `${actor} reassigned ${billName || "a bill"}`,
        body: billName ? `${billName} now has a different owner.` : "A bill owner changed in your plan.",
      };
    case "bill.monthly_covered":
      return {
        title: `${billName || "A monthly bill"} is covered`,
        body: `${actor} marked it covered for this month.`,
      };
    case "bill.marked_paid":
      return {
        title: `${actor} updated ${billName || "a bill"}`,
        body: billName ? `${billName} was marked paid.` : "A bill was marked paid.",
      };
    case "bill.completed":
      return {
        title: `${billName || "A bill"} is fully paid`,
        body: `${actor} just cleared it from the plan.`,
      };
    case "bill.marked_unpaid":
      return {
        title: `${actor} reopened ${billName || "a bill"}`,
        body: billName ? `${billName} is back on your list.` : "A bill was marked unpaid again.",
      };
    case "bill.deleted":
      return {
        title: `${actor} removed ${billName || "a bill"}`,
        body: "Open the app to review the latest bill list.",
      };
    case "bill.created":
      return {
        title: `${billName || "A bill"} was added`,
        body: `${actor} added it to the plan.`,
      };
    case "bill.updated":
      return {
        title: `${actor} updated ${billName || "a bill"}`,
        body: "Open the app to review the latest details.",
      };
    default:
      return {
        title: entry?.action || "Bill updated",
        body: billName ? `${billName} changed in your plan.` : "Open the app to see what changed.",
      };
  }
}

export default function useNotificationScheduler({
  reminderPreferences,
  allAccts,
  activeHouseholdId,
  currentUserId,
  selMonth,
  selYear,
  subscription,
  showToast,
  openBillingPage,
  billActivity = [],
}) {
  const isNativeApp = isNativePlatform();
  const [notifPermission, setNotifPermission] = useState("default");
  const activitySeededRef = useRef(false);
  const billActivitySeededRef = useRef(false);
  const pushTokenRef = useRef("");
  const pushDeviceIdRef = useRef(getClientDeviceId());

  useEffect(() => {
    let alive = true;
    const syncNotificationPermission = async () => {
      if (typeof window === "undefined") return;
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await LocalNotifications.checkPermissions();
          if (alive) setNotifPermission(perm.display || "default");
        } catch {
          if (alive) setNotifPermission("default");
        }
        return;
      }
      if (typeof Notification !== "undefined") {
        setNotifPermission(Notification.permission);
        return;
      }
      setNotifPermission("unsupported");
    };
    syncNotificationPermission();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isNativeApp || notifPermission !== "granted" || !currentUserId) return undefined;

    let active = true;
    const persistPushDevice = async (token) => {
      if (!token || !currentUserId) return;
      try {
        await savePushDevice(currentUserId, pushDeviceIdRef.current, {
          token,
          platform: Capacitor.getPlatform(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          activeHouseholdId: String(activeHouseholdId || ""),
          reminderPreferences,
        });
      } catch (error) {
        console.error("save push device error", error);
      }
    };

    const registerNativePush = async () => {
      try {
        const permissions = await PushNotifications.requestPermissions();
        if ((permissions.receive || "granted") !== "granted") return;

        const tokenListener = await PushNotifications.addListener("registration", (token) => {
          if (!active) return;
          pushTokenRef.current = String(token?.value || "");
          persistPushDevice(pushTokenRef.current);
        });
        const errorListener = await PushNotifications.addListener("registrationError", (error) => {
          console.error("push registration error", error);
        });

        await PushNotifications.register();

        return () => {
          tokenListener?.remove?.();
          errorListener?.remove?.();
        };
      } catch (error) {
        console.error("native push setup error", error);
        return undefined;
      }
    };

    let cleanup;
    registerNativePush().then((nextCleanup) => {
      cleanup = nextCleanup;
      if (pushTokenRef.current) persistPushDevice(pushTokenRef.current);
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [activeHouseholdId, currentUserId, isNativeApp, notifPermission, reminderPreferences]);

  useEffect(() => {
    if (!isNativeApp || !currentUserId || notifPermission === "granted" || !pushDeviceIdRef.current) return;
    removePushDevice(currentUserId, pushDeviceIdRef.current).catch((error) =>
      console.error("remove push device error", error)
    );
  }, [currentUserId, isNativeApp, notifPermission]);

  // Web notifications
  useEffect(() => {
    if (!reminderPreferences.dueSoon || notifPermission !== "granted" || isNativeApp || typeof Notification === "undefined") return;
    const upcoming = allAccts.filter((a) => isBillOpenThisCycle(a) && a.d_left !== null && a.d_left >= 0 && a.d_left <= 3);
    upcoming.forEach((a) => {
      if (a.d_left === 0) {
        if (!shouldDispatchReminder("web-today", a.id)) return;
        showWebNotification(`${a.name} due today`, {
          body: `Minimum payment: ${fx(a.min_due_v || a.budgeted_min || 0)}`,
          tag: `bill-${a.id}-today`,
        });
      } else if (a.d_left === 1) {
        if (!shouldDispatchReminder("web-tomorrow", a.id)) return;
        showWebNotification(`${a.name} due tomorrow`, {
          body: `Minimum payment: ${fx(a.min_due_v || a.budgeted_min || 0)}`,
          tag: `bill-${a.id}-tomorrow`,
        });
      }
    });
  }, [allAccts, isNativeApp, notifPermission, reminderPreferences.dueSoon]);

  // Native notifications
  useEffect(() => {
    if (!reminderPreferences.dueSoon || !isNativeApp || notifPermission !== "granted") return;
    const upcoming = allAccts.filter((a) => isBillOpenThisCycle(a) && a.d_left !== null && a.d_left >= 0 && a.d_left <= 2);
    if (!upcoming.length) return;

    const syncNativeReminders = async () => {
      try {
        const now = Date.now();
        const notifications = [];
        const cancelIds = [];
        upcoming.forEach((a) => {
          const amount = fx(a.min_due_v || a.budgeted_min || 0);
          const dueAt = new Date(selYear, selMonth - 1, a.due_day || 1, 9, 0, 0, 0);
          const reminderAt = new Date(dueAt);
          reminderAt.setDate(reminderAt.getDate() - 1);
          const tomorrowId = accountReminderId(a.id, "tomorrow");
          const todayId = accountReminderId(a.id, "today");
          cancelIds.push({ id: tomorrowId }, { id: todayId });

          if (a.d_left === 0) {
            if (shouldDispatchReminder("native-today", a.id)) {
              notifications.push({
                id: todayId,
                title: `${a.name} due today`,
                body: `Minimum payment: ${amount}`,
                schedule: { at: new Date(now + 4000), allowWhileIdle: true },
              });
            }
            return;
          }

          if (reminderAt.getTime() > now + 60000) {
            notifications.push({
              id: tomorrowId,
              title: `${a.name} due tomorrow`,
              body: `Minimum payment: ${amount}`,
              schedule: { at: reminderAt, allowWhileIdle: true },
            });
          }
          if (dueAt.getTime() > now + 60000) {
            notifications.push({
              id: todayId,
              title: `${a.name} due today`,
              body: `Minimum payment: ${amount}`,
              schedule: { at: dueAt, allowWhileIdle: true },
            });
          }
        });

        if (cancelIds.length) await LocalNotifications.cancel({ notifications: cancelIds });
        if (notifications.length) await LocalNotifications.schedule({ notifications });
      } catch (e) {
        console.error("native reminder scheduling error", e);
      }
    };
    syncNativeReminders();
  }, [allAccts, isNativeApp, notifPermission, reminderPreferences.dueSoon, selMonth, selYear]);

  useEffect(() => {
    activitySeededRef.current = false;
    billActivitySeededRef.current = false;
  }, [activeHouseholdId, currentUserId]);

  useEffect(() => {
    if (!reminderPreferences.householdUpdates || notifPermission !== "granted") return;
    const latest = Array.isArray(billActivity) ? billActivity[0] : null;
    if (!latest?.id) return;
    if (!billActivitySeededRef.current) {
      billActivitySeededRef.current = true;
      return;
    }
    const dedupeKey = `budget_bill_activity_${currentUserId}_${latest.id}`;
    if (typeof window !== "undefined" && localStorage.getItem(dedupeKey)) return;
    if (typeof window !== "undefined") localStorage.setItem(dedupeKey, "1");
    const { title, body } = buildBillActivityNotification(latest);
    if (isNativeApp) {
      LocalNotifications.schedule({
        notifications: [{
          id: accountReminderId(latest.id, "bill-activity"),
          title,
          body,
          schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        }],
      }).catch((error) => console.error("bill activity native notification error", error));
      return;
    }
    showWebNotification(title, {
      body,
      tag: `bill-activity-${latest.id}`,
    }).catch((error) => console.error("bill activity web notification error", error));
  }, [billActivity, currentUserId, isNativeApp, notifPermission, reminderPreferences.householdUpdates]);

  useEffect(() => {
    if (!activeHouseholdId || !reminderPreferences.householdUpdates || notifPermission !== "granted") return undefined;

    const sendActivityNotification = async (item) => {
      const notificationTitle = item?.title || "Household updated";
      const notificationBody = item?.detail || "Open the app to see what changed.";

      if (isNativeApp) {
        try {
          await LocalNotifications.schedule({
            notifications: [{
              id: accountReminderId(item?.id || Date.now(), "activity"),
              title: notificationTitle,
              body: notificationBody,
              schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
            }],
          });
        } catch (error) {
          console.error("household activity native notification error", error);
        }
        return;
      }

      await showWebNotification(notificationTitle, {
        body: notificationBody,
        tag: `household-activity-${item?.id || Date.now()}`,
      });
    };

    const unsub = subscribeFormattedHouseholdActivity(activeHouseholdId, (items = []) => {
      const latest = Array.isArray(items) ? items[0] : null;
      if (!latest?.id) return;
      if (!activitySeededRef.current) {
        activitySeededRef.current = true;
        return;
      }
      if (String(latest?.raw?.actorUid || "") === String(currentUserId || "")) return;
      const dedupeKey = `budget_household_activity_${activeHouseholdId}_${latest.id}`;
      if (typeof window !== "undefined" && localStorage.getItem(dedupeKey)) return;
      if (typeof window !== "undefined") localStorage.setItem(dedupeKey, "1");
      sendActivityNotification(latest).catch((err) =>
        console.error("household activity notification error", err)
      );
    }, 8);

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [activeHouseholdId, currentUserId, isNativeApp, notifPermission, reminderPreferences.householdUpdates]);

  const requestBillReminderPermission = async () => {
    if (!canUseFeature(subscription, "reminders")) {
      showToast(getUpgradeMessage("reminders"));
      openBillingPage();
      return;
    }
    try {
      if (isNativeApp) {
        const [localPerm, pushPerm] = await Promise.all([
          LocalNotifications.requestPermissions(),
          PushNotifications.requestPermissions(),
        ]);
        const next = localPerm.display || pushPerm.receive || "default";
        setNotifPermission(next);
        showToast(next === "granted" ? "Phone bill reminders enabled" : "Phone notifications are still blocked");
        return;
      }
      if (typeof Notification === "undefined") {
        setNotifPermission("unsupported");
        showToast("Notifications are not supported on this device");
        return;
      }
      const next = await Notification.requestPermission();
      setNotifPermission(next);
      showToast(next === "granted" ? "Browser bill reminders enabled" : "Browser notifications are blocked");
    } catch (e) {
      console.error("notification permission error", e);
      showToast("Unable to enable notifications right now");
    }
  };

  return { notifPermission, requestBillReminderPermission };
}
