import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REMINDER_PREFERENCES,
  normalizeReminderPreferences,
} from "../services/notificationPreferenceService";

export default function useReminderPreferences({
  user,
  isLocalUser,
  localData,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  workspaceScope,
}) {
  const [preferences, setPreferences] = useState(DEFAULT_REMINDER_PREFERENCES);
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user) {
        if (!alive) return;
        setPreferences(DEFAULT_REMINDER_PREFERENCES);
        setPreferencesLoading(false);
        return;
      }

      if (user.isLocal || isLocalUser) {
        const settings = localData.loadSettings(user.uid) || {};
        if (!alive) return;
        setPreferences(normalizeReminderPreferences(settings.reminderPreferences));
        setPreferencesLoading(false);
        return;
      }

      try {
        const settings = await loadWorkspaceSettings(user.uid, workspaceScope);
        if (!alive) return;
        setPreferences(normalizeReminderPreferences(settings?.reminderPreferences));
      } catch (error) {
        console.error("load reminder preferences error", error);
        if (alive) setPreferences(DEFAULT_REMINDER_PREFERENCES);
      } finally {
        if (alive) setPreferencesLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [user, isLocalUser, localData, loadWorkspaceSettings, workspaceScope]);

  const savePreferences = useCallback(
    async (nextValue) => {
      if (!user) return;
      const normalized = normalizeReminderPreferences(nextValue);
      setPreferences(normalized);

      if (user.isLocal || isLocalUser) {
        const settings = localData.loadSettings(user.uid) || {};
        localData.saveSettings(user.uid, {
          ...settings,
          reminderPreferences: normalized,
        });
        return;
      }

      try {
        const settings = await loadWorkspaceSettings(user.uid, workspaceScope);
        await saveWorkspaceSettings(
          user.uid,
          {
            ...(settings || {}),
            reminderPreferences: normalized,
          },
          workspaceScope
        );
      } catch (error) {
        console.error("save reminder preferences error", error);
      }
    },
    [user, isLocalUser, localData, loadWorkspaceSettings, saveWorkspaceSettings, workspaceScope]
  );

  const patchPreferences = useCallback(
    async (patch) => {
      await savePreferences({ ...preferences, ...patch });
    },
    [preferences, savePreferences]
  );

  return {
    reminderPreferences: preferences,
    preferencesLoading,
    saveReminderPreferences: savePreferences,
    patchReminderPreferences: patchPreferences,
  };
}

