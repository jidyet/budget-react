import { useMemo } from "react";
import { buildSubscriptionState } from "../services/subscriptionService";

export default function useSubscription(input) {
  return useMemo(() => buildSubscriptionState(input), [input]);
}
