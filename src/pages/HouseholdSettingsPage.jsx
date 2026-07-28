import { useEffect, useRef, useState } from "react";
import MemberAvatar from "../components/household/MemberAvatar";
import GuidanceCard from "../components/ui/GuidanceCard";
import { buildHouseholdInviteLink, formatHouseholdRole } from "../services/householdService";

const COLOR_OPTIONS = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#22c55e"];

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });
}

async function compressProfilePhoto(file) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const sizes = [96, 80, 64, 48];
  const qualities = [0.82, 0.72, 0.62, 0.5];

  for (const size of sizes) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    for (const quality of qualities) {
      const next = canvas.toDataURL("image/webp", quality);
      if (next.length <= 10000) return next;
    }
  }

  throw new Error("That photo is still too large. Try a smaller image.");
}

export default function HouseholdSettingsPage({
  palette,
  householdProfile = {},
  householdInviteLink,
  workspaceMode,
  currentHouseholdMember,
  householdMembers = [],
  householdRequests = [],
  onOpenSetup,
  onOpenCreate,
  onOpenJoin,
  onLeave,
  userProfile,
  subscription,
  onOpenBilling,
  onSaveProfile,
  onCopyInvite,
  onShareInvite,
  onInviteByUserId,
  pendingHouseholdId = "",
  pendingHouseholdName = "",
  onCancelPendingRequest,
}) {
  const c = palette;
  const household = workspaceMode === "household" && currentHouseholdMember ? householdProfile.activeHousehold : null;
  const pendingCount = householdRequests.filter((item) => item.status === "pending").length;
  const freePlanAtLimit = subscription?.billingEnabled && !subscription?.premium && Boolean(subscription?.memberLimitReached);
  const photoInputRef = useRef(null);
  const [draft, setDraft] = useState({
    displayName: "",
    photoURL: "",
    avatarColor: COLOR_OPTIONS[0],
  });
  const [inviteUserId, setInviteUserId] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setDraft({
        displayName: currentHouseholdMember?.displayName || currentHouseholdMember?.label || userProfile?.displayName || "",
        photoURL: currentHouseholdMember?.photoURL || userProfile?.photoURL || "",
        avatarColor: currentHouseholdMember?.avatarColor || userProfile?.avatarColor || COLOR_OPTIONS[0],
      });
    });
  }, [currentHouseholdMember, userProfile]);

  const hasHousehold = workspaceMode === "household" && !!household;
  const hasPendingRequest = !hasHousehold && !!pendingHouseholdId;
  const inviteLink = hasHousehold
    ? (householdInviteLink || buildHouseholdInviteLink(household, typeof window !== "undefined" ? window.location.origin : ""))
    : "";
  const workspaceStatusLabel = hasHousehold ? "Shared" : hasPendingRequest ? "Pending" : "Solo";
  const openJoinHousehold = () => {
    if (!hasHousehold) {
      onOpenJoin?.();
      return;
    }
    const shouldContinue = typeof window === "undefined"
      ? true
      : window.confirm("Joining another household can switch your active household when that join is approved. Continue to the join flow?");
    if (!shouldContinue) return;
    onOpenJoin?.();
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Household
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>
              {hasHousehold ? (household?.name || "Shared home") : (hasPendingRequest ? pendingHouseholdName || "Pending" : "Start your shared home")}
            </div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
              {hasHousehold
                ? (household?.description || "A simple shared place for progress, payments, and the next move.")
                : hasPendingRequest
                  ? "Your request is still waiting for approval."
                  : "Create a household to track bills, debt payoff, and progress together with your partner, family, or roommates."}
            </div>
          </div>

          {hasHousehold && currentHouseholdMember?.role !== "owner" && onLeave && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={openJoinHousehold}
                style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Join household
              </button>
              <button
                type="button"
                onClick={onLeave}
                style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.da}`, background: c.daD, color: c.da, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Leave household
              </button>
            </div>
          )}

          {hasHousehold && (!onLeave || currentHouseholdMember?.role === "owner") && (
            <button
              type="button"
              onClick={openJoinHousehold}
              style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Join household
            </button>
          )}
        </div>

        {hasPendingRequest && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, background: `${c.wa}12`, border: `1.5px solid ${c.wa}55` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: `${c.wa}20`, color: c.wa, fontSize: 16, flexShrink: 0 }}>...</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: c.tx }}>Waiting for approval</div>
                <div style={{ fontSize: 11, color: c.tx2 }}>
                  Your request to join <strong>{pendingHouseholdName || "a household"}</strong> is pending. You'll be switched over once approved.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelPendingRequest}
              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
            >
              Cancel request
            </button>
          </div>
        )}

        {!hasHousehold && !hasPendingRequest && (
          <div style={{ display: "grid", gap: 12, padding: "14px 16px", borderRadius: 16, background: c.surf2, border: `1px solid ${c.border}` }}>
            <GuidanceCard
              palette={c}
              icon="+"
              title="Start your shared home"
              instruction="Use Create household to start one, or Join household if someone already invited you."
              result="Once connected, you can invite people, share a join code, and track progress together."
            />
            <div style={{ fontSize: 12, color: c.tx2 }}>
              Create your household first, then invite family, partner, or roommates.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf, border: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Current mode</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{workspaceStatusLabel}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onOpenCreate || onOpenSetup}
                style={{ padding: "11px 15px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
              >
                Create household
              </button>
              <button
                type="button"
                onClick={openJoinHousehold}
                style={{ padding: "11px 15px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Join household
              </button>
            </div>
          </div>
        )}

        {hasHousehold && (
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
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{household?.joinCode || "Unavailable"}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>People here</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>{householdMembers.length} active - {pendingCount} waiting</div>
            </div>
          </div>
        )}
      </div>

      {hasHousehold && (
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Invite someone</div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Share one link and let them join from their phone.</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 13, color: c.tx, wordBreak: "break-all" }}>
            {inviteLink || "Invite link unavailable right now."}
          </div>
          {freePlanAtLimit && (
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
              You have filled the free household. Upgrade when you want to invite more people.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                if (!inviteLink) {
                  window.alert("Create a household first before sharing an invite link.");
                  return;
                }
                onCopyInvite(inviteLink);
              }}
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => {
                if (!inviteLink) {
                  window.alert("Create a household first before sharing an invite link.");
                  return;
                }
                onShareInvite(inviteLink);
              }}
              style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Share
            </button>
            {freePlanAtLimit && (
              <button
                type="button"
                onClick={onOpenBilling}
                style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Open billing
              </button>
            )}
          </div>
          <div style={{ marginTop: 4, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>
              Invite by user ID
            </div>
            <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
              If someone shares their user ID with you, paste it here and send them an invite that shows on their home page.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={inviteUserId}
                onChange={(event) => setInviteUserId(event.target.value)}
                placeholder="Paste their user ID"
                style={{ flex: 1, minWidth: 220, padding: "11px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 14 }}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!hasHousehold) {
                    window.alert("Create a household first before sending invites.");
                    return;
                  }
                  if (!String(inviteUserId || "").trim()) {
                    window.alert("Paste their user ID first.");
                    return;
                  }
                  const sent = await onInviteByUserId?.(inviteUserId);
                  if (sent) setInviteUserId("");
                }}
                style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Send invite
              </button>
            </div>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: photoBusy ? "not-allowed" : "pointer", opacity: photoBusy ? 0.7 : 1 }}
              >
                {photoBusy ? "Adding photo..." : "Choose photo"}
              </button>
              {draft.photoURL && (
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, photoURL: "" }))}
                  style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  Remove photo
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setPhotoBusy(true);
                try {
                  const photoURL = await compressProfilePhoto(file);
                  setDraft((prev) => ({ ...prev, photoURL }));
                } catch (error) {
                  window.alert(error?.message || "Could not add that photo.");
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
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
