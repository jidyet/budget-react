import { useEffect, useState } from "react";
import { subscribeCurrentHousehold } from "../services/householdService";

export default function useCurrentHousehold(user, isLocalUser) {
  const [profile, setProfile] = useState({ activeHousehold: null, memberships: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      queueMicrotask(() => {
        setProfile({ activeHousehold: null, memberships: [] });
        setLoading(false);
        setError(null);
      });
      return () => {};
    }
    queueMicrotask(() => setLoading(true));
    const unsub = subscribeCurrentHousehold(user.uid, (next) => {
      setProfile(next);
      setLoading(false);
      setError(null);
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  return { profile, loading, error };
}
