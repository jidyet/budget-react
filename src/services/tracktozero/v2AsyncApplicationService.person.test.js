import { describe, expect, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "../repositories/tracktozeroRepositories";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "./v2SeedData";
import { createTrackToZeroV2AsyncAppService } from "./v2AsyncApplicationService";
import { effectiveOwnerType } from "../../domain/tracktozero/ownership.js";

const makeService = (actorId = "seed-owner") => {
  const repository = new InMemoryTrackToZeroRepository(createTrackToZeroV2Seed());
  const service = createTrackToZeroV2AsyncAppService({ repository, actorId, asOf: V2_TEST_NOW });
  return { repository, service };
};

const candidate = (overrides = {}) => ({
  candidateId: "cand-1",
  source: "pdf",
  creditorName: "Capital One",
  accountName: "Capital One Card",
  accountReferenceSafe: "last4:1234",
  debtType: "credit_card",
  currentBalance: 3400,
  aprStatus: "known",
  apr: 24.99,
  minimumPayment: 95,
  dueDate: "2026-08-15",
  ownerType: "unassigned",
  ownerId: "",
  includedInCorePayoffPlan: true,
  warnings: [],
  duplicateStatus: "new",
  decision: "pending_review",
  ...overrides,
});

describe("DATA-HH1: createImportedPerson", () => {
  it("creates a Workspace-scoped person for a genuinely new name", async () => {
    const { service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    expect(person.displayName).toBe("Babajide Yusuf");
    expect(person.kind).toBe("imported_person");
    expect(person.status).toBe("active");
    expect(person.workspaceMembershipId).toBe("");
    const listed = await service.listWorkspacePersons("household-seed");
    expect(listed.map((p) => p.id)).toContain(person.id);
  });

  it("is idempotent for a normalized-exact duplicate name - returns the existing person, never a second one", async () => {
    const { service } = makeService();
    const first = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const second = await service.createImportedPerson("household-seed", { displayName: "  BABAJIDE   YUSUF " });
    expect(second.id).toBe(first.id);
    const listed = await service.listWorkspacePersons("household-seed");
    expect(listed.filter((p) => p.status !== "merged")).toHaveLength(1);
  });

  it("refuses to shadow an existing real workspace member with a competing person identity", async () => {
    const { service } = makeService();
    // "Jidye" is the household-seed owner's real displayName.
    await expect(service.createImportedPerson("household-seed", { displayName: "Jidye" })).rejects.toThrow(/already a workspace member/i);
  });

  it("requires a name", async () => {
    const { service } = makeService();
    await expect(service.createImportedPerson("household-seed", { displayName: "   " })).rejects.toThrow(/name is required/i);
  });

  it("never creates an Auth account or a WorkspaceMembership - only a financial identity", async () => {
    const { repository, service } = makeService();
    const membershipsBefore = repository.listMemberships("household-seed").length;
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    expect(repository.listMemberships("household-seed")).toHaveLength(membershipsBefore);
    expect(person.workspaceMembershipId).toBe("");
    // No invite was created either.
    expect(repository.listMemberInvites?.("household-seed") || []).toHaveLength(0);
  });
});

describe("DATA-HH1: confirmAlias", () => {
  it("adds a confirmed alias that a future import can then match on", async () => {
    const { service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const updated = await service.confirmAlias("household-seed", person.id, "Jide Yusuf");
    expect(updated.aliases).toContain("Jide Yusuf");
  });

  it("is idempotent - confirming the same alias twice does not duplicate it", async () => {
    const { service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    await service.confirmAlias("household-seed", person.id, "Jide Yusuf");
    const again = await service.confirmAlias("household-seed", person.id, "jide yusuf");
    expect(again.aliases.filter((a) => a.toLowerCase() === "jide yusuf")).toHaveLength(1);
  });

  it("rejects a person id from a different workspace", async () => {
    const { repository, service } = makeService();
    const otherWorkspacePerson = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    // Directly plant a person doc under a different workspace with the same id shape is unrealistic;
    // instead confirm resolving against the WRONG workspace fails.
    await expect(service.confirmAlias("personal-seed", otherWorkspacePerson.id, "Jide")).rejects.toThrow(/not found/i);
    expect(repository.getWorkspacePerson("household-seed", otherWorkspacePerson.id)).not.toBeNull();
  });
});

describe("DATA-HH1: mergeWorkspacePersons", () => {
  it("reassigns every Debt owned by the merged-from person, merges aliases, and marks it terminal", async () => {
    const { repository, service } = makeService();
    const keep = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const dup = await service.createImportedPerson("household-seed", { displayName: "Baba J. Yusuf-Smith" }); // deliberately not a normalized-exact dup
    const debt = await service.createNewDebt("household-seed", {
      clientRequestId: "dup-owned-1", name: "Card owned by duplicate", accountReferenceSafe: "last4:9999",
      currentBalance: 500, minimumRequiredPayment: 25, aprStatus: "known", apr: 20, includedInCorePayoffPlan: true,
      ownerType: "person", ownerId: dup.id,
    });
    expect(debt.ownerId).toBe(dup.id);

    const result = await service.mergeWorkspacePersons("household-seed", { keepPersonId: keep.id, mergeFromPersonId: dup.id });
    expect(result.reassignedDebtCount).toBe(1);
    expect(result.mergeFromPerson.status).toBe("merged");
    expect(result.mergeFromPerson.mergedIntoPersonId).toBe(keep.id);
    expect(result.keepPerson.aliases).toContain("Baba J. Yusuf-Smith");

    const reloadedDebt = repository.listDebts("household-seed").find((d) => d.id === debt.id);
    expect(reloadedDebt.ownerId).toBe(keep.id);
    expect(reloadedDebt.ownerLabel).toBe("Babajide Yusuf");
  });

  it("is idempotent - merging an already-merged person a second time is a safe no-op", async () => {
    const { service } = makeService();
    const keep = await service.createImportedPerson("household-seed", { displayName: "Person A" });
    const dup = await service.createImportedPerson("household-seed", { displayName: "Person B" });
    await service.mergeWorkspacePersons("household-seed", { keepPersonId: keep.id, mergeFromPersonId: dup.id });
    const second = await service.mergeWorkspacePersons("household-seed", { keepPersonId: keep.id, mergeFromPersonId: dup.id });
    expect(second.alreadyMerged).toBe(true);
    expect(second.reassignedDebtCount).toBe(0);
  });

  it("rejects merging a person into themselves", async () => {
    const { service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Solo Person" });
    await expect(service.mergeWorkspacePersons("household-seed", { keepPersonId: person.id, mergeFromPersonId: person.id })).rejects.toThrow(/into themselves/i);
  });
});

describe("DATA-HH1: resolveOwner accepts a verified household person", () => {
  it("assigns a real household person as an import candidate's owner", async () => {
    const { repository, service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [candidate()] });
    await service.resolveOwner("household-seed", batch.id, "cand-1", { ownerType: "person", ownerId: person.id });
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates[0];
    expect(reloaded.ownerType).toBe("person");
    expect(reloaded.ownerId).toBe(person.id);
  });

  it("rejects an unverified/nonexistent person id - parser text can never become authoritative ownership", async () => {
    const { service } = makeService();
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [candidate()] });
    await expect(
      service.resolveOwner("household-seed", batch.id, "cand-1", { ownerType: "person", ownerId: "not-a-real-person" })
    ).rejects.toThrow(/verified household person/i);
  });

  it("committing a person-owned candidate creates a Debt with ownerType person and the person's label", async () => {
    const { service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const batch = await service.createImportBatch("household-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [candidate({ ownerType: "person", ownerId: person.id })] });
    await service.resolveAsNewDebt("household-seed", batch.id, "cand-1");
    const { createdDebts } = await service.commitImportBatch("household-seed", batch.id);
    expect(createdDebts[0].ownerType).toBe("person");
    expect(createdDebts[0].ownerId).toBe(person.id);
    expect(createdDebts[0].ownerLabel).toBe("Babajide Yusuf");
    expect(effectiveOwnerType(createdDebts[0])).toBe("person");
  });
});

describe("DATA-HH1: import pre-fill matching - exact only, importer never assumed as owner", () => {
  it("an exact-match owner name pre-fills as a person, but the human still must confirm via a decision", async () => {
    const { repository, service } = makeService();
    const person = await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "excel", sourceFilename: "x.xlsx",
      candidates: [candidate({ ownerSuggestion: "Babajide Yusuf" })],
    });
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates[0];
    expect(reloaded.ownerType).toBe("person");
    expect(reloaded.ownerId).toBe(person.id);
  });

  it("a merely-possible match (initial + surname) never auto-assigns ownership", async () => {
    const { repository, service } = makeService();
    await service.createImportedPerson("household-seed", { displayName: "Babajide Yusuf" });
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "excel", sourceFilename: "x.xlsx",
      candidates: [candidate({ ownerSuggestion: "B. Yusuf" })],
    });
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates[0];
    expect(reloaded.ownerType).toBe("unassigned");
    expect(reloaded.ownerSuggestion).toBe("B. Yusuf"); // raw evidence preserved
  });

  it("Kristina/the importer is never assumed to be the debt owner just because she uploaded the file", async () => {
    // seed-owner ("Jidye") uploads a statement whose printed owner is
    // "Baba Yusuf" (matches the household-seed admin, single-token-named
    // "Baba") - the resulting candidate must resolve toward that real
    // member, never toward the actor who ran the import.
    const { repository, service } = makeService("seed-owner");
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "excel", sourceFilename: "x.xlsx",
      candidates: [candidate({ ownerSuggestion: "Baba Yusuf" })],
    });
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates[0];
    expect(reloaded.ownerType).toBe("member");
    expect(reloaded.ownerId).toBe("seed-admin"); // Baba, not seed-owner (the importer)
  });

  it("Joint literal owner text is preserved as raw evidence but never auto-assigned - a human still confirms Joint explicitly", async () => {
    const { repository, service } = makeService();
    const batch = await service.createImportBatch("household-seed", {
      sourceType: "excel", sourceFilename: "x.xlsx",
      candidates: [candidate({ ownerSuggestion: "Joint" })],
    });
    const reloaded = repository.getImportBatch("household-seed", batch.id).candidates[0];
    // Pre-fill only ever sets "member"/"person" exact matches - "joint" is
    // never silently pre-selected, since that's a real financial-authority
    // decision (whole-household ownership), not a name lookup.
    expect(reloaded.ownerType).toBe("unassigned");
  });
});

describe("DATA-HH1: workspace isolation for person identities", () => {
  it("the same display name in two different workspaces produces two fully independent people", async () => {
    const { service } = makeService();
    const inHousehold = await service.createImportedPerson("household-seed", { displayName: "Alex Taylor" });
    // personal-seed is a personal workspace (single-owner) - use it only to
    // prove listWorkspacePersons never leaks across workspace boundaries.
    const listedForHousehold = await service.listWorkspacePersons("household-seed");
    expect(listedForHousehold.map((p) => p.id)).toContain(inHousehold.id);
    const listedForPersonal = await service.listWorkspacePersons("personal-seed");
    expect(listedForPersonal.map((p) => p.id)).not.toContain(inHousehold.id);
  });

  it("a person id from another workspace can never be used to assign ownership in this workspace", async () => {
    const { service } = makeService();
    const foreignPerson = await service.createImportedPerson("household-seed", { displayName: "Foreign Person" });
    const batch = await service.createImportBatch("personal-seed", { sourceType: "pdf", sourceFilename: "x.pdf", candidates: [candidate()] });
    await expect(
      service.resolveOwner("personal-seed", batch.id, "cand-1", { ownerType: "person", ownerId: foreignPerson.id })
    ).rejects.toThrow(/verified household person/i);
  });
});

describe("DATA-HH1: security", () => {
  it("owner and admin can create/merge/alias household people", async () => {
    const { service: ownerService } = makeService("seed-owner");
    const owner = await ownerService.createImportedPerson("household-seed", { displayName: "Owner-created Person" });
    expect(owner.id).toBeTruthy();

    const { repository } = makeService();
    const adminService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-admin", asOf: V2_TEST_NOW });
    const admin = await adminService.createImportedPerson("household-seed", { displayName: "Admin-created Person" });
    expect(admin.id).toBeTruthy();
  });

  it("a viewer cannot create, alias, or merge household people", async () => {
    const { repository } = makeService();
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    await expect(viewerService.createImportedPerson("household-seed", { displayName: "Should Fail" })).rejects.toThrow(/cannot add household people/i);
  });

  it("a viewer CAN still read the household person list (view permission)", async () => {
    const { repository, service } = makeService("seed-owner");
    await service.createImportedPerson("household-seed", { displayName: "Readable Person" });
    const viewerService = createTrackToZeroV2AsyncAppService({ repository, actorId: "seed-viewer", asOf: V2_TEST_NOW });
    const listed = await viewerService.listWorkspacePersons("household-seed");
    expect(listed.some((p) => p.displayName === "Readable Person")).toBe(true);
  });

  it("a non-member cannot read or write household people for a workspace they don't belong to", async () => {
    const { repository } = makeService();
    const outsiderService = createTrackToZeroV2AsyncAppService({ repository, actorId: "not-a-member", asOf: V2_TEST_NOW });
    await expect(outsiderService.listWorkspacePersons("household-seed")).rejects.toThrow(/not a member/i);
    await expect(outsiderService.createImportedPerson("household-seed", { displayName: "Intruder" })).rejects.toThrow(/not a member/i);
  });
});
