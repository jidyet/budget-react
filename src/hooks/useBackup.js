import { useState } from "react";
import { loadUserSettings, loadWorkspaceSettings, saveUserSettings, saveWorkspaceSettings } from "../firebase";
import { normalizeIncomeEntries, isSystemIncomeSource } from "../utils/budgetUtils";
import { canUseFeature, getUpgradeMessage } from "../utils/planLimits";

export default function useBackup({
  user,
  isLocalUser,
  monthKey,
  workspaceScope,
  localData,
  setBackupLoading,
  setCustomAccounts,
  setUserCategories,
  setIncomeTemplates,
  setDeletedAccountIds,
  setAccountOverrides,
  setAssets,
  setPaySchedule,
  subscription,
  showToast,
  askConfirm,
  openBillingPage,
  canExportAdminBackup = false,
  buildAdminBackupPayload = null,
}) {
  const [adminBackupLoading, setAdminBackupLoading] = useState(false);

  const downloadJson = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });

    // Support older Microsoft browsers when available.
    if (typeof window !== "undefined" && typeof window.navigator?.msSaveOrOpenBlob === "function") {
      window.navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();

    // Keep the blob URL alive briefly so mobile browsers/webviews can finish the download.
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  };

  const sanitizeFilenamePart = (value, fallback = "backup") =>
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;

  const exportBackup = async () => {
    if (!canUseFeature(subscription, "export")) {
      showToast(getUpgradeMessage("export"));
      openBillingPage();
      return;
    }
    const confirmed = await askConfirm({
      title: "Export Settings Backup",
      message: "This backup includes your settings and personal preferences in plain text. Save it somewhere private that you trust.",
      confirmLabel: "Download settings backup",
      tone: "danger",
    });
    if (!confirmed) return;
    setBackupLoading(true);
    try {
      let settings;
      let personalSettings = {};
      if (user && (user.isLocal || isLocalUser)) {
        settings = localData.loadSettings(user.uid);
        personalSettings = { paySchedule: settings?.paySchedule || null };
      } else {
        const [workspaceSettings, userSettings] = await Promise.all([
          loadWorkspaceSettings(user?.uid || "local", workspaceScope),
          user?.uid ? loadUserSettings(user.uid) : Promise.resolve({}),
        ]);
        settings = workspaceSettings;
        personalSettings = {
          paySchedule: userSettings?.paySchedule || workspaceSettings?.paySchedule || null,
        };
      }
      const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        user: user?.email || "local",
        scope: "settings-only",
        settings,
        personalSettings,
      };
      downloadJson(backup, `tracktozero-settings-${monthKey}.json`);
      showToast("Settings backup downloaded");
    } catch (e) {
      showToast("Backup failed: " + e.message, "error");
    } finally {
      setBackupLoading(false);
    }
  };

  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.settings) throw new Error("Invalid backup file");
      const confirmed = await askConfirm({
        title: "Restore Settings Backup",
        message: "This will overwrite your current settings, categories, and personal preferences. Bills, payment history, and month records are not changed by this restore.",
        confirmLabel: "Restore settings",
        tone: "danger",
      });
      if (!confirmed) return;
      if (user) {
        if (user.isLocal || isLocalUser) {
          localData.saveSettings(user.uid, {
            ...data.settings,
            ...(data.personalSettings?.paySchedule ? { paySchedule: data.personalSettings.paySchedule } : {}),
          });
        } else {
          await saveWorkspaceSettings(user.uid, data.settings, workspaceScope);
          if (data.personalSettings?.paySchedule) {
            await saveUserSettings(user.uid, { paySchedule: data.personalSettings.paySchedule });
          }
        }
      }
      showToast("Settings restored");
      setCustomAccounts(Array.isArray(data.settings?.customAccounts) ? data.settings.customAccounts : []);
      setUserCategories(Array.isArray(data.settings?.userCategories) ? data.settings.userCategories : []);
      setIncomeTemplates(
        normalizeIncomeEntries(Array.isArray(data.settings?.incomeTemplates) ? data.settings.incomeTemplates : [])
          .filter((entry) => !isSystemIncomeSource(entry.src))
      );
      setDeletedAccountIds(Array.isArray(data.settings?.deletedAccountIds) ? data.settings.deletedAccountIds : []);
      setAccountOverrides(data.settings?.accountOverrides && typeof data.settings.accountOverrides === "object" ? data.settings.accountOverrides : {});
      setAssets(Number(data.settings?.assets || 0));
      if (data.personalSettings?.paySchedule && typeof setPaySchedule === "function") {
        setPaySchedule(data.personalSettings.paySchedule);
      }
    } catch (e) {
      showToast("Restore failed: " + e.message, "error");
    }
  };

  const exportAdminBackup = async () => {
    if (!canExportAdminBackup || typeof buildAdminBackupPayload !== "function") {
      showToast("Admin backup is not available here.", "error");
      return;
    }
    const confirmed = await askConfirm({
      title: "Export Full Workspace Backup",
      message: "This admin backup includes settings, the selected month's records, income, and payoff plans in plain text. Save it somewhere private that you trust.",
      confirmLabel: "Download full backup",
      tone: "danger",
    });
    if (!confirmed) return;
    setAdminBackupLoading(true);
    try {
      const payload = await buildAdminBackupPayload();
      const modeLabel = payload?.workspaceMode === "household"
        ? sanitizeFilenamePart(payload?.householdName || "household")
        : sanitizeFilenamePart(user?.email?.split?.("@")?.[0] || "solo");
      const selectedMonthKey = payload?.monthKey || monthKey;
      const backup = {
        version: 3,
        exportedAt: new Date().toISOString(),
        user: user?.email || "local",
        ...payload,
      };
      downloadJson(backup, `tracktozero-backup-${modeLabel}-${selectedMonthKey}.json`);
      showToast("Admin backup downloaded");
    } catch (e) {
      showToast("Admin backup failed: " + e.message, "error");
    } finally {
      setAdminBackupLoading(false);
    }
  };

  return { exportBackup, importBackup, exportAdminBackup, adminBackupLoading };
}
