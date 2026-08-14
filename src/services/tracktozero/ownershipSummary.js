import { effectiveOwnerType } from "../../domain/tracktozero/ownership.js";

// Rolls up household debt by owner without ever double-counting: each debt
// contributes its balance to exactly one bucket (a specific member, the
// joint/household bucket, or unassigned) and the buckets sum to the same
// total as totalIncludedDebt. Personal workspaces have nothing to summarize
// by owner - every debt already belongs to the one signed-in member.
export const summarizeHouseholdOwnership = ({ workspace, members = [], includedDebts = [], debtBalance }) => {
  if (workspace?.type !== "household") return null;

  const byMember = new Map();
  let jointTotal = 0;
  let unassignedTotal = 0;
  let total = 0;

  for (const debt of includedDebts) {
    const balance = debtBalance(debt);
    total += balance;
    if (effectiveOwnerType(debt) === "member" && debt.ownerId) {
      const member = members.find((candidate) => candidate.uid === debt.ownerId);
      const existing = byMember.get(debt.ownerId) || {
        uid: debt.ownerId,
        displayName: member?.displayName || debt.ownerLabel || debt.ownerId,
        total: 0,
        debtCount: 0,
      };
      existing.total += balance;
      existing.debtCount += 1;
      byMember.set(debt.ownerId, existing);
    } else if (effectiveOwnerType(debt) === "joint") {
      jointTotal += balance;
    } else {
      unassignedTotal += balance;
    }
  }

  return {
    total,
    perMember: [...byMember.values()].sort((a, b) => b.total - a.total),
    jointTotal,
    unassignedTotal,
  };
};
