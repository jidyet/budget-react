import { describe, expect, it } from "vitest";
import { resolveDebtOwnership } from "./ownership.js";

const householdMembers = [
  { workspaceId: "h1", uid: "owner-uid", role: "owner", status: "active", displayName: "Jidye" },
  { workspaceId: "h1", uid: "admin-uid", role: "admin", status: "active", displayName: "Baba" },
  { workspaceId: "h1", uid: "removed-uid", role: "contributor", status: "removed", displayName: "Former Member" },
];

describe("resolveDebtOwnership", () => {
  it("Personal workspaces always default to the signed-in member, regardless of what's requested", () => {
    const result = resolveDebtOwnership({
      workspaceType: "personal",
      members: [{ uid: "solo-uid", displayName: "Solo User" }],
      actorId: "solo-uid",
      requested: { ownerType: "joint", ownerId: "someone-else" },
    });
    expect(result).toEqual({ ownerType: "member", ownerId: "solo-uid", ownerLabel: "Solo User" });
  });

  it("Personal workspace falls back to 'You' if the actor has no membership displayName on file", () => {
    const result = resolveDebtOwnership({ workspaceType: "personal", members: [], actorId: "solo-uid" });
    expect(result).toEqual({ ownerType: "member", ownerId: "solo-uid", ownerLabel: "You" });
  });

  it("Household: a verified member uid resolves to that member's real display name", () => {
    const result = resolveDebtOwnership({
      workspaceType: "household",
      members: householdMembers,
      actorId: "owner-uid",
      requested: { ownerType: "member", ownerId: "admin-uid" },
    });
    expect(result).toEqual({ ownerType: "member", ownerId: "admin-uid", ownerLabel: "Baba" });
  });

  it("Household: Joint/Household ownership carries no single member id", () => {
    const result = resolveDebtOwnership({ workspaceType: "household", members: householdMembers, requested: { ownerType: "joint" } });
    expect(result).toEqual({ ownerType: "joint", ownerId: "", ownerLabel: "Joint / Household" });
  });

  it("Household: explicit Unassigned is preserved as a real, honest state", () => {
    const result = resolveDebtOwnership({ workspaceType: "household", members: householdMembers, requested: { ownerType: "unassigned" } });
    expect(result).toEqual({ ownerType: "unassigned", ownerId: "", ownerLabel: "Unassigned" });
  });

  it("Household: no request at all defaults to Unassigned rather than guessing", () => {
    const result = resolveDebtOwnership({ workspaceType: "household", members: householdMembers });
    expect(result.ownerType).toBe("unassigned");
  });

  it("REPRODUCTION-STYLE: an unverified uid string can never become a member owner, even if it looks plausible", () => {
    expect(() =>
      resolveDebtOwnership({
        workspaceType: "household",
        members: householdMembers,
        requested: { ownerType: "member", ownerId: "not-a-real-member-uid" },
      })
    ).toThrow(/verified household member/i);
  });

  it("a removed/former member can no longer be selected as owner", () => {
    expect(() =>
      resolveDebtOwnership({
        workspaceType: "household",
        members: householdMembers,
        requested: { ownerType: "member", ownerId: "removed-uid" },
      })
    ).toThrow(/verified household member/i);
  });

  it("junk parser text (e.g. mail boilerplate) can never become an owner - only a real uid selection can", () => {
    expect(() =>
      resolveDebtOwnership({
        workspaceType: "household",
        members: householdMembers,
        requested: { ownerType: "member", ownerId: "For Undeliverable Mail Only" },
      })
    ).toThrow(/verified household member/i);
  });

  it("rejects a nonsense ownerType outright", () => {
    expect(() =>
      resolveDebtOwnership({ workspaceType: "household", members: householdMembers, requested: { ownerType: "spouse" } })
    ).toThrow(/Invalid ownerType/);
  });
});
