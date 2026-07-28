import { useEffect, useState } from "react";
import { loadUserSettings, loadWorkspaceSettings, saveUserSettings, saveWorkspaceSettings } from "../firebase";
import { normalizeCurrencyCode } from "../utils/budgetUtils";

/**
 * useSettings
 *
 * Owns: assets, monthNote/monthNoteSaved, onboarding state, backupLoading.
 * Effects: month note loader (reloads per monthKey).
 * Functions: saveMonthNote, saveAssets, completeOnboarding.
 *
 * exportBackup / importBackup stay in App.jsx for now — they depend on
 * records/income (from useWorkspaceRecords) and account setters (from
 * useAccounts). They will move to a modal/overlay layer in Phase 1f.
 */
export default function useSettings({
  user,
  isLocalUser,
  workspaceScope,
  localData,
  monthKey,
  showToast,
}) {
  const [assets, setAssets] = useState(0);
  const [monthNote, setMonthNote] = useState("");
  const [monthNoteSaved, setMonthNoteSaved] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0); // 0 = not shown
  const [onboardingDone, setOnboardingDone] = useState(true); // default true, flip on detection
  const [backupLoading, setBackupLoading] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("USD");

  // --- Month note loader (reloads when month or workspace changes) ---
  useEffect(() => {
    let alive = true;
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      const s = localData.loadSettings(user.uid);
      queueMicrotask(() => {
        if (!alive) return;
        setMonthNote(s?.monthNotes?.[monthKey] || "");
        setMonthNoteSaved(false);
      });
      return () => { alive = false; };
    }
    loadWorkspaceSettings(user.uid, workspaceScope).then((s) => {
      if (!alive) return;
      setMonthNote(s?.monthNotes?.[monthKey] || "");
      setMonthNoteSaved(false);
    }).catch((e) => {
      console.error("load month note error", e);
    });
    return () => { alive = false; };
  }, [monthKey, user, isLocalUser, localData, workspaceScope]);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setCurrencyCode("USD"));
      return;
    }
    if (user.isLocal || isLocalUser) {
      const settings = localData.loadSettings(user.uid) || {};
      queueMicrotask(() => setCurrencyCode(normalizeCurrencyCode(settings?.currencyCode)));
      return;
    }
    loadUserSettings(user.uid).then((settings) => {
      setCurrencyCode(normalizeCurrencyCode(settings?.currencyCode));
    }).catch((e) => {
      console.error("load currency preference error", e);
      setCurrencyCode("USD");
    });
  }, [user, isLocalUser, localData]);

  // --- saveMonthNote ---
  const saveMonthNote = async (note) => {
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      const existing = localData.loadSettings(user.uid);
      localData.saveSettings(user.uid, {
        ...existing,
        monthNotes: { ...(existing?.monthNotes || {}), [monthKey]: note },
      });
      setMonthNoteSaved(true);
      setTimeout(() => setMonthNoteSaved(false), 2000);
      return;
    }
    try {
      const existing = await loadWorkspaceSettings(user.uid, workspaceScope);
      await saveWorkspaceSettings(user.uid, {
        ...existing,
        monthNotes: { ...(existing?.monthNotes || {}), [monthKey]: note },
      }, workspaceScope);
      setMonthNoteSaved(true);
      setTimeout(() => setMonthNoteSaved(false), 2000);
    } catch (e) {
      console.error("saveMonthNote error", e);
      showToast("Could not save note", "error");
    }
  };

  // --- saveAssets ---
  const saveAssets = async (val) => {
    if (!user) return;
    const numVal = Number(val) || 0;
    if (user.isLocal || isLocalUser) {
      const existing = localData.loadSettings(user.uid);
      localData.saveSettings(user.uid, { ...existing, assets: numVal });
      setAssets(numVal);
      showToast("Assets saved");
      return;
    }
    const existing = await loadWorkspaceSettings(user.uid, workspaceScope) || {};
    await saveWorkspaceSettings(user.uid, { ...existing, assets: numVal }, workspaceScope);
    setAssets(numVal);
    showToast("Assets saved");
  };

  const saveCurrencyPreference = async (nextCode) => {
    if (!user) return false;
    const normalized = normalizeCurrencyCode(nextCode);
    if (user.isLocal || isLocalUser) {
      const existing = localData.loadSettings(user.uid) || {};
      localData.saveSettings(user.uid, { ...existing, currencyCode: normalized });
      setCurrencyCode(normalized);
      showToast(`Currency set to ${normalized}`);
      return true;
    }
    try {
      const existing = await loadUserSettings(user.uid) || {};
      await saveUserSettings(user.uid, { ...existing, currencyCode: normalized });
      setCurrencyCode(normalized);
      showToast(`Currency set to ${normalized}`);
      return true;
    } catch (e) {
      console.error("saveCurrencyPreference error", e);
      showToast("Could not save currency", "error");
      return false;
    }
  };

  // --- completeOnboarding ---
  const completeOnboarding = async () => {
    setOnboardingStep(0);
    setOnboardingDone(true);
    if (user) {
      if (user.isLocal || isLocalUser) {
        const existing = localData.loadSettings(user.uid);
        localData.saveSettings(user.uid, { ...existing, onboardingDone: true });
        return;
      }
      const existing = await loadUserSettings(user.uid) || {};
      await saveUserSettings(user.uid, { ...existing, onboardingDone: true });
    }
  };

  return {
    assets, setAssets,
    monthNote, setMonthNote,
    monthNoteSaved, setMonthNoteSaved,
    onboardingStep, setOnboardingStep,
    onboardingDone, setOnboardingDone,
    backupLoading, setBackupLoading,
    currencyCode, setCurrencyCode,
    saveMonthNote,
    saveAssets,
    saveCurrencyPreference,
    completeOnboarding,
  };
}
