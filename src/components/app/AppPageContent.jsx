import { lazy, Suspense, useState } from "react";
import OverviewPage from "../../pages/OverviewPage";
import DashboardPage from "../../pages/DashboardPage";
import LoadingState from "../ui/LoadingState";
import PageErrorBoundary from "../ui/PageErrorBoundary";

const AccountsPage = lazy(() => import("../../pages/AccountsPage"));
const PayoffPage = lazy(() => import("../../pages/PayoffPage"));
const TrendsPage = lazy(() => import("../../pages/TrendsPage"));
const DueNextPage = lazy(() => import("../../pages/DueNextPage"));
const SettingsPage = lazy(() => import("../../pages/SettingsPage"));
const HistoryPage = lazy(() => import("../../pages/HistoryPage"));
const BillingPage = lazy(() => import("../../pages/BillingPage"));
const NotificationSettingsPage = lazy(() => import("../../pages/NotificationSettingsPage"));
const BetaHelpPage = lazy(() => import("../../pages/BetaHelpPage"));
const FounderOpsPage = lazy(() => import("../../pages/FounderOpsPage"));
const AdminPage = lazy(() => import("../../pages/AdminPage"));
const PrivacySecurityPage = lazy(() => import("../../pages/PrivacySecurityPage"));
const SupportPage = lazy(() => import("../../pages/SupportPage"));
const UploadPage = lazy(() => import("../../pages/UploadPage"));
const HouseholdPage = lazy(() => import("../../pages/HouseholdPage"));

export default function AppPageContent(props) {
  const {
    page,
    c,
    isMobile,
    mounted,
    reducedMotion,
    pageVisible,
    selMonth,
    setSelMonth,
    selYear,
    setSelYear,
    monthKey,
    theme,
    user,
    isLocalUser,
    allAccts,
    allOwners,
    allCategories,
    income,
    assets,
    subscription,
    launchFlags,
    workspaceMode,
    householdProfile,
    householdMembers,
    householdRequests,
    canManageHousehold,
    founderOpsVisible,
    founderAccount,
    founderOpsState,
    founderOpsTick,
    currentUserLabel,
    userProfile,
    currentHouseholdMember,
    supportEmail,
    appVersionLabel,
    today,
    currencyCode,
    firebaseStatus,
    baseAccounts,
    pwaInstalled,
    notifPermission,
  } = props;
  const lazyFallback = <LoadingState palette={c} label="Opening page..." />;
  const [pageRetryKey, setPageRetryKey] = useState(0);

  return (
    <PageErrorBoundary
      key={`${page}-${pageRetryKey}`}
      palette={c}
      sectionName={`page:${page}`}
      resetToken={`${page}-${pageRetryKey}`}
      onReset={() => setPageRetryKey((current) => current + 1)}
    >
      <div
        style={{
          paddingTop: isMobile ? 12 : 16,
          animation: !reducedMotion && pageVisible ? "pageIn 0.24s ease forwards" : "none",
          opacity: pageVisible ? undefined : 0,
          position: "relative",
          zIndex: isMobile ? 1 : 40,
          isolation: "isolate",
          pointerEvents: "auto",
        }}
      >
        {page === "overview" && (
          <OverviewPage
            showDueSoon={props.showDueSoon}
            dueNextSectionRef={props.dueNextSectionRef}
            dashboard={
              <DashboardPage
                mounted={mounted}
                c={c}
                isMobile={isMobile}
                selMonth={selMonth}
                setSelMonth={setSelMonth}
                selYear={selYear}
                setSelYear={setSelYear}
                lblStyle={props.lblStyle}
                selStyle={props.selStyle}
                totalBal={props.totalBal}
                totalDue={props.totalDue}
                totalPaid={props.totalPaid}
                remaining={props.remaining}
                dueSoon={props.dueSoon}
                homeDueBills={props.homeDueBills}
                setShowDueSoon={props.setShowDueSoon}
                showDueSoon={props.showDueSoon}
                allAccts={allAccts}
                getPrevRecord={props.getPrevRecord}
                openDueNextView={props.openDueNextView}
                setPage={props.setPage}
                workspaceMode={workspaceMode}
                activeHouseholdId={props.activeHouseholdId}
                monthKey={monthKey}
                householdProfile={householdProfile}
                householdMembers={householdMembers}
                householdRequests={householdRequests}
                canManageHousehold={canManageHousehold}
                incomingHouseholdInvites={props.incomingHouseholdInvites}
                handleApproveHouseholdRequest={props.handleApproveHouseholdRequest}
                handleRejectHouseholdRequest={props.handleRejectHouseholdRequest}
                handleAcceptHouseholdInvite={props.handleAcceptHouseholdInvite}
                handleDeclineHouseholdInvite={props.handleDeclineHouseholdInvite}
                payoffSimulate={props.payoffSimulate}
                subscription={subscription}
                openBillingPage={props.openBillingPage}
                reducedMotion={reducedMotion}
                openFeedback={props.openFeedback}
                reminderPreferences={props.reminderPreferences}
                pwaInstalled={pwaInstalled}
                launchFlags={launchFlags}
                founderAccount={founderAccount}
                softLaunchState={props.softLaunchState}
                patchSoftLaunchState={props.patchSoftLaunchState}
                onInstallApp={props.handleInstallApp}
                onOpenHouseholdSetupCreate={() => {
                  props.setHouseholdSetupTab("create");
                  props.setHouseholdSetupOpen(true);
                }}
                onOpenHouseholdSetupJoin={() => {
                  props.setHouseholdSetupTab("join");
                  props.setHouseholdSetupOpen(true);
                }}
                householdInviteLink={props.householdInviteLink}
                onCopyInvite={props.handleCopyHouseholdInvite}
                onShareInvite={props.handleShareHouseholdInvite}
                totalInc={props.totalInc}
                receivedIncomeTotal={props.receivedIncomeTotal}
                netAfterBills={props.netAfterBills}
                recurringIncomeEntries={props.recurringIncomeEntries}
                recurringPayPeriods={props.recurringPayPeriods}
                incomeReceipts={props.incomeReceipts}
                setShowIncome={props.setShowIncome}
                markPaid={props.markPaid}
              />
            }
            dueNext={
              <DueNextPage
                mounted={mounted}
                c={c}
                isMobile={isMobile}
                dueNextWeekOffset={props.dueNextWeekOffset}
                setDueNextWeekOffset={props.setDueNextWeekOffset}
                weekAnchor={props.weekAnchor}
                weekEnd={props.weekEnd}
                dueNextBills={props.dueNextBills}
                dueNextGroups={props.dueNextGroups}
                dueNextExpanded={props.dueNextExpanded}
                setDueNextExpanded={props.setDueNextExpanded}
                selMonth={selMonth}
                selYear={selYear}
                dueNextItemRefs={props.dueNextItemRefs}
                dueNextTargetId={props.dueNextTargetId}
                markPaid={props.markPaid}
              />
            }
          />
        )}
        {page === "bills" && (
          <Suspense fallback={lazyFallback}>
            <AccountsPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              allAccts={allAccts}
              plans={props.plans}
              planId={props.planId}
              acctOwnerF={props.acctOwnerF}
              setAcctOwnerF={props.setAcctOwnerF}
              acctCatF={props.acctCatF}
              setAcctCatF={props.setAcctCatF}
              acctStatusF={props.acctStatusF}
              setAcctStatusF={props.setAcctStatusF}
              acctSearch={props.acctSearch}
              setAcctSearch={props.setAcctSearch}
              acctGroupBy={props.acctGroupBy}
              setAcctGroupBy={props.setAcctGroupBy}
              allOwners={allOwners}
              billActivity={props.billActivity}
              allCategories={allCategories}
              inputStyle={props.inputStyle}
              selStyle={props.selStyle}
              bulkMode={props.bulkMode}
              setBulkMode={props.setBulkMode}
              bulkSelected={props.bulkSelected}
              setBulkSelected={props.setBulkSelected}
              openDueNextView={props.openDueNextView}
              acctExpanded={props.acctExpanded}
              setAcctExpanded={props.setAcctExpanded}
              swipeState={props.swipeState}
              setSwipeState={props.setSwipeState}
              updateRecord={props.updateRecord}
              showToast={props.showToast}
              showUndoToast={props.showUndoToast}
              setEditId={props.setEditId}
              editId={props.editId}
              getPrevRecord={props.getPrevRecord}
              getEffectiveApr={props.getEffectiveAprCurrent}
              markPaid={props.markPaid}
              openEdit={props.openEdit}
              setPage={props.setPage}
              theme={theme}
              buildAutoBalanceUpdates={props.buildAutoBalanceUpdates}
              launchFlags={launchFlags}
              founderAccount={founderAccount}
              workspaceMode={workspaceMode}
              householdMembers={householdMembers}
              selMonth={selMonth}
              selYear={selYear}
            />
          </Suspense>
        )}
        {page === "payoff" && (
          <Suspense fallback={lazyFallback}>
            <PayoffPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              isTablet={props.isTablet}
              allAccts={allAccts}
              planOwner={props.planOwner}
              setPlanOwner={props.setPlanOwner}
              planItems={props.planItems}
              setPlanItems={props.setPlanItems}
              planMonthlyExtra={props.planMonthlyExtra}
              setPlanMonthlyExtra={props.setPlanMonthlyExtra}
              whatIfExtra={props.whatIfExtra}
              setWhatIfExtra={props.setWhatIfExtra}
              planStrategy={props.planStrategy}
              setPlanStrategy={props.setPlanStrategy}
              payoffSimulate={props.payoffSimulate}
              getEffectiveApr={props.getEffectiveAprCurrent}
              setPlanId={props.setPlanId}
              setPlanName={props.setPlanName}
              planId={props.planId}
              plans={props.plans}
              planName={props.planName}
              setShowStrategyCompare={props.setShowStrategyCompare}
              showStrategyCompare={props.showStrategyCompare}
              lblStyle={props.lblStyle}
              selStyle={props.selStyle}
              inputStyle={props.inputStyle}
              savePlan={props.savePlan}
              saveRawPlan={props.saveRawPlan}
              saveBtnStyle={props.saveBtnStyle}
              buildDefaultPlanItems={props.buildDefaultPlanItems}
              createPlanDraft={props.createPlanDraft}
              removePlan={props.removePlan}
              selMonth={selMonth}
              selYear={selYear}
              setPlanExpanded={props.setPlanExpanded}
              planExpanded={props.planExpanded}
              whatIfExtraTimerRef={props.whatIfExtraTimerRef}
              goalDate={props.goalDate}
              setGoalDate={props.setGoalDate}
              goalRequiredExtra={props.goalRequiredExtra}
              setGoalRequiredExtra={props.setGoalRequiredExtra}
              showAllSimRows={props.showAllSimRows}
              setShowAllSimRows={props.setShowAllSimRows}
              MAX_SIMULATION_MONTHS={props.MAX_SIMULATION_MONTHS}
              SIM_DISPLAY_ROWS={props.SIM_DISPLAY_ROWS}
              launchFlags={launchFlags}
              founderAccount={founderAccount}
              workspaceMode={workspaceMode}
              householdMembers={householdMembers}
            />
          </Suspense>
        )}
        {page === "insights" && (
          <Suspense fallback={lazyFallback}>
            <TrendsPage
              c={c}
              isMobile={isMobile}
              mounted={mounted}
              allAccts={allAccts}
              allOwners={allOwners}
              billActivity={props.billActivity}
              selMonth={selMonth}
              selYear={selYear}
              income={income}
              assets={assets}
              setCatF={props.setAcctCatF}
              navigateTo={props.navigateTo}
              launchFlags={launchFlags}
              founderAccount={founderAccount}
              workspaceMode={workspaceMode}
              householdMembers={householdMembers}
            />
          </Suspense>
        )}
        {page === "billing" && (
          <Suspense fallback={lazyFallback}>
            <BillingPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              subscription={subscription}
              stripeReady={props.stripeReady}
              onStartCheckout={props.startBillingCheckout}
              onManageBilling={props.manageBilling}
            />
          </Suspense>
        )}
        {page === "beta" && (
          <Suspense fallback={lazyFallback}>
            <BetaHelpPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              appVersionLabel={appVersionLabel}
              billingEnabled={launchFlags.billingEnabled}
              openFeedback={props.openFeedback}
              copyToClipboard={props.copyToClipboard}
            />
          </Suspense>
        )}
        {page === "founder" && founderOpsVisible && (
          <Suspense fallback={lazyFallback}>
            <FounderOpsPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              appVersionLabel={appVersionLabel}
              supportEmail={supportEmail}
              launchFlags={launchFlags}
              softLaunchSummary={props.softLaunchSummary}
              feedbackSentCount={founderOpsState.feedbackSentCount}
              copyToClipboard={props.copyToClipboard}
              founderOpsTick={founderOpsTick}
            />
          </Suspense>
        )}
        {page === "admin" && founderAccount && (
          <Suspense fallback={lazyFallback}>
            <AdminPage mounted={mounted} c={c} isMobile={isMobile} user={user} showToast={props.showToast} />
          </Suspense>
        )}
        {page === "privacy" && (
          <Suspense fallback={lazyFallback}>
            <PrivacySecurityPage mounted={mounted} c={c} isMobile={isMobile} />
          </Suspense>
        )}
        {page === "support" && (
          <Suspense fallback={lazyFallback}>
            <SupportPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              supportEmail={supportEmail}
              openFeedback={props.openFeedback}
              copyToClipboard={props.copyToClipboard}
            />
          </Suspense>
        )}
        {page === "notifications" && (
          <Suspense fallback={lazyFallback}>
            <NotificationSettingsPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              notifPermission={notifPermission}
              requestBillReminderPermission={props.requestBillReminderPermission}
              reminderPreferences={props.reminderPreferences}
              preferencesLoading={props.preferencesLoading}
              patchReminderPreferences={props.patchReminderPreferences}
              pwaInstalled={pwaInstalled}
              subscription={subscription}
              founderAccount={founderAccount}
            />
          </Suspense>
        )}
        {page === "household" && (
          <Suspense fallback={lazyFallback}>
            <HouseholdPage
              c={c}
              workspaceMode={workspaceMode}
              setHouseholdSetupOpen={props.setHouseholdSetupOpen}
              setHouseholdSetupTab={props.setHouseholdSetupTab}
              householdProfile={householdProfile}
              currentHouseholdMember={currentHouseholdMember}
              householdMembers={householdMembers}
              householdRequests={householdRequests}
              canManageHousehold={canManageHousehold}
              handleApproveHouseholdRequest={props.handleApproveHouseholdRequest}
              handleRejectHouseholdRequest={props.handleRejectHouseholdRequest}
              handleLeaveHousehold={props.handleLeaveHousehold}
              handleRemoveHouseholdMember={props.handleRemoveHouseholdMember}
              handleSetMemberRole={props.handleSetMemberRole}
              userProfile={userProfile}
              householdInviteLink={props.householdInviteLink}
              subscription={subscription}
              openBillingPage={props.openBillingPage}
              handleSaveHouseholdProfile={props.handleSaveHouseholdProfile}
              handleCopyHouseholdInvite={props.handleCopyHouseholdInvite}
              handleShareHouseholdInvite={props.handleShareHouseholdInvite}
              handleInviteHouseholdMemberByUserId={props.handleInviteHouseholdMemberByUserId}
              pendingHouseholdId={props.pendingHouseholdId}
              pendingHouseholdName={props.pendingHouseholdName}
              cancelPendingRequest={props.cancelPendingRequest}
            />
          </Suspense>
        )}
        {page === "upload" && (
          <Suspense fallback={lazyFallback}>
            <UploadPage
              c={c}
              allAccts={allAccts}
              monthKey={monthKey}
              theme={theme}
              ownerOptions={Array.from(new Set([
                ...(allOwners || []),
                currentUserLabel || "",
                ...(householdMembers || []).flatMap((member) => [member?.displayName || "", member?.label || ""]),
              ].filter(Boolean)))}
              updateRecord={props.updateRecord}
              showToast={props.showToast}
              handleUpload={props.handleUpload}
              addCustomAccount={props.addCustomAccount}
            />
          </Suspense>
        )}
        {page === "history" && (
          <Suspense fallback={lazyFallback}>
            <HistoryPage
              mounted={mounted}
              c={c}
              user={user}
              isLocalUser={isLocalUser}
              ensureLocalUserData={props.ensureLocalUserData}
              monthKey={monthKey}
              loadUploads={props.loadUploads}
              workspaceScope={props.workspaceScope}
              selMonth={selMonth}
              selYear={selYear}
              normalizeAprDecimal={props.normalizeAprDecimal}
              isMobile={isMobile}
            />
          </Suspense>
        )}
        {page === "settings" && (
          <Suspense fallback={lazyFallback}>
            <SettingsPage
              mounted={mounted}
              c={c}
              isMobile={isMobile}
              appVersionLabel={appVersionLabel}
              currentUserId={user?.uid || ""}
              currentUserEmail={user?.email || ""}
              currentUserLabel={currentUserLabel}
              userIsLocal={Boolean(user?.isLocal || isLocalUser)}
              currencyCode={currencyCode}
              saveCurrencyPreference={props.saveCurrencyPreference}
              settingsOverviewRef={props.settingsOverviewRef}
              settingsBillsRef={props.settingsBillsRef}
              settingsCategoriesRef={props.settingsCategoriesRef}
              settingsDataRef={props.settingsDataRef}
              scrollToSettingsSection={props.scrollToSettingsSection}
              householdProfile={householdProfile}
              workspaceMode={workspaceMode}
              setHouseholdSetupOpen={props.setHouseholdSetupOpen}
              setHouseholdSetupTab={props.setHouseholdSetupTab}
              currentHouseholdMember={currentHouseholdMember}
              householdMembers={householdMembers}
              householdRequests={householdRequests}
              userProfile={userProfile}
              subscription={subscription}
              openBillingPage={props.openBillingPage}
              stripeReady={props.stripeReady}
              startBillingCheckout={props.startBillingCheckout}
              manageBilling={props.manageBilling}
              firebaseStatus={firebaseStatus}
              baseAccounts={baseAccounts}
              selMonth={selMonth}
              selYear={selYear}
              theme={theme}
              today={today}
              isNativeApp={props.isNativeApp}
              notifPermission={notifPermission}
              requestBillReminderPermission={props.requestBillReminderPermission}
              openNotificationSettings={() => props.navigateTo("notifications")}
              inputStyle={props.inputStyle}
              newCategoryName={props.newCategoryName}
              setNewCategoryName={props.setNewCategoryName}
              addCategory={props.addCategory}
              saveBtnStyle={props.saveBtnStyle}
              allCategories={allCategories}
              addBillSectionRef={props.addBillSectionRef}
              addAcctStep={props.addAcctStep}
              setAddAcctStep={props.setAddAcctStep}
              lblStyle={props.lblStyle}
              newAcct={props.newAcct}
              setNewAcct={props.setNewAcct}
              selStyle={props.selStyle}
              allOwners={allOwners}
              billActivity={props.billActivity}
              showToast={props.showToast}
              addCustomAccount={props.addCustomAccount}
              editingAccountId={props.editingAccountId}
              setEditingAccountId={props.setEditingAccountId}
              startEditAccount={props.startEditAccount}
              deleteAccount={props.deleteAccount}
              deleteAccounts={props.deleteAccounts}
              editAcct={props.editAcct}
              setEditAcct={props.setEditAcct}
              saveEditAccount={props.saveEditAccount}
              normalizeMonthInput={props.normalizeMonthInput}
              normalizeAprDecimal={props.normalizeAprDecimal}
              canManageHousehold={canManageHousehold}
              handleApproveHouseholdRequest={props.handleApproveHouseholdRequest}
              handleRejectHouseholdRequest={props.handleRejectHouseholdRequest}
              handleLeaveHousehold={props.handleLeaveHousehold}
              handleDeleteHousehold={props.handleDeleteHousehold}
              handleRemoveHouseholdMember={props.handleRemoveHouseholdMember}
              handleSetMemberRole={props.handleSetMemberRole}
              householdInviteLink={props.householdInviteLink}
              handleSaveHouseholdProfile={props.handleSaveHouseholdProfile}
              handleCopyHouseholdInvite={props.handleCopyHouseholdInvite}
              handleShareHouseholdInvite={props.handleShareHouseholdInvite}
              handleInviteHouseholdMemberByUserId={props.handleInviteHouseholdMemberByUserId}
              pendingHouseholdId={props.pendingHouseholdId}
              pendingHouseholdName={props.pendingHouseholdName}
              cancelPendingRequest={props.cancelPendingRequest}
              onForgotPassword={() => props.handleForgotPassword(user?.email || props.authEmail)}
              onUpdatePassword={props.handleUpdatePassword}
              onDeleteAccount={props.handleDeleteAccount}
              passwordUpdateLoading={props.passwordUpdateLoading}
              assets={assets}
              saveAssets={props.saveAssets}
              allAccts={allAccts}
              updateRecord={props.updateRecord}
              handleUpload={props.handleUpload}
              paySchedule={props.paySchedule}
              savePaySchedule={props.savePaySchedule}
              exportBackup={props.exportBackup}
              backupLoading={props.backupLoading}
              importBackup={props.importBackup}
              exportAdminBackup={props.exportAdminBackup}
              adminBackupLoading={props.adminBackupLoading}
              openFeedback={props.openFeedback}
              openPrivacyPage={() => props.setPage("privacy")}
              openSupportPage={() => props.setPage("support")}
              copyToClipboard={props.copyToClipboard}
              softLaunchSummary={props.softLaunchSummary}
              founderAccount={founderAccount}
              founderOpsVisible={founderOpsVisible}
            />
          </Suspense>
        )}
      </div>
    </PageErrorBoundary>
  );
}
