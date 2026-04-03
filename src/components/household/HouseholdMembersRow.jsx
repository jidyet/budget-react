import MemberAvatar from "./MemberAvatar";

export default function HouseholdMembersRow({ palette, members = [], pendingRequests = [], canManageHousehold = false, inviteLink = "", onShareInvite, onOpenSetup, onApprove, onReject }) {
  const c = palette;
  const sortedMembers = [...members].sort((a, b) => {
    const aOwner = String(a?.role || "").toLowerCase() === "owner" ? 1 : 0;
    const bOwner = String(b?.role || "").toLowerCase() === "owner" ? 1 : 0;
    return bOwner - aOwner;
  });
  const visibleMembers = sortedMembers.slice(0, 5);
  const extraCount = Math.max(0, sortedMembers.length - visibleMembers.length);
  const visiblePending = pendingRequests.slice(0, 3);
  const extraPending = Math.max(0, pendingRequests.length - visiblePending.length);

  return (
    <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Members Online</div>
          <div style={{ fontSize: 13, color: c.tx2 }}>A quick look at who is moving forward with you.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: c.muted }}>
            {sortedMembers.length} member{sortedMembers.length === 1 ? "" : "s"}
            {pendingRequests.length > 0 ? ` • ${pendingRequests.length} waiting` : ""}
          </div>
          {canManageHousehold && (
            <button
              type="button"
              onClick={() => inviteLink ? (onShareInvite && onShareInvite(inviteLink)) : (onOpenSetup && onOpenSetup())}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: 999,
                border: `1px solid ${c.ac}55`,
                background: `${c.ac}12`,
                color: c.ac,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              + Invite
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {visibleMembers.map((member, index) => {
          const label = member.displayName || member.label || member.email || member.uid || `Member ${index + 1}`;
          return (
            <div key={member.id || member.uid || label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border}` }}>
              <MemberAvatar member={member} size={30} fontSize={11} palette={c} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.tx, lineHeight: 1.2 }}>{label}</div>
                <div style={{ fontSize: 11, color: c.muted, textTransform: "capitalize" }}>{member.role || "member"}</div>
              </div>
            </div>
          );
        })}
        {extraCount > 0 && (
          <div style={{ padding: "8px 10px", borderRadius: 999, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 12, fontWeight: 700, color: c.tx2 }}>
            +{extraCount} more
          </div>
        )}
      </div>
      {!!visiblePending.length && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {visiblePending.map((request, index) => {
            const label = request.displayName || request.email || `Invite ${index + 1}`;
            const requestId = request.uid || request.id;
            return (
              <div key={requestId || label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 14, background: `${c.wa}12`, border: `1px solid ${c.wa}44`, flexWrap: "wrap" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", background: `${c.wa}18`, color: c.wa, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                  ?
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: c.tx, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: c.wa }}>Wants to join</div>
                </div>
                {canManageHousehold && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => onApprove && onApprove(requestId)}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: c.go, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      Let in
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject && onReject(requestId)}
                      style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {extraPending > 0 && (
            <div style={{ padding: "8px 10px", borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}33`, fontSize: 12, fontWeight: 700, color: c.wa }}>
              +{extraPending} waiting
            </div>
          )}
        </div>
      )}
    </div>
  );
}
