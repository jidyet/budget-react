import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptHouseholdInvite,
  approveJoinRequest,
  continueSoloWorkspace,
  createHousehold,
  deleteCurrentHousehold,
  declineHouseholdInvite,
  ensureHouseholdInviteReady,
  fetchHouseholdMembership,
  fetchHouseholdById,
  inviteUserToHousehold,
  leaveHousehold,
  removeHouseholdMember,
  setHouseholdMemberRole,
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

// Parse #join=CODE&household=ID from a string (URL hash or full URL)
const parseInviteTerm = (term) => {
  if (!term) return null;
  try {
    const s = String(term).trim();
    const hashPart = s.startsWith("http") ? new URL(s).hash : s;
    const params = new URLSearchParams(hashPart.replace(/^#/, ""));
    const joinCode = (params.get("join") || params.get("joinCode") || "").trim().toUpperCase();
    const householdId = (params.get("household") || params.get("householdId") || "").trim();
    if (joinCode && householdId) return { joinCode, householdId };
  } catch { /* ignore */ }
  return null;
};
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
      if (inviteModalOpenRef.current) {
        // Invite effect opened the modal — let it stay open. Clear flag so future
        // snapshots (e.g. after joining) can close the modal as expected.
        inviteModalOpenRef.current = false;
      } else {
        setHouseholdSetupOpen(!!needsHouseholdChoice);
      }
      if (needsHouseholdChoice) setHouseholdSetupTab("choose");
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  // Holds the household created in this session so the subscription doesn't
  // overwrite it with a stale Firestore read before the write propagates.
  const justCreatedHouseholdRef = useRef(null);

  // Set to true when the invite-link effect opens the setup modal so that the
  // async subscribeUserWorkspace snapshot doesn't immediately close it.
  const inviteModalOpenRef = useRef(false);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setHouseholdProfile({ activeHousehold: null, memberships: [] });
      return;
    }
    const unsub = subscribeHouseholdForUser(user.uid, (profile) => {
      const created = justCreatedHouseholdRef.current;
      if (created) {
        const incomingId = profile?.activeHousehold?.id || "";
        if (incomingId === created.id) {
          // Firestore caught up — merge to preserve the correct joinCode
          justCreatedHouseholdRef.current = null;
          setHouseholdProfile({
            ...profile,
            activeHousehold: { ...profile.activeHousehold, joinCode: created.joinCode },
            memberships: (profile.memberships || []).map((m) =>
              m.id === created.id ? { ...m, joinCode: created.joinCode } : m
            ),
          });
          return;
        }
        // Firestore hasn't caught up yet — keep the created state
        return;
      }
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
    ]).then(([household, member]) => {
      if (cancelled) return;
      if (member?.status === "active") return;
      // Do not immediately write the user back to solo on a single stale refresh read.
      // The live household/member listeners below are the authoritative source and will
      // reset the workspace if the membership is truly gone.
      if (household || member) return;
      resetToSoloWorkspace({
        syncRemote: false,
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
    ensureHouseholdInviteReady(activeHouseholdId, user).catch((error) => {
      console.error("ensureHouseholdInviteReady error", error);
    });
  }, [activeHouseholdId, canManageHousehold, resolvedHousehold, householdProfile?.activeHousehold, user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    if (!activeHouseholdId || workspaceMode !== "household") return;
    if (!householdMembersReady) return;
    const stillMember = (householdMembers || []).some((member) => String(member.uid || member.id) === String(user.uid));
    if (stillMember) return;
    let cancelled = false;

    fetchHouseholdMembership(activeHouseholdId, user.uid)
      .then((member) => {
        if (cancelled) return;
        if (member?.status === "active") return;
        resetToSoloWorkspace({
          syncRemote: false,
          logLabel: "reset missing active household member",
        });
      })
      .catch((error) => {
        console.error("confirm missing active household member error", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isLocalUser, activeHouseholdId, workspaceMode, householdMembersReady, householdMembers, resetToSoloWorkspace]);

  const searchForHouseholds = useCallback(async (overrideTerm = "") => {
    setHouseholdSearchLoading(true);
    try {
      const term = String(overrideTerm || householdForm.search || "").trim();
      if (!term) {
        setHouseholdSearchResults([]);
        return;
      }
      // Fast path: if term contains both householdId + joinCode (i.e. it's an invite link),
      // skip the search layer entirely and fetch the root doc directly — same as the
      // auto-click-detect path. This is more reliable than going through searchHouseholds.
      const parsed = parseInviteTerm(term);
      if (parsed?.householdId) {
        const household = await fetchHouseholdById(parsed.householdId).catch(() => null);
        if (household) {
          setHouseholdSearchResults([{ ...household, joinCode: household.joinCode || parsed.joinCode }]);
          return;
        }
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

  // Preserve invite link in sessionStorage before auth wipes the URL hash
  useEffect(() => {
    if (typeof window === "undefined" || user) return;
    const inviteTerm = getInviteSearchTermFromLocation();
    if (inviteTerm) sessionStorage.setItem("_pendingInviteLink", inviteTerm);
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined" || !user || user.isLocal || isLocalUser) return;
    const inviteTerm =
      sessionStorage.getItem("_pendingInviteLink") || getInviteSearchTermFromLocation();
    if (!inviteTerm) return;
    sessionStorage.removeItem("_pendingInviteLink");
    history.replaceState(null, "", window.location.pathname);
    inviteModalOpenRef.current = true;
    setHouseholdSetupTab("join");
    setHouseholdSetupOpen(true);
    setHouseholdForm((prev) => ({ ...prev, search: inviteTerm }));

    // When the invite link has both householdId and joinCode, fetch the household
    // directly instead of going through search — avoids all search/index/rules issues.
    const parsed = parseInviteTerm(inviteTerm);
    if (parsed?.householdId) {
      fetchHouseholdById(parsed.householdId).then((household) => {
        if (household) {
          setHouseholdSearchResults([{
            ...household,
            joinCode: household.joinCode || parsed.joinCode,
          }]);
        } else {
          searchForHouseholds(inviteTerm);
        }
      }).catch(() => searchForHouseholds(inviteTerm));
    } else {
      searchForHouseholds(inviteTerm);
    }
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
      // Pin the created household so the subscription can't overwrite it with a
      // stale Firestore read before the new write propagates.
      justCreatedHouseholdRef.current = created;
      setHouseholdProfile((prev) => ({
        activeHousehold: created,
        memberships: [
          created,
          ...((prev?.memberships || []).filter((item) => String(item.id) !== String(created.id))),
        ],
      }));
      setActiveHouseholdId(created.id);
      setWorkspaceMode("household");
      setHouseholdMembersReady(false);
      // Keep modal open, switch to invite tab so the owner can copy/share right away
      setHouseholdSetupTab("invite");
      showToast("Household created successfully", "success");
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
      const repaired = await ensureHouseholdInviteReady(activeHouseholdId, user);
      if (repaired?.joinCode) {
        return buildHouseholdInviteLink(repaired, typeof window !== "undefined" ? window.location.origin : "");
      }
    } catch (e) {
      console.error("syncDirectoryBeforeInvite error", e);
    }
    return buildHouseholdInviteLink(seed, typeof window !== "undefined" ? window.location.origin : "");
  };

  const handleCopyHouseholdInvite = async (link) => {
    const repairedLink = await syncDirectoryBeforeInvite();
    const nextLink = String(link || repairedLink || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(nextLink);
      showToast("Invite link copied", "success");
    } catch (e) {
      console.error("handleCopyHouseholdInvite error", e);
      showToast("Could not copy the link", "error");
    }
  };

  const handleShareHouseholdInvite = async (link) => {
    const repairedLink = await syncDirectoryBeforeInvite();
    const nextLink = String(link || repairedLink || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
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

  const handleApproveHouseholdRequest = useCallback(async (requestUserId) => {
    const currentHouseholdId = activeHouseholdIdRef.current;
    if (!currentHouseholdId || !user) return;
    try {
      await approveJoinRequest(currentHouseholdId, requestUserId, user);
      showToast("Join request approved");
    } catch (e) {
      console.error("handleApproveHouseholdRequest error", e);
      showToast("Could not approve request", "error");
    }
  }, [user, showToast]); // reads activeHouseholdId via ref — always current, no stale closure

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

  const handleDeleteHousehold = async () => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return false;
    try {
      await deleteCurrentHousehold(activeHouseholdId);
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdProfile({ activeHousehold: null, memberships: [] });
      setHouseholdMembers([]);
      setHouseholdRequests([]);
      setPendingHouseholdId("");
      setPendingHouseholdName("");
      showToast("Household deleted", "success");
      return true;
    } catch (e) {
      console.error("handleDeleteHousehold error", e);
      showToast(e?.message || "Could not delete household", "error");
      return false;
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

  const handleSetMemberRole = async (targetUid, newRole) => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    try {
      await setHouseholdMemberRole(activeHouseholdId, targetUid, newRole, user);
      showToast(`Role updated to ${newRole}`);
    } catch (e) {
      console.error("handleSetMemberRole error", e);
      showToast(e?.message || "Could not update role", "error");
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
    handleDeleteHousehold,
    handleRemoveHouseholdMember,
    handleSetMemberRole,
    handleInviteHouseholdMemberByUserId,
    handleAcceptHouseholdInvite,
    handleDeclineHouseholdInvite,
  };
}
