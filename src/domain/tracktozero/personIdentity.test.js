import { describe, expect, it } from "vitest";
import { findDuplicateMember, findDuplicatePerson, matchImportedOwnerToIdentity, normalizePersonName } from "./personIdentity.js";

const member = (overrides = {}) => ({ uid: "m1", displayName: "Kristina Davis", status: "active", ...overrides });
const person = (overrides = {}) => ({ id: "p1", displayName: "Babajide Yusuf", aliases: [], status: "active", ...overrides });

describe("DATA-HH1: normalizePersonName", () => {
  it("trims, collapses whitespace, and case-folds", () => {
    expect(normalizePersonName("  KRISTINA   DAVIS ")).toBe("kristina davis");
    expect(normalizePersonName("Kristina Davis")).toBe("kristina davis");
    expect(normalizePersonName("kristina davis")).toBe("kristina davis");
  });

  it("strips light punctuation without collapsing distinct names together", () => {
    expect(normalizePersonName("B. Yusuf")).toBe("b yusuf");
    expect(normalizePersonName("Kristina Davis")).not.toBe(normalizePersonName("Kristina Yusuf"));
  });
});

describe("DATA-HH1: matchImportedOwnerToIdentity", () => {
  it("classifies a literal Joint/Household reference", () => {
    expect(matchImportedOwnerToIdentity({ rawName: "Joint" }).status).toBe("joint");
    expect(matchImportedOwnerToIdentity({ rawName: "Household" }).status).toBe("joint");
  });

  it("exact match: an imported name identical to a verified member resolves deterministically", () => {
    const result = matchImportedOwnerToIdentity({ rawName: "Kristina Davis", members: [member()], people: [] });
    expect(result).toMatchObject({ status: "exact", kind: "member", membershipUid: "m1" });
  });

  it("exact match: an imported name identical to an existing household person resolves deterministically", () => {
    const result = matchImportedOwnerToIdentity({ rawName: "Babajide Yusuf", members: [], people: [person()] });
    expect(result).toMatchObject({ status: "exact", kind: "person", personId: "p1" });
  });

  it("confirmed alias: 'Jide Yusuf' resolves to Babajide Yusuf only because the alias was already confirmed", () => {
    const withAlias = person({ aliases: ["Jide Yusuf"] });
    const result = matchImportedOwnerToIdentity({ rawName: "Jide Yusuf", members: [], people: [withAlias] });
    expect(result).toMatchObject({ status: "strong", kind: "person", personId: "p1" });

    // Without the confirmed alias, the same raw name must NOT auto-resolve -
    // a nickname/shortened first name is never an automatic heuristic.
    const withoutAlias = person({ aliases: [] });
    const unresolved = matchImportedOwnerToIdentity({ rawName: "Jide Yusuf", members: [], people: [withoutAlias] });
    expect(unresolved.status).not.toBe("exact");
    expect(unresolved.status).not.toBe("strong");
  });

  it("possible match: an initial + exact surname is a suggestion, never an automatic confirmation", () => {
    const result = matchImportedOwnerToIdentity({ rawName: "B. Yusuf", members: [], people: [person()] });
    expect(result).toMatchObject({ status: "possible", kind: "person", personId: "p1" });
  });

  it("unresolved: insufficient evidence never silently resolves", () => {
    const result = matchImportedOwnerToIdentity({ rawName: "BJ", members: [], people: [person()] });
    expect(result.status).toBe("unresolved");
  });

  it("unresolved: an empty/missing name is never silently resolved", () => {
    expect(matchImportedOwnerToIdentity({ rawName: "" }).status).toBe("unresolved");
    expect(matchImportedOwnerToIdentity({}).status).toBe("unresolved");
  });

  it("removed members and merged people are never matched", () => {
    const removedMember = member({ status: "removed" });
    const mergedPerson = person({ status: "merged" });
    const result = matchImportedOwnerToIdentity({ rawName: "Kristina Davis", members: [removedMember], people: [] });
    expect(result.status).toBe("unresolved");
    const result2 = matchImportedOwnerToIdentity({ rawName: "Babajide Yusuf", members: [], people: [mergedPerson] });
    expect(result2.status).toBe("unresolved");
  });

  it("member matches take priority over person matches for the same exact name (avoids treating a real member as merely a financial person)", () => {
    const result = matchImportedOwnerToIdentity({
      rawName: "Kristina Davis",
      members: [member()],
      people: [person({ id: "p2", displayName: "Kristina Davis" })],
    });
    expect(result.kind).toBe("member");
  });
});

describe("DATA-HH1: duplicate-person guards", () => {
  it("finds a normalized-exact duplicate person, case/whitespace-insensitive", () => {
    const existing = [person()];
    expect(findDuplicatePerson("BABAJIDE YUSUF", existing)?.id).toBe("p1");
    expect(findDuplicatePerson("  Babajide   Yusuf ", existing)?.id).toBe("p1");
  });

  it("does not treat a merely-similar name as a duplicate", () => {
    expect(findDuplicatePerson("Jide Yusuf", [person()])).toBeNull();
  });

  it("ignores merged people when checking for duplicates", () => {
    expect(findDuplicatePerson("Babajide Yusuf", [person({ status: "merged" })])).toBeNull();
  });

  it("finds a duplicate against a real member too, so a person is never created that shadows an existing member", () => {
    expect(findDuplicateMember("Kristina Davis", [member()])?.uid).toBe("m1");
    expect(findDuplicateMember("kristina davis", [member()])?.uid).toBe("m1");
  });

  it("ignores removed members when checking for duplicates", () => {
    expect(findDuplicateMember("Kristina Davis", [member({ status: "removed" })])).toBeNull();
  });
});
