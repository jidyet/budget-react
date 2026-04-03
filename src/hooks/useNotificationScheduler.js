import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
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
}) {
  const isNativeApp = isNativePlatform();
  const [notifPermission, setNotifPermission] = useState("default");
  const activitySeededRef = useRef(false);

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

  // Web notifications
  useEffect(() => {
    if (!reminderPreferences.dueSoon || notifPermission !== "granted" || isNativeApp || typeof Notification === "undefined") return;
    const upcoming = allAccts.filter((a) => !a.is_paid && a.d_left !== null && a.d_left >= 0 && a.d_left <= 3);
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
    const upcoming = allAccts.filter((a) => !a.is_paid && a.d_left !== null && a.d_left >= 0 && a.d_left <= 2);
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
  }, [activeHouseholdId, currentUserId]);

  useEffect(() => {
    if (!activeHouseholdId || !reminderPreferences.householdUpdates || notifPermission !== "granted") return undefined;

    const sendActivityNotification = async (item) => {
      const notificationTitle = item?.title || "Household updated";
      const notificationBody = item?.detail || "Someone moved things forward.";

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
        const perm = await LocalNotifications.requestPermissions();
        const next = perm.display || "default";
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
