import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptHouseholdInvite,
  approveJoinRequest,
  continueSoloWorkspace,
  createHousehold,
  declineHouseholdInvite,
  ensureHouseholdDirectoryEntry,
  fetchHouseholdMembership,
  fetchHouseholdById,
  inviteUserToHousehold,
  leaveHousehold,
  removeHouseholdMember,
  rejectJoinRequest,
  requestJoinHousehold,
  saveHouseholdMemberProfile,
  saveUserProfile,
  saveUserSettings,
  searchHouseholds,
  subscribeHouseholdForUser,
  subscribeHouseholdInvites,
  subscribeHouseholdMembers,
  subscribeJoinRequests,
  subscribeUserWorkspace,
} from "../firebase";
import { buildHouseholdInviteLink } from "../services/householdService";

const getInviteSearchTermFromLocation = () => {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const queryJoinCode = url.searchParams.get("joinCode") || url.searchParams.get("join");
    const queryHouseholdId = url.searchParams.get("household") || url.searchParams.get("householdId") || url.searchParams.get("hid");
    const hashParams = new URLSearchParams(String(url.hash || "").replace(/^#/, ""));
    const hashJoinCode = hashParams.get("joinCode") || hashParams.get("join");
    const hashHouseholdId = hashParams.get("household") || hashParams.get("householdId") || hashParams.get("hid");
    const joinCode = String(queryJoinCode || hashJoinCode || "").trim().toUpperCase();
    const householdId = String(queryHouseholdId || hashHouseholdId || "").trim();
    if (!joinCode && !householdId) return "";
    if (joinCode && householdId) return `#join=${joinCode}&household=${householdId}`;
    return joinCode || householdId;
  } catch {
    return "";
  }
};

export default function useHouseholdWorkspace({
  user,
  userProfile,
  isLocalUser,
  buildHouseholdSeed,
  showToast,
}) {
  const [workspaceMode, setWorkspaceMode] = useState("solo");
  const [activeHouseholdId, setActiveHouseholdId] = useState("");
  const [householdProfile, setHouseholdProfile] = useState({ activeHousehold: null, memberships: [] });
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [householdRequests, setHouseholdRequests] = useState([]);
  const [householdSetupOpen, setHouseholdSetupOpen] = useState(false);
  const [householdSetupTab, setHouseholdSetupTab] = useState("choose");
  const [householdForm, setHouseholdForm] = useState({ name: "", description: "", joinMode: "approval", search: "" });
  const [householdSearchResults, setHouseholdSearchResults] = useState([]);
  const [householdSearchLoading, setHouseholdSearchLoading] = useState(false);
  const [householdActionLoading, setHouseholdActionLoading] = useState(false);
  const [pendingHouseholdId, setPendingHouseholdId] = useState("");
  const [pendingHouseholdName, setPendingHouseholdName] = useState("");
  const [incomingHouseholdInvites, setIncomingHouseholdInvites] = useState([]);
  const [householdMembersReady, setHouseholdMembersReady] = useState(false);

  const resetToSoloWorkspace = useCallback((options = {}) => {
    const {
      clearPending = true,
      clearSetup = false,
      syncRemote = false,
      logLabel = "reset household workspace",
    } = options;

    setActiveHouseholdId("");
    setWorkspaceMode("solo");
    setHouseholdProfile({ activeHousehold: null, memberships: [] });
    setHouseholdMembers([]);
    setHouseholdRequests([]);
    setHouseholdMembersReady(false);
    if (clearSetup) setHouseholdSetupOpen(false);
    if (clearPending) {
      setPendingHouseholdId("");
      setPendingHouseholdName("");
    }
    if (syncRemote && user?.uid && !user?.isLocal && !isLocalUser) {
      saveUserSettings(user.uid, {
        activeHouseholdId: "",
        householdSetupDone: true,
        workspaceMode: "solo",
        pendingHouseholdId: clearPending ? "" : pendingHouseholdId,
        pendingHouseholdName: clearPending ? "" : pendingHouseholdName,
      }).catch((error) => {
        console.error(`${logLabel} error`, error);
      });
    }
  }, [isLocalUser, pendingHouseholdId, pendingHouseholdName, user?.isLocal, user?.uid]);

  // Refs so the membership-sync effect can read current values without listing
  // them as deps — prevents the race where subscribeUserWorkspace fires first
  // (setting solo/empty) and stale householdProfile re-overrides back to household.
  const activeHouseholdIdRef = useRef(activeHouseholdId);
  activeHouseholdIdRef.current = activeHouseholdId;
  const workspaceModeRef = useRef(workspaceMode);
  workspaceModeRef.current = workspaceMode;

  useEffect(() => {
    setWorkspaceMode("solo");
    setActiveHouseholdId("");
    setHouseholdProfile({ activeHousehold: null, memberships: [] });
    setHouseholdMembers([]);
    setHouseholdRequests([]);
    setHouseholdSetupOpen(false);
    setHouseholdSetupTab("choose");
    setHouseholdSearchResults([]);
    setPendingHouseholdId("");
    setPendingHouseholdName("");
    setIncomingHouseholdInvites([]);
    setHouseholdMembersReady(false);
  }, [user?.uid, isLocalUser]);

  // Derive actorName as a stable string so workspaceScope doesn't recreate on
  // every Firestore householdMembers snapshot when the name hasn't changed.
  const actorName = useMemo(() => {
    if (!user) return "Member";
    const currentMember = (householdMembers || []).find(
      (m) => String(m.uid || m.id) === String(user.uid)
    );
    return (
      currentMember?.displayName ||
      currentMember?.label ||
      userProfile?.displayName ||
      (user.email ? user.email.split("@")[0] : "Member")
    );
  }, [user, householdMembers, userProfile?.displayName]);

  const workspaceScope = useMemo(() => {
    if (!user || user.isLocal || isLocalUser || !activeHouseholdId) return null;
    return {
      householdId: activeHouseholdId,
      actorUid: user.uid,
      actorEmail: user.email || "",
      actorName,
    };
  }, [user, isLocalUser, activeHouseholdId, actorName]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdSetupOpen(false);
      return;
    }
    const unsub = subscribeUserWorkspace(user.uid, (settings) => {
      const nextMode = settings?.workspaceMode || "solo";
      setWorkspaceMode(nextMode);
      setActiveHouseholdId(settings?.activeHouseholdId || "");
      setPendingHouseholdId(settings?.pendingHouseholdId || "");
      setPendingHouseholdName(settings?.pendingHouseholdName || "");
      if (nextMode !== "household" || !settings?.activeHouseholdId) {
        setHouseholdProfile({ activeHousehold: null, memberships: [] });
        setHouseholdMembers([]);
        setHouseholdRequests([]);
        setHouseholdMembersReady(false);
      }
      // Only show setup modal if they haven't made a choice yet
      const needsHouseholdChoice = !settings?.householdSetupDone && !settings?.pendingHouseholdId;
      setHouseholdSetupOpen(!!needsHouseholdChoice);
      if (needsHouseholdChoice) setHouseholdSetupTab("choose");
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setHouseholdProfile({ activeHousehold: null, memberships: [] });
      return;
    }
    const unsub = subscribeHouseholdForUser(user.uid, (profile) => {
      setHouseholdProfile(profile);
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setIncomingHouseholdInvites([]);
      return;
    }
    const unsub = subscribeHouseholdInvites(user.uid, (items) => {
      setIncomingHouseholdInvites(items || []);
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    const acceptedInvite = (incomingHouseholdInvites || []).find((item) =>
      item?.status === "accepted" && String(item?.householdId || item?.id || "") === String(activeHouseholdId || "")
    );
    if (!acceptedInvite) return;
    const notifyKey = `budget_household_accepted_${user.uid}_${acceptedInvite.householdId || acceptedInvite.id}`;
    if (typeof window !== "undefined" && localStorage.getItem(notifyKey)) return;
    if (typeof window !== "undefined") localStorage.setItem(notifyKey, "1");
    showToast(`You were added to ${acceptedInvite.householdName || "the household"}`, "success");
    declineHouseholdInvite(user.uid, acceptedInvite.householdId || acceptedInvite.id).catch((error) => {
      console.error("clear accepted household invite error", error);
    });
  }, [user, isLocalUser, activeHouseholdId, incomingHouseholdInvites, showToast]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    const activeMembershipId = householdProfile?.activeHousehold?.id || "";
    if (!activeMembershipId) return;
    // Read current values via refs — NOT as deps — so this effect only re-runs
    // when the membership data itself changes (householdProfile.activeHousehold.id).
    // If subscribeUserWorkspace fires first and clears the workspace to "solo",
    // we must NOT let stale householdProfile data override it back to "household".
    // The effect will run again when subscribeHouseholdForUser catches up and
    // sets householdProfile.activeHousehold to null, at which point activeMembershipId
    // will be "" and we return early — correctly leaving the solo reset in place.
    if (activeHouseholdIdRef.current === activeMembershipId && workspaceModeRef.current === "household") return;

    // Membership changed: sync workspace and close any lingering setup modal
    setActiveHouseholdId(activeMembershipId);
    setWorkspaceMode("household");
    setHouseholdSetupOpen(false);

    setPendingHouseholdId("");
    setPendingHouseholdName("");
    saveUserSettings(user.uid, {
      activeHouseholdId: activeMembershipId,
      householdSetupDone: true,
      workspaceMode: "household",
      pendingHouseholdId: "",
      pendingHouseholdName: "",
    }).catch((error) => {
      console.error("sync approved household workspace error", error);
    });
  }, [user, isLocalUser, householdProfile?.activeHousehold?.id]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    if (!activeHouseholdId || workspaceMode !== "household") return;
    let cancelled = false;

    Promise.all([
      fetchHouseholdById(activeHouseholdId),
      fetchHouseholdMembership(activeHouseholdId, user.uid),
    ]).then(([, member]) => {
      if (cancelled) return;
      if (member?.status === "active") return;
      resetToSoloWorkspace({
        syncRemote: true,
        logLabel: "validate active household membership",
      });
    }).catch((error) => {
      console.error("active household validation fetch error", error);
    });

    return () => {
      cancelled = true;
    };
  }, [user, isLocalUser, activeHouseholdId, workspaceMode, resetToSoloWorkspace]);

  useEffect(() => {
    if (!activeHouseholdId) {
      setHouseholdMembers([]);
      setHouseholdRequests([]);
      setHouseholdMembersReady(false);
      return;
    }
    const unsubMembers = subscribeHouseholdMembers(activeHouseholdId, (items) => {
      setHouseholdMembers(items || []);
      setHouseholdMembersReady(true);
    });
    const unsubRequests = subscribeJoinRequests(activeHouseholdId, setHouseholdRequests);
    return () => {
      unsubMembers && unsubMembers();
      unsubRequests && unsubRequests();
    };
  }, [activeHouseholdId]);

  const currentHouseholdMember = useMemo(
    () => householdMembers.find((member) => String(member.uid || member.id) === String(user?.uid || "")),
    [householdMembers, user?.uid]
  );
  const canManageHousehold = ["owner", "admin"].includes(currentHouseholdMember?.role || "");
  const resolvedHousehold = useMemo(
    () => householdProfile.activeHousehold || householdProfile.memberships?.find((item) => String(item.id) === String(activeHouseholdId)) || null,
    [householdProfile, activeHouseholdId]
  );
  const householdInviteLink = buildHouseholdInviteLink(
    resolvedHousehold,
    typeof window !== "undefined" ? window.location.origin : ""
  );

  useEffect(() => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    if (!canManageHousehold) return;
    const directorySeed = resolvedHousehold || householdProfile?.activeHousehold || null;
    if (!directorySeed?.name && !directorySeed?.joinCode) return;
    ensureHouseholdDirectoryEntry(activeHouseholdId, directorySeed).catch((error) => {
      console.error("ensureHouseholdDirectoryEntry error", error);
    });
  }, [activeHouseholdId, canManageHousehold, resolvedHousehold, householdProfile?.activeHousehold, user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    if (!activeHouseholdId || workspaceMode !== "household") return;
    if (!householdMembersReady) return;
    const stillMember = (householdMembers || []).some((member) => String(member.uid || member.id) === String(user.uid));
    if (stillMember) return;

    resetToSoloWorkspace({
      syncRemote: true,
      logLabel: "reset missing active household member",
    });
  }, [user, isLocalUser, activeHouseholdId, workspaceMode, householdMembersReady, householdMembers, resetToSoloWorkspace]);

  const searchForHouseholds = useCallback(async (overrideTerm = "") => {
    setHouseholdSearchLoading(true);
    try {
      const term = String(overrideTerm || householdForm.search || "").trim();
      if (!term) {
        setHouseholdSearchResults([]);
        return;
      }
      const results = await searchHouseholds(term);
      setHouseholdSearchResults(results);
    } catch (e) {
      console.error("searchForHouseholds error", e);
      showToast("Search failed", "error");
    } finally {
      setHouseholdSearchLoading(false);
    }
  }, [householdForm.search, showToast]);

  const clearHouseholdSearchResults = useCallback(() => {
    setHouseholdSearchResults([]);
    setHouseholdSearchLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !user || user.isLocal || isLocalUser) return;
    const inviteTerm = getInviteSearchTermFromLocation();
    if (!inviteTerm) return;
    setHouseholdSetupTab("join");
    setHouseholdSetupOpen(true);
    setHouseholdForm((prev) => ({ ...prev, search: inviteTerm }));
    searchForHouseholds(inviteTerm);
    history.replaceState(null, "", window.location.pathname);
  }, [user, isLocalUser, searchForHouseholds]);

  const createCurrentHousehold = async () => {
    if (!user || user.isLocal || isLocalUser) return;
    const name = String(householdForm.name || "").trim();
    if (!name) {
      showToast("Household name is required", "error");
      return;
    }
    setHouseholdActionLoading(true);
    try {
      const seed = typeof buildHouseholdSeed === "function" ? buildHouseholdSeed() : null;
      const created = await createHousehold({ ...user, ...userProfile }, householdForm, seed);
      setHouseholdProfile((prev) => ({
        activeHousehold: created,
        memberships: [
          created,
          ...((prev?.memberships || []).filter((item) => String(item.id) !== String(created.id))),
        ],
      }));
      setActiveHouseholdId(created.id);
      setWorkspaceMode("household");
      // Keep modal open, switch to invite tab so the owner can copy/share right away
      setHouseholdSetupTab("invite");
      showToast(`Household created! Code: ${created.joinCode}`, "success");
    } catch (e) {
      console.error("createCurrentHousehold error", e);
      showToast(`Could not create household${e?.message ? `: ${e.message}` : ""}`, "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const joinSelectedHousehold = async (household) => {
    if (!user || user.isLocal || isLocalUser) return;
    setHouseholdActionLoading(true);
    try {
      const result = await requestJoinHousehold({ ...user, ...userProfile }, household);
      if (result.status === "joined") {
        setHouseholdProfile((prev) => ({
          activeHousehold: household,
          memberships: [
            household,
            ...((prev?.memberships || []).filter((item) => String(item.id) !== String(household.id))),
          ],
        }));
        setActiveHouseholdId(household.id);
        setWorkspaceMode("household");
        setHouseholdSetupOpen(false);
        showToast(`Joined ${household.name}`, "success");
      } else {
        // Save pending state so the setup modal doesn't reopen on page reload
        setPendingHouseholdId(household.id);
        setPendingHouseholdName(household.name || "");
        await saveUserSettings(user.uid, {
          householdSetupDone: true,
          pendingHouseholdId: household.id,
          pendingHouseholdName: household.name || "",
        }).catch((e) => console.error("save pending join state error", e));
        setHouseholdSetupOpen(false);
        showToast(`Join request sent to ${household.name}`, "success");
      }
    } catch (e) {
      console.error("joinSelectedHousehold error", e);
      showToast(e?.message || "Could not join household", "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const cancelPendingRequest = async () => {
    if (!user || user.isLocal || isLocalUser) return;
    setPendingHouseholdId("");
    setPendingHouseholdName("");
    await saveUserSettings(user.uid, {
      pendingHouseholdId: "",
      pendingHouseholdName: "",
    }).catch((e) => console.error("cancelPendingRequest error", e));
    showToast("Join request cancelled");
  };

  const continueSoloMode = async () => {
    if (!user || user.isLocal || isLocalUser) return;
    setHouseholdActionLoading(true);
    try {
      await continueSoloWorkspace(user.uid);
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdSetupOpen(false);
      showToast("Continuing in solo mode");
    } catch (e) {
      console.error("continueSoloMode error", e);
      showToast("Could not update workspace mode", "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const handleSaveHouseholdProfile = async (profile) => {
    if (!user || user.isLocal || isLocalUser) return;
    const nextProfile = {
      uid: user.uid,
      email: user.email || "",
      displayName: String(profile?.displayName || "").trim() || (user.email ? user.email.split("@")[0] : "Member"),
      photoURL: String(profile?.photoURL || "").trim(),
      avatarColor: String(profile?.avatarColor || "").trim(),
    };
    try {
      await saveUserProfile(user.uid, nextProfile);
      if (activeHouseholdId) {
        await saveHouseholdMemberProfile(activeHouseholdId, user.uid, nextProfile);
      }
      showToast("Your details are saved", "success");
    } catch (e) {
      console.error("handleSaveHouseholdProfile error", e);
      showToast("Could not save your details", "error");
    }
  };

  const syncDirectoryBeforeInvite = async () => {
    if (!activeHouseholdId || !canManageHousehold) return;
    const seed = resolvedHousehold || householdProfile?.activeHousehold;
    if (!seed?.name && !seed?.joinCode) return;
    try {
      await ensureHouseholdDirectoryEntry(activeHouseholdId, seed);
    } catch (e) {
      console.error("syncDirectoryBeforeInvite error", e);
    }
  };

  const handleCopyHouseholdInvite = async (link) => {
    const nextLink = String(link || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
    await syncDirectoryBeforeInvite();
    try {
      await navigator.clipboard.writeText(nextLink);
      showToast("Invite link copied", "success");
    } catch (e) {
      console.error("handleCopyHouseholdInvite error", e);
      showToast("Could not copy the link", "error");
    }
  };

  const handleShareHouseholdInvite = async (link) => {
    const nextLink = String(link || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
    await syncDirectoryBeforeInvite();
    try {
      if (navigator.share) {
        await navigator.share({
          title: householdProfile.activeHousehold?.name || "TrackToZero",
          text: "Join our shared progress space.",
          url: nextLink,
        });
        return;
      }
      await handleCopyHouseholdInvite(nextLink);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error("handleShareHouseholdInvite error", e);
      showToast("Could not share the link", "error");
    }
  };

  const handleApproveHouseholdRequest = async (requestUserId) => {
    if (!activeHouseholdId || !user) return;
    try {
      await approveJoinRequest(activeHouseholdId, requestUserId, user);
      showToast("Join request approved");
    } catch (e) {
      console.error("handleApproveHouseholdRequest error", e);
      showToast("Could not approve request", "error");
    }
  };

  const handleRejectHouseholdRequest = async (requestUserId) => {
    if (!activeHouseholdId || !user) return;
    try {
      await rejectJoinRequest(activeHouseholdId, requestUserId, user);
      showToast("Join request rejected");
    } catch (e) {
      console.error("handleRejectHouseholdRequest error", e);
      showToast("Could not reject request", "error");
    }
  };

  const handleLeaveHousehold = async () => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    try {
      await leaveHousehold(user.uid, activeHouseholdId);
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdProfile({ activeHousehold: null, memberships: [] });
      showToast("You left the household");
    } catch (e) {
      console.error("handleLeaveHousehold error", e);
      showToast(e?.message || "Could not leave household", "error");
    }
  };

  const handleRemoveHouseholdMember = async (targetUid) => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    try {
      await removeHouseholdMember(activeHouseholdId, targetUid, user);
      showToast("Member removed");
    } catch (e) {
      console.error("handleRemoveHouseholdMember error", e);
      showToast(e?.message || "Could not remove member", "error");
    }
  };

  const handleInviteHouseholdMemberByUserId = async (targetUid) => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return false;
    try {
      await inviteUserToHousehold(activeHouseholdId, targetUid, user);
      showToast("Invite sent");
      return true;
    } catch (e) {
      console.error("handleInviteHouseholdMemberByUserId error", e);
      showToast(e?.message || "Could not send invite", "error");
      return false;
    }
  };

  const handleAcceptHouseholdInvite = async (householdId) => {
    if (!user || user.isLocal || isLocalUser) return;
    setHouseholdActionLoading(true);
    try {
      const result = await acceptHouseholdInvite({ ...user, ...userProfile }, householdId);
      if (result.status === "joined") {
        setPendingHouseholdId("");
        setPendingHouseholdName("");
        showToast(`Joined ${result.household?.name || "household"}`, "success");
      } else {
        setPendingHouseholdId(result.household?.id || householdId);
        setPendingHouseholdName(result.household?.name || "");
        await saveUserSettings(user.uid, {
          householdSetupDone: true,
          pendingHouseholdId: result.household?.id || householdId,
          pendingHouseholdName: result.household?.name || "",
        }).catch((e) => console.error("save invited pending join state error", e));
        showToast(`Request sent to ${result.household?.name || "household"}`, "success");
      }
    } catch (e) {
      console.error("handleAcceptHouseholdInvite error", e);
      showToast(e?.message || "Could not accept invite", "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const handleDeclineHouseholdInvite = async (householdId) => {
    if (!user || user.isLocal || isLocalUser) return;
    try {
      await declineHouseholdInvite(user.uid, householdId);
      showToast("Invite dismissed");
    } catch (e) {
      console.error("handleDeclineHouseholdInvite error", e);
      showToast(e?.message || "Could not dismiss invite", "error");
    }
  };

  return {
    workspaceMode,
    setWorkspaceMode,
    activeHouseholdId,
    setActiveHouseholdId,
    householdProfile,
    setHouseholdProfile,
    householdMembers,
    householdRequests,
    householdSetupOpen,
    setHouseholdSetupOpen,
    householdSetupTab,
    setHouseholdSetupTab,
    householdForm,
    setHouseholdForm,
    householdSearchResults,
    householdSearchLoading,
    householdActionLoading,
    workspaceScope,
    currentHouseholdMember,
    canManageHousehold,
    resolvedHousehold,
    householdInviteLink,
    incomingHouseholdInvites,
    pendingHouseholdId,
    pendingHouseholdName,
    cancelPendingRequest,
    createCurrentHousehold,
    searchForHouseholds,
    clearHouseholdSearchResults,
    joinSelectedHousehold,
    continueSoloMode,
    handleSaveHouseholdProfile,
    syncDirectoryBeforeInvite,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    handleLeaveHousehold,
    handleRemoveHouseholdMember,
    handleInviteHouseholdMemberByUserId,
    handleAcceptHouseholdInvite,
    handleDeclineHouseholdInvite,
  };
}
