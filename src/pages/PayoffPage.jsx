import { useEffect, useState } from "react";
import ProviderMark from "../components/ProviderMark";
import GuidanceCard from "../components/ui/GuidanceCard";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import { fx, pct } from "../utils/budgetUtils";
import AICoachCard from "../components/ai/AICoachCard";
import {
  buildCoachState,
  summarizeCoachBillMix,
  buildCoachHouseholdSummary,
  buildCoachMonthKey,
  summarizeCoachAccounts,
  summarizeLargestBalances,
} from "../services/aiCoachPayload";
import { canAccessAICoach } from "../config/launchFlags";
import { getBillDisplayName } from "../services/billModel";

export default function PayoffPage(props) {
  const {
    mounted, c, isMobile, isTablet, allAccts, planOwner, setPlanOwner, planItems, setPlanItems,
    planMonthlyExtra, setPlanMonthlyExtra, whatIfExtra, setWhatIfExtra, planStrategy, setPlanStrategy,
    payoffSimulate, getEffectiveApr, setPlanId, setPlanName, planId, plans, planName,
    lblStyle, selStyle, inputStyle, savePlan, saveRawPlan, saveBtnStyle, buildDefaultPlanItems,
    selMonth, selYear, setPlanExpanded, planExpanded, goalDate, setGoalDate,
    setGoalRequiredExtra, showAllSimRows, setShowAllSimRows,
    MAX_SIMULATION_MONTHS, SIM_DISPLAY_ROWS, createPlanDraft, removePlan,
    launchFlags, founderAccount, workspaceMode, householdMembers,
  } = props;

  const [whatIfDraft, setWhatIfDraft] = useState(String(whatIfExtra || 0));
  const [goalDateDraft, setGoalDateDraft] = useState(goalDate || "");
  const [scenarioAccountId, setScenarioAccountId] = useState(""); // "" = All debts
  const [goalDebtId, setGoalDebtId] = useState(""); // "" = All included debts


  const owners = ["All", ...Array.from(new Set(allAccts.map((a) => a.owner))).filter(Boolean)];
  const scopedAccounts = planOwner === "All" ? allAccts : allAccts.filter((a) => a.owner === planOwner);
  const visibleRows = scopedAccounts.map((a) => {
    const key = String(a.id);
    return { ...a, include: !!planItems[key]?.include, extra: String(planItems[key]?.extra_payment ?? "0") };
  });
  const planGrouped = {};
  visibleRows.forEach((r) => {
    if (!planGrouped[r.category]) planGrouped[r.category] = [];
    planGrouped[r.category].push(r);
  });
  const planGroupKeys = Object.keys(planGrouped);
  const included = visibleRows.filter((r) => r.include);
  const extraMap = {};
  included.forEach((r) => { extraMap[r.id] = Number(r.extra || 0); });

  const scenarioAccounts = scopedAccounts.filter((a) => Number(a.cur_bal || 0) > 0.01);

  // "" = "All debts" — valid selection, don't auto-select first account
  useEffect(() => {
    if (!scenarioAccounts.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (scenarioAccountId) setScenarioAccountId("");
      return;
    }
    if (scenarioAccountId === "") return;
    const stillExists = scenarioAccounts.some((a) => String(a.id) === String(scenarioAccountId));
    if (!stillExists) setScenarioAccountId("");
  }, [scenarioAccounts, scenarioAccountId]);

  // Keep goalDebtId in sync with available accounts
  useEffect(() => {
    if (!goalDebtId) return;
    const stillExists = scenarioAccounts.some((a) => String(a.id) === goalDebtId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!stillExists) setGoalDebtId("");
  }, [scenarioAccounts, goalDebtId]);

  const scenarioSelectedDebt = scenarioAccountId
    ? (scenarioAccounts.find((a) => String(a.id) === String(scenarioAccountId)) || null)
    : null;

  // Per-debt scenario rows (used only when a specific debt is selected)
  // Baseline always strips planned_v and paid_v so it reflects minimum-only payments,
  // regardless of whether the plan has synced planned_v to the account.
  const scenarioBaselineRows = scenarioSelectedDebt
    ? payoffSimulate([{ ...scenarioSelectedDebt, planned_v: 0, paid_v: 0 }], "avalanche", 0, {}, selMonth, selYear)
    : [];
  const scenarioDebtRows = scenarioSelectedDebt
    ? payoffSimulate([scenarioSelectedDebt], "avalanche", Number(whatIfExtra || 0), {}, selMonth, selYear)
    : [];

  const runSim = (strategy, monthlyExtra, perAccountExtra = extraMap) =>
    payoffSimulate(included, strategy, Number(monthlyExtra || 0), perAccountExtra, selMonth, selYear);

  const currentPlanRows = runSim(planStrategy, Number(planMonthlyExtra || 0), extraMap);
  const scenarioExtraMap = scenarioSelectedDebt
    ? { ...extraMap, [scenarioSelectedDebt.id]: Number(extraMap[scenarioSelectedDebt.id] || 0) + Number(whatIfExtra || 0) }
    : extraMap;

  // simRows: apply whatIfExtra as per-account extra (specific debt) or monthly extra pool (all debts)
  const simRows = Number(whatIfExtra || 0) > 0
    ? (scenarioSelectedDebt
        ? runSim(planStrategy, Number(planMonthlyExtra || 0), scenarioExtraMap)
        : runSim(planStrategy, Number(planMonthlyExtra || 0) + Number(whatIfExtra || 0), extraMap))
    : currentPlanRows;

  const payoffMonths = simRows.length;
  const payoffEnd = simRows[simRows.length - 1]?.month || "n/a";
  const totalInterest = simRows.reduce((s, r) => s + (r.total_interest || 0), 0);
  // Baseline: strip planned_v and paid_v so it always uses minimum-only payments,
  // giving a true "what if you just paid the minimum" reference regardless of plan sync.
  const baselineRows = payoffSimulate(
    included.map((a) => ({ ...a, planned_v: 0, paid_v: 0 })),
    planStrategy, 0, {}, selMonth, selYear
  );
  const baselineMonths = baselineRows.length;
  const baselineInterest = baselineRows.reduce((s, r) => s + (r.total_interest || 0), 0);
  const interestSaved = Math.max(0, baselineInterest - totalInterest);
  const monthsSaved = Math.max(0, baselineMonths - payoffMonths);

  const totalScheduledDebtPayment = included.reduce((sum, acct) => {
    const planned = Math.max(0, Number(acct?.planned_v || 0));
    const paid = Math.max(0, Number(acct?.paid_v || 0));
    const minimum = Math.max(0, Number(acct?.min_due_v || 0));
    return sum + (planned > 0 ? planned : paid > 0 ? paid : minimum);
  }, 0);
  const totalPlannedPerAccountExtra = included.reduce((sum, acct) =>
    sum + Math.max(0, Number(extraMap[acct.id] || 0)), 0);
  const planMonthlyDebtPayment = totalScheduledDebtPayment + totalPlannedPerAccountExtra + Math.max(0, Number(planMonthlyExtra || 0));

  // What If stats — unified for both "specific debt" and "All debts" modes
  // When no specific debt and no whatIfExtra entered: compare true baseline (minimums) vs current plan,
  // so users see the value of their configured plan. When extra IS entered: compare current plan vs plan+extra.
  const whatIfBaselineRows = scenarioSelectedDebt
    ? scenarioBaselineRows
    : (Number(whatIfExtra || 0) > 0 ? currentPlanRows : baselineRows);
  const whatIfScenarioRows = scenarioSelectedDebt ? scenarioDebtRows : simRows;
  // Whether the user has engaged the "what if extra" input (changes column label semantics)
  const isWhatIfMode = Number(whatIfExtra || 0) > 0 || !!scenarioSelectedDebt;
  const scenarioCurrentPayment = scenarioSelectedDebt
    ? (() => {
        const planned = Math.max(0, Number(scenarioSelectedDebt.planned_v || 0));
        const paid = Math.max(0, Number(scenarioSelectedDebt.paid_v || 0));
        const min = Math.max(0, Number(scenarioSelectedDebt.min_due_v || 0));
        return planned > 0 ? planned : paid > 0 ? paid : min;
      })()
    : planMonthlyDebtPayment;
  const scenarioCurrentBalance = scenarioSelectedDebt
    ? Number(scenarioSelectedDebt.cur_bal || 0)
    : included.reduce((s, a) => s + Number(a.cur_bal || 0), 0);
  const scenarioMonthsCurrent = whatIfBaselineRows.length;
  const scenarioMonthsNew = whatIfScenarioRows.length;
  const scenarioMonthsSaved = Math.max(0, scenarioMonthsCurrent - scenarioMonthsNew);
  const scenarioInterestSaved = Math.max(0,
    whatIfBaselineRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0) -
    whatIfScenarioRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0)
  );

  const scenarioComparisonRows = (() => {
    const totalRows = Math.max(whatIfBaselineRows.length, whatIfScenarioRows.length);
    return Array.from({ length: totalRows }, (_, index) => {
      const currentRow = whatIfBaselineRows[index];
      const newRow = whatIfScenarioRows[index];
      return {
        month: currentRow?.month || newRow?.month || `Month ${index + 1}`,
        currentBalance: Number(currentRow?.remaining_debt || 0),
        newBalance: Number(newRow?.remaining_debt || 0),
        currentInterest: Number(currentRow?.total_interest || 0),
        newInterest: Number(newRow?.total_interest || 0),
      };
    });
  })();

  const formatGoalMonth = (value) => {
    if (!value) return "";
    const parsed = new Date(`${value}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  // Standalone goalPlanner — independent of What If, uses goalDebtId
  const goalPlanner = (() => {
    if (!goalDate) return null;
    const [goalYearRaw, goalMonthRaw] = goalDate.split("-");
    const goalYearNum = Number(goalYearRaw);
    const goalMonthNum = Number(goalMonthRaw);
    if (!Number.isFinite(goalYearNum) || !Number.isFinite(goalMonthNum)) return { valid: false, reason: "invalid" };
    const targetRowCount = ((goalYearNum - selYear) * 12) + (goalMonthNum - selMonth) + 1;
    if (targetRowCount <= 0) return { valid: false, reason: "past" };
    const targetLabel = formatGoalMonth(goalDate);

    const goalAccounts = goalDebtId
      ? scenarioAccounts.filter((a) => String(a.id) === goalDebtId)
      : included;
    if (!goalAccounts.length) return { valid: false, reason: "no_accounts" };

    const goalExtraMap = goalDebtId ? { [goalDebtId]: Number(extraMap[goalDebtId] || 0) } : extraMap;
    const goalBaseMonthlyExtra = goalDebtId ? 0 : Number(planMonthlyExtra || 0);

    const goalBaselineRows = payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra, goalExtraMap, selMonth, selYear);
    const baselineFinishesOnTime = goalBaselineRows.length > 0 && goalBaselineRows.length <= targetRowCount;
    const baselineProjectionRow = goalBaselineRows[targetRowCount - 1] || goalBaselineRows[goalBaselineRows.length - 1] || null;
    const baselineRemainingAtGoal = baselineFinishesOnTime ? 0 : Math.max(0, Number(baselineProjectionRow?.remaining_debt || 0));
    const configuredFinishMonth = goalBaselineRows[goalBaselineRows.length - 1]?.month || "n/a";

    const simulateWithExtra = (additionalExtra) =>
      payoffSimulate(goalAccounts, planStrategy, goalBaseMonthlyExtra + additionalExtra, goalExtraMap, selMonth, selYear);

    let additionalNeeded = 0;
    if (!baselineFinishesOnTime) {
      let lo = 0, hi = 250, result = null;
      const finishesByTarget = (rows) => rows.length > 0 && rows.length <= targetRowCount;
      while (hi < 100000 && !finishesByTarget(simulateWithExtra(hi))) hi *= 2;
      if (finishesByTarget(simulateWithExtra(hi))) {
        for (let iter = 0; iter < 30; iter++) {
          const mid = (lo + hi) / 2;
          if (finishesByTarget(simulateWithExtra(mid))) { result = mid; hi = mid; }
          else lo = mid;
        }
      }
      additionalNeeded = result === null ? null : Math.ceil(result);
    }

    const proposedRows = additionalNeeded === null ? [] : simulateWithExtra(additionalNeeded);
    const proposedFinishMonth = proposedRows[proposedRows.length - 1]?.month || configuredFinishMonth;

    const goalCurrentPayment = goalDebtId
      ? (() => {
          const a = goalAccounts[0];
          if (!a) return 0;
          const planned = Math.max(0, Number(a.planned_v || 0));
          const paid = Math.max(0, Number(a.paid_v || 0));
          const min = Math.max(0, Number(a.min_due_v || 0));
          return (planned > 0 ? planned : paid > 0 ? paid : min) + Number(extraMap[String(a.id)] || 0);
        })()
      : planMonthlyDebtPayment;

    return {
      valid: true,
      targetLabel,
      targetRowCount,
      goalDebtId,
      baselineFinishesOnTime,
      baselineRemainingAtGoal,
      configuredFinishMonth,
      additionalNeeded,
      proposedFinishMonth,
      proposedTotalMonthlyPayment: additionalNeeded === null ? null : goalCurrentPayment + (additionalNeeded || 0),
    };
  })();

  useEffect(() => {
    if (!goalPlanner?.valid) { setGoalRequiredExtra(null); return; }
    setGoalRequiredExtra(goalPlanner.additionalNeeded);
  }, [goalPlanner, setGoalRequiredExtra]);

  const recommendedTarget = (() => {
    const candidates = included.filter((a) => Number(a.cur_bal || 0) > 0.01);
    if (!candidates.length) return null;
    const ordered = [...candidates].sort((a, b) => {
      if (planStrategy === "snowball") return Number(a.cur_bal || 0) - Number(b.cur_bal || 0);
      return (b.effectiveApr ?? getEffectiveApr(b)) - (a.effectiveApr ?? getEffectiveApr(a));
    });
    return ordered[0] || null;
  })();
  const targetExtra = recommendedTarget ? Number(extraMap[recommendedTarget.id] || 0) : 0;
  const targetReason = recommendedTarget
    ? (planStrategy === "snowball" ? "smallest balance" : recommendedTarget.promoActive ? `promo deadline in ${recommendedTarget.promoUntil}` : "highest effective APR")
    : "";
  const aiCoachPayload = allAccts.length ? {
    askType: "payoff",
    monthKey: buildCoachMonthKey(selMonth, selYear),
    workspaceMode: workspaceMode || "solo",
    householdSummary: buildCoachHouseholdSummary({ workspaceMode, householdMembers }),
    accounts: summarizeCoachAccounts(
      included.map((acct) => ({
        ...acct,
        balance: Number(acct.cur_bal || 0),
        apr: Number(acct.effectiveApr ?? getEffectiveApr(acct) ?? 0),
        minDue: Number(acct.min_due_v || 0),
        plannedPayment: Math.max(0, Number(acct.planned_v || 0)) || Math.max(0, Number(acct.paid_v || 0)) || Math.max(0, Number(acct.min_due_v || 0)),
      })),
      6
    ),
    largestBalances: summarizeLargestBalances(
      included.map((acct) => ({
        ...acct,
        balance: Number(acct.cur_bal || 0),
        apr: Number(acct.effectiveApr ?? getEffectiveApr(acct) ?? 0),
        minDue: Number(acct.min_due_v || 0),
      })),
      3
    ),
    billMix: summarizeCoachBillMix(allAccts),
    payoffSummary: {
      strategy: planStrategy,
      monthsToZero: payoffMonths,
      debtFreeMonth: payoffEnd,
      totalInterest,
      monthlyDebtPayment: planMonthlyDebtPayment,
      monthsSaved,
      interestSaved,
      recommendedTarget: recommendedTarget ? { name: getBillDisplayName(recommendedTarget), reason: targetReason } : null,
      goalDate: goalDate || "",
      goalDateStatus: goalPlanner?.valid ? {
        targetLabel: goalPlanner.targetLabel,
        onTrack: goalPlanner.additionalNeeded === 0,
        remainingAtGoal: goalPlanner.baselineRemainingAtGoal,
        additionalNeeded: goalPlanner.additionalNeeded,
      } : null,
    },
    coachState: buildCoachState({
      askType: "payoff",
      accounts: allAccts,
      payoffSummary: {
        monthsToZero: payoffMonths,
        recommendedTarget: recommendedTarget ? { name: getBillDisplayName(recommendedTarget) } : null,
      },
    }),
  } : null;
  const aiCoachVisible = canAccessAICoach({ founderAccount });

  // ── Results panel — rendered in the right column (desktop) or sticky inline (mobile) ──
  // Mutually exclusive: only one instance renders at a time based on isMobile.
  const resultsPanel = (
    <div style={{ background: `linear-gradient(135deg, ${c.surf}, ${c.surf2})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 12 }}>
        Your payoff summary
      </div>
      {included.length === 0 ? (
        <GuidanceCard
          palette={c}
          icon="→"
          title="Choose debts for this plan"
          instruction="Go to the debt list below and turn on the balances you want in the plan."
          result="Your finish date, interest total, and next target will show here."
        />
      ) : (
        <>
          {/* Timeline */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 36, fontWeight: 800, color: c.tx, lineHeight: 1 }}>{payoffMonths}</span>
              <span style={{ fontSize: 14, color: c.tx2, fontWeight: 500 }}>months</span>
            </div>
            <div style={{ fontSize: 13, color: c.tx2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Debt-free by <strong style={{ color: c.tx }}>{payoffEnd}</strong>
              {monthsSaved > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>
                  {monthsSaved} mo faster
                </span>
              )}
            </div>
          </div>

          {/* Interest + monthly */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: c.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Interest you'd pay</div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 17, fontWeight: 800, color: c.tx }}>{fx(totalInterest)}</div>
              {interestSaved > 0 && (
                <div style={{ fontSize: 11, color: c.ac, marginTop: 3, fontWeight: 700 }}>Save {fx(interestSaved)}</div>
              )}
            </div>
            <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: c.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Monthly total</div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 17, fontWeight: 800, color: c.tx }}>{fx(planMonthlyDebtPayment)}</div>
              <div style={{ fontSize: 11, color: c.tx2, marginTop: 3 }}>across {included.length} debt{included.length !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* What-if boost pill (if active) */}
          {Number(whatIfExtra) > 0 && scenarioMonthsSaved > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: c.acD, border: `1px solid ${c.ac}44`, marginBottom: 12, fontSize: 12, color: c.ac, fontWeight: 700 }}>
              +{fx(Number(whatIfExtra))}/mo extra → {scenarioMonthsSaved} month{scenarioMonthsSaved !== 1 ? "s" : ""} sooner
              {scenarioInterestSaved > 0 && <span style={{ fontWeight: 400, color: c.ac, opacity: 0.85 }}> · Save {fx(scenarioInterestSaved)}</span>}
            </div>
          )}

          {/* Goal date status (if set) */}
          {goalPlanner?.valid && goalPlanner.additionalNeeded !== null && (
            <div style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: goalPlanner.additionalNeeded > 0 ? c.waD || c.surf2 : c.surf2,
              border: `1px solid ${goalPlanner.additionalNeeded > 0 ? (c.wa ? `${c.wa}44` : c.border) : c.border}`,
              marginBottom: 12,
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 800, color: goalPlanner.additionalNeeded > 0 ? c.wa || c.tx : c.tx, marginBottom: 2 }}>
                Goal: {goalPlanner.targetLabel}
              </div>
              <div style={{ color: c.tx2 }}>
                {goalPlanner.additionalNeeded > 0
                  ? `+${fx(goalPlanner.additionalNeeded)}/mo needed to hit your date`
                  : "✓ Already on track"}
              </div>
            </div>
          )}

          {/* First target */}
          {recommendedTarget && (
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: c.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>First debt to focus on</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ProviderMark bank={recommendedTarget.bank} name={recommendedTarget.name} size={16} />
                <span style={{ fontSize: 14, fontWeight: 800, color: c.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getBillDisplayName(recommendedTarget)}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>{fx(recommendedTarget.cur_bal || 0)}</span>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>{targetReason}</span>
                {targetExtra > 0 && (
                  <span style={{ padding: "3px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>+{fx(targetExtra)} extra</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const formatDebtLabel = (acct) => {
    const rawName = String(acct?.name || "").trim();
    const bank    = String(acct?.bank  || "").trim();
    const owner   = String(acct?.owner || "").trim();

    // Strip bank prefix from name if it appears at the start (case-insensitive)
    let cleanName = rawName;
    if (bank && cleanName.toUpperCase().startsWith(bank.toUpperCase())) {
      cleanName = cleanName.slice(bank.length).trim();
    }
    // Remove any leading dashes left after stripping bank
    cleanName = cleanName.replace(/^[-–—\s]+/, "").trim();

    // Remove trailing "(Owner)" if owner is already known
    if (owner) {
      cleanName = cleanName.replace(new RegExp(`\\s*\\(${owner}\\)\\s*$`, "i"), "").trim();
    }

    // Remove surrounding parentheses from the remaining name fragment
    cleanName = cleanName.replace(/^\((.+)\)$/, "$1").trim();

    // Convert ALL-CAPS words to Title Case (keep known abbreviations)
    const KEEP = new Set(["APR", "CC", "LLC", "UTD", "SOFI", "BOFA"]);
    cleanName = cleanName.replace(/\b([A-Z]{2,})\b/g, (w) =>
      KEEP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );

    // Build final label
    const nameHasBank = cleanName.toLowerCase().startsWith(bank.toLowerCase());
    const displayName = nameHasBank
      ? cleanName
      : bank && cleanName
      ? `${bank} ${cleanName}`
      : bank || cleanName;

    return owner ? `${displayName} · ${owner}` : displayName;
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, position: "relative", zIndex: 10, isolation: "isolate", pointerEvents: "auto" }}>

      {/* ── Two-column layout: input column (left/full) + results column (right, desktop only) ── */}
      <div style={{
        display: isMobile ? "block" : "grid",
        gridTemplateColumns: isTablet ? "1fr 280px" : "1fr 300px",
        gap: 16,
        alignItems: "start",
      }}>

        {/* ── INPUT COLUMN ── */}
        <div>

          {/* 1. Header */}
          <div style={{ background: `linear-gradient(135deg, ${c.surf}, ${c.surf2})`, border: `1px solid ${c.border}`, borderRadius: 16, padding: isMobile ? "16px 18px" : "18px 22px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Get to Zero</div>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: c.tx, marginBottom: 6 }}>Choose your goal date and watch your path to zero.</div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>Pick your approach, set a goal date, and explore what happens when you pay a little extra. Then add your debts and save your plan.</div>
          </div>

          <AICoachCard
            palette={c}
            isMobile={isMobile}
            requestPayload={aiCoachPayload}
            featureEnabled={launchFlags?.aiCoachEnabled}
            accessAllowed={aiCoachVisible}
            scopeLabel="your current payoff plan"
            testerOnly={launchFlags?.aiCoachTesterOnly}
            quickPrompts={[
              { key: "payoff_priority", label: "What should I pay first?" },
              { key: "payoff_reason", label: "Why this bill first?" },
              { key: "payoff_extra", label: "What if I add more?" },
            ]}
          />

          {/* 2. Strategy comparison */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            {(() => {
              const compareExtraMap = Number(whatIfExtra || 0) > 0 && scenarioSelectedDebt ? scenarioExtraMap : extraMap;
              const avaRows = runSim("avalanche", Number(planMonthlyExtra || 0), compareExtraMap);
              const snoRows = runSim("snowball", Number(planMonthlyExtra || 0), compareExtraMap);
              const avaMonths = avaRows.length;
              const snoMonths = snoRows.length;
              const avaInterest = avaRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
              const snoInterest = snoRows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);
              const better = avaInterest <= snoInterest ? "avalanche" : "snowball";
              const interestDiff = Math.abs(avaInterest - snoInterest);
              const monthDiff = Math.abs(avaMonths - snoMonths);
              return (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>Pick your approach</div>
                  <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
                    Not sure which to pick? Both work. Avalanche saves you more money. Snowball gives you faster wins. The best one is the one you'll stick with.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    {[
                      {
                        key: "avalanche",
                        eyebrow: "Saves the most money",
                        label: "Avalanche",
                        desc: "Pay off the most expensive debt first — the one charging you the most in interest. Takes longer to feel progress, but you pay less overall.",
                        goodFor: "Best for: people who want to minimize what they pay.",
                        months: avaMonths,
                        interest: avaInterest,
                      },
                      {
                        key: "snowball",
                        eyebrow: "Builds momentum fastest",
                        label: "Snowball",
                        desc: "Clear your smallest debt first for a quick win, then roll that freed-up payment into the next one. Early wins keep you motivated.",
                        goodFor: "Best for: people who need early wins to stay on track.",
                        months: snoMonths,
                        interest: snoInterest,
                      },
                    ].map((s) => (
                      <div
                        key={s.key}
                        onClick={() => setPlanStrategy(s.key)}
                        style={{
                          background: c.surf,
                          border: `2px solid ${s.key === better ? c.ac : s.key === planStrategy ? c.in : c.border}`,
                          borderRadius: 14,
                          padding: isMobile ? "12px 14px" : "16px 18px",
                          cursor: "pointer",
                          transition: "border-color 0.2s",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: s.key === better ? c.ac : c.muted, marginBottom: 4 }}>
                          {s.key === better ? `★ ${s.eyebrow}` : s.eyebrow}
                        </div>
                        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: c.tx, marginBottom: 6 }}>{s.label}</div>
                        {!isMobile && <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5, marginBottom: 8 }}>{s.desc}</div>}
                        {!isMobile && <div style={{ fontSize: 11, color: c.muted, fontStyle: "italic", marginBottom: 12 }}>{s.goodFor}</div>}
                        <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: c.tx, fontFamily: "'DM Mono',monospace", marginBottom: 4, lineHeight: 1 }}>
                          {s.months} <span style={{ fontSize: 12, fontWeight: 500, color: c.tx2 }}>mo</span>
                        </div>
                        <div style={{ fontSize: 12, color: c.tx2 }}>
                          Interest: <span style={{ color: c.da, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fx(s.interest)}</span>
                        </div>
                        {s.key === planStrategy && (
                          <div style={{ marginTop: 8, fontSize: 11, color: c.ac, fontWeight: 700 }}>✓ Your strategy</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {included.length > 0 && interestDiff > 1 && (
                    <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6, padding: "10px 14px", borderRadius: 8, background: c.surf2, border: `1px solid ${c.border}` }}>
                      {better === "avalanche"
                        ? `Avalanche saves you ${fx(interestDiff)} more in interest${monthDiff > 0 ? `, but Snowball gets you your first paid-off debt ${monthDiff} month${monthDiff !== 1 ? "s" : ""} sooner` : ""}.`
                        : `Snowball gets you your first paid-off debt faster${interestDiff > 0 ? `, but Avalanche saves you ${fx(interestDiff)} more in interest` : ""}.`
                      }
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* 3. Set your goal date */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Set your goal date</div>
            <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
              Pick a target date and we'll tell you exactly how much extra you need to pay each month to get there — no guessing required.
            </div>

            {/* Debt selector */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...lblStyle, marginBottom: 6 }}>Which debt are you targeting?</div>
              <select
                style={{ ...selStyle, width: isMobile ? "100%" : 360 }}
                value={goalDebtId}
                onChange={(e) => setGoalDebtId(e.target.value)}
              >
                <option value="">My entire plan</option>
                {scenarioAccounts.map((acct) => (
                  <option key={acct.id} value={String(acct.id)}>
                    {formatDebtLabel(acct)}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, fontSize: 12, color: c.tx2 }}>
                {goalDebtId
                  ? `Calculates what you need to pay on just this debt to finish by your date.`
                  : `Calculates what you need to add to your plan total to pay off all included debts by your date.`}
              </div>
            </div>

            {/* Date picker row */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: c.tx2, whiteSpace: "nowrap" }}>I want to be debt-free by:</span>
              <input
                type="month"
                value={goalDateDraft}
                min={`${selYear}-${String(selMonth).padStart(2, "0")}`}
                onChange={(e) => setGoalDateDraft(e.target.value)}
                style={{ width: isMobile ? "100%" : 200, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 13, outline: "none" }}
              />
              <button
                type="button"
                onClick={() => { setGoalDate(goalDateDraft); if (!goalDateDraft) setGoalRequiredExtra(null); }}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Show My Path to Zero
              </button>
              {goalDate && (
                <button
                  type="button"
                  onClick={() => { setGoalDate(""); setGoalDateDraft(""); setGoalRequiredExtra(null); }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: "transparent", color: c.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
              {goalPlanner?.valid && goalPlanner.additionalNeeded !== null && (
                <div style={{ background: goalPlanner.additionalNeeded > 0 ? c.acD : c.surf2, border: `1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}40` : c.border2}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: goalPlanner.additionalNeeded > 0 ? c.ac : c.tx2, fontWeight: 700 }}>
                  {goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}/mo needed` : "✓ You're already on track"}
                </div>
              )}
            </div>

            {goalDate && !goalPlanner?.valid && goalPlanner?.reason !== "no_accounts" && (
              <div style={{ marginTop: 10, fontSize: 12, color: c.muted }}>
                Pick a month from {MONTHS[selMonth - 1]} {selYear} onward to run the projection.
              </div>
            )}
            {goalDate && goalPlanner?.reason === "no_accounts" && (
              <div style={{ marginTop: 10, fontSize: 12, color: c.muted }}>
                No debts are included in your plan. Go to <strong>What's in your plan?</strong> below to add some.
              </div>
            )}

            {goalPlanner?.valid && (
              <>
                {!goalDebtId && (() => {
                  const excludedTotal = scopedAccounts.reduce((sum, a) => {
                    const key = String(a.id);
                    return (!planItems[key]?.include && Number(a.cur_bal || 0) > 0.01) ? sum + Number(a.cur_bal || 0) : sum;
                  }, 0);
                  if (excludedTotal < 0.01) return null;
                  return (
                    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: c.waD || c.surf2, border: `1px solid ${c.wa || c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                      <strong style={{ color: c.wa || c.tx }}>Heads up:</strong> {fx(excludedTotal)} in debt is not included in this plan and won't be covered by this projection. Go to <strong>What's in your plan?</strong> below to add those debts.
                    </div>
                  );
                })()}

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
                  <div style={{ background: c.surf2, border: `1px solid ${goalPlanner.baselineFinishesOnTime ? c.border : `${c.da}44`}`, borderRadius: 10, padding: 12 }}>
                    <div style={lblStyle}>Where you'll be</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: goalPlanner.baselineFinishesOnTime ? c.ac : c.da, lineHeight: 1.1 }}>
                      {goalPlanner.baselineFinishesOnTime ? "On time" : fx(goalPlanner.baselineRemainingAtGoal)}
                    </div>
                    <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                      {goalPlanner.baselineFinishesOnTime
                        ? `Your current plan finishes by ${goalPlanner.targetLabel}.`
                        : `Still owed by ${goalPlanner.targetLabel} on your current plan.`}
                    </div>
                  </div>
                  <div style={{ background: c.surf2, border: `1px solid ${goalPlanner.additionalNeeded > 0 ? `${c.ac}44` : c.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={lblStyle}>Extra needed each month</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: goalPlanner.additionalNeeded > 0 ? c.ac : c.tx }}>
                      {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? `+${fx(goalPlanner.additionalNeeded)}` : "Nothing more"}
                    </div>
                    <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                      {goalPlanner.additionalNeeded === null
                        ? "Cannot compute — try a later date."
                        : goalPlanner.additionalNeeded > 0
                          ? `Add this each month to hit ${goalPlanner.targetLabel}.`
                          : `No increase needed to finish on time.`}
                    </div>
                  </div>
                  <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={lblStyle}>You'd finish in</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c.tx, lineHeight: 1.1 }}>
                      {goalPlanner.additionalNeeded === null ? "n/a" : goalPlanner.additionalNeeded > 0 ? goalPlanner.proposedFinishMonth : goalPlanner.configuredFinishMonth}
                    </div>
                    <div style={{ fontSize: 12, color: c.tx2, marginTop: 6 }}>
                      {goalPlanner.additionalNeeded > 0
                        ? `With +${fx(goalPlanner.additionalNeeded)}/mo — total ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo.`
                        : `Your current plan finishes here.`}
                    </div>
                  </div>
                </div>

                {goalPlanner.additionalNeeded > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const needed = goalPlanner.additionalNeeded;
                        if (goalPlanner.goalDebtId) {
                          const key = goalPlanner.goalDebtId;
                          const debtAcct = included.find((a) => String(a.id) === key);
                          const newItems = scopedAccounts.map((a) => ({
                            account_id: a.id,
                            include: String(a.id) === key,
                            extra_payment: String(a.id) === key ? Number(extraMap[key] || 0) + needed : 0,
                          }));
                          const newItemMap = {};
                          scopedAccounts.forEach((a) => {
                            newItemMap[String(a.id)] = {
                              include: String(a.id) === key,
                              extra_payment: String(a.id) === key ? String(Number(extraMap[key] || 0) + needed) : "0",
                            };
                          });
                          setPlanItems(newItemMap);
                          setPlanMonthlyExtra("0");
                          const planLabel = debtAcct ? `${getBillDisplayName(debtAcct)} — Goal Plan` : "Focused Goal Plan";
                          setPlanName(planLabel);
                          setPlanId("");
                          await saveRawPlan({ name: planLabel, owner: planOwner, strategy: planStrategy, monthly_extra: 0, items: newItems });
                        } else {
                          const newExtra = String(Number(planMonthlyExtra || 0) + needed);
                          setPlanMonthlyExtra(newExtra);
                          await savePlan(planId, { silent: false });
                        }
                      }}
                      style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Add {fx(goalPlanner.additionalNeeded)}/mo to my plan
                    </button>
                    <span style={{ fontSize: 12, color: c.tx2 }}>
                      {goalPlanner.goalDebtId
                        ? `Creates a focused plan for this debt only`
                        : `Sets plan monthly extra to ${fx(Number(planMonthlyExtra || 0) + goalPlanner.additionalNeeded)}/mo`}
                    </span>
                  </div>
                )}
                {goalPlanner.additionalNeeded !== null && (
                  <div style={{ marginTop: 10, fontSize: 12, color: c.tx2, lineHeight: 1.6, padding: "10px 14px", borderRadius: 8, background: c.surf2, border: `1px solid ${c.border}` }}>
                    {goalPlanner.additionalNeeded > 0
                      ? `On your current plan you'd still have ${fx(goalPlanner.baselineRemainingAtGoal)} left by ${goalPlanner.targetLabel}. Add ${fx(goalPlanner.additionalNeeded)}/mo to bring your total to ~${fx(goalPlanner.proposedTotalMonthlyPayment)}/mo and finish on time.`
                      : `You're already on track — your current plan finishes by ${goalPlanner.targetLabel}.`}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 4. What if I pay a little extra? */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>What if I pay a little extra?</div>
            <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
              See how much faster you can reach zero.
            </div>

            {/* Quick-pick chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: c.tx2 }}>Try:</span>
              {[25, 50, 100, 200, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { setWhatIfDraft(String(amt)); setWhatIfExtra(String(amt)); }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: `1px solid ${Number(whatIfExtra) === amt ? c.ac : c.border2}`,
                    background: Number(whatIfExtra) === amt ? c.acD : c.surf2,
                    color: Number(whatIfExtra) === amt ? c.ac : c.tx2,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  +${amt}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 12, alignItems: "start", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: c.tx2, whiteSpace: "nowrap" }}>How much extra each month?</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: c.surf2, borderRadius: 8, padding: "4px 10px", border: `1.5px solid ${c.ac}` }}>
                  <span style={{ color: c.tx2, fontSize: 14, fontWeight: 600 }}>$</span>
                  <input
                    type="number" min="0" step="50"
                    value={whatIfDraft}
                    onChange={(e) => setWhatIfDraft(e.target.value)}
                    style={{ width: 90, padding: "6px 4px", border: "none", background: "transparent", color: c.tx, fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace", outline: "none" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setWhatIfExtra(String(Number(whatIfDraft || 0)))}
                  style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  See the difference
                </button>
                {Number(whatIfExtra) > 0 && (
                  <button
                    type="button"
                    onClick={() => { setWhatIfExtra("0"); setWhatIfDraft("0"); }}
                    style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: "transparent", color: c.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div>
                <div style={{ ...lblStyle, marginBottom: 6 }}>Which debt gets the extra?</div>
                <select
                  style={{ ...selStyle, width: "100%", maxWidth: 340 }}
                  value={scenarioAccountId}
                  onChange={(e) => setScenarioAccountId(e.target.value)}
                >
                  <option value="">Spread it across all my debts</option>
                  {scenarioAccounts.map((acct) => (
                    <option key={acct.id} value={String(acct.id)}>
                      {formatDebtLabel(acct)}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6, fontSize: 12, color: c.tx2 }}>
                  {scenarioSelectedDebt
                    ? `Extra goes directly to ${getBillDisplayName(scenarioSelectedDebt)}, on top of the current payment.`
                    : "Extra is added to your monthly pool and distributed using your chosen strategy."}
                </div>
              </div>
            </div>

            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>{scenarioSelectedDebt ? "Debt Balance" : "Total Balance"}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 800, color: c.tx }}>
                  {included.length ? fx(scenarioCurrentBalance) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>You're paying now</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 800, color: c.tx }}>
                  {included.length ? fx(scenarioCurrentPayment) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>With extra</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 800, color: Number(whatIfExtra || 0) > 0 ? c.ac : c.tx }}>
                  {included.length ? fx(scenarioCurrentPayment + Number(whatIfExtra || 0)) : "n/a"}
                </div>
              </div>
              <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 10, padding: 10 }}>
                <div style={lblStyle}>{isWhatIfMode ? "Months you'd save" : "Plan saves you"}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 800, color: scenarioMonthsSaved > 0 ? c.ac : c.tx }}>
                  {included.length ? `${scenarioMonthsSaved} mo` : "n/a"}
                </div>
                {scenarioInterestSaved > 0 && (
                  <div style={{ fontSize: 11, color: c.ac, marginTop: 4 }}>Save {fx(scenarioInterestSaved)} in interest</div>
                )}
              </div>
            </div>

            {/* Balance path chart */}
            {(isWhatIfMode || scenarioMonthsSaved > 0) && scenarioComparisonRows.length > 1 && (() => {
              const W = 460, H = 180, PAD = { t: 16, r: 16, b: isMobile ? 40 : 32, l: 56 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const maxBal = Math.max(...whatIfBaselineRows.map((r) => r.remaining_debt || 0), ...whatIfScenarioRows.map((r) => r.remaining_debt || 0), 1);
              const buildPoints = (rows) => rows.map((r, i) => {
                const x = PAD.l + ((rows.length === 1 ? 0 : i / (rows.length - 1)) * cW);
                const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
                return `${x},${y}`;
              }).join(" ");
              const newPts = buildPoints(whatIfScenarioRows);
              const currentPts = buildPoints(whatIfBaselineRows);
              const areaPath = `M${PAD.l},${PAD.t + cH} ` + whatIfScenarioRows.map((r, i) => {
                const x = PAD.l + ((whatIfScenarioRows.length === 1 ? 0 : i / (whatIfScenarioRows.length - 1)) * cW);
                const y = PAD.t + cH - (((r.remaining_debt || 0) / maxBal) * cH);
                return `L${x},${y}`;
              }).join(" ") + ` L${W - PAD.r},${PAD.t + cH} Z`;
              const totalLen = scenarioComparisonRows.length;
              const xLabelIndexes = Array.from(new Set([0, Math.max(0, Math.floor((totalLen - 1) / 2)), Math.max(0, totalLen - 1)])).sort((a, b) => a - b);
              const xLabels = xLabelIndexes.map((i) => ({ i, label: scenarioComparisonRows[i]?.month || `Month ${i + 1}` }));
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10, marginBottom: 8, flexDirection: isMobile ? "column" : "row" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Your path to zero</div>
                      <div style={{ fontSize: 13, color: c.tx2 }}>
                        {scenarioSelectedDebt
                          ? `${getBillDisplayName(scenarioSelectedDebt)} — current payment vs adding ${fx(Number(whatIfExtra || 0))}/mo`
                          : isWhatIfMode
                            ? `All included debts — current plan vs adding ${fx(Number(whatIfExtra || 0))}/mo extra`
                            : `All included debts — minimum-only payments vs your payoff plan`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ padding: "5px 8px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 11, fontWeight: 700, color: c.tx2 }}>{isWhatIfMode ? "Current plan" : "Minimums"}</span>
                      <span style={{ padding: "5px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>{isWhatIfMode ? "With extra" : "Your plan"}</span>
                    </div>
                  </div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                    <defs>
                      <linearGradient id="payoffGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.ac} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={c.ac} stopOpacity="0.01" />
                      </linearGradient>
                    </defs>
                    {[0, 0.5, 1].map((f, gi) => (
                      <line key={gi} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4" />
                    ))}
                    {[0, 0.5, 1].map((f, gi) => (
                      <text key={gi} x={PAD.l - 6} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">{fx(maxBal * (1 - f))}</text>
                    ))}
                    <path d={areaPath} fill="url(#payoffGrad)" />
                    <polyline points={currentPts} fill="none" stroke={c.tx} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    <polyline points={newPts} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {xLabels.map(({ i, label }) => {
                      const x = PAD.l + ((totalLen === 1 ? 0 : i / (totalLen - 1)) * cW);
                      const isFirst = i === xLabelIndexes[0];
                      const isLast = i === xLabelIndexes[xLabelIndexes.length - 1];
                      return <text key={i} x={x} y={H - 8} textAnchor={isFirst ? "start" : isLast ? "end" : "middle"} fontSize={isMobile ? "8" : "9"} fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{label}</text>;
                    })}
                  </svg>
                </div>
              );
            })()}

            {/* Month-by-month table */}
            {scenarioComparisonRows.length > 0 && (isWhatIfMode || scenarioMonthsSaved > 0) && (
              <div style={{ maxHeight: 260, overflowY: "auto", borderTop: `1px solid ${c.border}`, paddingTop: 8, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr 1fr 1fr", gap: 8, padding: "0 0 8px", borderBottom: `1px solid ${c.border}` }}>
                  <span style={lblStyle}>Month</span>
                  <span style={lblStyle}>{isWhatIfMode ? "Without extra" : "Min. payments"}</span>
                  <span style={lblStyle}>{isWhatIfMode ? "With extra" : "Your plan"}</span>
                  <span style={lblStyle}>Saved</span>
                </div>
                {(showAllSimRows ? scenarioComparisonRows : scenarioComparisonRows.slice(0, SIM_DISPLAY_ROWS)).map((r, i) => {
                  const balanceSaved = Math.max(0, r.currentBalance - r.newBalance);
                  return (
                    <div key={`${r.month}-${i}`} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: `1px dashed ${c.border}` }}>
                      <span>{r.month}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace" }}>{isMobile ? `Without extra: ${fx(r.currentBalance)}` : fx(r.currentBalance)}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace" }}>{isMobile ? `With extra: ${fx(r.newBalance)}` : fx(r.newBalance)}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", color: balanceSaved > 0 ? c.ac : c.muted }}>{isMobile ? `Saved: ${fx(balanceSaved)}` : fx(balanceSaved)}</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {scenarioComparisonRows.length > SIM_DISPLAY_ROWS && !showAllSimRows && (
                    <button type="button" onClick={() => setShowAllSimRows(true)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Show all {scenarioComparisonRows.length} months
                    </button>
                  )}
                  {showAllSimRows && scenarioComparisonRows.length > SIM_DISPLAY_ROWS && (
                    <button type="button" onClick={() => setShowAllSimRows(false)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Show less
                    </button>
                  )}
                  {scenarioComparisonRows.length > 0 && (
                    <button type="button" onClick={() => {
                      const rows = scenarioComparisonRows || [];
                      const win = window.open("", "_blank");
                      if (!win) return;
                      const html = `<!DOCTYPE html><html><head><title>Payoff Schedule</title><style>
                        body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
                        h1 { font-size: 18px; margin-bottom: 4px; }
                        .meta { color: #666; margin-bottom: 20px; font-size: 11px; }
                        table { width: 100%; border-collapse: collapse; }
                        th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #ddd; }
                        td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
                        tr:nth-child(even) td { background: #fafafa; }
                        .money { font-family: monospace; }
                        @media print { body { margin: 0; } }
                      </style></head><body>
                        <h1>Debt Payoff Schedule</h1>
                        <div class="meta">Strategy: ${planStrategy} · Generated ${new Date().toLocaleDateString()} · Plan: ${planName || "Unnamed"}</div>
                        <table>
                          <thead><tr><th>#</th><th>Month</th><th>${isWhatIfMode ? "Without Extra" : "Min. Payments"}</th><th>${isWhatIfMode ? "With Extra" : "Your Plan"}</th><th>Saved</th></tr></thead>
                          <tbody>
                            ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.month || ""}</td><td class="money">$${(Number(r.currentBalance) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="money">$${(Number(r.newBalance) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="money">$${(Math.max(0, r.currentBalance - r.newBalance)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join("")}
                          </tbody>
                        </table>
                      </body></html>`;
                      win.document.write(html);
                      win.document.close();
                      win.print();
                    }} style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      🖨 Print
                    </button>
                  )}
                </div>
              </div>
            )}
            {scenarioComparisonRows.length === 0 && (
              <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>
                {included.length === 0
                  ? `Add debts to your plan below, then come back here to explore how extra payments speed things up.`
                  : `Type an amount above and tap "See the difference" — we'll show you exactly how many months you save.`}
              </div>
            )}

            {/* Apply to plan */}
            {Number(whatIfExtra || 0) > 0 && (
              <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={async () => {
                    const extra = Number(whatIfExtra || 0);
                    if (scenarioSelectedDebt) {
                      const key = String(scenarioSelectedDebt.id);
                      const newItems = scopedAccounts.map((a) => ({
                        account_id: a.id,
                        include: String(a.id) === key,
                        extra_payment: String(a.id) === key ? Number(extraMap[key] || 0) + extra : 0,
                      }));
                      const newItemMap = {};
                      scopedAccounts.forEach((a) => {
                        newItemMap[String(a.id)] = {
                          include: String(a.id) === key,
                          extra_payment: String(a.id) === key ? String(Number(extraMap[key] || 0) + extra) : "0",
                        };
                      });
                      setPlanItems(newItemMap);
                      setPlanMonthlyExtra("0");
                      setPlanName(`${getBillDisplayName(scenarioSelectedDebt)} — Focus Plan`);
                      setPlanId("");
                      await saveRawPlan({ name: `${getBillDisplayName(scenarioSelectedDebt)} — Focus Plan`, owner: planOwner, strategy: planStrategy, monthly_extra: 0, items: newItems });
                    } else {
                      const newExtra = String(Number(planMonthlyExtra || 0) + extra);
                      setPlanMonthlyExtra(newExtra);
                      await savePlan(planId, { silent: false });
                    }
                    setWhatIfExtra("0");
                    setWhatIfDraft("0");
                  }}
                  style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.ac}`, background: c.ac, color: "#062532", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  Add +{fx(Number(whatIfExtra))}/mo to my plan
                </button>
                <span style={{ fontSize: 12, color: c.tx2 }}>
                  {scenarioSelectedDebt
                    ? `Creates a focused plan for ${getBillDisplayName(scenarioSelectedDebt)} only`
                    : `Adds to plan monthly extra — total ${fx(planMonthlyDebtPayment + Number(whatIfExtra || 0))}/mo`}
                </span>
              </div>
            )}
          </div>

          {/* 5. Results panel — mobile only (sticky once it reaches the top) */}
          {isMobile && (
            <div style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              marginBottom: 12,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              borderRadius: 16,
            }}>
              {resultsPanel}
            </div>
          )}

          {/* 6. What's in your plan? (debt selection) */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", marginBottom: 8, gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>What's in your plan?</div>
                <div style={{ fontSize: 13, color: c.tx2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  Tick the debts you want to tackle. Add a little extra to any one to pay it down faster.
                  {visibleRows.length > 0 && (
                    <span style={{ padding: "2px 8px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 11, fontWeight: 700, color: c.ac }}>
                      {included.length} of {visibleRows.length} {included.length === 1 ? "debt" : "debts"} included
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap", width: isMobile ? "100%" : "auto", position: "relative", zIndex: 31, pointerEvents: "auto" }}>
                <button
                  type="button"
                  onClick={() => { const next = {}; visibleRows.forEach((r) => { next[String(r.id)] = { include: true, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" }; }); setPlanItems(next); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
                >Add all</button>
                <button
                  type="button"
                  onClick={() => { const next = {}; visibleRows.forEach((r) => { next[String(r.id)] = { include: false, extra_payment: planItems[String(r.id)]?.extra_payment ?? "0" }; }); setPlanItems(next); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
                >Remove all</button>
                <button
                  type="button"
                  onClick={() => { const next = {}; planGroupKeys.forEach((cat) => { next[cat] = true; }); setPlanExpanded(next); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
                >Expand all</button>
                <button
                  type="button"
                  onClick={() => { const next = {}; planGroupKeys.forEach((cat) => { next[cat] = false; }); setPlanExpanded(next); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}
                >Collapse all</button>
              </div>
            </div>
            {planGroupKeys.map((cat) => {
              const rows = planGrouped[cat] || [];
              const hasState = Object.prototype.hasOwnProperty.call(planExpanded, cat);
              const open = hasState ? !!planExpanded[cat] : false;
              return (
                <div key={cat} style={{ marginBottom: 8, position: "relative", zIndex: 20, isolation: "isolate", pointerEvents: "auto" }}>
                  <button
                    type="button"
                    onClick={() => setPlanExpanded((prev) => ({ ...prev, [cat]: !open }))}
                    style={{ width: "100%", border: "none", background: "transparent", padding: "6px 0", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", position: "relative", zIndex: 21, pointerEvents: "auto" }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>
                      {CAT_ICON[cat]} {cat} ({rows.length})
                    </span>
                    <span style={{ fontSize: 12, color: c.muted, fontWeight: 800 }}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && !isMobile && (
                    <div style={{ display: "grid", gridTemplateColumns: "26px 1.2fr 120px 120px 120px 140px", gap: 8, alignItems: "center", padding: "6px 0 8px", borderBottom: `1px solid ${c.border}` }}>
                      <div />
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Debt</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Balance</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>APR</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Min Due</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Extra payment</div>
                    </div>
                  )}
                  {open && rows.map((r) => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "22px 1fr" : "26px 1.2fr 120px 120px 120px 140px", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: e.target.checked, extra_payment: prev[String(r.id)]?.extra_payment ?? "0" } }))}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <ProviderMark bank={r.bank} name={r.name} size={16} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getBillDisplayName(r)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          <span style={{ padding: "3px 7px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border2}`, fontSize: 10, fontWeight: 700, color: c.tx2 }}>
                            {r.include ? "In plan" : "Not included"}
                          </span>
                          {recommendedTarget?.id === r.id && (
                            <span style={{ padding: "3px 7px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}44`, fontSize: 10, fontWeight: 700, color: c.ac }}>
                              Current target
                            </span>
                          )}
                          {r.promoActive && (
                            <span style={{ padding: "3px 7px", borderRadius: 999, background: c.waD || c.surf2, border: `1px solid ${c.wa}44`, fontSize: 10, fontWeight: 700, color: c.wa }}>
                              Promo ends {r.promoUntil}
                            </span>
                          )}
                        </div>
                        {isMobile && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6, fontSize: 12 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>APR</div>
                              <div style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{pct(r.effectiveApr ?? getEffectiveApr(r))}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>Min Due</div>
                              <div style={{ fontFamily: "'DM Mono',monospace" }}>{fx(r.min_due_v)}</div>
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2 }}>Balance</div>
                              <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac }}>{fx(r.cur_bal || 0)}</div>
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={{ ...lblStyle, marginBottom: 4 }}>Extra payment ($)</div>
                              <input
                                type="number"
                                style={inputStyle}
                                value={r.extra}
                                onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: e.target.value } }))}
                                onBlur={async (e) => {
                                  const normalized = String(Number(e.target.value || 0));
                                  if (normalized !== e.target.value) {
                                    setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: normalized } }));
                                  }
                                  await savePlan(planId, { silent: true });
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace", color: c.ac }}>{fx(r.cur_bal || 0)}</div>}
                      {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace", color: c.muted }}>{pct(r.effectiveApr ?? getEffectiveApr(r))}</div>}
                      {!isMobile && <div style={{ fontFamily: "'DM Mono',monospace" }}>{fx(r.min_due_v)}</div>}
                      {!isMobile && (
                        <input
                          type="number"
                          style={inputStyle}
                          value={r.extra}
                          onChange={(e) => setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: e.target.value } }))}
                          onBlur={async (e) => {
                            const normalized = String(Number(e.target.value || 0));
                            if (normalized !== e.target.value) {
                              setPlanItems((prev) => ({ ...prev, [String(r.id)]: { include: prev[String(r.id)]?.include ?? true, extra_payment: normalized } }));
                            }
                            await savePlan(planId, { silent: true });
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* 7. Save your plan */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Save your plan</div>
            <div style={{ fontSize: 13, color: c.tx2, marginBottom: 14 }}>You've built your plan. Now lock it in.</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: isMobile ? "stretch" : "center", marginBottom: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>Saved plans</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 31, pointerEvents: "auto" }}>
                <button type="button" onClick={createPlanDraft} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, cursor: "pointer", position: "relative", zIndex: 32, pointerEvents: "auto" }}>Start fresh</button>
                {!!planId && (
                  <button type="button" onClick={() => removePlan(planId)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.da}`, background: c.daD, color: c.da, cursor: "pointer", fontWeight: 700, position: "relative", zIndex: 32, pointerEvents: "auto" }}>Remove plan</button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1.3fr 1fr 1fr 1fr", gap: 8, position: "relative", zIndex: 31, isolation: "isolate", pointerEvents: "auto" }}>
              <div>
                <div style={lblStyle}>Saved plan</div>
                <select style={{ ...selStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">Unsaved draft</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.owner}</option>)}
                </select>
              </div>
              <div>
                <div style={lblStyle}>Name</div>
                <input style={{ ...inputStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planName} onChange={(e) => setPlanName(e.target.value)} />
              </div>
              <div>
                <div style={lblStyle}>Owner</div>
                <select
                  style={{ ...selStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }}
                  value={planOwner}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPlanOwner(v);
                    const defaults = buildDefaultPlanItems(v, allAccts);
                    const map = {};
                    defaults.forEach((it) => {
                      const old = planItems[String(it.account_id)];
                      map[String(it.account_id)] = {
                        include: old ? old.include : true,
                        extra_payment: old ? old.extra_payment : "0",
                      };
                    });
                    setPlanItems(map);
                  }}
                >
                  {owners.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={lblStyle}>Extra each month ($)</div>
                <input type="number" style={{ ...inputStyle, position: "relative", zIndex: 32, pointerEvents: "auto" }} value={planMonthlyExtra} onChange={(e) => setPlanMonthlyExtra(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: isMobile ? "stretch" : "flex-end", marginTop: 10 }}>
              <button type="button" onClick={() => savePlan(planId)} style={{ ...saveBtnStyle, width: isMobile ? "100%" : "auto", position: "relative", zIndex: 32, pointerEvents: "auto" }}>{planId ? "Update plan" : "Save this plan"}</button>
            </div>
          </div>

        </div>
        {/* END INPUT COLUMN */}

        {/* ── RESULTS COLUMN — desktop only, sticky ── */}
        {!isMobile && (
          <div style={{ position: "sticky", top: 16 }}>
            {resultsPanel}
          </div>
        )}

      </div>
    </div>
  );
}
