import { describe, expect, it } from "vitest";
import {
  effectiveBalanceStatus,
  isBalanceUnresolved,
  isConfirmedZero,
  isDebtNeedsReview,
  isMinimumPaymentContaminated,
  looksLikeJunkOwnerLabel,
  matchMemberByName,
  resolveDebtOwnership,
} from "./ownership.js";

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

describe("matchMemberByName", () => {
  it("matches a suggestion with a middle initial the member profile doesn't have (first + last name match)", () => {
    const match = matchMemberByName("Kristina K Davis", [
      { uid: "u1", displayName: "Kristina Davis", status: "active" },
      { uid: "u2", displayName: "Baba", status: "active" },
    ]);
    expect(match?.uid).toBe("u1");
  });

  it("matches an exact two-token name", () => {
    const match = matchMemberByName("Baba Yusuf", [{ uid: "u1", displayName: "Baba Yusuf", status: "active" }]);
    expect(match?.uid).toBe("u1");
  });

  it("does NOT match a different person, even with an overlapping last name", () => {
    const match = matchMemberByName("Kristina K Davis", [{ uid: "u1", displayName: "John Davis", status: "active" }]);
    expect(match).toBeNull();
  });

  it("does not match a removed/former member", () => {
    const match = matchMemberByName("Kristina Davis", [{ uid: "u1", displayName: "Kristina Davis", status: "removed" }]);
    expect(match).toBeNull();
  });

  it("returns null when there is no plausible suggestion (empty, single token, or junk mail boilerplate)", () => {
    expect(matchMemberByName("", [{ uid: "u1", displayName: "Kristina Davis", status: "active" }])).toBeNull();
    expect(matchMemberByName("Chase", [{ uid: "u1", displayName: "Kristina Davis", status: "active" }])).toBeNull();
    expect(matchMemberByName("For Undeliverable Mail Only", [{ uid: "u1", displayName: "Kristina Davis", status: "active" }])).toBeNull();
  });

  it("returns null when there are no members to match against", () => {
    expect(matchMemberByName("Kristina Davis", [])).toBeNull();
  });
});

describe("matchMemberByName: single-token member profiles (common for invited/seeded members)", () => {
  it("matches a first-name-only member profile against the suggestion's first token", () => {
    const match = matchMemberByName("Baba K Yusuf", [{ uid: "u1", displayName: "Baba", status: "active" }]);
    expect(match?.uid).toBe("u1");
  });

  it("does not match a first-name-only member against an unrelated suggestion", () => {
    const match = matchMemberByName("Kristina K Davis", [{ uid: "u1", displayName: "Baba", status: "active" }]);
    expect(match).toBeNull();
  });
});

describe("effectiveBalanceStatus / isConfirmedZero / isBalanceUnresolved", () => {
  it("defaults to confirmed when balanceStatus is absent (backward compatible with pre-existing records)", () => {
    expect(effectiveBalanceStatus({ currentBalance: 0 })).toBe("confirmed");
    expect(isConfirmedZero({ currentBalance: 0 })).toBe(true);
    expect(isBalanceUnresolved({ currentBalance: 0 })).toBe(false);
  });

  it("a confirmed $0 balance is treated as a genuine paid-off claim", () => {
    expect(isConfirmedZero({ currentBalance: 0, balanceStatus: "confirmed" })).toBe(true);
  });

  it("REPRODUCTION-STYLE: an unresolved (failed-import) $0 balance is never treated as paid off", () => {
    expect(isConfirmedZero({ currentBalance: 0, balanceStatus: "unresolved" })).toBe(false);
    expect(isBalanceUnresolved({ currentBalance: 0, balanceStatus: "unresolved" })).toBe(true);
  });

  it("a nonzero confirmed balance is never mistaken for confirmed-zero", () => {
    expect(isConfirmedZero({ currentBalance: 500, balanceStatus: "confirmed" })).toBe(false);
  });
});

describe("isMinimumPaymentContaminated", () => {
  it("REPRODUCTION: flags the Firstmark case - minimum payment equals the APR percentage", () => {
    const debt = { aprStatus: "known", apr: 0.0674, minimumRequiredPayment: 6.74 };
    expect(isMinimumPaymentContaminated(debt)).toBe(true);
  });

  it("does not flag a legitimate minimum payment that is unrelated to APR", () => {
    const debt = { aprStatus: "known", apr: 0.0674, minimumRequiredPayment: 85 };
    expect(isMinimumPaymentContaminated(debt)).toBe(false);
  });

  it("does not flag when APR is unknown or minimum payment is null", () => {
    expect(isMinimumPaymentContaminated({ aprStatus: "unknown", apr: null, minimumRequiredPayment: 6.74 })).toBe(false);
    expect(isMinimumPaymentContaminated({ aprStatus: "known", apr: 0.0674, minimumRequiredPayment: null })).toBe(false);
  });

  it("does not flag a coincidental $0 minimum payment against a 0% APR", () => {
    expect(isMinimumPaymentContaminated({ aprStatus: "known", apr: 0, minimumRequiredPayment: 0 })).toBe(false);
  });
});

describe("looksLikeJunkOwnerLabel", () => {
  it("REPRODUCTION: flags mail-handling boilerplate stored as an owner label", () => {
    expect(looksLikeJunkOwnerLabel("For Undeliverable Mail Only")).toBe(true);
  });

  it("flags card product/network names stored as an owner label", () => {
    expect(looksLikeJunkOwnerLabel("Visa Signature")).toBe(true);
  });

  it("does not flag a genuine human name", () => {
    expect(looksLikeJunkOwnerLabel("Kristina Davis")).toBe(false);
    expect(looksLikeJunkOwnerLabel("Baba")).toBe(false);
    expect(looksLikeJunkOwnerLabel("")).toBe(false);
  });
});

describe("isDebtNeedsReview", () => {
  it("flags an unresolved balance", () => {
    expect(isDebtNeedsReview({ currentBalance: 0, balanceStatus: "unresolved" })).toBe(true);
  });

  it("flags a contaminated minimum payment", () => {
    expect(isDebtNeedsReview({ currentBalance: 500, aprStatus: "known", apr: 0.0674, minimumRequiredPayment: 6.74 })).toBe(true);
  });

  it("does not flag a clean, fully-confirmed debt", () => {
    expect(isDebtNeedsReview({ currentBalance: 500, balanceStatus: "confirmed", aprStatus: "known", apr: 0.2, minimumRequiredPayment: 25 })).toBe(false);
  });

  it("does not flag a genuinely confirmed $0 (paid off) debt", () => {
    expect(isDebtNeedsReview({ currentBalance: 0, balanceStatus: "confirmed" })).toBe(false);
  });
});
