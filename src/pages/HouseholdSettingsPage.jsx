import { useEffect, useState } from "react";
import MemberAvatar from "../components/household/MemberAvatar";
import { buildHouseholdInviteLink, formatHouseholdRole } from "../services/householdService";

const COLOR_OPTIONS = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#22c55e"];

export default function HouseholdSettingsPage({
  palette,
  householdProfile,
  householdInviteLink,
  workspaceMode,
  currentHouseholdMember,
  householdMembers,
  householdRequests,
  onOpenSetup,
  userProfile,
  subscription,
  onOpenBilling,
  onSaveProfile,
  onCopyInvite,
  onShareInvite,
}) {
  const c = palette;
  const household = householdProfile.activeHousehold;
  const pendingCount = householdRequests.filter((item) => item.status === "pending").length;
  const freePlanAtLimit = subscription?.billingEnabled && !subscription?.premium && Boolean(subscription?.memberLimitReached);
  const [draft, setDraft] = useState({
    displayName: "",
    photoURL: "",
    avatarColor: COLOR_OPTIONS[0],
  });

  useEffect(() => {
    setDraft({
      displayName: currentHouseholdMember?.displayName || currentHouseholdMember?.label || userProfile?.displayName || "",
      photoURL: currentHouseholdMember?.photoURL || userProfile?.photoURL || "",
      avatarColor: currentHouseholdMember?.avatarColor || userProfile?.avatarColor || COLOR_OPTIONS[0],
    });
  }, [currentHouseholdMember, userProfile]);

  const inviteLink = householdInviteLink || buildHouseholdInviteLink(household, typeof window !== "undefined" ? window.location.origin : "");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Household
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>{household?.name || (workspaceMode === "household" ? "Shared home" : "Solo flow")}</div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
              {household?.description || "A simple shared place for progress, payments, and the next move."}
            </div>
          </div>
          <button type="button" onClick={onOpenSetup} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            {workspaceMode === "household" ? "Open setup" : "Start sharing"}
          </button>
        </div>

        {workspaceMode === "household" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Your role</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{formatHouseholdRole(currentHouseholdMember?.role)}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Join style</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx, textTransform: "capitalize" }}>{household?.joinMode || "approval"}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Join code</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{household?.joinCode || "Not ready yet"}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>People here</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{householdMembers.length} active - {pendingCount} waiting</div>
            </div>
          </div>
        )}
      </div>

      {workspaceMode === "household" && (
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Invite someone</div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Share one link and let them join from their phone.</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 13, color: c.tx, wordBreak: "break-all" }}>
            {inviteLink || "Create a household first to get your link."}
          </div>
          {freePlanAtLimit && (
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
              You have filled the free household. Upgrade when you want to invite more people.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => onCopyInvite(inviteLink)} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Copy link
            </button>
            <button type="button" onClick={() => onShareInvite(inviteLink)} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Share
            </button>
            {freePlanAtLimit && (
              <button type="button" onClick={onOpenBilling} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                Open billing
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Your look</div>
          <div style={{ fontSize: 13, color: c.tx2 }}>Use your name, your color, and a photo if you want one.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <MemberAvatar member={draft} size={56} fontSize={18} palette={c} />
          <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 220 }}>
            <input value={draft.displayName} onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="What should people call you?" style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 14 }} />
            <input value={draft.photoURL} onChange={(event) => setDraft((prev) => ({ ...prev, photoURL: event.target.value }))} placeholder="Photo link (optional)" style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 14 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Pick ${color}`}
              onClick={() => setDraft((prev) => ({ ...prev, avatarColor: color }))}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: draft.avatarColor === color ? `3px solid ${c.tx}` : `1px solid ${c.border}`,
                background: color,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <div>
          <button type="button" onClick={() => onSaveProfile(draft)} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Save your details
          </button>
        </div>
      </div>
    </div>
  );
}
