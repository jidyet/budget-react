import { useEffect, useState } from "react";
import { subscribeSharedDashboardSnapshot } from "../services/householdDashboardService";

export default function useHouseholdDashboard(householdId, monthKey) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId || !monthKey) {
      queueMicrotask(() => {
        setDashboard(null);
        setLoading(false);
      });
      return () => {};
    }
    queueMicrotask(() => setLoading(true));
    const unsub = subscribeSharedDashboardSnapshot(householdId, monthKey, (snapshot) => {
      setDashboard(snapshot);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, [householdId, monthKey]);

  return { dashboard, loading };
}
