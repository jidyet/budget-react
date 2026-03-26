import { useMemo } from "react";
import { buildHeadsUps } from "../services/headsUpService";

export default function useHeadsUp(input) {
  return useMemo(() => buildHeadsUps(input), [input]);
}

