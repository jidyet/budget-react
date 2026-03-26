import { useMemo } from "react";
import { buildMilestones } from "../services/milestoneService";

export default function useMilestones(input) {
  return useMemo(() => buildMilestones(input), [input]);
}
