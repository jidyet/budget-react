import { useMemo } from "react";
import { buildWeeklySummary } from "../services/weeklySummaryService";

export default function useWeeklySummary(input) {
  return useMemo(() => buildWeeklySummary(input), [input]);
}
