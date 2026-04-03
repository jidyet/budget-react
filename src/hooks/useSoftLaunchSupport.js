import { useState } from "react";
import {
  patchSoftLaunchState,
  readSoftLaunchState,
  recordSoftLaunchVisit,
} from "../services/softLaunchService";

export default function useSoftLaunchSupport() {
  const [softLaunchState, setSoftLaunchState] = useState(() => recordSoftLaunchVisit(readSoftLaunchState()));

  const patchState = (patch) => {
    const next = patchSoftLaunchState(patch);
    setSoftLaunchState(next);
    return next;
  };

  return {
    softLaunchState,
    patchSoftLaunchState: patchState,
  };
}
