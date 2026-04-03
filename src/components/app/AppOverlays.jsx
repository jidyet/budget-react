import MoreDrawer from "./MoreDrawer";
import FilterSheet from "../overlays/FilterSheet";
import CmdkSearch from "../overlays/CmdkSearch";
import EditPanelModal from "../overlays/EditPanelModal";
import IncomeModal from "../overlays/IncomeModal";
import ConfirmDialog from "../feedback/ConfirmDialog";
import UndoToast from "../feedback/UndoToast";
import FeedbackModal from "../feedback/FeedbackModal";
import SuccessToast from "../ui/SuccessToast";
import MobileActionBar from "./MobileActionBar";
import MobileBottomNav from "./MobileBottomNav";

export default function AppOverlays(props) {
  const {
    hasAuthenticatedUser,
    showMoreDrawer,
    page,
    c,
    isMobile,
    navigateTo,
    founderOpsVisible,
    founderAccount,
    currentUserLabel,
    userProfile,
    showIncome,
    incomeReceipts,
    boaPayPeriods,
    eagleviewPayPeriods,
    paySchedule,
    updateIncomeReceipt,
    recurringIncomeEntries,
    manualIncomeEntries,
    newInc,
    setNewInc,
    incomeSources,
    lblStyle,
    selStyle,
    inputStyle,
    saveBtnStyle,
    addIncome,
    saveCurrentAsIncomeSchedule,
    applyIncomeSchedule,
    incomeTemplates,
    setShowIncome,
    safeTop,
    safeBottom,
    editId,
    allAccts,
    theme,
    updateRecord,
    buildAutoBalanceUpdates,
    accountOverrides,
    setAccountOverrides,
    customAccounts,
    userCategories,
    setUserCategories,
    allCategories,
    deletedAccountIds,
    showToast,
    setEditId,
    showMobileActionBar,
    mobileActionBarConfig,
    NAV,
    setShowMoreDrawer,
    showFilterSheet,
    acctOwnerF,
    setAcctOwnerF,
    acctCatF,
    setAcctCatF,
    acctStatusF,
    setAcctStatusF,
    setShowFilterSheet,
    confirmState,
    closeConfirm,
    feedbackOpen,
    feedbackValues,
    feedbackSending,
    feedbackError,
    closeFeedback,
    patchFeedback,
    sendFeedback,
    undoStack,
    undoTimerRef,
    setUndoStack,
    cmdkOpen,
    cmdkQuery,
    setCmdkQuery,
    cmdkResults,
    cmdkInputRef,
    setCmdkOpen,
    toast,
    reducedMotion,
  } = props;

  return (
    <>
      {hasAuthenticatedUser && (
        <MoreDrawer
          open={showMoreDrawer}
          page={page}
          palette={c}
          isMobile={isMobile}
          safeTop={safeTop}
          currentUserLabel={currentUserLabel}
          userProfile={userProfile}
          onClose={() => setShowMoreDrawer(false)}
          navigateTo={navigateTo}
          founderOpsEnabled={founderOpsVisible}
          adminEnabled={founderAccount}
        />
      )}
      {hasAuthenticatedUser && showIncome && (
        <IncomeModal
          c={c}
          isMobile={isMobile}
          incomeReceipts={incomeReceipts}
          boaPayPeriods={boaPayPeriods}
          eagleviewPayPeriods={eagleviewPayPeriods}
          boaLabel={paySchedule?.boaLabel || "Paycheck A"}
          eagleviewLabel={paySchedule?.eagleviewLabel || "Paycheck B"}
          updateIncomeReceipt={updateIncomeReceipt}
          recurringIncomeEntries={recurringIncomeEntries}
          manualIncomeEntries={manualIncomeEntries}
          newInc={newInc}
          setNewInc={setNewInc}
          incomeSources={incomeSources}
          lblStyle={lblStyle}
          selStyle={selStyle}
          inputStyle={inputStyle}
          saveBtnStyle={saveBtnStyle}
          addIncome={addIncome}
          saveCurrentAsIncomeSchedule={saveCurrentAsIncomeSchedule}
          applyIncomeSchedule={applyIncomeSchedule}
          incomeTemplates={incomeTemplates}
          onClose={() => setShowIncome(false)}
        />
      )}
      <EditPanelModal
        c={c}
        isMobile={isMobile}
        safeBottom={safeBottom}
        editId={editId}
        allAccts={allAccts}
        theme={theme}
        updateRecord={updateRecord}
        buildAutoBalanceUpdates={buildAutoBalanceUpdates}
        accountOverrides={accountOverrides}
        setAccountOverrides={setAccountOverrides}
        customAccounts={customAccounts}
        userCategories={userCategories}
        setUserCategories={setUserCategories}
        allCategories={allCategories}
        incomeTemplates={incomeTemplates}
        deletedAccountIds={deletedAccountIds}
        showToast={showToast}
        onClose={() => setEditId(null)}
      />
      {isMobile && (
        <>
          {showMobileActionBar && (
            <MobileActionBar
              palette={c}
              safeBottom={safeBottom}
              title={mobileActionBarConfig.title}
              subtitle={mobileActionBarConfig.subtitle}
              actions={mobileActionBarConfig.actions}
              status={mobileActionBarConfig.status}
            />
          )}
          <MobileBottomNav
            navItems={NAV}
            page={page}
            palette={c}
            showMoreDrawer={showMoreDrawer}
            setShowMoreDrawer={setShowMoreDrawer}
            navigateTo={navigateTo}
            safeBottom={safeBottom}
          />
        </>
      )}
      {isMobile && showFilterSheet && (
        <FilterSheet
          c={c}
          allAccts={allAccts}
          ownerF={acctOwnerF}
          setOwnerF={setAcctOwnerF}
          catF={acctCatF}
          setCatF={setAcctCatF}
          filt={acctStatusF}
          setFilt={setAcctStatusF}
          FILTERS={["All", "Unpaid", "Paid"]}
          onClose={() => setShowFilterSheet(false)}
        />
      )}
      <ConfirmDialog state={confirmState} palette={c} isMobile={isMobile} onClose={closeConfirm} />
      <FeedbackModal
        open={feedbackOpen}
        palette={c}
        isMobile={isMobile}
        values={feedbackValues}
        sending={feedbackSending}
        error={feedbackError}
        onClose={closeFeedback}
        onChange={patchFeedback}
        onSubmit={sendFeedback}
      />
      <UndoToast
        undoStack={undoStack}
        palette={c}
        isMobile={isMobile}
        safeBottom={safeBottom}
        onUndo={() => {
          undoStack.restore();
          setUndoStack(null);
          clearTimeout(undoTimerRef.current);
        }}
        onDismiss={() => {
          setUndoStack(null);
          clearTimeout(undoTimerRef.current);
        }}
      />
      {cmdkOpen && (
        <CmdkSearch
          c={c}
          isMobile={isMobile}
          cmdkQuery={cmdkQuery}
          setCmdkQuery={setCmdkQuery}
          cmdkResults={cmdkResults}
          cmdkInputRef={cmdkInputRef}
          founderOpsVisible={founderOpsVisible}
          navigateTo={navigateTo}
          onClose={() => setCmdkOpen(false)}
        />
      )}
      <SuccessToast toast={toast} palette={c} reducedMotion={reducedMotion} />
    </>
  );
}
