import { useState, useEffect } from "react";
import { onAuth, subscribeUserProfile, upsertUserRegistry } from "../firebase";
import { canAccessFounderOps, getLaunchFlags, isFounderEmail } from "../config/launchFlags";
import { readFounderOpsState } from "../services/founderOpsService";
import { getFirebaseStatus } from "../firebase";

/**
 * useAppSession
 *
 * Answers: "Who is using this app right now?"
 *   - Firebase auth listener + local-user flag
 *   - User profile (displayName, etc.)
 *   - Founder / tester flags derived from email
 *   - Static launch flags
 *
 * Does NOT own: auth form state, handleAuthSubmit, household membership,
 * workspace records, or account catalogs.
 */
export default function useAppSession() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [userProfile, setUserProfile] = useState({});

  // --- Firebase auth listener ---
  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
      if (u && !u.isLocal) {
        setIsLocalUser(false);
        upsertUserRegistry(u.uid, { email: u.email || "" });
      }
      setAuthLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  // --- User profile subscription ---
  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      queueMicrotask(() => setUserProfile({}));
      return () => {};
    }
    return subscribeUserProfile(user.uid, (profile) => {
      setUserProfile(profile || {});
    });
  }, [user, isLocalUser]);

  // --- Derived identity (stable references, no deps changing) ---
  const founderAccount = isFounderEmail(user?.email);
  const founderOpsVisible = canAccessFounderOps(user?.email);
  const currentUserLabel =
    (userProfile?.displayName || "").trim()
    || (user?.email ? user.email.split("@")[0] : "")
    || "Me";

  // Static config (read once at module level in each getter, effectively stable)
  const launchFlags = getLaunchFlags();
  const founderOpsState = readFounderOpsState();
  const firebaseStatus = getFirebaseStatus();

  return {
    user,
    setUser,
    authLoading,
    isLocalUser,
    setIsLocalUser,
    userProfile,
    currentUserLabel,
    defaultOwnerLabel: currentUserLabel,
    founderAccount,
    founderOpsVisible,
    founderOpsState,
    launchFlags,
    firebaseStatus,
  };
}
