import MemberAvatar from "./MemberAvatar";

export default function HouseholdMembersRow({ palette, members = [] }) {
  const c = palette;
  const visibleMembers = members.slice(0, 5);
  const extraCount = Math.max(0, members.length - visibleMembers.length);

  return (
    <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>You're synced</div>
          <div style={{ fontSize: 13, color: c.tx2 }}>A quick look at who's moving this forward with you.</div>
        </div>
        <div style={{ fontSize: 12, color: c.muted }}>{members.length} member{members.length === 1 ? "" : "s"}</div>
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
    </div>
  );
}
