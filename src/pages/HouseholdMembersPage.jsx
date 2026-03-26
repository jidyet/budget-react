import MemberAvatar from "../components/household/MemberAvatar";
import EmptyState from "../components/feedback/EmptyState";
import UpgradeCard from "../components/billing/UpgradeCard";
import { formatHouseholdRole } from "../services/householdService";

export default function HouseholdMembersPage({
  palette,
  householdMembers,
  householdRequests,
  canManageHousehold,
  subscription,
  onOpenBilling,
  onApprove,
  onReject,
}) {
  const c = palette;
  const pendingRequests = householdRequests.filter((item) => item.status === "pending");
  const freePlanAtLimit = subscription?.billingEnabled && !subscription?.premium && Boolean(subscription?.memberLimitReached);
  const freeMemberLimit = subscription?.limits?.householdMembers || 2;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>People here</div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Real names, real faces, one shared path.</div>
          </div>
          <div style={{ fontSize: 12, color: c.muted }}>
            {householdMembers.length} active
            {!subscription?.premium && subscription?.billingEnabled ? ` - ${householdMembers.length}/${freeMemberLimit} on free` : ""}
          </div>
        </div>
        {freePlanAtLimit && (
          <UpgradeCard
            palette={c}
            compact
            title="Unlock shared progress"
            detail="Free keeps up to 2 people in one household. Upgrade when you want to keep growing together."
            cta="Open billing"
            onClick={onOpenBilling}
          />
        )}
        {householdMembers.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {householdMembers.map((member) => {
              const label = member.displayName || member.label || member.email || member.uid;
              return (
                <div key={member.id || member.uid} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <MemberAvatar member={member} size={42} fontSize={14} palette={c} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: c.tx }}>{label}</div>
                      <div style={{ fontSize: 12, color: c.muted }}>{member.email || member.uid}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ padding: "6px 10px", borderRadius: 999, background: c.acD, border: `1px solid ${c.ac}33`, color: c.ac, fontSize: 11, fontWeight: 800 }}>
                      {formatHouseholdRole(member.role)}
                    </div>
                    <div style={{ padding: "6px 10px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border}`, color: c.tx2, fontSize: 11, fontWeight: 700 }}>
                      {member.status || "active"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState palette={c} title="No one yet" message="Start by inviting the people doing this with you." />
        )}
      </div>

      {canManageHousehold && (
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Waiting to join</div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Keep it easy. Let in the people you trust.</div>
          </div>
          {pendingRequests.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {pendingRequests.map((request) => {
                const label = request.displayName || request.label || request.email || request.uid;
                return (
                  <div key={request.id || request.uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <MemberAvatar member={request} size={40} fontSize={13} palette={c} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: c.tx }}>{label}</div>
                        <div style={{ fontSize: 12, color: c.muted }}>{request.email || request.uid}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={freePlanAtLimit}
                        onClick={() => onApprove(request.uid || request.id)}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: freePlanAtLimit ? c.border2 : c.ac,
                          color: freePlanAtLimit ? c.tx2 : "#001014",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: freePlanAtLimit ? "not-allowed" : "pointer",
                        }}
                      >
                        Let them in
                      </button>
                      <button type="button" onClick={() => onReject(request.uid || request.id)} style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${c.da}`, background: c.daD, color: c.da, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                        Not now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState palette={c} title="All clear" message="No one is waiting right now." />
          )}
        </div>
      )}
    </div>
  );
}
