import { useMemo } from "react";
import { buildProgressScore } from "../services/progressScoreService";

export default function useProgressScore(input) {
  return useMemo(() => buildProgressScore(input), [input]);
}

