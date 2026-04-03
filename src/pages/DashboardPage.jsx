import { MONTHS } from "../data/mockAccounts";
import { useState, useEffect } from "react";
import HouseholdHomePage from "./HouseholdHomePage";
import useDebtProgress from "../hooks/useDebtProgress";
import useMilestones from "../hooks/useMilestones";
import useNextMove from "../hooks/useNextMove";
import useProgressScore from "../hooks/useProgressScore";
import useHeadsUp from "../hooks/useHeadsUp";
import useProgressNotes from "../hooks/useProgressNotes";
import useHouseholdActivity from "../hooks/useHouseholdActivity";
import useMomentum from "../hooks/useMomentum";
import useNudges from "../hooks/useNudges";
import useWeeklySummary from "../hooks/useWeeklySummary";
import useDailyCheckIn from "../hooks/useDailyCheckIn";
import ProgressHeroCard from "../components/progress/ProgressHeroCard";
import DebtLeftCard from "../components/progress/DebtLeftCard";
import PaidThisMonthCard from "../components/progress/PaidThisMonthCard";
import AlmostDoneCard from "../components/progress/AlmostDoneCard";
import MonthsSoonerCard from "../components/progress/MonthsSoonerCard";
import MilestoneCard from "../components/progress/MilestoneCard";
import ProgressDebtList from "../components/progress/ProgressDebtList";
import DailyCheckInCard from "../components/habit/DailyCheckInCard";
import NudgeRow from "../components/habit/NudgeRow";
import MomentumCard from "../components/habit/MomentumCard";
import WeeklySummaryCard from "../components/habit/WeeklySummaryCard";
import UpgradeCard from "../components/billing/UpgradeCard";
import GuidanceStack from "../components/guidance/GuidanceStack";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import HouseholdMembersRow from "../components/household/HouseholdMembersRow";
import { canUseFeature, getUpgradeMessage } from "../utils/planLimits";
// removed unused celebration helpers to reduce lint noise
// soft launch prompt helper removed (not used in current codepath)

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
    totalBal,
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
    monthKey,
    householdProfile,
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
  const milestones = useMilestones({ progress, accounts: allAccts, getPrevRecord });
  const nextMove = useNextMove({ progress, accounts: allAccts, dueSoon, getPrevRecord, workspaceMode });
  const { activity } = useHouseholdActivity(activeHouseholdId, 8);
  const momentum = useMomentum({ accounts: allAccts, activity, progress, getPrevRecord });
  const weeklySummary = useWeeklySummary({ workspaceMode, progress, momentum, dueSoon, activity });
  const nudges = useNudges({ dueSoon, progress, momentum, activity, workspaceMode });
  const checkIn = useDailyCheckIn({ workspaceMode, dueSoon, progress, nextMove, momentum, weeklySummary, activity });
  const progressScore = useProgressScore({ accounts: allAccts, progress, momentum, activity, workspaceMode, getPrevRecord });
  const headsUps = useHeadsUp({ accounts: allAccts, progress, dueSoon, momentum, getPrevRecord });
  const progressNotes = useProgressNotes({ progress, milestones, momentum, workspaceMode, activity });
  const periodLabel = `${MONTHS[selMonth - 1]} ${selYear}`;
  const dueSoonItems = (homeDueBills.length ? homeDueBills : dueSoon).slice(0, isMobile ? 4 : 12);
  const canSeeAdvancedProgress = canUseFeature(subscription, "advancedProgress");
  const canSeeWeeklySummaries = canUseFeature(subscription, "weeklySummaries");
  const canSeeReminders = canUseFeature(subscription, "reminders");
  const hasAccounts = allAccts.length > 0;
  const isHouseholdDashboard = hasAccounts && workspaceMode === "household" && activeHouseholdId;
  const shouldShowDailyFocus = hasAccounts && !isHouseholdDashboard;
  const shouldShowGuidanceStack = hasAccounts && !isHouseholdDashboard;
  const shouldShowHouseholdEntry = !activeHouseholdId;
  const dueWithinThreeDaysCount = dueSoon.filter((item) => Number(item?.d_left) <= 3).length;
  const pendingHouseholdRequests = (householdRequests || []).filter((request) => request?.status === "pending");
  const homepageJoinRequest = canManageHousehold ? pendingHouseholdRequests[0] : null;
  const homepageInvite = !activeHouseholdId
    ? (incomingHouseholdInvites || []).find((item) => item?.status === "pending")
    : null;
  const homepageInviteRequest = !activeHouseholdId
    ? (incomingHouseholdInvites || []).find((item) => item?.status === "requested")
    : null;
  const topHouseholdUpdates = (activity || []).slice(0, 3);
  const [now, setNow] = useState(() => Date.now());
  const yearOptions = Array.from(new Set([selYear - 1, selYear, selYear + 1, new Date().getFullYear() + 1])).sort((left, right) => left - right);
  useEffect(() => {
    // Refresh periodically so "x minutes ago" stays current.
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const formatUpdateAge = (createdAt) => {
    if (!createdAt) return "";
    try {
      const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
      const diffMs = Math.max(0, now - date.getTime());
      const diffMin = Math.max(1, Math.round(diffMs / 60000));
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.round(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.round(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return "";
    }
  };
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
  const openCheckInAction = () => {
    if (checkIn?.action === "due-next") {
      openDueNextView();
      return;
    }
    setPage(checkIn?.action === "payoff" ? "payoff" : "bills");
  };
  // soft-launch handlers removed (unused in current codepath)

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : isHouseholdDashboard ? "0.9fr 1fr auto" : "1fr auto",
          gap: 14,
          alignItems: "stretch",
          marginBottom: 16,
        }}
      >
        {isHouseholdDashboard && (
          <HouseholdMembersRow
            palette={c}
            members={householdMembers}
            pendingRequests={pendingHouseholdRequests}
            canManageHousehold={canManageHousehold}
            inviteLink={householdInviteLink}
            onShareInvite={onShareInvite}
            onOpenSetup={onOpenHouseholdSetupCreate}
            onApprove={handleApproveHouseholdRequest}
            onReject={handleRejectHouseholdRequest}
          />
        )}
        <div
          style={{
            display: "grid",
            gap: 12,
            background: `linear-gradient(135deg, ${c.ac}12, ${c.surf} 38%, ${c.surf2} 82%, ${c.wa}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 22,
            padding: isMobile ? "16px 16px" : "18px 20px",
            boxShadow: `0 18px 40px ${c.ac}10`,
          }}
        >
          <div>
            <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
              {isHouseholdDashboard ? "Shared progress" : "Your progress"}
            </div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
              {isHouseholdDashboard ? "Latest movement across your shared space." : "Where you are now, what changed, and what to do next."}
            </div>
            {isHouseholdDashboard && (
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {topHouseholdUpdates.map((item, index) => (
                  <div
                    key={item?.id || item?.createdAt || item?.title || index}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 11px",
                      borderRadius: 999,
                      background: `${c.surf}D8`,
                      border: `1px solid ${c.border}`,
                      maxWidth: "100%",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.ac, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: c.tx2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: isMobile ? "52vw" : 220,
                      }}
                    >
                      {item?.title || "Someone updated"}
                      {formatUpdateAge(item?.createdAt) ? ` · ${formatUpdateAge(item.createdAt)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", background: `${c.surf}C8`, border: `1px solid ${c.border}`, borderRadius: 18, padding: "10px 12px", minWidth: isMobile ? "100%" : 240 }}>
          <div style={{ minWidth: isMobile ? 110 : 120 }}>
            <div style={lblStyle}>Month</div>
            <select style={selStyle} value={selMonth} onChange={(event) => setSelMonth(Number(event.target.value))}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 90 }}>
            <div style={lblStyle}>Year</div>
            <select style={selStyle} value={selYear} onChange={(event) => setSelYear(Number(event.target.value))}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {hasAccounts && workspaceMode === "household" && activeHouseholdId && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 12, marginBottom: 16 }}>
          {canSeeAdvancedProgress ? (
            <ProgressDebtList palette={c} debts={progress.progressByDebt} activity={activity} reducedMotion={reducedMotion} />
          ) : (
            <UpgradeCard
              palette={c}
              title={getUpgradeMessage("advancedProgress")}
              detail="See richer debt rings and deeper shared momentum when you want the fuller picture."
              cta="See billing"
              onClick={openBillingPage}
            />
          )}
          <div style={{ display:"grid", gap:12 }}>
            {canSeeWeeklySummaries ? (
              <MilestoneCard palette={c} milestones={milestones} reducedMotion={reducedMotion} isMobile={isMobile} activity={activity} />
            ) : (
              <UpgradeCard
                palette={c}
                compact
                title={getUpgradeMessage("weeklySummaries")}
                detail="Weekly recaps and milestone moments land here when you want more shared momentum."
                cta="See billing"
                onClick={openBillingPage}
              />
            )}
          </div>
        </div>
      )}

      {!!dueSoonItems.length && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>
            Coming up
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {dueSoonItems.map((item) => (
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
                <div style={{ fontSize: 11, fontWeight: 900, color: c.ac, marginBottom: 6 }}>
                  {item.daysUntilDue === 0 || item.d_left === 0
                    ? "Due today"
                    : `Due in ${item.daysUntilDue ?? item.d_left}d`}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 12, color: c.tx2 }}>
                  {item.owner}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
                Heads up
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
                {pendingHouseholdRequests.length > 1 ? `${pendingHouseholdRequests.length} people want to join` : "Someone wants to join"}
              </div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
                {homepageJoinRequest.displayName || homepageJoinRequest.email || "A new member"} is waiting for your yes.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={{
                  ...heroButtonStyle,
                  background: c.ac,
                  border: "none",
                }}
                onClick={() => handleApproveHouseholdRequest?.(homepageJoinRequest.uid || homepageJoinRequest.id)}
              >
                Let them in
              </button>
              <button
                type="button"
                style={{
                  ...heroButtonStyle,
                  background: c.surf,
                  color: c.tx,
                }}
                onClick={() => handleRejectHouseholdRequest?.(homepageJoinRequest.uid || homepageJoinRequest.id)}
              >
                Not now
              </button>
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
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
                Invite
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
                {homepageInvite.householdName || "Shared home"} invited you
              </div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
                {homepageInvite.invitedByName || homepageInvite.invitedByEmail || "Someone"} wants to share progress with you.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={{ ...heroButtonStyle, background: c.ac, border: "none" }}
                onClick={() => handleAcceptHouseholdInvite?.(homepageInvite.householdId || homepageInvite.id)}
              >
                Accept invite
              </button>
              <button
                type="button"
                style={{ ...heroButtonStyle, background: c.surf, color: c.tx }}
                onClick={() => handleDeclineHouseholdInvite?.(homepageInvite.householdId || homepageInvite.id)}
              >
                Dismiss
              </button>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
                Request sent
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
                Waiting on {homepageInviteRequest.householdName || "household"} to reply
              </div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
                Your join request is in. This will switch over as soon as it gets approved.
              </div>
            </div>
          </div>
        </div>
      )}

      {shouldShowHouseholdEntry && (
        <div style={{ marginBottom: 16 }}>
          <EmptyStateCard
            palette={c}
            title="Bring someone in when you're ready"
            message="Start solo, create a shared home, or join one from a link. Your everyday view will stay simple either way."
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={heroButtonStyle} onClick={onOpenHouseholdSetupCreate}>
                  Create household
                </button>
                <button type="button" style={heroButtonStyle} onClick={onOpenHouseholdSetupJoin}>
                  Join household
                </button>
              </div>
            }
          />
        </div>
      )}

      {!hasAccounts && (
        <div style={{ marginBottom: 16 }}>
          <EmptyStateCard
            palette={c}
            title="Start your progress here"
            message="Add your first bill, import a sheet, or upload a statement. Once you do, this home screen will show what changed and what to do next."
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={heroButtonStyle} onClick={() => setPage("settings")}>
                  Add a bill
                </button>
                <button type="button" style={heroButtonStyle} onClick={() => setPage("upload")}>
                  Import or upload
                </button>
              </div>
            }
          />
        </div>
      )}

      {shouldShowDailyFocus && (() => {
        const showCheckIn = checkIn?.title !== "You're synced";
        return (
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : showCheckIn ? "1.05fr .95fr" : "1fr", gap:12, marginBottom:16 }}>
            {showCheckIn && <DailyCheckInCard palette={c} checkIn={checkIn} onAction={openCheckInAction} />}
            <div style={{ display:"grid", gap:12 }}>
              <MomentumCard palette={c} momentum={momentum} reducedMotion={reducedMotion} isMobile={isMobile} />
              {canSeeReminders ? (
                <NudgeRow palette={c} nudges={nudges} />
              ) : (
                <UpgradeCard
                  palette={c}
                  compact
                  title={getUpgradeMessage("reminders")}
                  detail="Add calm reminders and gentle nudges when you want a little more support."
                  cta="See billing"
                  onClick={openBillingPage}
                />
              )}
            </div>
          </div>
        );
      })()}

      {shouldShowGuidanceStack && <GuidanceStack
        palette={c}
        isMobile={isMobile}
        score={progressScore}
        headsUps={headsUps}
        nextMove={nextMove}
        notes={progressNotes}
      />}

      {hasAccounts && (workspaceMode === "household" && activeHouseholdId ? (
        <>
          <HouseholdHomePage
            palette={c}
            householdId={activeHouseholdId}
            monthKey={monthKey}
            householdProfile={householdProfile}
            householdMembers={householdMembers}
            dueSoon={dueSoon}
            totalBal={totalBal}
            totalPaid={totalPaid}
            totalDue={totalDue}
            remaining={remaining}
            progress={progress}
            activity={activity}
            totalIncome={totalInc}
            receivedIncomeTotal={receivedIncomeTotal}
            netAfterBills={netAfterBills}
            recurringIncomeEntries={recurringIncomeEntries}
            recurringPayPeriods={recurringPayPeriods}
            incomeReceipts={incomeReceipts}
            onOpenIncome={() => setShowIncome(true)}
          />
          {canManageHousehold && householdInviteLink && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", borderRadius: 16, background: c.surf, border: `1px solid ${c.border}`, flexWrap: "wrap", marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted, marginBottom: 2 }}>Invite someone</div>
                <div style={{ fontSize: 12, color: c.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{householdInviteLink}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => onCopyInvite && onCopyInvite(householdInviteLink)} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Copy link</button>
                <button type="button" onClick={() => onShareInvite && onShareInvite(householdInviteLink)} style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Share</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <ProgressHeroCard palette={c} progress={progress} workspaceMode={workspaceMode} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
            <DebtLeftCard palette={c} value={progress.totalDebtLeftLabel} detail="Debt left" />
            <PaidThisMonthCard palette={c} value={progress.paidThisMonthLabel} detail="Paid this month" />
            <AlmostDoneCard palette={c} debt={progress.almostDoneDebt} />
            {canSeeAdvancedProgress ? (
              <MonthsSoonerCard
                palette={c}
                label={progress.monthsSooner > 0 ? progress.monthsSoonerLabel : "Nice work"}
                detail={progress.monthsSooner > 0 ? `Projected finish ${progress.projectedPayoffDate}` : `${progress.totalReductionLabel} down this month`}
              />
            ) : (
              <UpgradeCard
                palette={c}
                compact
                title="See your full plan"
                detail="Projected finish dates and payoff acceleration live here when you want more detail."
                cta="See billing"
                onClick={openBillingPage}
              />
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 12, marginBottom: 16 }}>
            {canSeeAdvancedProgress ? (
              <ProgressDebtList palette={c} debts={progress.progressByDebt} activity={activity} reducedMotion={reducedMotion} />
            ) : (
              <UpgradeCard
                palette={c}
                title={getUpgradeMessage("advancedProgress")}
                detail="Richer progress visuals, closer wins, and deeper payoff cues show up here with premium."
                cta="See billing"
                onClick={openBillingPage}
              />
            )}
            <div style={{ display: "grid", gap: 12 }}>
              {canSeeWeeklySummaries ? (
                <WeeklySummaryCard palette={c} summary={weeklySummary} />
              ) : (
                <UpgradeCard
                  palette={c}
                  compact
                  title={getUpgradeMessage("weeklySummaries")}
                  detail="Weekly recaps and momentum snapshots stay ready here when you want them."
                  cta="See billing"
                  onClick={openBillingPage}
                />
              )}
              {canSeeAdvancedProgress ? (
                <MilestoneCard palette={c} milestones={milestones} reducedMotion={reducedMotion} isMobile={isMobile} activity={activity} />
              ) : (
                <UpgradeCard
                  palette={c}
                  compact
                  title="Go a little deeper"
                  detail="Milestones and richer progress moments open up here when you decide to upgrade."
                  cta="See billing"
                  onClick={openBillingPage}
                />
              )}
            </div>
          </div>
        </>
      ))}

      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        {!isHouseholdDashboard ? (
        <>
        {/* This Month — anchored to a real next step */}
        <div
          style={{
            background: `linear-gradient(135deg, ${c.ac}10, ${c.surf} 36%, ${c.surf2} 86%, ${c.wa}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 22,
            padding: "18px 20px",
            display: "grid",
            gap: 10,
            boxShadow: `0 16px 36px rgba(0,0,0,0.08)`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              This month
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: c.tx, marginBottom: 6 }}>
              {periodLabel}
            </div>
            {/* One attention sentence */}
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
              {dueWithinThreeDaysCount > 0
                ? `${dueSoon.filter((d) => d.d_left <= 3).length} bill${dueSoon.filter((d) => d.d_left <= 3).length !== 1 ? "s" : ""} due in the next 3 days — open due next to act.`
                : remaining > 0
                  ? `$${Math.round(remaining).toLocaleString()} still to cover — open bills to check.`
                  : `Month covered. $${Math.round(totalPaid).toLocaleString()} paid down — keep the streak.`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("bills")}>Open bills</button>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("payoff")}>Open payoff</button>
            <button type="button" style={heroButtonStyle} onClick={() => openDueNextView()}>Open due next</button>
          </div>
        </div>

        </>
        ) : null}
        {/* Feedback — visually quiet, below main content */}
        <div
          style={{
            background: "transparent",
            border: `1px solid ${c.border}`,
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            opacity: 0.75,
          }}
        >
          <div style={{ fontSize: 12, color: c.tx2 }}>
            Tell us what felt helpful or off — short notes shape what comes next.
          </div>
          <button
            type="button"
            onClick={() => openFeedback("overview")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${c.border2}`,
              background: "transparent",
              color: c.muted,
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Send feedback
          </button>
        </div>
      </div>
    </div>
  );
}
