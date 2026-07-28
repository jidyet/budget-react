import { MONTHS } from "../data/mockAccounts";
import { useState, useCallback } from "react";
import HouseholdHomePage from "./HouseholdHomePage";
import useDebtProgress from "../hooks/useDebtProgress";
import useMilestones from "../hooks/useMilestones";
import useNextMove from "../hooks/useNextMove";
import useHouseholdActivity from "../hooks/useHouseholdActivity";
import AlmostDoneCard from "../components/progress/AlmostDoneCard";
import MonthsSoonerCard from "../components/progress/MonthsSoonerCard";
import MilestoneCard from "../components/progress/MilestoneCard";
import ProgressDebtList from "../components/progress/ProgressDebtList";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import GuidanceCard from "../components/ui/GuidanceCard";
import HouseholdActivityStrip from "../components/household/HouseholdActivityStrip";
import { canUseFeature } from "../utils/planLimits";
import { fx } from "../utils/budgetUtils";
import HomepageHero from "../components/progress/HomepageHero";
import FocusDebtCard from "../components/progress/FocusDebtCard";
import DueNextCard from "../components/progress/DueNextCard";
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

export default function DashboardPage(props) {
  const {
    mounted,
    c,
    isMobile,
    selMonth,
    setSelMonth,
    selYear,
    setSelYear,
    lblStyle,
    selStyle,
    totalPaid,
    totalDue,
    remaining,
    dueSoon,
    homeDueBills = [],
    allAccts,
    getPrevRecord,
    openDueNextView,
    setPage,
    workspaceMode,
    activeHouseholdId,
    householdMembers,
    householdRequests,
    canManageHousehold,
    incomingHouseholdInvites = [],
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    handleAcceptHouseholdInvite,
    handleDeclineHouseholdInvite,
    payoffSimulate,
    subscription,
    openBillingPage,
    reducedMotion,
    openFeedback,
    onOpenHouseholdSetupCreate,
    onOpenHouseholdSetupJoin,
    householdInviteLink,
    onCopyInvite,
    onShareInvite,
    totalInc,
    receivedIncomeTotal,
    netAfterBills,
    recurringIncomeEntries,
    recurringPayPeriods,
    incomeReceipts,
    setShowIncome,
    markPaid,
    launchFlags,
    founderAccount,
  } = props;

  const progress = useDebtProgress({
    accounts: allAccts,
    totalPaid,
    totalDue,
    getPrevRecord,
    payoffSimulate,
    selMonth,
    selYear,
    workspaceMode,
    householdMembers,
  });

  // Shared classification helper — used by Fix 1 and Fix 4
  const isMonthlyAccount = (a) => {
    if (a?.startsOverMonthly === true) return true;
    if (String(a?.billType || "").toLowerCase() === "monthly") return true;
    if (String(a?.type || "").toLowerCase() === "monthly") return true;
    return false;
  };
  const debtOnly   = (progress.progressByDebt || []).filter((a) => !isMonthlyAccount(a));
  // Fix 4: lowest-balance debt not yet paid off
  const closestAccount =
    debtOnly
      .filter((a) => Number(a.cur_bal ?? 0) > 0.01)
      .sort((a, b) => Number(a.cur_bal) - Number(b.cur_bal))[0] ?? null;

  const milestones = useMilestones({ progress, accounts: allAccts, getPrevRecord });
  const nextMove = useNextMove({ progress, accounts: allAccts, dueSoon, getPrevRecord, workspaceMode });
  const { activity } = useHouseholdActivity(activeHouseholdId, 8);

  const allDueSoon = homeDueBills.length ? homeDueBills : dueSoon;

  // Due soon list — all upcoming bills excluding the one already shown in DueNextCard
  const dueSoonList = allDueSoon.slice(1, isMobile ? 7 : 13);

  const canSeeAdvancedProgress = canUseFeature(subscription, "advancedProgress");
  const hasAccounts = allAccts.length > 0;
  const isHouseholdDashboard = hasAccounts && workspaceMode === "household" && activeHouseholdId;
  const shouldShowHouseholdEntry = !activeHouseholdId;
  const dueWithinThreeDaysCount = dueSoon.filter((item) => Number(item?.d_left) <= 3).length;
  const pendingHouseholdRequests = (householdRequests || []).filter((r) => r?.status === "pending");
  const homepageJoinRequest = canManageHousehold ? pendingHouseholdRequests[0] : null;
  const homepageInvite = !activeHouseholdId
    ? (incomingHouseholdInvites || []).find((item) => item?.status === "pending")
    : null;
  const homepageInviteRequest = !activeHouseholdId
    ? (incomingHouseholdInvites || []).find((item) => item?.status === "requested")
    : null;
  const [inviteCopied, setInviteCopied] = useState(false);
  const handleInviteCopy = useCallback(() => {
    if (!householdInviteLink) return;
    onCopyInvite?.(householdInviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2400);
  }, [householdInviteLink, onCopyInvite]);

  const aiCoachPayload = hasAccounts ? {
    askType: "overview",
    monthKey: buildCoachMonthKey(selMonth, selYear),
    workspaceMode,
    householdSummary: buildCoachHouseholdSummary({ workspaceMode, householdMembers }),
    accounts: summarizeCoachAccounts(progress.progressByDebt, 6),
    largestBalances: summarizeLargestBalances(allAccts, 3),
    billMix: summarizeCoachBillMix(allAccts),
    overviewSummary: {
      totalDebtLeft: progress.totalDebtLeft,
      paidThisMonth: progress.paidThisMonth,
      totalDue: progress.totalDue,
      totalReduction: progress.totalReduction,
      monthsSooner: progress.monthsSooner,
      projectedPayoffDate: progress.projectedPayoffDate,
      nextFocusDebt: progress.nextFocusDebt ? { name: progress.nextFocusDebt.name } : null,
      almostDoneDebt: progress.almostDoneDebt ? { name: progress.almostDoneDebt.name, balance: progress.almostDoneDebt.currentBalance } : null,
      nextMove: nextMove ? { body: nextMove.body, detail: nextMove.detail, action: nextMove.action } : null,
      dueWithinThreeDaysCount,
    },
    coachState: buildCoachState({
      askType: "overview",
      accounts: allAccts,
    }),
  } : null;

  const aiCoachVisible = canAccessAICoach({ founderAccount });

  const heroButtonStyle = {
    padding: "11px 15px",
    borderRadius: 999,
    border: `1px solid ${c.border2}`,
    background: `${c.surf}D8`,
    color: c.tx,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: `0 10px 24px rgba(0,0,0,0.08)`,
  };
  const billingTextLinkStyle = {
    background: "none",
    border: "none",
    padding: 0,
    color: c.ac,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    whiteSpace: "nowrap",
  };
  const openAddBillPage = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("__tracktozero_open_add_bill__", "1");
    }
    setPage("settings");
  }, [setPage]);

  // Shared small-card style for monthly summary
  const monthCardStyle = {
    padding: isMobile ? "12px 14px" : "14px 16px",
    borderRadius: 16,
    background: c.surf,
    border: `1px solid ${c.border}`,
    display: "grid",
    gap: 4,
  };
  const monthLabelStyle = {
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    fontFamily: "'Instrument Sans',sans-serif",
  };
  const monthValueStyle = {
    fontFamily: "'DM Mono',monospace",
    fontSize: isMobile ? 18 : 20,
    fontWeight: 700,
    lineHeight: 1.1,
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s" }}>

      {/* ── 1. HERO — Total debt ─────────────────────────────────────────────── */}
      <HomepageHero
        palette={c}
        isMobile={isMobile}
        isHousehold={!!isHouseholdDashboard}
        progress={progress}
        selMonth={selMonth}
        setSelMonth={setSelMonth}
        selYear={selYear}
        setSelYear={setSelYear}
        lblStyle={lblStyle}
        selStyle={selStyle}
        reducedMotion={reducedMotion}
      />

      {/* ── 2. AI COACH ─────────────────────────────────────────────────────── */}
      <AICoachCard
        palette={c}
        isMobile={isMobile}
        requestPayload={aiCoachPayload}
        featureEnabled={launchFlags?.aiCoachEnabled}
        accessAllowed={aiCoachVisible}
        scopeLabel="your current monthly overview"
        testerOnly={launchFlags?.aiCoachTesterOnly}
        quickPrompts={[
          { key: "overview_focus", label: "What should I focus on?" },
          { key: "overview_change", label: "What changed this month?" },
          { key: "overview_track", label: "Am I on track?" },
        ]}
      />

      {/* ── 3. NO ACCOUNTS EMPTY STATE ──────────────────────────────────────── */}
      {!hasAccounts && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <GuidanceCard
              palette={c}
              icon="i"
              title="Start your dashboard"
              instruction="Go to Settings → Bills & Budget to add a bill, or open Import or upload."
              result="This screen will start showing progress, due items, and your next move."
            />
          </div>
          <EmptyStateCard
            palette={c}
            title="Start your progress here"
            message="Add your first bill or upload a statement. Once you do, this screen will show what changed and what to do next."
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={heroButtonStyle} onClick={openAddBillPage}>Add a bill</button>
                <button type="button" style={heroButtonStyle} onClick={() => setPage("upload")}>Import or upload</button>
              </div>
            }
          />
        </div>
      )}

      {/* ── 4. HOUSEHOLD ALERTS ─────────────────────────────────────────────── */}
      {!!homepageJoinRequest && (
        <div
          style={{
            marginBottom: 14,
            background: `linear-gradient(135deg, ${c.ac}14, ${c.surf} 34%, ${c.surf2} 84%, ${c.wa}12)`,
            border: `1px solid ${c.border}`,
            borderRadius: 20,
            padding: isMobile ? "14px 14px" : "16px 18px",
            boxShadow: `0 14px 30px rgba(0,0,0,0.06)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Heads up</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
                {pendingHouseholdRequests.length > 1 ? `${pendingHouseholdRequests.length} people want to join` : "Someone wants to join"}
              </div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
                {homepageJoinRequest.displayName || homepageJoinRequest.email || "A new member"} is waiting for your yes.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={{ ...heroButtonStyle, background: c.ac, border: "none" }} onClick={() => handleApproveHouseholdRequest?.(homepageJoinRequest.uid || homepageJoinRequest.id)}>Let them in</button>
              <button type="button" style={{ ...heroButtonStyle, background: c.surf, color: c.tx }} onClick={() => handleRejectHouseholdRequest?.(homepageJoinRequest.uid || homepageJoinRequest.id)}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {!!homepageInvite && (
        <div
          style={{
            marginBottom: 14,
            background: `linear-gradient(135deg, ${c.ok}12, ${c.surf} 34%, ${c.surf2} 84%, ${c.ac}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 20,
            padding: isMobile ? "14px 14px" : "16px 18px",
            boxShadow: `0 14px 30px rgba(0,0,0,0.06)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Invite</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{homepageInvite.householdName || "Shared home"} invited you</div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>{homepageInvite.invitedByName || homepageInvite.invitedByEmail || "Someone"} wants to share progress with you.</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={{ ...heroButtonStyle, background: c.ac, border: "none" }} onClick={() => handleAcceptHouseholdInvite?.(homepageInvite.householdId || homepageInvite.id)}>Accept invite</button>
              <button type="button" style={{ ...heroButtonStyle, background: c.surf, color: c.tx }} onClick={() => handleDeclineHouseholdInvite?.(homepageInvite.householdId || homepageInvite.id)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {!!homepageInviteRequest && (
        <div
          style={{
            marginBottom: 14,
            background: `linear-gradient(135deg, ${c.wa}12, ${c.surf} 34%, ${c.surf2} 84%, ${c.ac}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 20,
            padding: isMobile ? "14px 14px" : "16px 18px",
            boxShadow: `0 14px 30px rgba(0,0,0,0.06)`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Request sent</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>Waiting on {homepageInviteRequest.householdName || "household"} to reply</div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>Your join request is in. This will switch over as soon as it gets approved.</div>
          </div>
        </div>
      )}

      {/* ── 5. MONTHLY SUMMARY ──────────────────────────────────────────────── */}
      {hasAccounts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={monthCardStyle}>
            <div style={{ ...monthLabelStyle, color: c.muted }}>Due this month</div>
            <div style={{ ...monthValueStyle, color: c.tx }}>{fx(totalDue)}</div>
          </div>
          <div style={monthCardStyle}>
            <div style={{ ...monthLabelStyle, color: c.go }}>Paid this month</div>
            <div style={{ ...monthValueStyle, color: c.go }}>{fx(totalPaid)}</div>
          </div>
          <div
            style={{
              ...monthCardStyle,
              ...(isMobile ? { gridColumn: "1 / -1" } : {}),
            }}
          >
            <div style={{ ...monthLabelStyle, color: remaining > 0 ? c.wa : c.go }}>
              Left this month
            </div>
            <div style={{ ...monthValueStyle, color: remaining > 0 ? c.wa : c.go }}>
              {fx(remaining)}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. MAIN ACTION CARDS — Due next + Focus debt ────────────────────── */}
      {hasAccounts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <DueNextCard
            palette={c}
            allDueSoon={allDueSoon}
            isMobile={isMobile}
            onMarkPaid={markPaid}
            onOpenBill={(id) => openDueNextView(id)}
          />
          <FocusDebtCard
            palette={c}
            allAccts={allAccts}
            progress={progress}
            isMobile={isMobile}
            onOpenBill={() => setPage("bills")}
          />
        </div>
      )}

      {/* ── 7. SECONDARY CARDS — Closest to gone + Finishing early ──────────── */}
      {hasAccounts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <AlmostDoneCard palette={c} debt={closestAccount} reducedMotion={reducedMotion} />
          <MonthsSoonerCard
            palette={c}
            monthsSooner={progress.monthsSooner}
            label={progress.monthsSooner > 0 ? progress.monthsSoonerLabel : "Nice work"}
            detail={progress.monthsSooner > 0 ? `Projected finish ${progress.projectedPayoffDate}` : `${progress.totalReductionLabel} down this month`}
          />
        </div>
      )}

      {/* ── 8. PROGRESS BY DEBT + MILESTONES ────────────────────────────────── */}
      {hasAccounts && (
        <div style={{ marginBottom: 16 }}>
          {!canSeeAdvancedProgress && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 10 }}>
              <button type="button" onClick={openBillingPage} style={billingTextLinkStyle}>
                See billing
              </button>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr",
              gap: 12,
            }}
          >
            <ProgressDebtList palette={c} debts={debtOnly} activity={activity} reducedMotion={reducedMotion} />
            <MilestoneCard
              palette={c}
              milestones={milestones}
              reducedMotion={reducedMotion}
              isMobile={isMobile}
            />
          </div>
        </div>
      )}

      {/* ── 9. HOUSEHOLD ACTIVITY STRIP ─────────────────────────────────────── */}
      {isHouseholdDashboard && (
        <HouseholdActivityStrip
          palette={c}
          isMobile={isMobile}
          members={householdMembers}
          activity={activity}
          pendingRequests={pendingHouseholdRequests}
          canManageHousehold={canManageHousehold}
          inviteLink={householdInviteLink}
          onShareInvite={onShareInvite}
          onOpenSetup={onOpenHouseholdSetupCreate}
          onApprove={handleApproveHouseholdRequest}
          onReject={handleRejectHouseholdRequest}
        />
      )}

      {/* ── 10. DUE SOON — remaining bills after the Due next card ──────────── */}
      {dueSoonList.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
            Due soon
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {dueSoonList.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openDueNextView(item.id)}
                style={{
                  minWidth: isMobile ? "72vw" : 180,
                  textAlign: "left",
                  padding: "14px 14px",
                  borderRadius: 18,
                  border: `1px solid ${c.ac}33`,
                  background: `linear-gradient(135deg, ${c.ac}16, ${c.surf} 46%, ${c.surf2})`,
                  cursor: "pointer",
                  boxShadow: `0 14px 28px ${c.ac}10`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, color: c.ac, marginBottom: 6, fontFamily: "'Instrument Sans',sans-serif" }}>
                  {item.d_left === 0 ? "Due today" : `Due in ${item.daysUntilDue ?? item.d_left}d`}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 12, color: c.tx2, fontFamily: "'Instrument Sans',sans-serif" }}>{item.owner}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 11. HOUSEHOLD INCOME CONTENT ────────────────────────────────────── */}
      {hasAccounts && isHouseholdDashboard && (
        <HouseholdHomePage
          palette={c}
          householdId={activeHouseholdId}
          totalIncome={totalInc}
          receivedIncomeTotal={receivedIncomeTotal}
          netAfterBills={netAfterBills}
          recurringIncomeEntries={recurringIncomeEntries}
          recurringPayPeriods={recurringPayPeriods}
          incomeReceipts={incomeReceipts}
          onOpenIncome={() => setShowIncome(true)}
        />
      )}

      {/* ── 12. INCOME + NAVIGATION ─────────────────────────────────────────── */}
      {hasAccounts && (
        <div
          style={{
            background: `linear-gradient(135deg, ${c.ac}10, ${c.surf} 36%, ${c.surf2} 86%, ${c.wa}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 22,
            padding: "18px 20px",
            display: "grid",
            gap: 10,
            marginBottom: 14,
            boxShadow: `0 16px 36px rgba(0,0,0,0.08)`,
          }}
        >
          {/* Income row */}
          <div
            onClick={() => setShowIncome(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              background: c.surf2,
              border: `1px solid ${c.border}`,
              cursor: "pointer",
              flexWrap: "wrap",
            }}
          >
            {totalInc > 0 ? (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", flex: 1 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2, fontFamily: "'Instrument Sans',sans-serif" }}>Income</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>{fx(totalInc)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2, fontFamily: "'Instrument Sans',sans-serif" }}>Bills</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}>{fx(totalDue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 2, fontFamily: "'Instrument Sans',sans-serif" }}>Left over</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: netAfterBills >= 0 ? c.go : c.da, fontFamily: "'DM Mono',monospace" }}>{fx(netAfterBills)}</div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.tx, marginBottom: 2 }}>Add your income</div>
                <div style={{ fontSize: 11, color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>See what's left after bills each month.</div>
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: c.ac, whiteSpace: "nowrap", fontFamily: "'Instrument Sans',sans-serif" }}>
              {totalInc > 0 ? "Edit ›" : "Add ›"}
            </div>
          </div>

          {totalInc <= 0 && (
            <GuidanceCard
              palette={c}
              icon="$"
              title="Set up paycheck tracking"
              instruction="Go to Settings → Bills & Budget, then add your paycheck amount and schedule."
              result="Once set up, you'll see income, bills, and what's left after payments."
            />
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("bills")}>Open bills</button>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("payoff")}>Open payoff</button>
            <button type="button" style={heroButtonStyle} onClick={() => openDueNextView()}>Open due next</button>
          </div>
        </div>
      )}

      {/* ── 13. HOUSEHOLD / INVITE STRIP ────────────────────────────────────── */}
      {(shouldShowHouseholdEntry || (canManageHousehold && householdMembers.length < 3)) && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "14px 18px",
            borderRadius: 16,
            background: c.surf,
            border: `1px solid ${c.border}`,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 2 }}>
              Bring someone in
            </div>
            <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5, fontFamily: "'Instrument Sans',sans-serif" }}>
              {shouldShowHouseholdEntry
                ? "Create a shared household or join one — your data stays private until you choose to share it."
                : "They'll see the same progress and can add their own bills alongside yours."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
            {shouldShowHouseholdEntry && (
              <>
                <button
                  type="button"
                  onClick={onOpenHouseholdSetupCreate}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={onOpenHouseholdSetupJoin}
                  style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                >
                  Join
                </button>
              </>
            )}
            <button
              type="button"
              onClick={shouldShowHouseholdEntry ? handleInviteCopy : (onShareInvite ? () => onShareInvite(householdInviteLink) : handleInviteCopy)}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: shouldShowHouseholdEntry ? `1px solid ${c.border2}` : "none",
                background: inviteCopied ? c.go : (shouldShowHouseholdEntry ? c.surf2 : c.ac),
                color: shouldShowHouseholdEntry ? c.tx : "#001014",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
                transition: "background 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              {inviteCopied ? "Link copied ✓" : "Share"}
            </button>
          </div>
        </div>
      )}

      {/* ── 14. FEEDBACK ────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 12, paddingBottom: 4, textAlign: "center", opacity: 0.5 }}>
        <button
          type="button"
          onClick={() => openFeedback("overview")}
          style={{
            background: "none",
            border: "none",
            color: c.muted,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            fontFamily: "'Instrument Sans',sans-serif",
          }}
        >
          Something feel off? Send a note
        </button>
      </div>

    </div>
  );
}
