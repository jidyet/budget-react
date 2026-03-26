import { useMemo } from "react";
import { buildNextMove } from "../services/nextMoveService";

export default function useNextMove(input) {
  return useMemo(() => buildNextMove(input), [input]);
}
