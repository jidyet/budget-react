import { useMemo } from "react";
import { buildDebtProgressSnapshot } from "../services/progressEngineService";

export default function useDebtProgress(input) {
  return useMemo(() => buildDebtProgressSnapshot(input), [input]);
}
