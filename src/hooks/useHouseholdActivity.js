import { useEffect, useState } from "react";
import { subscribeFormattedHouseholdActivity } from "../services/householdActivityService";

export default function useHouseholdActivity(householdId, maxItems = 8) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId) {
      setActivity([]);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    const unsub = subscribeFormattedHouseholdActivity(householdId, (items) => {
      setActivity(items);
      setLoading(false);
    }, maxItems);
    return () => unsub && unsub();
  }, [householdId, maxItems]);

  return { activity, loading };
}
