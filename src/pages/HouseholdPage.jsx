import HouseholdMembersPage from './HouseholdMembersPage';
import HouseholdSettingsPage from './HouseholdSettingsPage';

export default function HouseholdPage(props) {
  const {
    c,
    workspaceMode,
    setHouseholdSetupOpen,
    setHouseholdSetupTab,
    householdProfile,
    currentHouseholdMember,
    householdMembers,
    householdRequests,
    canManageHousehold,
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    userProfile,
    subscription,
    openBillingPage,
    handleSaveHouseholdProfile,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
  } = props;

  return (
    <div style={{ display:'grid', gap:12 }}>
      <HouseholdSettingsPage
        palette={c}
        householdProfile={householdProfile}
        workspaceMode={workspaceMode}
        currentHouseholdMember={currentHouseholdMember}
        householdMembers={householdMembers}
        householdRequests={householdRequests}
        userProfile={userProfile}
        subscription={subscription}
        onOpenBilling={openBillingPage}
        onSaveProfile={handleSaveHouseholdProfile}
        onCopyInvite={handleCopyHouseholdInvite}
        onShareInvite={handleShareHouseholdInvite}
        onOpenSetup={() => {
          setHouseholdSetupOpen(true);
          setHouseholdSetupTab('choose');
        }}
      />

      {workspaceMode === 'household' ? (
        <HouseholdMembersPage
          palette={c}
          householdMembers={householdMembers}
          householdRequests={householdRequests}
          canManageHousehold={canManageHousehold}
          subscription={subscription}
          onOpenBilling={openBillingPage}
          onApprove={handleApproveHouseholdRequest}
          onReject={handleRejectHouseholdRequest}
        />
      ) : (
        <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:18, padding:'18px 20px' }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:c.muted, marginBottom:6 }}>Solo mode</div>
          <div style={{ fontSize:18, fontWeight:800, color:c.tx, marginBottom:4 }}>Your private flow is still here</div>
          <div style={{ fontSize:13, color:c.tx2, lineHeight:1.6 }}>
            You can keep tracking on your own or start a shared household later without giving up spreadsheet import or manual entry.
          </div>
        </div>
      )}
    </div>
  );
}
