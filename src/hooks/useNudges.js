import { useMemo } from "react";
import { buildNudges } from "../services/nudgeService";

export default function useNudges(input) {
  return useMemo(() => buildNudges(input), [input]);
}
