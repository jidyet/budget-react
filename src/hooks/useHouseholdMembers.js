import { useEffect, useMemo, useState } from "react";
import { subscribeMembers, subscribePendingRequests } from "../services/householdService";

export default function useHouseholdMembers(householdId) {
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId) {
      queueMicrotask(() => {
        setMembers([]);
        setRequests([]);
        setLoading(false);
      });
      return () => {};
    }
    queueMicrotask(() => setLoading(true));
    const unsubMembers = subscribeMembers(householdId, (items) => {
      setMembers(items);
      setLoading(false);
    });
    const unsubRequests = subscribePendingRequests(householdId, setRequests);
    return () => {
      unsubMembers && unsubMembers();
      unsubRequests && unsubRequests();
    };
  }, [householdId]);

  const activeMembers = useMemo(() => members.filter((member) => member.status !== "inactive"), [members]);
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  return { members: activeMembers, requests, pendingRequests, loading };
}
