import { useState, useEffect, useRef, useCallback } from "react";
import { loadPayoffPlans, upsertPayoffPlan, deletePayoffPlan } from "../firebase";
import { MONTHS } from "../data/mockAccounts";
import { isMonthlyBill } from "../services/billModel";

/**
 * Manages payoff plan state, persistence, and CRUD.
 *
 * @param {object} deps
 * @param {object|null} deps.user
 * @param {boolean}     deps.isLocalUser
 * @param {string}      deps.activeHouseholdId
 * @param {string|null} deps.workspaceScope
 * @param {object}      deps.localData
 * @param {object[]}    deps.allAccts
 * @param {string[]}    deps.deletedAccountIds
 * @param {number}      deps.selMonth
 * @param {number}      deps.selYear
 * @param {Function}    deps.showToast
 */
const usePlans = ({
  user,
  isLocalUser,
  activeHouseholdId,
  workspaceScope,
  localData,
  allAccts,
  deletedAccountIds,
  selMonth,
  selYear,
  showToast,
  updateRecord = null,
}) => {
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planOwner, setPlanOwner] = useState("All");
  const [planStrategy, setPlanStrategy] = useState("avalanche");
  const [planMonthlyExtra, setPlanMonthlyExtra] = useState("0");
  const [planItems, setPlanItems] = useState({});
  const [whatIfExtra, setWhatIfExtra] = useState("0");
  const [showAllSimRows, setShowAllSimRows] = useState(false);
  const [planExpanded, setPlanExpanded] = useState({});
  const [showStrategyCompare, setShowStrategyCompare] = useState(false);
  const [goalDate, setGoalDate] = useState("");
  const [goalRequiredExtra, setGoalRequiredExtra] = useState(null);
  const whatIfExtraTimerRef = useRef(null);

  // Refs for values read inside effects/callbacks but that shouldn't re-trigger them
  const planNameRef = useRef(planName);
  const planItemsRef = useRef(planItems);
  const planOwnerRef = useRef(planOwner);
  const planStrategyRef = useRef(planStrategy);
  const planMonthlyExtraRef = useRef(planMonthlyExtra);
  const updateRecordRef = useRef(updateRecord);
  const allAcctsRef = useRef(allAccts);

  useEffect(() => {
    planNameRef.current = planName;
    planItemsRef.current = planItems;
    planOwnerRef.current = planOwner;
    planStrategyRef.current = planStrategy;
    planMonthlyExtraRef.current = planMonthlyExtra;
  }, [planName, planItems, planOwner, planStrategy, planMonthlyExtra]);

  useEffect(() => { updateRecordRef.current = updateRecord; }, [updateRecord]);
  useEffect(() => { allAcctsRef.current = allAccts; }, [allAccts]);

  // Load plans when user/workspace changes
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user) {
        setPlans([]);
        setPlanId("");
        return;
      }
      if (user.isLocal || isLocalUser) {
        const localPlans = localData.loadPlans(user.uid);
        if (alive) setPlans(localPlans);
        return;
      }
      try {
        const remotePlans = await loadPayoffPlans(user.uid, workspaceScope);
        if (alive) setPlans(remotePlans);
      } catch (e) {
        console.error("loadPayoffPlans error", e);
      }
    };
    run();
    return () => { alive = false; };
  }, [user, isLocalUser, activeHouseholdId, workspaceScope, localData]);

  // Sync active plan fields when plans list or selection changes.
  // Guard values (planName, planItems) are read via refs so they don't
  // re-trigger the effect and create a circular dependency loop.
  useEffect(() => {
    if (!plans.length) {
      queueMicrotask(() => setPlanId(""));
      return;
    }
    const currentName = planNameRef.current;
    const currentItems = planItemsRef.current;
    if (!planId && (currentName || Object.keys(currentItems || {}).length)) return;
    const selected = plans.find((p) => p.id === planId) || plans[0];
    queueMicrotask(() => {
      setPlanId(selected.id);
      setPlanName(selected.name || "");
      setPlanOwner(selected.owner || "All");
      setPlanStrategy(selected.strategy || "avalanche");
      setPlanMonthlyExtra(String(selected.monthly_extra ?? 0));
    });
    const itemMap = {};
    (selected.items || []).forEach((it) => {
      itemMap[String(it.account_id)] = {
        include: !!it.include,
        extra_payment: String(it.extra_payment ?? 0),
      };
    });
    queueMicrotask(() => setPlanItems(itemMap));
  }, [plans, planId]);

  const buildDefaultPlanItems = useCallback((owner, accounts) => {
    const scoped = owner === "All" ? accounts : accounts.filter((a) => a.owner === owner);
    const debtAccounts = scoped.filter((a) => !isMonthlyBill(a));
    return debtAccounts.map((a) => ({
      account_id: a.id,
      include: true,
      extra_payment: 0,
    }));
  }, []);

  const createPlanDraft = useCallback((opts = {}) => {
    const silent = !!opts.silent;
    const initialOwner = "All";
    const defaults = buildDefaultPlanItems(initialOwner, allAccts);
    const nextItems = {};
    defaults.forEach((item) => {
      nextItems[String(item.account_id)] = {
        include: true,
        extra_payment: "0",
      };
    });
    setPlanId("");
    setPlanName(`${MONTHS[selMonth - 1]} ${selYear} Draft`);
    setPlanOwner(initialOwner);
    setPlanStrategy("avalanche");
    setPlanMonthlyExtra("0");
    setWhatIfExtra("0");
    setPlanItems(nextItems);
    setShowAllSimRows(false);
    if (!silent) showToast("New draft ready");
  }, [allAccts, buildDefaultPlanItems, selMonth, selYear, showToast]);

  // Sync planned_v on each included account to min_due_v + plan extra_payment.
  // This makes the payoff plan actionable in the bill tracker — users just check off payments.
  // The simulation uses max(planned_v, min_due + extraMap) so there's no double-counting.
  const syncPlannedPayments = useCallback(async (items) => {
    const updateRecord = updateRecordRef.current;
    if (typeof updateRecord !== "function") return;
    const allAccts = allAcctsRef.current || [];
    await Promise.all(
      items
        .filter((item) => item.include)
        .map(async (item) => {
          const acct = allAccts.find((a) => String(a.id) === String(item.account_id));
          if (!acct) return;
          const minDue = Math.max(0, Number(acct.min_due_v || 0));
          const extra = Math.max(0, Number(item.extra_payment || 0));
          await updateRecord(String(acct.id), { planned_v: minDue + extra });
        })
    );
  }, []);

  const savePlan = useCallback(async (targetId = "", opts = {}) => {
    const silent = !!opts.silent;
    if (!user) return;
    // Read volatile plan state from refs so this callback doesn't need to be
    // recreated on every keystroke, preventing unnecessary downstream re-renders.
    const planOwner = planOwnerRef.current;
    const planItems = planItemsRef.current;
    const planName = planNameRef.current;
    const planStrategy = planStrategyRef.current;
    const planMonthlyExtra = planMonthlyExtraRef.current;

    const scoped = (planOwner === "All" ? allAccts : allAccts.filter((a) => a.owner === planOwner))
      .filter((a) => !deletedAccountIds.includes(a.id));
    const builtItems = scoped.map((a) => {
      const key = String(a.id);
      return {
        account_id: a.id,
        include: !!planItems[key]?.include,
        extra_payment: Number(planItems[key]?.extra_payment || 0),
      };
    });

    const payload = {
      name: (planName || "New Plan").trim(),
      owner: planOwner,
      strategy: planStrategy,
      monthly_extra: Number(planMonthlyExtra || 0),
      items: builtItems,
    };

    // Sync planned_v on included accounts (fire-and-forget; doesn't block the plan save)
    syncPlannedPayments(builtItems).catch((e) => console.warn("syncPlannedPayments error", e));

    if (user.isLocal || isLocalUser) {
      const id = localData.savePlan(user.uid, payload, targetId);
      const updated = localData.loadPlans(user.uid);
      setPlans(updated);
      setPlanId(id);
      if (!silent) showToast("Plan saved locally");
      return;
    }

    try {
      const id = await upsertPayoffPlan(user.uid, payload, targetId || null, workspaceScope);
      const updated = await loadPayoffPlans(user.uid, workspaceScope);
      setPlans(updated);
      setPlanId(id);
      if (!silent) showToast("Plan saved");
    } catch (e) {
      console.error("savePlan error", e);
      if (!silent) showToast("Plan save failed", "error");
    }
  }, [user, isLocalUser, allAccts, deletedAccountIds, workspaceScope, showToast, localData, syncPlannedPayments]);

  // Save a fully-formed payload directly (bypasses refs — safe to call immediately after setState)
  const saveRawPlan = useCallback(async (payload, targetId = "") => {
    if (!user) return null;
    // Sync planned_v for included accounts from the raw payload
    if (Array.isArray(payload?.items)) {
      syncPlannedPayments(payload.items).catch((e) => console.warn("syncPlannedPayments error", e));
    }
    if (user.isLocal || isLocalUser) {
      const id = localData.savePlan(user.uid, payload, targetId);
      const updated = localData.loadPlans(user.uid);
      setPlans(updated);
      setPlanId(id);
      showToast("Plan saved locally");
      return id;
    }
    try {
      const id = await upsertPayoffPlan(user.uid, payload, targetId || null, workspaceScope);
      const updated = await loadPayoffPlans(user.uid, workspaceScope);
      setPlans(updated);
      setPlanId(id);
      showToast("Plan saved");
      return id;
    } catch (e) {
      console.error("saveRawPlan error", e);
      showToast("Plan save failed", "error");
      return null;
    }
  }, [user, isLocalUser, workspaceScope, showToast, localData, syncPlannedPayments]);

  const removePlan = useCallback(async (targetId = "") => {
    if (!user || !targetId) return;
    if (user.isLocal || isLocalUser) {
      const updated = localData.deletePlan(user.uid, targetId);
      setPlans(updated);
      createPlanDraft({ silent: true });
      showToast("Plan deleted");
      return;
    }
    try {
      await deletePayoffPlan(user.uid, targetId, workspaceScope);
      const updated = await loadPayoffPlans(user.uid, workspaceScope);
      setPlans(updated);
      createPlanDraft({ silent: true });
      showToast("Plan deleted");
    } catch (e) {
      console.error("removePlan error", e);
      showToast("Could not delete plan", "error");
    }
  }, [user, isLocalUser, workspaceScope, createPlanDraft, showToast, localData]);

  return {
    plans, setPlans,
    planId, setPlanId,
    planName, setPlanName,
    planOwner, setPlanOwner,
    planStrategy, setPlanStrategy,
    planMonthlyExtra, setPlanMonthlyExtra,
    planItems, setPlanItems,
    whatIfExtra, setWhatIfExtra,
    showAllSimRows, setShowAllSimRows,
    planExpanded, setPlanExpanded,
    showStrategyCompare, setShowStrategyCompare,
    goalDate, setGoalDate,
    goalRequiredExtra, setGoalRequiredExtra,
    whatIfExtraTimerRef,
    savePlan,
    saveRawPlan,
    removePlan,
    createPlanDraft,
    buildDefaultPlanItems,
  };
};

export default usePlans;
