import { loadUserSettings, loadWorkspaceSettings, saveUserSettings, saveWorkspaceSettings } from "../firebase";
import { normalizeIncomeEntries, isSystemIncomeSource } from "../utils/budgetUtils";
import { canUseFeature, getUpgradeMessage } from "../utils/planLimits";

export default function useBackup({
  user,
  isLocalUser,
  records,
  income,
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
}) {
  const exportBackup = async () => {
    if (!canUseFeature(subscription, "export")) {
      showToast(getUpgradeMessage("export"));
      openBillingPage();
      return;
    }
    const confirmed = await askConfirm({
      title: "Export Backup",
      message: "This backup includes your personal and financial data in plain text. Only save it somewhere private that you trust.",
      confirmLabel: "Download backup",
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
        settings,
        personalSettings,
        records,
        income,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-backup-${monthKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded");
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
        title: "Restore Backup",
        message: "This will overwrite your current settings and categories.",
        confirmLabel: "Restore",
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
      showToast("Backup restored  -  reloading...");
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

  return { exportBackup, importBackup };
}
