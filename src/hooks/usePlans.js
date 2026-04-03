import { useState, useEffect, useRef, useCallback } from "react";
import { loadPayoffPlans, upsertPayoffPlan, deletePayoffPlan } from "../firebase";
import { MONTHS } from "../data/mockAccounts";

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

  useEffect(() => {
    planNameRef.current = planName;
    planItemsRef.current = planItems;
    planOwnerRef.current = planOwner;
    planStrategyRef.current = planStrategy;
    planMonthlyExtraRef.current = planMonthlyExtra;
  }, [planName, planItems, planOwner, planStrategy, planMonthlyExtra]);

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
    return scoped.map((a) => ({
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
  }, [user, isLocalUser, allAccts, deletedAccountIds, workspaceScope, showToast, localData]);

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
    removePlan,
    createPlanDraft,
    buildDefaultPlanItems,
  };
};

export default usePlans;
