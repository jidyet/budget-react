import { useMemo } from "react";
import { buildDebtProgressSnapshot } from "../services/progressEngineService";

// Destructure props so useMemo deps are individual stable values,
// not a new object literal created at the call site on every render.
export default function useDebtProgress({
  accounts,
  totalPaid,
  totalDue,
  getPrevRecord,
  payoffSimulate,
  selMonth,
  selYear,
  workspaceMode,
  householdMembers,
}) {
  return useMemo(
    () => buildDebtProgressSnapshot({ accounts, totalPaid, totalDue, getPrevRecord, payoffSimulate, selMonth, selYear, workspaceMode, householdMembers }),
    [accounts, totalPaid, totalDue, getPrevRecord, payoffSimulate, selMonth, selYear, workspaceMode, householdMembers],
  );
}
