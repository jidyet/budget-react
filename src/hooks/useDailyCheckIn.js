import { useMemo } from "react";
import { buildDailyCheckIn } from "../services/checkInService";

export default function useDailyCheckIn(input) {
  return useMemo(() => buildDailyCheckIn(input), [input]);
}
