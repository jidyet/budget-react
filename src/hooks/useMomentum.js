import { useMemo } from "react";
import { buildMomentumSnapshot } from "../services/momentumService";

export default function useMomentum(input) {
  return useMemo(() => buildMomentumSnapshot(input), [input]);
}
