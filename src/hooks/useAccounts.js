import { useEffect, useState } from "react";
import { loadUserSettings, saveUserSettings, loadWorkspaceSettings, saveWorkspaceSettings } from "../firebase";
import { CATEGORIES, MOCK_ACCOUNTS } from "../data/mockAccounts";
import {
  normalizeIncomeEntries,
  normalizeMonthInput,
  isSystemIncomeSource,
} from "../utils/budgetUtils";

const DEFAULT_PAY_SCHEDULE = { boaLabel: "Paycheck A", boaBase: 0, boaHolidayDelta: 0, eagleviewLabel: "Paycheck B", eagleviewBase: 0 };
const parsePaySchedule = (raw) =>
  raw && typeof raw === "object"
    ? { ...DEFAULT_PAY_SCHEDULE, ...raw }
    : DEFAULT_PAY_SCHEDULE;

/**
 * useAccounts
 *
 * Owns customAccounts, userCategories, deletedAccountIds, accountOverrides,
 * incomeTemplates state + all account CRUD and persistUserSettings.
 *
 * Cross-cutting deps (allAccts, updateRecord, buildAutoBalanceUpdates) that are
 * computed AFTER this hook in App.jsx are passed as mutable refs so they are
 * always current at function-call time, without requiring circular ordering.
 */
export default function useAccounts({
  user,
  isLocalUser,
  workspaceScope,
  localData,
  activeHouseholdId,
  defaultOwnerLabel,
  // Refs populated by App.jsx after their source computations
  allAcctsRef,               // ref to allAccts (baseAccounts merged with records)
  updateRecordRef,           // ref to updateRecord from useWorkspaceRecords
  buildAutoBalanceUpdatesRef,// ref to buildAutoBalanceUpdates from useWorkspaceRecords
  showToast,
  askConfirm,
  setAssets,                 // Phase 1e will own assets; for now assets lives in App
}) {
  const [customAccounts, setCustomAccounts] = useState([]);
  const [userCategories, setUserCategories] = useState([]);
  const [deletedAccountIds, setDeletedAccountIds] = useState([]);
  const [accountOverrides, setAccountOverrides] = useState({});
  const [incomeTemplates, setIncomeTemplates] = useState([]);
  const [paySchedule, setPaySchedule] = useState({
    boaLabel: "Paycheck A",
    boaBase: 0,
    boaHolidayDelta: 0,
    eagleviewLabel: "Paycheck B",
    eagleviewBase: 0,
  });
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editAcct, setEditAcct] = useState({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newAcct, setNewAcct] = useState({
    name: "",
    owner: "",
    bank: "",
    category: "CREDIT CARDS",
    apr: "",
    promoApr: "",
    promoUntil: "",
    aprAfterPromo: "",
    interest_type: "variable_apr",
    min: "",
    bal: "",
    due: "",
  });
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);

  // Compute all categories on-demand using current userCategories + allAccts.
  // Using allAcctsRef (not state) means this always reads the latest value at
  // call time without requiring a re-render dependency.
  const getCategories = () =>
    Array.from(
      new Set([
        ...CATEGORIES,
        ...userCategories,
        ...(allAcctsRef?.current || []).map((a) => a.category),
      ])
    ).filter(Boolean);

  // --- Reset on user/mode change ---
  useEffect(() => {
    queueMicrotask(() => {
      setCustomAccounts([]);
      setUserCategories([]);
      setDeletedAccountIds([]);
      setAccountOverrides({});
      setIncomeTemplates([]);
      setPaySchedule(DEFAULT_PAY_SCHEDULE);
    });
  }, [user?.uid, isLocalUser]);

  // --- Load settings ---
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user) {
        queueMicrotask(() => {
          setCustomAccounts([]);
          setUserCategories([]);
          setIncomeTemplates([]);
        });
        return;
      }
      if (user.isLocal || isLocalUser) {
        const local = localData.loadSettings(user.uid);
        if (!alive) return;
        setCustomAccounts(Array.isArray(local.customAccounts) ? local.customAccounts : []);
        setUserCategories(Array.isArray(local.userCategories) ? local.userCategories : []);
        setIncomeTemplates(
          normalizeIncomeEntries(Array.isArray(local.incomeTemplates) ? local.incomeTemplates : [])
            .filter((e) => !isSystemIncomeSource(e.src))
        );
        setDeletedAccountIds(Array.isArray(local.deletedAccountIds) ? local.deletedAccountIds : []);
        setAccountOverrides(local.accountOverrides && typeof local.accountOverrides === "object" ? local.accountOverrides : {});
        setAssets(Number(local?.assets || 0));
        setPaySchedule(parsePaySchedule(local.paySchedule));
        return;
      }
      try {
        // Always load personal settings (paySchedule is personal, and it's a fallback source).
        // Also always load the household path directly when activeHouseholdId is known —
        // even if workspaceScope is null (e.g., brief solo mode after a rules deploy blip).
        // This ensures accounts are found regardless of which path they landed in.
        const householdScope = activeHouseholdId ? { householdId: activeHouseholdId } : workspaceScope;
        const [householdResult, personalResult] = await Promise.allSettled([
          loadWorkspaceSettings(user.uid, householdScope),
          loadUserSettings(user.uid),
        ]);
        if (!alive) return;
        if (householdResult.status === "rejected")
          console.error("loadWorkspaceSettings error:", householdResult.reason);
        if (personalResult.status === "rejected")
          console.error("loadUserSettings error:", personalResult.reason);
        const household = householdResult.status === "fulfilled" ? householdResult.value : {};
        const personal  = personalResult.status  === "fulfilled" ? personalResult.value  : {};

        // Shared households must not be auto-seeded from a member's personal data.
        // When a household is active, always use the household settings path, even if empty.
        const src = activeHouseholdId ? household : personal;

        setCustomAccounts(Array.isArray(src.customAccounts) ? src.customAccounts : []);
        setUserCategories(Array.isArray(src.userCategories) ? src.userCategories : []);
        setIncomeTemplates(
          normalizeIncomeEntries(Array.isArray(src.incomeTemplates) ? src.incomeTemplates : [])
            .filter((e) => !isSystemIncomeSource(e.src))
        );
        setDeletedAccountIds(Array.isArray(src.deletedAccountIds) ? src.deletedAccountIds : []);
        setAccountOverrides(src.accountOverrides && typeof src.accountOverrides === "object" ? src.accountOverrides : {});
        setAssets(Number(src.assets ?? 0));

        // paySchedule is always personal — never shared across household members.
        const personalPay = parsePaySchedule(personal.paySchedule);
        const householdPay = parsePaySchedule(household.paySchedule);
        const hasPersonalPay = personalPay.boaBase > 0 || personalPay.eagleviewBase > 0;
        const hasHouseholdPay = householdPay.boaBase > 0 || householdPay.eagleviewBase > 0;
        if (activeHouseholdId && !hasHouseholdPay && hasPersonalPay) {
          saveWorkspaceSettings(user.uid, { ...household, paySchedule: personalPay }, householdScope).catch(console.error);
        }
        const resolvedPaySchedule = activeHouseholdId
          ? (hasHouseholdPay ? householdPay : personalPay)
          : personalPay;
        setPaySchedule(resolvedPaySchedule);
      } catch (e) {
        console.error("loadUserSettings error", e);
      }
    };
    run();
    return () => { alive = false; };
  }, [user, isLocalUser, localData, setAssets, activeHouseholdId, workspaceScope]);

  // --- persistUserSettings ---
  const persistUserSettings = async (
    nextAccounts,
    nextCategories,
    nextIncomeTemplates = incomeTemplates,
    nextDeletedAccountIds = deletedAccountIds,
    nextAccountOverrides = accountOverrides,
    nextPaySchedule = paySchedule,
  ) => {
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      localData.saveSettings(user.uid, {
        customAccounts: nextAccounts,
        userCategories: nextCategories,
        incomeTemplates: nextIncomeTemplates,
        deletedAccountIds: nextDeletedAccountIds,
        accountOverrides: nextAccountOverrides,
        paySchedule: nextPaySchedule,
      });
      return;
    }
    try {
      await saveWorkspaceSettings(user.uid, {
        customAccounts: nextAccounts,
        userCategories: nextCategories,
        incomeTemplates: nextIncomeTemplates,
        deletedAccountIds: nextDeletedAccountIds,
        accountOverrides: nextAccountOverrides,
        paySchedule: nextPaySchedule,
      }, workspaceScope);
    } catch (e) {
      console.error("persistUserSettings error", e);
      showToast("Could not save custom settings", "error");
      throw e; // re-throw so callers can skip their success toast
    }
  };

  // --- addCategory ---
  const addCategory = async () => {
    const name = (newCategoryName || "").trim().toUpperCase();
    if (!name) return;
    const cats = getCategories();
    if (cats.includes(name)) {
      setNewCategoryName("");
      showToast("Category already exists", "error");
      return;
    }
    const nextCategories = [...userCategories, name];
    setUserCategories(nextCategories);
    setNewCategoryName("");
    try {
      await persistUserSettings(customAccounts, nextCategories);
      showToast("Category added");
    } catch { /* error toast shown by persistUserSettings */ }
  };

  // --- addCustomAccount ---
  const addCustomAccount = async () => {
    const name = (newAcct.name || "").trim();
    const category = (newAcct.category || "").trim().toUpperCase();
    if (!name || !category) {
      showToast("Name and category are required", "error");
      return;
    }
    const aprVal = newAcct.apr === "" ? 0 : Number(newAcct.apr);
    const promoAprVal = newAcct.promoApr === "" ? 0 : Number(newAcct.promoApr);
    const aprAfterPromoVal = newAcct.aprAfterPromo === "" ? aprVal : Number(newAcct.aprAfterPromo);
    const promoUntil = normalizeMonthInput(newAcct.promoUntil);
    if (!isFinite(aprVal) || aprVal < 0) { showToast("APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(promoAprVal) || promoAprVal < 0) { showToast("Promo APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(aprAfterPromoVal) || aprAfterPromoVal < 0) { showToast("APR after promo must be a number 0 or greater", "error"); return; }
    if (String(newAcct.promoUntil || "").trim() && !promoUntil) { showToast("Promo end must use YYYY-MM", "error"); return; }
    const id = crypto.randomUUID();
    const account = {
      id,
      name,
      owner: newAcct.owner || defaultOwnerLabel,
      bank: (newAcct.bank || name).trim(),
      category,
      apr: aprVal,
      promo_apr: promoAprVal,
      promo_until: promoUntil,
      apr_after_promo: aprAfterPromoVal,
      interest_type: newAcct.interest_type || "variable_apr",
      budgeted_min: Number(newAcct.min || 0),
      due_day: Number(newAcct.due || 0),
      starting_bal: Number(newAcct.bal || 0),
    };
    const cats = getCategories();
    const nextAccounts = [...customAccounts, account];
    const nextCategories = cats.includes(category) ? userCategories : [...userCategories, category];
    setCustomAccounts(nextAccounts);
    if (!cats.includes(category)) setUserCategories(nextCategories);
    setNewAcct({
      name: "",
      owner: newAcct.owner || defaultOwnerLabel,
      bank: "",
      category,
      apr: "",
      promoApr: "",
      promoUntil: "",
      aprAfterPromo: "",
      interest_type: newAcct.interest_type || "variable_apr",
      min: "",
      bal: "",
      due: "",
    });
    try {
      await persistUserSettings(nextAccounts, nextCategories, incomeTemplates, deletedAccountIds);
      showToast("Account added");
    } catch { /* error toast shown by persistUserSettings */ }
  };

  // --- deleteAccount ---
  const deleteAccount = async (account) => {
    const confirmed = await askConfirm({
      title: "Delete Bill",
      message: `Delete "${account.name}"? This can be restored only by re-adding it.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) return;
    const nextDeletedAccountIds = Array.from(new Set([...deletedAccountIds, account.id]));
    setDeletedAccountIds(nextDeletedAccountIds);
    try {
      await persistUserSettings(customAccounts, userCategories, incomeTemplates, nextDeletedAccountIds);
      showToast("Bill deleted");
    } catch { /* error toast shown by persistUserSettings */ }
  };

  // --- migrateLegacyAccounts ---
  const migrateLegacyAccounts = async () => {
    const existingIds = new Set(customAccounts.map((a) => a.id));
    const toMigrate = MOCK_ACCOUNTS.filter((a) => !existingIds.has(a.id));
    if (!toMigrate.length) {
      showToast("All bills already migrated", "info");
      return;
    }
    const migrated = toMigrate.map((a) => ({
      id: a.id,
      name: a.name,
      owner: a.owner || "",
      bank: a.bank || a.name,
      category: a.category,
      apr: a.apr ?? 0,
      promo_apr: 0,
      promo_until: null,
      apr_after_promo: a.apr ?? 0,
      budgeted_min: a.budgeted_min ?? 0,
      due_day: a.due_day ?? 0,
      starting_bal: a.starting_bal ?? 0,
    }));
    const nextAccounts = [...customAccounts, ...migrated];
    const nextCategories = [...new Set([...userCategories, ...migrated.map((a) => a.category)])];
    setCustomAccounts(nextAccounts);
    setUserCategories(nextCategories);
    try {
      await persistUserSettings(nextAccounts, nextCategories, incomeTemplates, deletedAccountIds);
      showToast(`Migrated ${migrated.length} bills to your profile`);
    } catch { /* error toast shown by persistUserSettings */ }
  };

  // --- startEditAccount ---
  const startEditAccount = (account) => {
    setEditingAccountId(account.id);
    setEditAcct({
      category: account.category || "",
      min: account.budgeted_min ?? "",
      due: account.due_day ?? "",
      balance: account.cur_bal ?? "",
      apr: account.apr ?? "",
      promoApr: account.promo_apr ?? "",
      promoUntil: normalizeMonthInput(account.promo_until),
      aprAfterPromo: account.apr_after_promo ?? account.apr ?? "",
      interest_type: account.interest_type || "variable_apr",
      paid: account.paid_v ?? "",
    });
  };

  // --- saveEditAccount ---
  // Uses allAcctsRef / updateRecordRef / buildAutoBalanceUpdatesRef which are
  // populated by App.jsx after their source memos/hooks are resolved. Calling
  // this function only happens via user interaction, so refs are always current.
  const saveEditAccount = async () => {
    const category = (editAcct.category || "").trim().toUpperCase();
    if (!category) { showToast("Category is required", "error"); return; }
    const aprVal = editAcct.apr === "" ? 0 : Number(editAcct.apr);
    const promoAprVal = editAcct.promoApr === "" ? 0 : Number(editAcct.promoApr);
    const aprAfterPromoVal = editAcct.aprAfterPromo === "" ? aprVal : Number(editAcct.aprAfterPromo);
    const promoUntil = normalizeMonthInput(editAcct.promoUntil);
    if (!isFinite(aprVal) || aprVal < 0) { showToast("APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(promoAprVal) || promoAprVal < 0) { showToast("Promo APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(aprAfterPromoVal) || aprAfterPromoVal < 0) { showToast("APR after promo must be a number 0 or greater", "error"); return; }
    if (String(editAcct.promoUntil || "").trim() && !promoUntil) { showToast("Promo end must use YYYY-MM", "error"); return; }
    const nextOverrides = {
      ...accountOverrides,
      [editingAccountId]: {
        ...(accountOverrides[editingAccountId] || {}),
        category,
        budgeted_min: editAcct.min === "" ? 0 : Number(editAcct.min),
        due_day: editAcct.due === "" ? 0 : Number(editAcct.due),
        apr: aprVal,
        promo_apr: promoAprVal,
        promo_until: promoUntil,
        apr_after_promo: aprAfterPromoVal,
        interest_type: editAcct.interest_type || "variable_apr",
      },
    };
    const cats = getCategories();
    const nextCategories = cats.includes(category) ? userCategories : [...userCategories, category];
    const allAccts = allAcctsRef?.current || [];
    const acctForSync = allAccts.find((a) => a.id === editingAccountId);
    try {
      const ur = updateRecordRef?.current;
      const bau = buildAutoBalanceUpdatesRef?.current;
      const settingsData = {
        customAccounts,
        userCategories: nextCategories,
        incomeTemplates,
        deletedAccountIds,
        accountOverrides: nextOverrides,
        paySchedule,
      };

      if (acctForSync && ur && bau) {
        const recordUpdates = {
          apr_v: aprVal,
          ...bau(acctForSync, {
            paid_v: editAcct.paid === "" || editAcct.paid == null ? Number(acctForSync.paid_v || 0) : (Number(editAcct.paid) || 0),
            min_due_v: editAcct.min === "" || editAcct.min == null ? Number(acctForSync.min_due_v ?? acctForSync.budgeted_min ?? 0) : (Number(editAcct.min) || 0),
            cur_bal: editAcct.balance === "" || editAcct.balance == null ? Number(acctForSync.cur_bal ?? acctForSync.starting_bal ?? 0) : (Number(editAcct.balance) || 0),
          }),
        };
        await ur(editingAccountId, recordUpdates, settingsData);
      } else {
        await persistUserSettings(customAccounts, nextCategories, incomeTemplates, deletedAccountIds, nextOverrides);
      }
      setAccountOverrides(nextOverrides);
      if (!cats.includes(category)) setUserCategories(nextCategories);
      setEditingAccountId(null);
      showToast("Bill updated");
    } catch { /* error toast shown by persistUserSettings */ }
  };

  return {
    customAccounts, setCustomAccounts,
    userCategories, setUserCategories,
    deletedAccountIds, setDeletedAccountIds,
    accountOverrides, setAccountOverrides,
    incomeTemplates, setIncomeTemplates,
    paySchedule, setPaySchedule,
    editingAccountId, setEditingAccountId,
    editAcct, setEditAcct,
    newCategoryName, setNewCategoryName,
    newAcct, setNewAcct,
    showAddAccountForm, setShowAddAccountForm,
    persistUserSettings,
    savePaySchedule: async (next) => {
      const merged = { ...paySchedule, ...next };
      setPaySchedule(merged);
      // paySchedule is personal — write to users/{uid}/meta/app regardless of workspace mode
      if (user && !(user.isLocal || isLocalUser)) {
        if (activeHouseholdId) {
          const existing = await loadWorkspaceSettings(user.uid, workspaceScope) || {};
          await saveWorkspaceSettings(user.uid, { ...existing, paySchedule: merged }, workspaceScope);
          return;
        }
        await saveUserSettings(user.uid, { paySchedule: merged });
      } else if (user && (user.isLocal || isLocalUser)) {
        const existing = localData.loadSettings(user.uid);
        localData.saveSettings(user.uid, { ...existing, paySchedule: merged });
      }
    },
    addCategory,
    addCustomAccount,
    deleteAccount,
    migrateLegacyAccounts,
    startEditAccount,
    saveEditAccount,
  };
}
