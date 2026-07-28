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
    handleLeaveHousehold,
    handleRemoveHouseholdMember,
    handleSetMemberRole,
    userProfile,
    householdInviteLink,
    subscription,
    openBillingPage,
    handleSaveHouseholdProfile,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
    handleInviteHouseholdMemberByUserId,
    pendingHouseholdId,
    pendingHouseholdName,
    cancelPendingRequest,
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
        householdInviteLink={householdInviteLink}
        subscription={subscription}
        onOpenBilling={openBillingPage}
        onSaveProfile={handleSaveHouseholdProfile}
        onCopyInvite={handleCopyHouseholdInvite}
        onShareInvite={handleShareHouseholdInvite}
        onInviteByUserId={handleInviteHouseholdMemberByUserId}
        pendingHouseholdId={pendingHouseholdId}
        pendingHouseholdName={pendingHouseholdName}
        onCancelPendingRequest={cancelPendingRequest}
        onOpenSetup={() => {
          setHouseholdSetupOpen(true);
          setHouseholdSetupTab('choose');
        }}
        onOpenCreate={() => {
          setHouseholdSetupOpen(true);
          setHouseholdSetupTab('create');
        }}
        onOpenJoin={() => {
          setHouseholdSetupOpen(true);
          setHouseholdSetupTab('join');
        }}
        onLeave={handleLeaveHousehold}
      />

      {workspaceMode === 'household' ? (
        <HouseholdMembersPage
          palette={c}
          householdMembers={householdMembers}
          householdRequests={householdRequests}
          currentHouseholdMember={currentHouseholdMember}
          canManageHousehold={canManageHousehold}
          subscription={subscription}
          onOpenBilling={openBillingPage}
          onApprove={handleApproveHouseholdRequest}
          onReject={handleRejectHouseholdRequest}
          onLeave={handleLeaveHousehold}
          onRemoveMember={handleRemoveHouseholdMember}
          onSetRole={handleSetMemberRole}
        />
      ) : null}
    </div>
  );
}
