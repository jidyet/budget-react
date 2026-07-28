/**
 * HouseholdActivityStrip — Phase 5
 *
 * Merges HouseholdMembersRow + activity feed into one compact strip.
 *
 * Desktop: avatars | member count | divider | latest activity | + Invite button
 * Mobile:  avatars row / member count / activity line stacked
 *
 * Pending join requests shown as a subtle separate row beneath, not a full panel.
 */

import MemberAvatar from "./MemberAvatar";

export default function HouseholdActivityStrip({
  palette,
  isMobile,
  members = [],
  activity = [],
  pendingRequests = [],
  canManageHousehold = false,
  inviteLink = "",
  onShareInvite,
  onOpenSetup,
  onApprove,
  onReject,
}) {
  const c = palette;

  const sortedMembers = [...members].sort((a, b) =>
    (String(b?.role).toLowerCase() === "owner" ? 1 : 0) -
    (String(a?.role).toLowerCase() === "owner" ? 1 : 0)
  );
  const visibleAvatars = sortedMembers.slice(0, 5);
  const extraCount = Math.max(0, sortedMembers.length - visibleAvatars.length);
  const latestActivity = activity[0] || null;
  const pendingVisible = pendingRequests.slice(0, 3);
  const pendingExtra = Math.max(0, pendingRequests.length - pendingVisible.length);

  const handleInvite = () => {
    if (inviteLink) { onShareInvite?.(inviteLink); }
    else { onOpenSetup?.(); }
  };

  return (
    <div
      style={{
        background: c.surf,
        border: `1px solid ${c.border}`,
        borderRadius: 18,
        padding: isMobile ? "14px 16px" : "14px 18px",
        marginBottom: 16,
      }}
    >
      {/* ── Main strip ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {/* Avatar stack */}
        <div style={{ display: "flex", alignItems: "center", gap: -6, flexShrink: 0 }}>
          {visibleAvatars.map((member, i) => (
            <div
              key={member.id || member.uid || i}
              style={{
                marginLeft: i === 0 ? 0 : -10,
                border: `2px solid ${c.surf}`,
                borderRadius: "50%",
                zIndex: visibleAvatars.length - i,
                position: "relative",
              }}
            >
              <MemberAvatar member={member} size={34} fontSize={12} palette={c} />
            </div>
          ))}
          {extraCount > 0 && (
            <div
              style={{
                marginLeft: -10,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: c.surf2,
                border: `2px solid ${c.surf}`,
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                fontWeight: 900,
                color: c.muted,
                position: "relative",
                zIndex: 0,
              }}
            >
              +{extraCount}
            </div>
          )}
        </div>

        {/* Member count */}
        <div style={{ fontSize: 12, fontWeight: 800, color: c.tx2, flexShrink: 0, whiteSpace: "nowrap" }}>
          {sortedMembers.length} {sortedMembers.length === 1 ? "person" : "people"}
        </div>

        {/* Divider */}
        {!isMobile && latestActivity && (
          <div style={{ width: 1, height: 28, background: c.border, flexShrink: 0 }} />
        )}

        {/* Latest activity */}
        {latestActivity && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              color: c.tx2,
              lineHeight: 1.4,
              whiteSpace: isMobile ? "normal" : "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span style={{ color: c.muted, marginRight: 4 }}>·</span>
            {latestActivity.title}
            {latestActivity.timestamp && (
              <span style={{ color: c.muted, marginLeft: 6, fontSize: 11 }}>
                {latestActivity.timestamp}
              </span>
            )}
          </div>
        )}

        {/* Invite button */}
        {canManageHousehold && (
          <button
            type="button"
            onClick={handleInvite}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "7px 13px",
              borderRadius: 999,
              border: `1px solid ${c.ac}55`,
              background: `${c.ac}12`,
              color: c.ac,
              fontSize: 11,
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Invite
          </button>
        )}
      </div>

      {/* ── Pending requests row ─────────────────────────────────────────── */}
      {pendingVisible.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${c.border}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, color: c.wa, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
            Waiting to join
          </div>
          {pendingVisible.map((req) => {
            const label = req.displayName || req.email || "Someone";
            const reqId = req.uid || req.id;
            return (
              <div
                key={reqId || label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: `${c.wa}10`,
                  border: `1px solid ${c.wa}33`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: c.tx }}>{label}</div>
                {canManageHousehold && (
                  <>
                    <button
                      type="button"
                      onClick={() => onApprove?.(reqId)}
                      style={{ padding: "3px 9px", borderRadius: 6, border: "none", background: c.go, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      Let in
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject?.(reqId)}
                      style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      No
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {pendingExtra > 0 && (
            <div style={{ fontSize: 11, color: c.wa, fontWeight: 700 }}>+{pendingExtra} more</div>
          )}
        </div>
      )}
    </div>
  );
}
