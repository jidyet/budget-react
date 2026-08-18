import { describe, expect, it, vi } from "vitest";
import { ROLE_PERMISSIONS } from "./constants";
import {
  createBalanceSnapshot,
  createDebt,
  createPaymentEvent,
  createPlanVersion,
  createStartingDebtSnapshotItem,
  createWorkspace,
  createWorkspaceMembership,
} from "./models";
import { describeMigrationState } from "./migrationState";
import { InMemoryTrackToZeroRepository } from "../../services/repositories/tracktozeroRepositories";
import { activatePlanTransaction, createReforecastVersion, resolveActivePlanContext } from "../../services/tracktozero/activePlanService";
import { buildExpectedCheckpoints, debtToEngineAccount, simulatePlanVersion } from "../../services/adapters/tracktozeroCalcAdapter";
import { buildMigrationPreview, classifyLegacyAccount, LEGACY_DEBT_CLASSIFICATION, legacyAccountToDebtCandidate, legacySavedPlanToDraftCandidate } from "../../services/adapters/legacyTrackToZeroAdapter";
import { payoffSimulate } from "../../services/calc/payoffEngine";

const ts = "2026-01-01T00:00:00.000Z";
const baseDebt = (overrides = {}) => createDebt({
  id: "d1",
  workspaceId: "w1",
  name: "Card",
  currentBalance: 1000,
  minimumRequiredPayment: 50,
  aprStatus: "known",
  apr: 0.2,
  createdAt: ts,
  createdBy: "owner",
  ...overrides,
});

describe("workspace and membership domain", () => {
  it("validates personal and household workspaces", () => {
    expect(createWorkspace({ id: "personal", type: "personal", createdAt: ts, createdBy: "u1" }).type).toBe("personal");
    expect(createWorkspace({ id: "home", type: "household", createdAt: ts, createdBy: "u1" }).type).toBe("household");
    expect(() => createWorkspace({ id: "bad", type: "team", createdAt: ts, createdBy: "u1" })).toThrow(/workspace.type/);
  });

  it("validates roles and permission matrix", () => {
    expect(createWorkspaceMembership({ workspaceId: "w1", uid: "owner", role: "owner", createdAt: ts }).role).toBe("owner");
    expect(() => createWorkspaceMembership({ workspaceId: "w1", uid: "x", role: "superuser", createdAt: ts })).toThrow(/membership.role/);
    expect(ROLE_PERMISSIONS.owner.managePlans).toBe(true);
    expect(ROLE_PERMISSIONS.contributor.recordObservations).toBe(true);
    expect(ROLE_PERMISSIONS.viewer.recordObservations).toBe(false);
  });
});

describe("debt domain", () => {
  it("supports known, unknown, no-interest APRs and rejects invalid money", () => {
    expect(baseDebt({ aprStatus: "known", apr: 20 }).apr).toBe(0.2);
    expect(baseDebt({ aprStatus: "unknown", apr: null }).apr).toBeNull();
    expect(baseDebt({ aprStatus: "no_interest", apr: 0 }).apr).toBe(0);
    expect(() => baseDebt({ currentBalance: Number.NaN })).toThrow(/currentBalance/);
    expect(() => baseDebt({ minimumRequiredPayment: -1 })).toThrow(/minimumRequiredPayment/);
  });

  it("UX-9: treats an omitted minimum payment as unknown (null), never a silent confirmed $0 - mirrors unknown APR", () => {
    expect(baseDebt({ minimumRequiredPayment: undefined }).minimumRequiredPayment).toBeNull();
    expect(baseDebt({ minimumRequiredPayment: null }).minimumRequiredPayment).toBeNull();
    expect(baseDebt({ minimumRequiredPayment: "" }).minimumRequiredPayment).toBeNull();
    expect(baseDebt({ minimumRequiredPayment: 0 }).minimumRequiredPayment).toBe(0);
    expect(baseDebt({ minimumRequiredPayment: 50 }).minimumRequiredPayment).toBe(50);
  });

  it("excludes mortgage from core payoff by default", () => {
    expect(baseDebt({ debtType: "mortgage" }).includedInCorePayoffPlan).toBe(false);
    expect(baseDebt({ debtType: "mortgage", includedInCorePayoffPlan: true }).includedInCorePayoffPlan).toBe(true);
  });

  it("defaults ownerType from a legacy ownerId (backward compatible) or to unassigned", () => {
    expect(baseDebt({ ownerId: "u1" }).ownerType).toBe("member");
    expect(baseDebt({}).ownerType).toBe("unassigned");
  });

  it("enforces the ownerType/ownerId cross-field contract - member requires an id, others forbid one", () => {
    expect(() => baseDebt({ ownerType: "member", ownerId: "" })).toThrow(/ownerId is required/);
    expect(() => baseDebt({ ownerType: "joint", ownerId: "u1" })).toThrow(/ownerId must be empty/);
    expect(() => baseDebt({ ownerType: "unassigned", ownerId: "u1" })).toThrow(/ownerId must be empty/);
    expect(baseDebt({ ownerType: "member", ownerId: "u1" }).ownerId).toBe("u1");
    expect(baseDebt({ ownerType: "joint" }).ownerId).toBe("");
    expect(baseDebt({ ownerType: "unassigned" }).ownerId).toBe("");
  });

  it("defaults balanceStatus to confirmed and rejects an invalid value", () => {
    expect(baseDebt({}).balanceStatus).toBe("confirmed");
    expect(baseDebt({ balanceStatus: "unresolved" }).balanceStatus).toBe("unresolved");
    expect(() => baseDebt({ balanceStatus: "estimated" })).toThrow(/balanceStatus/);
  });

  it("rejects an invalid ownerType", () => {
    expect(() => baseDebt({ ownerType: "spouse" })).toThrow(/ownerType/);
  });
});

describe("plans, versions, active pointer, and immutability", () => {
  it("allows multiple drafts and atomically activates one authoritative plan", () => {
    const repo = new InMemoryTrackToZeroRepository();
    repo.saveWorkspace({ id: "w1", type: "household", createdAt: ts, createdBy: "owner" });
    repo.savePlan({ id: "p1", workspaceId: "w1", status: "draft", createdAt: ts, createdBy: "owner" });
    repo.savePlan({ id: "p2", workspaceId: "w1", status: "draft", createdAt: ts, createdBy: "owner" });
    repo.savePlanVersion({ id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche", asOf: ts, extraMonthlyPayment: 0, createdAt: ts, createdBy: "owner", createdBecause: "activation" });
    repo.savePlanVersion({ id: "v2", planId: "p2", workspaceId: "w1", versionNumber: 1, strategy: "snowball", asOf: ts, extraMonthlyPayment: 0, createdAt: ts, createdBy: "owner", createdBecause: "activation" });

    activatePlanTransaction({ repository: repo, workspaceId: "w1", planId: "p1", versionId: "v1", actorId: "owner", activatedAt: ts });
    activatePlanTransaction({ repository: repo, workspaceId: "w1", planId: "p2", versionId: "v2", actorId: "owner", activatedAt: ts });

    expect(repo.getWorkspace("w1").activePlanId).toBe("p2");
    expect(repo.getPlan("w1", "p2").status).toBe("active");
    expect(repo.getPlan("w1", "p1").status).toBe("archived");
  });

  it("uses workspace.activePlanId over status flags", () => {
    const context = resolveActivePlanContext({
      workspace: { id: "w1", activePlanId: "p2" },
      plans: [
        { id: "p1", status: "active", activeVersionId: "v1" },
        { id: "p2", status: "draft", activeVersionId: "v2" },
      ],
      versions: [{ id: "v2", planId: "p2" }],
    });
    expect(context.plan.id).toBe("p2");
  });

  it("protects immutable versions and creates reforecast as a new version", () => {
    const repo = new InMemoryTrackToZeroRepository();
    const version = repo.savePlanVersion({ id: "v1", planId: "p1", workspaceId: "w1", versionNumber: 1, strategy: "avalanche", asOf: ts, extraMonthlyPayment: 0, createdAt: ts, createdBy: "owner", createdBecause: "activation" });
    expect(() => repo.updatePlanVersion(version)).toThrow(/immutable/);
    const next = createReforecastVersion({ repository: repo, priorVersion: version, overrides: { id: "v2", createdAt: ts, createdBy: "owner", asOf: ts } });
    expect(next.versionNumber).toBe(2);
    expect(next.createdBecause).toBe("reforecast");
  });
});

describe("events and snapshots", () => {
  it("requires actor metadata and rejects invalid values", () => {
    expect(createPaymentEvent({ id: "p1", workspaceId: "w1", debtId: "d1", amount: 10, paidAt: ts, createdAt: ts, createdBy: "member" }).createdBy).toBe("member");
    expect(() => createPaymentEvent({ id: "p1", workspaceId: "w1", debtId: "d1", amount: 0, paidAt: ts, createdAt: ts })).toThrow();
    expect(createBalanceSnapshot({ id: "s1", workspaceId: "w1", debtId: "d1", balance: 10, observedAt: ts, createdAt: ts, createdBy: "member" }).balance).toBe(10);
    expect(() => createBalanceSnapshot({ id: "s1", workspaceId: "w1", debtId: "d1", balance: -1, observedAt: ts, createdAt: ts, createdBy: "member" })).toThrow();
  });

  it("does not mutate inputs and latest snapshot is deterministic", () => {
    const repo = new InMemoryTrackToZeroRepository();
    const input = { id: "s1", workspaceId: "w1", debtId: "d1", balance: 100, observedAt: ts, createdAt: ts, createdBy: "member" };
    const before = structuredClone(input);
    repo.createBalanceSnapshot(input);
    repo.createBalanceSnapshot({ ...input, id: "s2", balance: 90, observedAt: "2026-02-01T00:00:00.000Z" });
    expect(input).toEqual(before);
    expect(repo.listBalanceSnapshots("w1", "d1")[0].id).toBe("s2");
    expect(() => repo.updateBalanceSnapshot()).toThrow(/append-only/);
    expect(() => repo.updatePaymentEvent()).toThrow(/append-only/);
  });
});

describe("calculation adapter and expected schedule", () => {
  it("maps domain debt to Phase 1 engine input without changing payoff results", () => {
    const debt = baseDebt({ currentBalance: 500, minimumRequiredPayment: 100, apr: 0 });
    const legacy = [{ id: "d1", name: "Card", cur_bal: 500, min_due_v: 100, apr_v: 0, planned_v: 0, paid_v: 0 }];
    expect(payoffSimulate([debtToEngineAccount(debt)], "avalanche", 0, {}, 1, 2026)).toEqual(
      payoffSimulate(legacy, "avalanche", 0, {}, 1, 2026)
    );
  });

  it("UX-9: maps an unknown (null) minimum payment to 0 for the engine, without mutating the debt's own stored truth", () => {
    const debt = baseDebt({ currentBalance: 500, minimumRequiredPayment: undefined, apr: 0 });
    expect(debt.minimumRequiredPayment).toBeNull();
    expect(debtToEngineAccount(debt).min_due_v).toBe(0);
  });

  it("generates deterministic expected checkpoints from a frozen plan version", () => {
    const debt = baseDebt({ currentBalance: 300, minimumRequiredPayment: 100, apr: 0 });
    const version = createPlanVersion({
      id: "v1",
      planId: "p1",
      workspaceId: "w1",
      versionNumber: 1,
      strategy: "avalanche",
      asOf: ts,
      startingDebtSnapshot: [createStartingDebtSnapshotItem(debt)],
      extraMonthlyPayment: 0,
      createdAt: ts,
      createdBy: "owner",
      createdBecause: "activation",
    });
    expect(simulatePlanVersion({ debts: [debt], planVersion: version, startMonth: 1, startYear: 2026 })).toHaveLength(3);
    expect(buildExpectedCheckpoints({ debts: [debt], planVersion: version, startMonth: 1, startYear: 2026 })).toHaveLength(3);
  });
});

describe("legacy adapters and migration preview", () => {
  it("classifies clear debts, expenses, and ambiguous records", () => {
    expect(classifyLegacyAccount({ id: "loan", name: "SoFi Loan", cur_bal: 1000, billType: "paydown" }).classification).toBe(LEGACY_DEBT_CLASSIFICATION.CLEAR_DEBT);
    expect(classifyLegacyAccount({ id: "utility", name: "Electric", category: "Utilities", billType: "monthly", cur_bal: 0 }).classification).toBe(LEGACY_DEBT_CLASSIFICATION.NOT_DEBT);
    expect(classifyLegacyAccount({ id: "unknown", name: "Thing", cur_bal: 10, billType: "" }).classification).toBe(LEGACY_DEBT_CLASSIFICATION.NEEDS_CONFIRMATION);
  });

  it("creates debt candidates and draft plan candidates only", () => {
    expect(legacyAccountToDebtCandidate({ account: { id: "loan", name: "Loan", cur_bal: 100, min_due_v: 10, apr_v: 20, billType: "paydown" }, workspaceId: "w1" }).debt.apr).toBe(0.2);
    expect(legacySavedPlanToDraftCandidate({ plan: { id: "legacy-plan", items: [] }, workspaceId: "w1", asOf: ts }).status).toBe("draft");
  });

  it("migration preview performs zero writes and surfaces ambiguity", () => {
    const writeSink = vi.fn();
    expect(() => buildMigrationPreview({ legacyWorkspace: { id: "w1" }, asOf: ts, writeSink })).toThrow(/read-only/);
    expect(writeSink).not.toHaveBeenCalled();
    const preview = buildMigrationPreview({
      legacyWorkspace: { id: "w1" },
      legacyAccounts: [
        { id: "loan", name: "Loan", cur_bal: 100, min_due_v: 10, billType: "paydown" },
        { id: "mystery", name: "Mystery", cur_bal: 10 },
      ],
      legacyPlans: [{ id: "plan1", items: [] }],
      asOf: ts,
    });
    expect(preview.writesPerformed).toBe(0);
    expect(preview.candidateDebts).toHaveLength(1);
    expect(preview.ambiguousRecords).toHaveLength(1);
    expect(preview.candidateDraftPlans[0].status).toBe("draft");
  });

  it("documents migration states", () => {
    expect(describeMigrationState("legacy")).toMatch(/canonical/);
    expect(() => describeMigrationState("done")).toThrow();
  });
});
