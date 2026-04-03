import DueSoonBanner from "./DueSoonBanner";
import AppPageContent from "./AppPageContent";
import OnboardingFlow from "../../pages/OnboardingFlow";
import HouseholdSetupModal from "../modals/HouseholdSetupModal";

export default function AppAuthenticatedContent(props) {
  const {
    hasAuthenticatedUser,
    isMobile,
    c,
    dueBanner,
    allAccts,
    openDueNextView,
    setDueBanner,
    user,
    isLocalUser,
    householdSetupOpen,
    householdSetupTab,
    setHouseholdSetupTab,
    householdForm,
    setHouseholdForm,
    householdActionLoading,
    householdSearchLoading,
    householdSearchResults,
    lblStyle,
    inputStyle,
    selStyle,
    createCurrentHousehold,
    searchForHouseholds,
    clearHouseholdSearchResults,
    joinSelectedHousehold,
    continueSoloMode,
    setHouseholdSetupOpen,
    householdInviteLink,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
    onboardingStep,
    setOnboardingStep,
    completeOnboarding,
    currencyCode,
    saveCurrencyPreference,
    navigateTo,
  } = props;

  return (
    <>
      {hasAuthenticatedUser && (
        <>
          <div
            style={{
              paddingTop: 0,
              position: "relative",
              zIndex: isMobile ? 1 : 40,
              isolation: "isolate",
              pointerEvents: "auto",
            }}
          >
            <div style={{ pointerEvents: "auto" }}>
              <DueSoonBanner
                visible={dueBanner}
                accounts={allAccts}
                palette={c}
                isMobile={isMobile}
                onView={openDueNextView}
                onClose={() => setDueBanner(false)}
              />
            </div>
            <AppPageContent {...props} />
          </div>
          <OnboardingFlow
            c={c}
            isMobile={isMobile}
            step={onboardingStep}
            setStep={setOnboardingStep}
            completeOnboarding={completeOnboarding}
            currencyCode={currencyCode}
            currencyOptions={props.currencyOptions}
            onCurrencyChange={saveCurrencyPreference}
            openSettings={() => {
              navigateTo("settings");
              setOnboardingStep(3);
            }}
          />
        </>
      )}
      {hasAuthenticatedUser && user && !(user.isLocal || isLocalUser) && (
        <HouseholdSetupModal
          open={householdSetupOpen}
          palette={c}
          isMobile={isMobile}
          tab={householdSetupTab}
          setTab={setHouseholdSetupTab}
          form={householdForm}
          setForm={setHouseholdForm}
          actionLoading={householdActionLoading}
          searchLoading={householdSearchLoading}
          searchResults={householdSearchResults}
          lblStyle={lblStyle}
          inputStyle={inputStyle}
          selStyle={selStyle}
          onCreate={createCurrentHousehold}
          onSearch={searchForHouseholds}
          onClearSearchResults={clearHouseholdSearchResults}
          onJoin={joinSelectedHousehold}
          onContinueSolo={continueSoloMode}
          onDismiss={() => setHouseholdSetupOpen(false)}
          inviteLink={householdInviteLink}
          onCopyInvite={handleCopyHouseholdInvite}
          onShareInvite={handleShareHouseholdInvite}
        />
      )}
    </>
  );
}
