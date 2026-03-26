import { MONTHS } from "../data/mockAccounts";
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
import HouseholdEncouragementCard from "../components/habit/HouseholdEncouragementCard";
import UpgradeCard from "../components/billing/UpgradeCard";
import GuidanceStack from "../components/guidance/GuidanceStack";
import CelebrationBanner from "../components/ui/CelebrationBanner";
import LaunchSupportCard from "../components/ui/LaunchSupportCard";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import { canUseFeature, getUpgradeMessage } from "../utils/planLimits";
import { buildCelebrationState } from "../services/retentionService";
import { buildSoftLaunchPrompt } from "../services/softLaunchService";

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
    showDueSoon,
    setShowDueSoon,
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
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    payoffSimulate,
    subscription,
    openBillingPage,
    reducedMotion,
    openFeedback,
    reminderPreferences,
    pwaInstalled,
    launchFlags,
    softLaunchState,
    patchSoftLaunchState,
    onInstallApp,
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
  const { activity, loading: activityLoading } = useHouseholdActivity(activeHouseholdId, 8);
  const momentum = useMomentum({ accounts: allAccts, activity, progress, getPrevRecord });
  const weeklySummary = useWeeklySummary({ workspaceMode, progress, momentum, dueSoon, activity });
  const nudges = useNudges({ dueSoon, progress, momentum, activity, workspaceMode });
  const checkIn = useDailyCheckIn({ workspaceMode, dueSoon, progress, nextMove, momentum, weeklySummary, activity });
  const progressScore = useProgressScore({ accounts: allAccts, progress, momentum, activity, workspaceMode, getPrevRecord });
  const headsUps = useHeadsUp({ accounts: allAccts, progress, dueSoon, momentum, getPrevRecord });
  const progressNotes = useProgressNotes({ progress, milestones, momentum, workspaceMode, activity });
  const celebration = buildCelebrationState({ milestones, progressScore, workspaceMode, activity });
  const softLaunchPrompt = buildSoftLaunchPrompt({
    softLaunchState,
    reminderPreferences,
    pwaInstalled,
    progress,
    milestones,
    momentum,
    launchFlags,
  });
  const periodLabel = `${MONTHS[selMonth - 1]} ${selYear}`;
  const dueSoonItems = dueSoon.slice(0, isMobile ? 4 : 6);
  const canSeeAdvancedProgress = canUseFeature(subscription, "advancedProgress");
  const canSeeWeeklySummaries = canUseFeature(subscription, "weeklySummaries");
  const canSeeReminders = canUseFeature(subscription, "reminders");
  const hasAccounts = allAccts.length > 0;
  const pendingHouseholdRequests = (householdRequests || []).filter((request) => request?.status === "pending");
  const homepageJoinRequest = canManageHousehold ? pendingHouseholdRequests[0] : null;
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
  const handleLaunchPrimary = async () => {
    if (!softLaunchPrompt) return;
    if (softLaunchPrompt.kind === "welcome" && !pwaInstalled) {
      const installed = await onInstallApp?.();
      if (!installed) return;
      patchSoftLaunchState({ welcomeDismissed: true, lastPromptAt: new Date().toISOString() });
      return;
    }
    if (softLaunchPrompt.kind === "review") {
      patchSoftLaunchState({ reviewCompleted: true, lastPromptAt: new Date().toISOString() });
      openFeedback("soft-launch");
      return;
    }
    if (softLaunchPrompt.kind === "return") {
      patchSoftLaunchState({ lastPromptAt: new Date().toISOString() });
      setPage("bills");
      return;
    }
    patchSoftLaunchState({ lastPromptAt: new Date().toISOString() });
  };
  const handleLaunchSecondary = () => {
    if (!softLaunchPrompt) return;
    if (softLaunchPrompt.kind === "review") {
      patchSoftLaunchState({ reviewDismissed: true, lastPromptAt: new Date().toISOString() });
      return;
    }
    if (softLaunchPrompt.kind === "welcome") {
      patchSoftLaunchState({ welcomeDismissed: true, lastPromptAt: new Date().toISOString() });
      return;
    }
    patchSoftLaunchState({ lastPromptAt: new Date().toISOString() });
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s" }}>
      <CelebrationBanner palette={c} celebration={celebration} reducedMotion={reducedMotion} />
      <div style={{ marginBottom: 14 }}>
        <LaunchSupportCard
          palette={c}
          prompt={softLaunchPrompt}
          onPrimary={handleLaunchPrimary}
          onSecondary={handleLaunchSecondary}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 16,
          background: `linear-gradient(135deg, ${c.ac}12, ${c.surf} 38%, ${c.surf2} 82%, ${c.wa}10)`,
          border: `1px solid ${c.border}`,
          borderRadius: 22,
          padding: isMobile ? "16px 16px" : "18px 20px",
          boxShadow: `0 18px 40px ${c.ac}10`,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
            Overview
          </div>
          <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
            {workspaceMode === "household" ? "Shared progress" : "Your progress"}
          </div>
          <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
            Where you are now, what changed, and what to do next.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", background: `${c.surf}C8`, border: `1px solid ${c.border}`, borderRadius: 18, padding: "10px 12px" }}>
          <div style={{ minWidth: isMobile ? 110 : 120 }}>
            <div style={lblStyle}>Month</div>
            <select style={selStyle} value={selMonth} onChange={(event) => setSelMonth(Number(event.target.value))}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 90 }}>
            <div style={lblStyle}>Year</div>
            <select style={selStyle} value={selYear} onChange={(event) => setSelYear(Number(event.target.value))}>
              {[2024, 2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
                  {item.d_left === 0 ? "Due today" : `Due in ${item.d_left}d`}
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

      {hasAccounts && <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.1fr .9fr", gap:12, marginBottom:16 }}>
        <DailyCheckInCard palette={c} checkIn={checkIn} onAction={openCheckInAction} />
        <div style={{ display:"grid", gap:12 }}>
          <MomentumCard palette={c} momentum={momentum} />
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
      </div>}

      {hasAccounts && <GuidanceStack
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
            householdRequests={householdRequests}
            canManageHousehold={canManageHousehold}
            handleApproveHouseholdRequest={handleApproveHouseholdRequest}
            handleRejectHouseholdRequest={handleRejectHouseholdRequest}
            dueSoon={dueSoon}
            totalBal={totalBal}
            totalPaid={totalPaid}
            totalDue={totalDue}
            remaining={remaining}
            progress={progress}
            activity={activity}
            activityLoading={activityLoading}
            momentum={momentum}
            weeklySummary={weeklySummary}
          />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 12, marginBottom: 16 }}>
            {canSeeAdvancedProgress ? (
              <ProgressDebtList palette={c} debts={progress.progressByDebt} />
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
              <HouseholdEncouragementCard palette={c} activity={activity} memberCount={householdMembers.length} momentum={momentum} />
              {canSeeWeeklySummaries ? (
                <MilestoneCard palette={c} milestones={milestones} />
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
              <ProgressDebtList palette={c} debts={progress.progressByDebt} />
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
                <MilestoneCard palette={c} milestones={milestones} />
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${c.ac}10, ${c.surf} 36%, ${c.surf2} 86%, ${c.wa}10)`,
            border: `1px solid ${c.border}`,
            borderRadius: 22,
            padding: "18px 20px",
            display: "grid",
            gap: 12,
            boxShadow: `0 16px 36px rgba(0,0,0,0.08)`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              This month
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
              {periodLabel}
            </div>
            <div style={{ fontSize: 13, color: c.tx2 }}>
              Keep it simple. One next move is enough.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("bills")}>
              Open bills
            </button>
            <button type="button" style={heroButtonStyle} onClick={() => setPage("payoff")}>
              Open payoff
            </button>
            <button type="button" style={heroButtonStyle} onClick={() => openDueNextView()}>
              Open due next
            </button>
          </div>
        </div>
        <div
          style={{
            background: c.surf,
            border: `1px solid ${c.border}`,
            borderRadius: 18,
            padding: "16px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Help shape this
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: c.tx, marginBottom: 4 }}>
              Tell us what felt helpful or off
            </div>
            <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
              Short notes help us smooth the daily flow.
            </div>
          </div>
          <button type="button" style={heroButtonStyle} onClick={() => openFeedback("overview")}>
            Send feedback
          </button>
        </div>
      </div>
    </div>
  );
}
