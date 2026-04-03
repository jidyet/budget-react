import { useCallback, useEffect, useState } from "react";
import { loadIncome, loadRecords, saveRecord, saveRecordAndSettings, subscribeRecords } from "../firebase";
import {
  AUTH_TIMEOUT_MS,
  defaultRecord,
  getBalanceBase,
  isSystemIncomeSource,
  normalizeAprDecimal,
  normalizeIncomeEntries,
} from "../utils/budgetUtils";

const localKey = (uid) => `budget_local_${uid}`;

/**
 * useWorkspaceRecords
 *
 * Owns the monthly Firestore records subscription, income loading,
 * and the core updateRecord / buildAutoBalanceUpdates helpers.
 *
 * Everything in this hook is scoped to a single (month, user, workspace).
 */
export default function useWorkspaceRecords({
  user,
  isLocalUser,
  workspaceScope,
  monthKey,
  recordSeedAccounts,
  localData,
  allAccounts, // [...starterTemplateAccounts, ...customAccounts] for updateRecord labels
}) {
  const [records, setRecords] = useState({});
  const [income, setIncome] = useState([]);
  const [incomeReceipts, setIncomeReceipts] = useState({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const getPrevMonthKey = useCallback((key) => {
    const [year, month] = String(key || "").split("-").map(Number);
    if (!year || !month) return "";
    const prevDate = new Date(year, month - 2, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const buildCarryoverRecord = useCallback((account, previousRecord) => {
    const prev = previousRecord || {};
    const carriedBalance = Number(
      prev.cur_bal ??
      prev.base_bal_v ??
      account?.starting_bal ??
      0
    ) || 0;
    return {
      ...defaultRecord(account),
      paid_v: 0,
      is_paid: false,
      purch_v: 0,
      interest_paid_v: 0,
      min_due_v: Number(prev.min_due_v ?? account?.budgeted_min ?? 0) || 0,
      base_bal_v: carriedBalance,
      cur_bal: carriedBalance,
      apr_v: normalizeAprDecimal(prev.apr_v ?? account?.apr ?? 0),
    };
  }, []);

  // --- Reset when user/mode changes ---
  useEffect(() => {
    queueMicrotask(() => {
      setRecords({});
      setIncome([]);
      setIncomeReceipts({});
    });
  }, [user?.uid, isLocalUser]);

  // --- Subscribe / load for current month ---
  useEffect(() => {
    if (!user) {
      queueMicrotask(() => {
        setRecords({});
        setIncome([]);
        setIncomeReceipts({});
        setLoading(false);
        setMounted(false);
      });
      return;
    }

    // Local user — read from localStorage
    if (user.isLocal || isLocalUser) {
      const lr = localData.loadRecords(user.uid, monthKey);
      const prevMonthKey = getPrevMonthKey(monthKey);
      const prevRecords = prevMonthKey ? (localData.loadRecords(user.uid, prevMonthKey) || {}) : {};
      const merged = {};
      recordSeedAccounts.forEach((a) => {
        const carryover = buildCarryoverRecord(a, prevRecords[String(a.id)]);
        const saved = lr[String(a.id)];
        merged[a.id] = saved ? { ...carryover, ...saved } : carryover;
      });
      queueMicrotask(() => setRecords(merged));

      const lim = localData.loadIncome(user.uid, monthKey);
      const normalized = Array.isArray(lim)
        ? { entries: lim, receipts: {} }
        : {
            entries: Array.isArray(lim?.entries) ? lim.entries : [],
            receipts: lim?.receipts && typeof lim.receipts === "object" ? lim.receipts : {},
          };
      queueMicrotask(() => {
        setIncome(
          normalizeIncomeEntries(normalized.entries)
            .filter((e) => !isSystemIncomeSource(e.src))
        );
        setIncomeReceipts(normalized.receipts);
        setMounted(true);
        setLoading(false);
      });
      return;
    }

    // Cloud user — subscribe to Firestore
    queueMicrotask(() => {
      setLoading(true);
      setIncomeReceipts({});
      setMounted(false);
    });

    let incomeAlive = true;
    let recordSubAlive = true;
    const prevMonthKey = getPrevMonthKey(monthKey);

    const startRecords = async () => {
      let prevRecords = {};
      try {
        if (prevMonthKey) {
          prevRecords = await loadRecords(user.uid, prevMonthKey, workspaceScope);
        }
      } catch (error) {
        console.error("load previous month records error:", error);
      }

      const unsubInner = subscribeRecords(user.uid, monthKey, (fbRecords) => {
        if (!recordSubAlive) return;
        const merged = {};
        recordSeedAccounts.forEach((a) => {
          const carryover = buildCarryoverRecord(a, prevRecords[String(a.id)]);
          const fbData = fbRecords[String(a.id)];
          merged[a.id] = fbData ? { ...carryover, ...fbData } : carryover;
        });
        setRecords(merged);
        setMounted(true);
        setLoading(false);
      }, workspaceScope);

      return unsubInner;
    };

    let unsub = () => {};
    startRecords().then((inner) => {
      unsub = inner || (() => {});
    }).catch((error) => {
      console.error("startRecords error:", error);
      setLoading(false);
      setMounted(true);
    });

    loadIncome(user.uid, monthKey, workspaceScope)
      .then((loadedIncome) => {
        if (!incomeAlive) return;
        const normalized = Array.isArray(loadedIncome)
          ? { entries: loadedIncome, receipts: {} }
          : {
              entries: Array.isArray(loadedIncome?.entries) ? loadedIncome.entries : [],
              receipts:
                loadedIncome?.receipts && typeof loadedIncome.receipts === "object"
                  ? loadedIncome.receipts
                  : {},
            };
        setIncome(
          normalizeIncomeEntries(normalized.entries)
            .filter((e) => !isSystemIncomeSource(e.src))
        );
        setIncomeReceipts(normalized.receipts);
      })
      .catch((e) => {
        if (!incomeAlive) return;
        console.error("loadIncome error:", e);
        setIncome([]);
        setIncomeReceipts({});
      });

    // Fallback in case the subscription is slow
    const fallback = setTimeout(() => {
      setLoading(false);
      setMounted(true);
    }, AUTH_TIMEOUT_MS);

    return () => {
      incomeAlive = false;
      clearTimeout(fallback);
      recordSubAlive = false;
      unsub();
    };
  // workspaceScope?.householdId — not the full object — so member-metadata snapshots
  // (same household, different array reference) don't restart the subscription.
  }, [monthKey, user, isLocalUser, workspaceScope, recordSeedAccounts, localData, getPrevMonthKey, buildCarryoverRecord]);

  // --- buildAutoBalanceUpdates ---
  const buildAutoBalanceUpdates = useCallback((account, nextVals) => {
    const nextPaid  = Number(nextVals?.paid_v  || 0);
    const nextPurch = Number(nextVals?.purch_v || 0);
    const nextMinDue = Number(nextVals?.min_due_v ?? account?.min_due_v ?? 0);
    const nextCurBal = Number(nextVals?.cur_bal ?? NaN);
    const baseBal = Number.isFinite(nextCurBal)
      ? Math.max(0, nextCurBal) + nextPaid - nextPurch
      : getBalanceBase(account);

    const result = {
      base_bal_v: baseBal,
      paid_v:     nextPaid,
      min_due_v:  nextMinDue,
      cur_bal:    Math.max(0, baseBal - nextPaid + nextPurch),
      purch_v:    nextPurch,
    };
    if (nextVals?.planned_v !== undefined) {
      result.planned_v = Number(nextVals.planned_v) || 0;
    }
    if (nextVals?.interest_paid_v !== undefined) {
      result.interest_paid_v = Number(nextVals.interest_paid_v) || 0;
    }
    if (nextVals?.apr_v !== undefined || nextVals?.apr_pct !== undefined) {
      const aprSource = nextVals?.apr_v !== undefined
        ? nextVals.apr_v
        : (Number(nextVals?.apr_pct || 0) / 100);
      result.apr_v = normalizeAprDecimal(aprSource);
    }
    return result;
  }, []);

  // --- updateRecord ---
  // Optional third argument `settingsData` enables atomic record+settings write.
  // Pass the full settings payload when an APR edit must stay in sync with accountOverrides.
  const updateRecord = useCallback(async (id, updates, settingsData = null) => {
    const source = (allAccounts.find((a) => a.id === id) || {
      budgeted_min: 0, starting_bal: 0, apr: 0, name: "", bank: "", owner: "", category: "",
    });
    const current = records[id] || defaultRecord(source);
    const updated  = { ...current, ...updates };

    const touchesBalance = ["base_bal_v", "cur_bal", "paid_v", "purch_v"]
      .some((key) => Object.prototype.hasOwnProperty.call(updates, key));

    if (touchesBalance) {
      const nextPaid  = Number(updated.paid_v  || 0);
      const nextPurch = Number(updated.purch_v || 0);
      const nextBase = Object.prototype.hasOwnProperty.call(updates, "base_bal_v")
        ? Number(updates.base_bal_v || 0)
        : Object.prototype.hasOwnProperty.call(updates, "cur_bal")
          ? Number(updates.cur_bal || 0) + nextPaid - nextPurch
          : getBalanceBase(current);
      updated.base_bal_v = nextBase;
      updated.cur_bal = Math.max(0, nextBase - nextPaid + nextPurch);
    }

    const labeled = {
      ...updated,
      account_id:       String(id),
      account_name:     source.name     || "",
      account_bank:     source.bank     || "",
      account_owner:    source.owner    || "",
      account_category: source.category || "",
    };

    setRecords((r) => ({ ...r, [id]: updated }));

    if (user && !(user.isLocal || isLocalUser)) {
      if (settingsData) {
        await saveRecordAndSettings(user.uid, monthKey, id, labeled, settingsData, workspaceScope);
      } else {
        await saveRecord(user.uid, monthKey, id, labeled, workspaceScope);
      }
    } else if (user && (user.isLocal || isLocalUser)) {
      // Write record to localStorage
      const data = localData.ensureLocalUserData(user.uid);
      if (!data.months) data.months = {};
      if (!data.months[monthKey]) data.months[monthKey] = { accounts: {}, income: [], uploads: [] };
      const accts = data.months[monthKey].accounts || {};
      accts[String(id)] = { ...(accts[String(id)] || {}), ...labeled };
      data.months[monthKey].accounts = accts;
      localStorage.setItem(localKey(user.uid), JSON.stringify(data));
      // Synchronously write settings if provided (localStorage is synchronous, so this is effectively atomic)
      if (settingsData) {
        localData.saveSettings(user.uid, settingsData);
      }
    }
  }, [records, monthKey, user, isLocalUser, workspaceScope, allAccounts, localData]);

  return {
    records, setRecords,
    income, setIncome,
    incomeReceipts, setIncomeReceipts,
    loading, setLoading,
    mounted, setMounted,
    updateRecord,
    buildAutoBalanceUpdates,
  };
}
