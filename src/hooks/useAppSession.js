import { useState, useEffect } from "react";
import { onAuth, subscribeUserProfile, upsertUserRegistry } from "../firebase";
import { getLaunchFlags } from "../config/launchFlags";
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
  const [userClaims, setUserClaims] = useState({});

  // --- Firebase auth listener ---
  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
      if (u && !u.isLocal) {
        setIsLocalUser(false);
        upsertUserRegistry(u.uid, { email: u.email || "" });
        // Load custom claims (force-refresh so we get the latest)
        u.getIdTokenResult(true)
          .then((result) => setUserClaims(result.claims || {}))
          .catch(() => setUserClaims({}));
      } else {
        setUserClaims({});
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

  // Static config
  const launchFlags = getLaunchFlags();

  // --- Derived identity ---
  const founderAccount = Boolean(userClaims.founderAccount);
  const founderOpsVisible = Boolean(userClaims.founderAccount && launchFlags.founderOpsEnabled);
  const currentUserLabel =
    (userProfile?.displayName || "").trim()
    || (user?.email ? user.email.split("@")[0] : "")
    || "Me";
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
