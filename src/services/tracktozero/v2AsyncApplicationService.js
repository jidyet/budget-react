import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { createStartingDebtSnapshotItem } from "../../domain/tracktozero/models.js";
import { isDebtNeedsReview, resolveDebtOwnership } from "../../domain/tracktozero/ownership.js";
import { findDuplicateMember, findDuplicatePerson, matchImportedOwnerToIdentity, normalizePersonName } from "../../domain/tracktozero/personIdentity.js";
import { buildExpectedCheckpoints } from "../adapters/tracktozeroCalcAdapter.js";
import { calculateWhatIfComparison } from "../calc/scenarioComparison.js";
import {
  buildProjectionWithWarnings,
  derivePlanHealth,
  getEligiblePlanDebts,
  getIncludedDebts,
  monthKeyFromDate,
  sortDebtsForStrategy,
} from "./projectionStatusService.js";
import { deriveDebtPortfolioSummary } from "./portfolioSummary.js";
import { V2_DATA_MODES, hasPermission } from "./v2ApplicationService.js";
import { V2_TEST_NOW } from "./v2SeedData.js";
import {
  MATCH_CLASSIFICATIONS,
  RECONCILIATION_DECISIONS,
  buildResolutionEvidence,
  enrichImportCandidatesWithDebtMatches,
} from "./debtReconciliation.js";
import {
  REVIEW_RESOLUTION_TYPES,
  debtStateFingerprint,
  getActionableOpenCount,
  getBlockingReviewCount,
  getDeferredBlockingCount,
  getOpenReviewCount,
  getOpenReviewItems,
  getResolvedReviewItems,
  getReviewCountsByType,
  sortOpenReviewItems,
} from "./reviewDomain.js";
import { OWNER_TYPES, SCENARIO_TYPES } from "../../domain/tracktozero/constants.js";
import { FRIENDLY_SAVE_FAILURE, FRIENDLY_STALE_MESSAGE } from "./reviewCopy.js";

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const stableIdPart = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 64);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeDisplayName = (value) => normalizePersonName(String(value || "").trim());
const inviteExpiryDays = 7;
const addDaysIso = (iso, days) => new Date(Date.parse(iso) + (days * 24 * 60 * 60 * 1000)).toISOString();
const getWorkspaceLabel = (workspace = {}) => workspace.name || (workspace.type === "household" ? "Your household" : "Your workspace");
const encodeBase64Url = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const randomInviteToken = () => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
};
const hashInviteToken = async (token) => {
  const bytes = new TextEncoder().encode(String(token || ""));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const maskInviteEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return "";
  const [local, domain] = normalized.split("@");
  return `${local.slice(0, 2)}${local.length > 2 ? "…" : ""}@${domain}`;
};
const inviteStatusFromRecord = (invite, nowIso = V2_TEST_NOW) => {
  if (!invite) return "invalid";
  if (invite.status === "accepted") return "accepted";
  if (invite.status === "canceled") return "canceled";
  if (invite.status === "expired") return "expired";
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.parse(nowIso)) return "expired";
  return invite.status || "pending";
};
const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const inviteRoute = (workspaceId, rawToken) => `/join?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(rawToken)}`;

const parseAsOf = (asOf) => {
  const date = new Date(asOf || V2_TEST_NOW);
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
};

const dueDayFromCandidate = (candidate = {}) => {
  if (candidate.dueDay) return Number(candidate.dueDay);
  if (!candidate.dueDate) return null;
  const parsed = new Date(candidate.dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDate();
};

const metadataPatchFromCandidate = (metadataUpdates = {}) => {
  const allowed = ["apr", "aprStatus", "minimumRequiredPayment", "dueDay", "includedInCorePayoffPlan", "debtType", "ownerType", "ownerId", "ownerLabel", "accountReferenceSafe"];
  return Object.fromEntries(Object.entries(metadataUpdates)
    .filter(([key, value]) => allowed.includes(key) && value !== undefined));
};

export const getUserSafeTrackToZeroError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  if (code.includes("permission-denied") || /permission|insufficient/i.test(message)) {
    return {
      kind: "permission_denied",
      message: "This account does not have access to that TrackToZero workspace or action.",
    };
  }
  if (/emulator|required|unavailable/i.test(message)) {
    return {
      kind: "repository_error",
      message: "TrackToZero beta is temporarily unavailable. Nothing was changed. Try again shortly.",
    };
  }
  // DATA-1 HOTFIX: a raw Firestore write rejection (e.g. an internal
  // serialization bug like the undefined-field ImportBatch failure this
  // guards against) must never surface its technical wording as the
  // primary import-failure message.
  if (/setDoc|invalid data|unsupported field value/i.test(message)) {
    return {
      kind: "import_persistence_error",
      message: "We couldn't save that file yet. Nothing was added. Try again.",
    };
  }
  return {
    kind: "repository_error",
    message: "TrackToZero could not complete that action. Nothing was changed. Try again.",
  };
};

const resolveActivePlanContextAsync = async ({ repository, workspaceId }) => {
  const workspace = await repository.getWorkspace(workspaceId);
  if (!workspace?.activePlanId) return null;
  const plan = await repository.getPlan(workspaceId, workspace.activePlanId);
  if (!plan) return { workspace, plan: null, version: null };
  const version = plan.activeVersionId
    ? await repository.getPlanVersion(workspaceId, plan.id, plan.activeVersionId)
    : null;
  return { workspace, plan, version };
};

const latestSnapshotsByDebtAsync = async (repository, workspaceId, debts) => {
  const pairs = await Promise.all(debts.map(async (debt) => [
    debt.id,
    (await repository.listBalanceSnapshots(workspaceId, debt.id))[0] || null,
  ]));
  return Object.fromEntries(pairs);
};

const balanceHistoryByDebtAsync = async (repository, workspaceId, debts) => {
  const pairs = await Promise.all(debts.map(async (debt) => [
    debt.id,
    [...(await repository.listBalanceSnapshots(workspaceId, debt.id))].reverse(),
  ]));
  return Object.fromEntries(pairs);
};

const paymentEventsByDebtAsync = async (repository, workspaceId, debts) => {
  if (typeof repository.listPaymentEvents !== "function") return {};
  const pairs = await Promise.all(debts.map(async (debt) => [
    debt.id,
    await repository.listPaymentEvents(workspaceId, debt.id),
  ]));
  return Object.fromEntries(pairs);
};

export const createTrackToZeroV2AsyncAppService = ({
  repository,
  actorId = "seed-owner",
  mode = V2_DATA_MODES.interactive,
  asOf = V2_TEST_NOW,
} = {}) => {
  if (!repository) throw new Error("TrackToZero v2 async application service requires a repository");

  const assertInteractive = () => {
    if (mode !== V2_DATA_MODES.interactive) {
      throw new Error("Legacy Preview mode is read-only. No TrackToZero 2.0 writes are allowed here.");
    }
  };

  const getWorkspaces = async () =>
    (await repository.listWorkspaces())
      .map((workspace) => ({ ...workspace }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  const getUserWorkspaces = async () => {
    if (typeof repository.listMembershipsForUser !== "function") return getWorkspaces();
    const memberships = await repository.listMembershipsForUser(actorId);
    const workspaces = await Promise.all(
      memberships.map(async (membership) => repository.getWorkspace(membership.workspaceId))
    );
    return uniqueBy(
      workspaces
        .filter(Boolean)
        .sort((a, b) => (a.type || "").localeCompare(b.type || "") || String(a.name || a.id).localeCompare(String(b.name || b.id))),
      (workspace) => workspace.id
    );
  };

  const bootstrapOwnerWorkspace = async (workspaceId, { type = "personal", displayName = "", email = "" } = {}) => {
    assertInteractive();
    const existingMembership = await Promise.resolve(repository.getMembership(workspaceId, actorId)).catch(() => null);
    if (existingMembership?.status === "active") return getWorkspaceContext(workspaceId);
    const workspace = {
      id: workspaceId,
      type,
      status: "active",
      name: type === "household" ? `${displayName || "Your"} household` : "",
      activePlanId: "",
      createdAt: asOf,
      createdBy: actorId,
    };
    const ownerMembership = {
      workspaceId,
      uid: actorId,
      role: "owner",
      status: "active",
      displayName,
      email,
      createdAt: asOf,
      createdBy: actorId,
    };
    if (typeof repository.saveOwnerWorkspaceBootstrap === "function") {
      await repository.saveOwnerWorkspaceBootstrap({ workspace, ownerMembership });
    } else {
      await repository.saveWorkspace(workspace);
      await repository.saveMembership(ownerMembership);
    }
    return getWorkspaceContext(workspaceId);
  };

  const createMemberInvite = async (workspaceId, { email = "", role = "viewer" } = {}) => {
    assertInteractive();
    const { workspace, membership, members, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageMembers")) throw new Error("Your role cannot manage household invitations.");
    if (!["admin", "contributor", "viewer"].includes(role)) throw new Error("Owners cannot be invited or transferred in this beta flow.");
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Enter a valid invite email.");
    if (typeof repository.saveMemberInvite !== "function") throw new Error("Invitation storage is unavailable.");
    if (members.some((memberDoc) => normalizeEmail(memberDoc.email) === normalizedEmail && memberDoc.status === "active")) {
      throw new Error("They're already in this household.");
    }
    const pendingInvites = typeof repository.listMemberInvites === "function"
      ? await repository.listMemberInvites(workspaceId)
      : [];
    for (const pendingInvite of pendingInvites) {
      if (normalizeEmail(pendingInvite.emailNormalized) === normalizedEmail && inviteStatusFromRecord(pendingInvite, asOf) === "pending") {
        await repository.cancelMemberInvite?.({
          workspaceId,
          inviteId: pendingInvite.id,
          canceledAt: asOf,
          canceledByUserId: actorId,
        });
      }
    }
    const rawToken = randomInviteToken();
    const tokenHash = await hashInviteToken(rawToken);
    const savedInvite = await repository.saveMemberInvite({
      id: tokenHash,
      workspaceId,
      workspaceName: getWorkspaceLabel(workspace),
      emailNormalized: normalizedEmail,
      role,
      status: "pending",
      tokenHash,
      invitedByUserId: actorId,
      invitedByName: membership.displayName || membership.email || actorId,
      workspacePersonId: "",
      createdAt: asOf,
      createdBy: actorId,
      expiresAt: addDaysIso(asOf, inviteExpiryDays),
    });
    return {
      ...savedInvite,
      emailMasked: maskInviteEmail(savedInvite.emailNormalized),
      joinUrl: inviteRoute(workspaceId, rawToken),
      delivery: "copy_link",
      peopleCount: people.length,
    };
  };

  const listMemberInvites = async (workspaceId) => {
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!ROLE_PERMISSIONS[membership.role]?.view) throw new Error("You are not allowed to view household invites.");
    if (typeof repository.listMemberInvites !== "function") return [];
    return (await repository.listMemberInvites(workspaceId))
      .map((invite) => ({
        ...invite,
        derivedStatus: inviteStatusFromRecord(invite, asOf),
        emailMasked: maskInviteEmail(invite.emailNormalized),
      }))
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  };

  const getJoinInvitePreview = async (workspaceId, token) => {
    const tokenHash = await hashInviteToken(token);
    const invite = await repository.getMemberInvite?.(workspaceId, tokenHash);
    if (!invite) return { state: "invalid", invite: null };
    const derivedStatus = inviteStatusFromRecord(invite, asOf);
    return {
      state: derivedStatus === "pending" ? "ready" : derivedStatus,
      invite: {
        ...invite,
        derivedStatus,
        emailMasked: maskInviteEmail(invite.emailNormalized),
      },
    };
  };

  const suggestWorkspacePersonMatches = async (workspaceId, { displayName = "", email = "" } = {}) => {
    if (typeof repository.listWorkspacePersons !== "function") return [];
    const people = await repository.listWorkspacePersons(workspaceId);
    const activePeople = people.filter((person) => person.status !== "merged" && !person.workspaceMembershipId);
    const normalizedName = normalizeDisplayName(displayName);
    const emailName = normalizeDisplayName(normalizeEmail(email).split("@")[0]?.replace(/[._-]+/g, " ") || "");
    return activePeople.filter((person) => {
      if (!normalizedName && !emailName) return false;
      if (person.normalizedName === normalizedName || person.normalizedName === emailName) return true;
      return (person.aliases || []).some((alias) => {
        const normalizedAlias = normalizeDisplayName(alias);
        return normalizedAlias && (normalizedAlias === normalizedName || normalizedAlias === emailName);
      });
    });
  };

  const acceptMemberInvite = async (workspaceId, { token, displayName = "", email = "" } = {}) => {
    assertInteractive();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Sign in with the invited email to continue.");
    const tokenHash = await hashInviteToken(token);
    const invite = await repository.getMemberInvite?.(workspaceId, tokenHash);
    const derivedStatus = inviteStatusFromRecord(invite, asOf);
    if (!invite) throw new Error("This invite link is invalid.");
    if (derivedStatus === "expired") throw new Error("This invite has expired.");
    if (derivedStatus === "canceled") throw new Error("This invite was canceled.");
    if (normalizeEmail(invite.emailNormalized) !== normalizedEmail) {
      throw new Error(`This invite was sent to ${invite.emailNormalized}. Sign in with that account to continue.`);
    }
    const existingMembership = await Promise.resolve(repository.getMembership(workspaceId, actorId)).catch(() => null);
    if (derivedStatus === "accepted") {
      return {
        invite: { ...invite, derivedStatus },
        membership: existingMembership,
        personMatches: existingMembership ? await suggestWorkspacePersonMatches(workspaceId, { displayName, email }) : [],
        alreadyAccepted: true,
      };
    }
    const membershipInput = existingMembership || {
      workspaceId,
      uid: actorId,
      role: invite.role,
      status: "active",
      displayName,
      email: normalizedEmail,
      acceptedInviteId: invite.id,
      createdAt: asOf,
      createdBy: actorId,
    };
    const accepted = await repository.acceptMemberInvite({
      workspaceId,
      inviteId: invite.id,
      membership: membershipInput,
      acceptedAt: asOf,
      acceptedByUserId: actorId,
    });
    return {
      invite: { ...accepted.invite, derivedStatus: "accepted" },
      membership: accepted.membership,
      personMatches: await suggestWorkspacePersonMatches(workspaceId, { displayName, email }),
      alreadyAccepted: false,
    };
  };

  const cancelMemberInvite = async (workspaceId, inviteId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageMembers")) throw new Error("Your role cannot cancel household invitations.");
    if (typeof repository.cancelMemberInvite !== "function") throw new Error("Invitation storage is unavailable.");
    return repository.cancelMemberInvite({
      workspaceId,
      inviteId,
      canceledAt: asOf,
      canceledByUserId: actorId,
    });
  };

  const getWorkspaceContext = async (workspaceId) => {
    const workspace = await repository.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const [membership, members, people] = await Promise.all([
      repository.getMembership(workspaceId, actorId),
      repository.listMemberships?.(workspaceId) || [],
      repository.listWorkspacePersons?.(workspaceId) || [],
    ]);
    if (!membership || membership.status !== "active") throw new Error("You are not a member of this workspace.");
    return {
      workspace,
      membership,
      members,
      // DATA-HH1: Workspace-scoped financial identities (see
      // domain/tracktozero/personIdentity.js) - distinct from `members`,
      // never implying an authenticated account or WorkspaceMembership.
      // Loaded here, once per request, the same way `members` already is,
      // so every call site that already destructures getWorkspaceContext's
      // return gets `people` for free without a second round trip.
      people,
      permissions: ROLE_PERMISSIONS[membership?.role] || ROLE_PERMISSIONS.viewer,
    };
  };

  const getActivePlanContext = (workspaceId) => resolveActivePlanContextAsync({ repository, workspaceId });

  const getExpectedCheckpoints = async (workspaceId, activeContext) => {
    if (!activeContext?.plan || !activeContext?.version) return [];
    return repository.listExpectedCheckpoints?.(workspaceId, activeContext.plan.id, activeContext.version.id) || [];
  };

  const getWorkspaceSnapshot = async (workspaceId) => {
    const context = await getWorkspaceContext(workspaceId);
    const debts = await repository.listDebts(workspaceId);
    const memberInvites = typeof repository.listMemberInvites === "function"
      ? await repository.listMemberInvites(workspaceId)
      : [];
    const activeContext = await getActivePlanContext(workspaceId);
    const expectedCheckpoints = await getExpectedCheckpoints(workspaceId, activeContext);
    const snapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, debts);
    const balanceHistoryByDebt = await balanceHistoryByDebtAsync(repository, workspaceId, debts);
    const paymentEventsByDebt = await paymentEventsByDebtAsync(repository, workspaceId, debts);
    const { month, year } = parseAsOf(asOf);
    const projectionWithWarnings = activeContext?.version
      ? buildProjectionWithWarnings({ debts, planVersion: activeContext.version, startMonth: month, startYear: year })
      : { projection: [], warnings: [] };
    // THE single Home/Plan plan-health derivation (UX-0 Part 9-10) - see the
    // matching comment in v2ApplicationService.js's getWorkspaceSnapshot.
    const status = derivePlanHealth({
      debts,
      planVersion: activeContext?.version,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      projectionWarnings: projectionWithWarnings.warnings,
      asOf,
    });
    const includedDebts = getIncludedDebts(debts, activeContext?.version);
    const eligibleDebts = getEligiblePlanDebts(debts, activeContext?.version);
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    // A debt with a $0 (or lower) balance is already paid off and must never
    // be presented as "what to pay off next," even as a fallback when no
    // plan has been activated yet.
    const payableEligibleDebts = eligibleDebts.filter((debt) => debtBalance(debt) > 0);
    const projectedTarget = projectionWithWarnings.projection[0]?.payoff_target || "";
    const frozenTargetId = activeContext?.version?.startingDebtSnapshot?.find((item) => item.includedInCorePayoffPlan)?.debtId || "";
    const targetDebt = debts.find((debt) => debt.id === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.name === projectedTarget && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || debts.find((debt) => debt.id === frozenTargetId && debtBalance(debt) > 0 && !isDebtNeedsReview(debt))
      || payableEligibleDebts[0]
      || null;
    // THE single shared debt-portfolio derivation (UX-0 Part 3) - see the
    // matching comment in v2ApplicationService.js's getWorkspaceSnapshot.
    const portfolioSummary = deriveDebtPortfolioSummary({
      workspace: context.workspace,
      members: context.members,
      people: context.people,
      debts,
      debtBalance,
    });
    const payoffQueue = sortDebtsForStrategy(
      eligibleDebts.filter((debt) => debtBalance(debt) > 0),
      activeContext?.version?.strategy || "avalanche"
    );

    return {
      ...context,
      mode,
      asOf,
      memberInvites: memberInvites.map((invite) => ({
        ...invite,
        derivedStatus: inviteStatusFromRecord(invite, asOf),
        emailMasked: maskInviteEmail(invite.emailNormalized),
      })),
      debts,
      includedDebts,
      activeContext,
      expectedCheckpoints,
      latestSnapshotsByDebt: snapshotsByDebt,
      balanceHistoryByDebt,
      paymentEventsByDebt,
      projection: projectionWithWarnings.projection,
      warnings: projectionWithWarnings.warnings,
      status,
      totalIncludedDebt: portfolioSummary.includedDebt,
      targetDebt,
      portfolioSummary,
      payoffQueue,
      projectedZeroDate: projectionWithWarnings.projection.at(-1)?.month || activeContext?.version?.projectedZeroDate || "",
    };
  };

  const renameWorkspace = async (workspaceId, name) => {
    assertInteractive();
    const { workspace, membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageMembers")) throw new Error("Your role cannot rename this household.");
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Enter a household name.");
    return repository.putWorkspace({
      ...workspace,
      name: trimmed,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const connectWorkspacePersonToMember = async (workspaceId, { personId, memberUid = actorId, allowSelfService = false } = {}) => {
    assertInteractive();
    const context = await getWorkspaceContext(workspaceId);
    const selfService = allowSelfService && memberUid === actorId;
    if (!selfService && !hasPermission(context.membership, "manageMembers")) {
      throw new Error("Your role cannot connect household profiles.");
    }
    const person = context.people.find((entry) => entry.id === personId && entry.status !== "merged");
    if (!person) throw new Error("That financial profile was not found.");
    if (person.workspaceMembershipId && person.workspaceMembershipId !== memberUid) {
      throw new Error("This financial profile is already connected to another account.");
    }
    const member = context.members.find((entry) => entry.uid === memberUid && entry.status === "active");
    if (!member) throw new Error("That household member was not found.");
    const alreadyLinkedPerson = context.people.find((entry) => entry.workspaceMembershipId === memberUid && entry.id !== personId && entry.status !== "merged");
    if (alreadyLinkedPerson) {
      throw new Error("This account is already connected to another financial profile.");
    }
    return repository.saveWorkspacePerson({
      ...person,
      workspaceMembershipId: memberUid,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const createNewDebt = async (workspaceId, input) => {
    assertInteractive();
    const { workspace, membership, members, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view debts, but cannot add debt terms.");
    if (typeof repository.createDebtWithOpeningSnapshot !== "function") {
      throw new Error("Debt setup requires an opening balance snapshot.");
    }
    const ownership = resolveDebtOwnership({
      workspaceType: workspace.type,
      members,
      people,
      actorId,
      requested: { ownerType: input.ownerType, ownerId: input.ownerId },
    });
    const debtId = input.id || (input.clientRequestId ? `debt-${stableIdPart(input.clientRequestId)}` : id("debt"));
    const openingBalanceSnapshotId = input.openingBalanceSnapshotId || `opening-${debtId}`;
    const result = await repository.createDebtWithOpeningSnapshot({
      debt: {
        ...input,
        ...ownership,
        id: debtId,
        workspaceId,
        createdAt: asOf,
        createdBy: actorId,
        openingBalanceSnapshotId,
      },
      openingSnapshot: {
        id: openingBalanceSnapshotId,
        workspaceId,
        debtId,
        balance: input.currentBalance,
        observedAt: input.balanceAsOf || input.observedAt || asOf,
        source: "manual",
        notes: "Opening balance",
        createdAt: asOf,
        createdBy: actorId,
      },
    });
    return result.debt;
  };

  const updateDebt = async (workspaceId, debtId, patch) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role can view this debt, but cannot edit debt terms.");
    const current = (await repository.listDebts(workspaceId)).find((debt) => debt.id === debtId);
    if (!current) throw new Error("Debt not found");
    return repository.saveDebt({ ...current, ...patch, updatedAt: asOf, updatedBy: actorId });
  };

  const recordPayment = async (workspaceId, debtId, { amount, paidAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot record payments in this workspace.");
    const activeContext = await getActivePlanContext(workspaceId);
    return repository.createPaymentEvent({
      id: id("payment"),
      workspaceId,
      debtId,
      planId: activeContext?.plan?.id || "",
      planVersionId: activeContext?.version?.id || "",
      amount,
      paidAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  const recordBalanceSnapshot = async (workspaceId, debtId, { balance, observedAt = asOf, notes = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "recordObservations")) throw new Error("Your role cannot update balances in this workspace.");
    return repository.createBalanceSnapshot({
      id: id("snapshot"),
      workspaceId,
      debtId,
      balance,
      observedAt,
      source: "manual",
      notes,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  // Zero-write preview for a plan that doesn't exist yet (first-run flow):
  // mirrors previewReforecast's approach of building a not-yet-persisted
  // PlanVersion and running it through the existing trusted projection
  // engine, without creating anything. Nothing here recomputes payoff math -
  // buildProjectionWithWarnings is the same function createDraftPlan/
  // activatePlan use for real.
  const previewDraftPlan = async (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    const debts = await repository.listDebts(workspaceId);
    const included = debtIds.length
      ? debts.filter((debt) => debtIds.includes(debt.id))
      : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    if (!included.length) return null;
    const snapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, included);
    const { month, year } = parseAsOf(asOf);
    const previewVersion = {
      id: "preview-first-plan", workspaceId, planId: "preview", versionNumber: 1, strategy, asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment, goalDate, createdAt: asOf, createdBy: actorId, createdBecause: "activation",
    };
    const { projection, warnings } = buildProjectionWithWarnings({ debts: included, planVersion: previewVersion, startMonth: month, startYear: year });
    // See the matching comment in v2ApplicationService.js's previewDraftPlan
    // - the displayed order/total must reflect exactly what was simulated.
    const debtBalance = (debt) => Number(snapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0);
    const eligibleForDisplay = getEligiblePlanDebts(included, previewVersion).filter((debt) => debtBalance(debt) > 0);
    const startingTotalBalance = eligibleForDisplay.reduce((sum, debt) => sum + debtBalance(debt), 0);
    const payoffOrder = sortDebtsForStrategy(eligibleForDisplay, strategy);
    return {
      strategy,
      extraMonthlyPayment,
      includedDebts: included,
      payoffOrder,
      startingTotalBalance,
      monthsToZero: projection.length,
      projectedZeroDate: projection.at(-1)?.month || "",
      estimatedInterest: projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
      warnings,
      projection,
    };
  };

  const createDraftPlan = async (workspaceId, { strategy = "avalanche", extraMonthlyPayment = 0, debtIds = [], goalDate = "" } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot create payoff plans.");
    const debts = await repository.listDebts(workspaceId);
    const included = debtIds.length
      ? debts.filter((debt) => debtIds.includes(debt.id))
      : debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    const plan = await repository.savePlan({ id: id("plan"), workspaceId, status: "draft", createdAt: asOf, createdBy: actorId });
    const version = await repository.savePlanVersion({
      id: id("version"),
      planId: plan.id,
      workspaceId,
      versionNumber: 1,
      strategy,
      asOf,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      extraMonthlyPayment,
      goalDate,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "activation",
    });
    return { plan, version };
  };

  const activatePlan = async (workspaceId, planId, versionId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot activate payoff plans.");
    if (typeof repository.activatePlan !== "function") throw new Error("Repository cannot activate payoff plans");
    const context = await repository.activatePlan({ workspaceId, planId, versionId, actorId, activatedAt: asOf });
    const debts = await repository.listDebts(workspaceId);
    const { month, year } = parseAsOf(asOf);
    for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: context.version, startMonth: month, startYear: year }).slice(0, 36)) {
      await repository.createExpectedCheckpoint(checkpoint);
    }
    return context;
  };

  const createImportBatch = async (workspaceId, { sourceType, sourceFilename = "", candidates = [], warnings = [], parserVersion = "1" } = {}) => {
    assertInteractive();
    const { workspace, membership, members, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot import debts into this workspace.");
    const batchId = id("import");
    // Convenience pre-fill only: if the parser's raw ownerSuggestion is an
    // EXACT match (DATA-HH1's matching engine - never "strong"/"possible",
    // those stay unassigned for the human to explicitly confirm in Review)
    // against a REAL verified member or an existing household person,
    // pre-select them instead of forcing a manual pick - the human still
    // reviews/confirms (or changes) this before anything is committed, and
    // resolveDebtOwnership re-verifies it against the live member/person
    // lists regardless at commit time.
    const withOwnerSuggestions = workspace.type === "household"
      ? candidates.map((candidate) => {
          if (candidate.ownerType && candidate.ownerType !== "unassigned") return candidate;
          const match = matchImportedOwnerToIdentity({ rawName: candidate.ownerSuggestion, members, people });
          if (match.status !== "exact") return candidate;
          return match.kind === "member"
            ? { ...candidate, ownerType: "member", ownerId: match.membershipUid }
            : { ...candidate, ownerType: "person", ownerId: match.personId };
        })
      : candidates;
    const debts = await repository.listDebts(workspaceId);
    const latestSnapshotsByDebt = await latestSnapshotsByDebtAsync(repository, workspaceId, debts);
    const priorImportBatches = await (repository.listImportBatches?.(workspaceId) || []);
    const reconciledCandidates = enrichImportCandidatesWithDebtMatches({
      candidates: withOwnerSuggestions,
      debts,
      latestSnapshotsByDebt,
      priorImportBatches,
    });
    return repository.saveImportBatch({
      id: batchId,
      workspaceId,
      createdBy: actorId,
      createdAt: asOf,
      sourceType,
      sourceFilename,
      status: reconciledCandidates.length ? "review_required" : "failed",
      candidateCount: reconciledCandidates.length,
      confirmedCount: 0,
      rejectedCount: 0,
      duplicateCount: reconciledCandidates.filter((candidate) => candidate.evidence?.reconciliation?.classification === MATCH_CLASSIFICATIONS.duplicateImport).length,
      warnings,
      metadata: { parserVersion },
      candidates: reconciledCandidates.map((candidate) => ({ ...candidate, importBatchId: batchId, workspaceId })),
    });
  };

  const decideImportCandidate = async (workspaceId, batchId, candidateId, { decision, patch = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) =>
      candidate.candidateId === candidateId ? { ...candidate, ...patch, decision } : candidate);
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      confirmedCount: candidates.filter((c) => c.decision === "confirmed").length,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const resolveImportCandidateMatch = async (workspaceId, batchId, candidateId, { decision, targetDebtId = "", metadataUpdates = {}, patch = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!Object.values(RECONCILIATION_DECISIONS).includes(decision)) throw new Error("Unsupported reconciliation decision.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const debts = await repository.listDebts(workspaceId);
    const targetDebt = debts.find((debt) => debt.id === targetDebtId);
    if (decision === RECONCILIATION_DECISIONS.updateExisting && !targetDebt) {
      throw new Error("Target debt not found in this workspace.");
    }
    // Stale-review protection (Part 28) starts here: the target debt's
    // observed state is fingerprinted at the moment the human makes this
    // decision, not at commit time. commitImportBatch later compares this
    // fingerprint against the live debt and refuses to overwrite newer truth.
    const debtSnapshotAtResolution = decision === RECONCILIATION_DECISIONS.updateExisting ? debtStateFingerprint(targetDebt) : null;
    const reviewResolutionType = decision === RECONCILIATION_DECISIONS.updateExisting
      ? REVIEW_RESOLUTION_TYPES.updatedExistingDebt
      : decision === RECONCILIATION_DECISIONS.newDebt
        ? REVIEW_RESOLUTION_TYPES.createdNewDebt
        : REVIEW_RESOLUTION_TYPES.deferred;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      const resolution = buildResolutionEvidence({ decision, targetDebtId, metadataUpdates, actorId, resolvedAt: asOf });
      const nextDecision = decision === RECONCILIATION_DECISIONS.unsure ? "needs_information" : "confirmed";
      return {
        ...candidate,
        ...patch,
        decision: nextDecision,
        targetDebtId: decision === RECONCILIATION_DECISIONS.updateExisting ? targetDebtId : "",
        duplicateOfDebtId: decision === RECONCILIATION_DECISIONS.updateExisting ? targetDebtId : candidate.duplicateOfDebtId,
        duplicateStatus: decision === RECONCILIATION_DECISIONS.updateExisting ? "likely_duplicate" : candidate.duplicateStatus,
        // The durable, general-purpose REVIEW-1A marker (reviewDomain.js
        // reads this to derive status) - kept alongside, not instead of,
        // DATA-1B's own evidence.reconciliation.resolution below, which
        // existing tests already depend on.
        reviewResolution: { type: reviewResolutionType, decidedAt: asOf, decidedBy: actorId, debtSnapshotAtResolution },
        evidence: {
          ...(candidate.evidence || {}),
          reconciliation: {
            ...(candidate.evidence?.reconciliation || {}),
            resolution,
          },
        },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      confirmedCount: candidates.filter((c) => c.decision === "confirmed").length,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      duplicateCount: candidates.filter((c) => c.evidence?.reconciliation?.classification === MATCH_CLASSIFICATIONS.duplicateImport).length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  const commitImportBatch = async (workspaceId, batchId) => {
    assertInteractive();
    const { workspace, membership, members, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot commit this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status === "committed") return { batch, createdDebts: [] };
    if (batch.status !== "review_required") throw new Error(`Import batch cannot be committed from status "${batch.status}".`);

    const createdDebts = [];
    const updatedDebts = [];
    const failures = [];
    const staleCandidateIds = [];
    const committedOutcomeByCandidateId = new Map();
    for (const candidate of batch.candidates) {
      if (candidate.decision !== "confirmed") continue;
      const resolution = candidate.evidence?.reconciliation?.resolution || {};
      const isExistingUpdate = resolution.decision === RECONCILIATION_DECISIONS.updateExisting;
      const debtId = isExistingUpdate ? resolution.targetDebtId : `debt-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`;
      const openingBalanceSnapshotId = `opening-${debtId}`;
      try {
        if (isExistingUpdate) {
          if (typeof repository.updateDebtFromImportCandidate !== "function") throw new Error("Repository cannot update an existing debt from import.");
          const metadataPatch = metadataPatchFromCandidate(resolution.metadataUpdates || {});
          const result = await repository.updateDebtFromImportCandidate({
            workspaceId,
            debtId,
            metadataPatch,
            balanceSnapshot: {
              id: `import-${stableIdPart(`${batchId}:${candidate.candidateId}`)}`,
              workspaceId,
              debtId,
              balance: candidate.currentBalance,
              observedAt: candidate.statementDate || asOf,
              source: "import",
              notes: `Imported balance update from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidate.candidateId}).`,
              createdAt: asOf,
              createdBy: actorId,
            },
            actorId,
            updatedAt: asOf,
            // Stale-review protection (Part 28): compare against the debt's
            // state at the moment this decision was made, captured by
            // resolveImportCandidateMatch/resolveAsExistingDebt.
            expectedPriorState: candidate.reviewResolution?.debtSnapshotAtResolution || null,
          });
          updatedDebts.push(result.debt);
          committedOutcomeByCandidateId.set(candidate.candidateId, { type: REVIEW_RESOLUTION_TYPES.updatedExistingDebt, debtId, at: asOf });
          continue;
        }
        // candidate.ownerSuggestion is the parser's raw, non-authoritative
        // guess and is never written to the Debt - only the human-reviewed
        // ownerType/ownerId choice (verified below) becomes real ownership.
        const ownership = resolveDebtOwnership({
          workspaceType: workspace.type,
          members,
          people,
          actorId,
          requested: { ownerType: candidate.ownerType, ownerId: candidate.ownerId },
        });
        // Reuses the exact same repository method (and therefore the same
        // rules-enforced Debt+opening-BalanceSnapshot atomicity gate,
        // v2OpeningSnapshotCreatedWithDebt) that manual debt entry uses - no
        // separate atomicity contract to prove for the import path.
        const result = await repository.createDebtWithOpeningSnapshot({
          debt: {
            id: debtId,
            workspaceId,
            name: candidate.accountName || candidate.creditorName || "Imported debt",
            accountReferenceSafe: candidate.accountReferenceSafe,
            debtType: candidate.debtType,
            currentBalance: candidate.currentBalance,
            // Carries the parser/spreadsheet's confidence in this balance
            // through to the created Debt (see statementCandidateAdapter.js/
            // importCandidateAdapter.js) - a candidate whose balance was
            // never confidently found must never become a Debt that looks
            // like a confirmed $0 payoff (UX-0 Part 4/6).
            balanceStatus: candidate.balanceStatus || "confirmed",
            aprStatus: candidate.aprStatus,
            apr: candidate.aprStatus === "unknown" ? null : candidate.apr,
            minimumRequiredPayment: candidate.minimumPayment ?? 0,
            dueDay: dueDayFromCandidate(candidate),
            ...ownership,
            includedInCorePayoffPlan: candidate.includedInCorePayoffPlan,
            createdAt: asOf,
            createdBy: actorId,
            openingBalanceSnapshotId,
          },
          openingSnapshot: {
            id: openingBalanceSnapshotId,
            workspaceId,
            debtId,
            balance: candidate.currentBalance,
            observedAt: candidate.statementDate || asOf,
            source: "import",
            notes: `Imported from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidate.candidateId}).`,
            createdAt: asOf,
            createdBy: actorId,
          },
        });
        createdDebts.push(result.debt);
        committedOutcomeByCandidateId.set(candidate.candidateId, { type: REVIEW_RESOLUTION_TYPES.createdNewDebt, debtId, at: asOf });
      } catch (error) {
        // A stale-review failure is still a failure for batch-commit control
        // flow (nothing partial is marked committed, and it can be retried
        // after the reviewer looks again) - but it is tagged distinctly so
        // it is never confused with a generic repository error, and the
        // review stays actionable rather than silently disappearing.
        if (error?.code === "stale_review") staleCandidateIds.push(candidate.candidateId);
        failures.push({ candidateId: candidate.candidateId, message: error?.message || String(error), code: error?.code || "" });
      }
    }

    // Stamp committedOutcome onto the candidates that actually succeeded -
    // this is the durable marker that makes a review RESOLVED (Part 4/5):
    // the decision alone is not enough, the financial mutation must have
    // completed, and this must survive reload.
    const nextCandidates = batch.candidates.map((candidate) => {
      const outcome = committedOutcomeByCandidateId.get(candidate.candidateId);
      return outcome ? { ...candidate, committedOutcome: outcome } : candidate;
    });

    const confirmedCount = batch.candidates.filter((c) => c.decision === "confirmed").length;
    // REVIEW-1C: a batch holds multiple independently-reviewed candidates
    // (Part 5/40 - "per-item independent atomic resolution"). Committing one
    // decided candidate must never lock the whole batch away from the
    // others still legitimately pending - resolveImportCandidateMatch and
    // deferReview both require batch.status === "review_required" to act on
    // ANY candidate, so this batch can only flip to "committed" once every
    // candidate has actually reached a terminal state (confirmed-and-
    // committed, or excluded/dismissed). A candidate still "pending_review"
    // or "needs_information" (deferred - still OPEN per reviewDomain.js)
    // must keep the batch open, or it becomes permanently unreachable.
    const stillNeedsDecision = nextCandidates.some((c) => c.decision !== "confirmed" && c.decision !== "excluded");
    const committed = failures.length === 0 && !stillNeedsDecision;
    const updatedBatch = await repository.saveImportBatch({
      ...batch,
      candidates: nextCandidates,
      // A commit-time failure must always stay retryable (Part 27/48 -
      // "the batch was not marked committed so it can be retried") even when
      // zero candidates happened to succeed yet - "failed" is reserved for
      // createImportBatch's own zero-candidates-parsed case, never reused
      // here to mean "commit attempt failed."
      status: committed ? "committed" : "review_required",
      confirmedCount,
      rejectedCount: batch.candidates.filter((c) => c.decision === "excluded").length,
      committedAt: committed ? asOf : null,
      updatedAt: asOf,
      updatedBy: actorId,
      failure: failures.length ? `${failures.length} candidate(s) failed to commit: ${failures.map((f) => f.candidateId).join(", ")}` : "",
      warnings: [...(batch.warnings || []), ...failures.map((f) => `Candidate ${f.candidateId} failed: ${f.message}`)],
    });
    if (failures.length) throw Object.assign(new Error(`Import commit incomplete: ${failures.length} of ${confirmedCount} confirmed debts failed. ${createdDebts.length + updatedDebts.length} succeeded and were kept; the batch was not marked committed so it can be retried.`), { batch: updatedBatch, createdDebts, updatedDebts, failures, staleCandidateIds });
    return { batch: updatedBatch, createdDebts, updatedDebts };
  };

  // ── REVIEW-1A resolution commands ───────────────────────────────────────
  // React/UI code never performs multi-document financial mutations
  // directly (Part 12) - every resolution goes through one of these named
  // actions, which all share the same underlying safety machinery
  // (resolveImportCandidateMatch's staleness fingerprinting, and
  // commitImportBatch's atomic-per-candidate mutation + idempotent retry).

  // Update Existing (Part 13). Thin, named wrapper over the existing,
  // already-tested resolveImportCandidateMatch primitive - kept so the
  // resolution surface reads the way the rest of the spec names it.
  const resolveAsExistingDebt = (workspaceId, batchId, candidateId, { targetDebtId, metadataUpdates = {} } = {}) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.updateExisting, targetDebtId, metadataUpdates });

  // Create New Debt (Part 14).
  const resolveAsNewDebt = (workspaceId, batchId, candidateId) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.newDebt });

  // "I'm not sure" / Leave for later (Part 15) - the review stays OPEN with
  // zero financial mutation. Identical safety contract to "unsure" above;
  // named separately because it is not really a "reconciliation decision",
  // it is the explicit absence of one.
  const deferReview = (workspaceId, batchId, candidateId) =>
    resolveImportCandidateMatch(workspaceId, batchId, candidateId, { decision: RECONCILIATION_DECISIONS.unsure });

  const RESOLVABLE_CANDIDATE_FIELDS = Object.freeze(["currentBalance", "balanceStatus", "apr", "aprStatus", "minimumPayment", "dueDate", "dueDay", "ownerType", "ownerId"]);

  // Missing-information / field-conflict resolution (Part 16-19). Patches
  // only the specific fields the reviewer explicitly confirmed - never asks
  // for or overwrites fields the reviewer didn't touch. This narrows the
  // candidate's own review signals (e.g. clears BALANCE_CONFIRMATION once a
  // real balance is supplied) but is NOT itself a new_debt/update_existing
  // decision - it can be called any number of times before one of those.
  const resolveMissingInformation = async (workspaceId, batchId, candidateId, { fields = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const patch = Object.fromEntries(Object.entries(fields).filter(([key]) => RESOLVABLE_CANDIDATE_FIELDS.includes(key)));
    if (!Object.keys(patch).length) throw new Error("No resolvable fields were provided.");
    if ("currentBalance" in patch) patch.balanceStatus = "confirmed";
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        ...patch,
        fieldResolutions: {
          ...(candidate.fieldResolutions || {}),
          ...Object.fromEntries(Object.keys(patch).map((field) => [field, { value: patch[field], decidedAt: asOf, decidedBy: actorId }])),
        },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({ ...batch, candidates, updatedAt: asOf, updatedBy: actorId });
  };

  const resolveBalance = (workspaceId, batchId, candidateId, { currentBalance } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { currentBalance } });
  const resolveApr = (workspaceId, batchId, candidateId, { apr, aprStatus = "known" } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { apr, aprStatus } });
  const resolveMinimumPayment = (workspaceId, batchId, candidateId, { minimumPayment } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { minimumPayment } });
  // Day-of-month only (Part 19 of REVIEW-1B) - a source that only supports
  // "due day 21" must never be displayed/stored as a fabricated full date
  // like "Aug 21". dueDay is the same authoritative field Debt.dueDay
  // already uses; commitImportBatch's dueDayFromCandidate already prefers
  // candidate.dueDay over candidate.dueDate when both are present.
  const resolveDueDate = (workspaceId, batchId, candidateId, { dueDay } = {}) =>
    resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { dueDay: Number(dueDay) } });

  // Owner resolution (Part 19) - authoritative ownership is restricted to a
  // verified workspace member, a verified household person (DATA-HH1 -
  // financial-data evidence only, never proof of an account), Joint/
  // Household, or Unassigned. Parser text (ownerSuggestion) is never
  // accepted here as a value in its own right.
  const resolveOwner = async (workspaceId, batchId, candidateId, { ownerType, ownerId = "" } = {}) => {
    if (!OWNER_TYPES.includes(ownerType)) throw new Error("Unsupported owner type.");
    if (ownerType === "member") {
      const { members } = await getWorkspaceContext(workspaceId);
      if (!members.some((member) => member.uid === ownerId && member.status !== "removed")) {
        throw new Error("Owner must be a verified workspace member.");
      }
    }
    if (ownerType === "person") {
      const { people } = await getWorkspaceContext(workspaceId);
      if (!people.some((person) => person.id === ownerId && person.status !== "merged")) {
        throw new Error("Owner must be a verified household person.");
      }
    }
    const ownerIdToStore = ownerType === "member" || ownerType === "person" ? ownerId : "";
    return resolveMissingInformation(workspaceId, batchId, candidateId, { fields: { ownerType, ownerId: ownerIdToStore } });
  };

  // ── DATA-HH1: household financial-person identities ─────────────────────
  // listWorkspacePersons/createImportedPerson/confirmAlias/
  // mergeWorkspacePersons are the ONE place a WorkspacePerson is read or
  // written - UI code never touches the repository's people collection
  // directly (Part 30). None of these ever create an Auth account, a
  // WorkspaceMembership, or send an invitation (Part 25/26) - they only
  // establish/adjust a Workspace-scoped financial identity that Debt
  // ownership can reference without requiring an account.
  const listWorkspacePersons = async (workspaceId) => {
    const { people } = await getWorkspaceContext(workspaceId);
    return people;
  };

  const createImportedPerson = async (workspaceId, { displayName } = {}) => {
    assertInteractive();
    const { membership, members, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot add household people.");
    const name = String(displayName || "").trim();
    if (!name) throw new Error("A name is required to add a household person.");
    // Duplicate guard (Part 5/23) - never shadows an existing verified
    // member with a competing "person" identity for the same real person.
    const duplicateMember = findDuplicateMember(name, members);
    if (duplicateMember) {
      throw new Error(`${duplicateMember.displayName || "This person"} is already a workspace member - choose them instead of adding a new person.`);
    }
    // Exact-normalized duplicate people are never created twice; creating
    // the "same" person again is idempotent and just returns the existing one.
    const duplicatePerson = findDuplicatePerson(name, people);
    if (duplicatePerson) return duplicatePerson;
    return repository.saveWorkspacePerson({
      id: id("person"),
      workspaceId,
      displayName: name,
      normalizedName: normalizePersonName(name),
      aliases: [],
      kind: "imported_person",
      status: "active",
      source: "import_confirmed",
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  // A confirmed alias is the ONLY way a nickname/shortened name (e.g. "Jide"
  // for "Babajide Yusuf") becomes an automatic future match (Part 8) - never
  // inferred, always an explicit human decision recorded here.
  const confirmAlias = async (workspaceId, personId, aliasRawName) => {
    assertInteractive();
    const { membership, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot edit household people.");
    const person = people.find((candidate) => candidate.id === personId && candidate.status !== "merged");
    if (!person) throw new Error("Household person not found in this workspace.");
    const alias = String(aliasRawName || "").trim();
    if (!alias) throw new Error("An alias name is required.");
    const normalizedAlias = normalizePersonName(alias);
    if ((person.aliases || []).some((existing) => normalizePersonName(existing) === normalizedAlias)) return person;
    return repository.saveWorkspacePerson({
      ...person,
      aliases: [...(person.aliases || []), alias],
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Safe domain support for resolving an accidental duplicate (Part 24) -
  // reassigns every Debt owned by mergeFromPersonId to keepPersonId, merges
  // aliases (including the merged-from person's own name, so it's still
  // recognized on a future import), and marks the merged-from person
  // terminal. Idempotent: merging an already-merged person a second time is
  // a no-op, never a duplicate mutation or a confusing error on retry.
  const mergeWorkspacePersons = async (workspaceId, { keepPersonId, mergeFromPersonId } = {}) => {
    assertInteractive();
    const { membership, people } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot merge household people.");
    if (!keepPersonId || !mergeFromPersonId) throw new Error("Both a person to keep and a person to merge are required.");
    if (keepPersonId === mergeFromPersonId) throw new Error("Cannot merge a person into themselves.");
    const keepPerson = people.find((person) => person.id === keepPersonId && person.status !== "merged");
    if (!keepPerson) throw new Error("Household person to keep was not found in this workspace.");
    const mergeFromPerson = people.find((person) => person.id === mergeFromPersonId);
    if (!mergeFromPerson) throw new Error("Household person to merge was not found in this workspace.");
    if (mergeFromPerson.status === "merged") {
      return { keepPerson, mergeFromPerson, reassignedDebtCount: 0, alreadyMerged: true };
    }

    const debts = await repository.listDebts(workspaceId);
    const toReassign = debts.filter((debt) => debt.ownerType === "person" && debt.ownerId === mergeFromPersonId);
    for (const debt of toReassign) {
      await repository.saveDebt({
        ...debt,
        ownerId: keepPersonId,
        ownerLabel: keepPerson.displayName,
        updatedAt: asOf,
        updatedBy: actorId,
      });
    }

    const mergedAliases = [...new Set([...(keepPerson.aliases || []), ...(mergeFromPerson.aliases || []), mergeFromPerson.displayName])];
    const savedKeepPerson = await repository.saveWorkspacePerson({
      ...keepPerson,
      aliases: mergedAliases,
      updatedAt: asOf,
      updatedBy: actorId,
    });
    const savedMergeFromPerson = await repository.saveWorkspacePerson({
      ...mergeFromPerson,
      status: "merged",
      mergedIntoPersonId: keepPersonId,
      updatedAt: asOf,
      updatedBy: actorId,
    });

    return { keepPerson: savedKeepPerson, mergeFromPerson: savedMergeFromPerson, reassignedDebtCount: toReassign.length, alreadyMerged: false };
  };

  // Business-scope resolution (Part 20). "exclude" is terminal (dismissed,
  // zero mutation) - a business-like row never silently enters a Household
  // payoff. "include" only acknowledges the scope question; the reviewer
  // still separately resolves new_debt/update_existing afterward.
  const resolveBusinessScope = async (workspaceId, batchId, candidateId, { decision } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!["exclude", "include"].includes(decision)) throw new Error("Unsupported business-scope decision.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const resolutionType = decision === "exclude" ? REVIEW_RESOLUTION_TYPES.excludedBusinessScope : REVIEW_RESOLUTION_TYPES.includedBusinessScope;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: decision === "exclude" ? "excluded" : candidate.decision,
        includedInCorePayoffPlan: decision === "exclude" ? false : candidate.includedInCorePayoffPlan,
        reviewResolution: { type: resolutionType, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Debt-vs-bill classification (Part 21). "bill" is terminal - no Debt is
  // ever created from it.
  const resolveDebtClassification = async (workspaceId, batchId, candidateId, { classification } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!["debt", "bill"].includes(classification)) throw new Error("Unsupported classification.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const resolutionType = classification === "bill" ? REVIEW_RESOLUTION_TYPES.classifiedAsBill : REVIEW_RESOLUTION_TYPES.classifiedAsDebt;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: classification === "bill" ? "excluded" : candidate.decision,
        reviewResolution: { type: resolutionType, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Duplicate resolution (Part 22) - terminal, zero mutation, idempotent
  // (calling it twice leaves the same dismissed state).
  const dismissDuplicate = async (workspaceId, batchId, candidateId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    if (batch.status !== "review_required") throw new Error("This import is no longer open for review.");
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidateId !== candidateId) return candidate;
      return {
        ...candidate,
        decision: "excluded",
        reviewResolution: { type: REVIEW_RESOLUTION_TYPES.dismissedDuplicate, decidedAt: asOf, decidedBy: actorId },
      };
    });
    if (!candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Candidate not found in this import batch.");
    return repository.saveImportBatch({
      ...batch,
      candidates,
      rejectedCount: candidates.filter((c) => c.decision === "excluded").length,
      updatedAt: asOf,
      updatedBy: actorId,
    });
  };

  // Historical-statement resolution (Part 23) - uses the plain,
  // append-only createBalanceSnapshot primitive (never
  // updateDebtFromImportCandidate), so an older statement can NEVER become
  // the debt's current balance no matter when it is uploaded.
  const addHistoricalSnapshot = async (workspaceId, batchId, candidateId, { targetDebtId, statementDate } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "manageDebts")) throw new Error("Your role cannot review this import.");
    if (!statementDate) throw new Error("A statement date is required for a historical snapshot.");
    const batch = await repository.getImportBatch(workspaceId, batchId);
    if (!batch) throw new Error("Import batch not found");
    const candidate = batch.candidates.find((c) => c.candidateId === candidateId);
    if (!candidate) throw new Error("Candidate not found in this import batch.");
    const debts = await repository.listDebts(workspaceId);
    if (!debts.some((debt) => debt.id === targetDebtId)) throw new Error("Target debt not found in this workspace.");
    const latestSnapshot = (await repository.listBalanceSnapshots(workspaceId, targetDebtId))[0] || null;
    if (latestSnapshot && Date.parse(statementDate) >= Date.parse(latestSnapshot.observedAt)) {
      throw new Error("This statement is not older than the debt's latest known balance - use Update Existing Debt instead.");
    }
    const snapshot = await repository.createBalanceSnapshot({
      id: `historical-${stableIdPart(`${batchId}:${candidateId}`)}`,
      workspaceId,
      debtId: targetDebtId,
      balance: candidate.currentBalance,
      observedAt: statementDate,
      source: "import",
      notes: `Historical balance from ${batch.sourceFilename || batch.sourceType} (batch ${batchId}, candidate ${candidateId}). Confirmed as historical - does not change the debt's current balance.`,
      createdAt: asOf,
      createdBy: actorId,
    });
    const candidates = batch.candidates.map((c) => {
      if (c.candidateId !== candidateId) return c;
      return {
        ...c,
        decision: "confirmed",
        targetDebtId,
        reviewResolution: { type: REVIEW_RESOLUTION_TYPES.addedHistoricalSnapshot, decidedAt: asOf, decidedBy: actorId },
        committedOutcome: { type: REVIEW_RESOLUTION_TYPES.addedHistoricalSnapshot, debtId: targetDebtId, at: asOf },
      };
    });
    await repository.saveImportBatch({ ...batch, candidates, updatedAt: asOf, updatedBy: actorId });
    return { balanceSnapshot: snapshot };
  };

  // Shared review truth (Part 9, 39, 40) - the one entry point a future
  // Review Center / Home count / Import screen should call, so open/
  // blocking/type counts are never recomputed independently per screen.
  // Workspace-scoped for free: repository.listImportBatches already filters
  // by workspaceId in both the InMemory and Firebase repositories.
  const getReviewSnapshot = async (workspaceId) => {
    await getWorkspaceContext(workspaceId);
    const batches = await (repository.listImportBatches?.(workspaceId) || []);
    return {
      openItems: sortOpenReviewItems(getOpenReviewItems(batches)),
      resolvedItems: getResolvedReviewItems(batches),
      openCount: getOpenReviewCount(batches),
      blockingCount: getBlockingReviewCount(batches),
      // REVIEW-1C: actionableCount excludes items the user already chose to
      // defer - the ONE source the nav badge and batch-review progress both
      // read from, so they can never disagree (Part 32).
      actionableCount: getActionableOpenCount(batches),
      deferredBlockingCount: getDeferredBlockingCount(batches),
      countsByType: getReviewCountsByType(batches),
    };
  };

  // ── REVIEW-1C: batch review orchestration ───────────────────────────────
  // saveReviewSession/skipAllOpenReviews never write anything themselves -
  // they only call the same named REVIEW-1A resolution primitives every
  // individual resolution already uses (Part 5/40), one item at a time, and
  // aggregate the real outcomes. A bad item can never roll back or corrupt
  // an unrelated item's successful resolution, because each call is its own
  // independent, already-atomic/idempotent operation.
  const REVIEW_SESSION_ACTIONS = {
    resolveAsExistingDebt: (workspaceId, batchId, candidateId, args) => resolveAsExistingDebt(workspaceId, batchId, candidateId, args),
    resolveAsNewDebt: (workspaceId, batchId, candidateId) => resolveAsNewDebt(workspaceId, batchId, candidateId),
    resolveBalance: (workspaceId, batchId, candidateId, args) => resolveBalance(workspaceId, batchId, candidateId, args),
    resolveApr: (workspaceId, batchId, candidateId, args) => resolveApr(workspaceId, batchId, candidateId, args),
    resolveMinimumPayment: (workspaceId, batchId, candidateId, args) => resolveMinimumPayment(workspaceId, batchId, candidateId, args),
    resolveDueDate: (workspaceId, batchId, candidateId, args) => resolveDueDate(workspaceId, batchId, candidateId, args),
    resolveOwner: (workspaceId, batchId, candidateId, args) => resolveOwner(workspaceId, batchId, candidateId, args),
    resolveBusinessScope: (workspaceId, batchId, candidateId, args) => resolveBusinessScope(workspaceId, batchId, candidateId, args),
    resolveDebtClassification: (workspaceId, batchId, candidateId, args) => resolveDebtClassification(workspaceId, batchId, candidateId, args),
    dismissDuplicate: (workspaceId, batchId, candidateId) => dismissDuplicate(workspaceId, batchId, candidateId),
    addHistoricalSnapshot: (workspaceId, batchId, candidateId, args) => addHistoricalSnapshot(workspaceId, batchId, candidateId, args),
  };
  // Only these two decide a Debt's identity and require the two-phase
  // resolve-then-commit primitive - everything else in the map above
  // completes the moment its own call returns.
  const MATCH_SESSION_ACTIONS = new Set(["resolveAsExistingDebt", "resolveAsNewDebt"]);

  // "Save What I Know" (Part 4/40). stagedAnswers is a flat list of
  // independent field-level intents - NOT grouped by review item - because
  // that already matches how each resolution service is independently
  // safe/complete (Part 17): a candidate with two open fields can have one
  // saved and the other left open without any special-casing here.
  const saveReviewSession = async (workspaceId, stagedAnswers = []) => {
    assertInteractive();
    const resolvedEntries = [];
    const failedEntries = [];
    const batchIdsNeedingCommit = new Set();
    // Tracks which match-action entries actually got their decision recorded
    // this round (runner call succeeded) - the final reconciliation loop
    // below must only re-classify THESE, never an entry whose own resolve
    // call already failed and was already pushed to failedEntries above, or
    // that one staged answer gets counted twice (Part 49's idempotency
    // guarantee extends to the save-session summary itself, not just the
    // underlying Firestore writes).
    const recordedMatchEntryKeys = new Set();

    // Sequential, not parallel (Part 52) - bounded, predictable Firestore
    // load regardless of how many items are staged, and it keeps failure
    // attribution simple (no interleaved partial writes to reason about).
    for (const entry of stagedAnswers) {
      const { importBatchId, importCandidateId, action, args } = entry;
      const runner = REVIEW_SESSION_ACTIONS[action];
      if (!runner) {
        failedEntries.push({ ...entry, message: "We don't know how to save that yet." });
        continue;
      }
      try {
        await runner(workspaceId, importBatchId, importCandidateId, args);
        if (MATCH_SESSION_ACTIONS.has(action)) {
          batchIdsNeedingCommit.add(importBatchId);
          recordedMatchEntryKeys.add(`${importBatchId}:${importCandidateId}:${action}`);
        } else resolvedEntries.push(entry);
      } catch (error) {
        failedEntries.push({ ...entry, message: getUserSafeTrackToZeroError(error).message });
      }
    }

    // Commit each affected batch exactly once (not once per candidate) -
    // commitImportBatch already resolves every "confirmed" candidate in
    // that batch and isolates failures per candidate internally.
    const staleCandidateIds = new Set();
    const commitFailureMessageByCandidateId = new Map();
    for (const batchId of batchIdsNeedingCommit) {
      try {
        await commitImportBatch(workspaceId, batchId);
      } catch (commitError) {
        for (const failure of commitError?.failures || []) {
          if (failure.code === "stale_review") staleCandidateIds.add(failure.candidateId);
          else commitFailureMessageByCandidateId.set(failure.candidateId, FRIENDLY_SAVE_FAILURE);
        }
      }
    }

    // Truth comes from re-reading the shared selector, not from trusting
    // individual promise resolutions - this is what actually persisted.
    const snapshot = await getReviewSnapshot(workspaceId);
    const openIds = new Set(snapshot.openItems.map((item) => item.id));
    const staleEntries = [];
    for (const entry of stagedAnswers) {
      if (!MATCH_SESSION_ACTIONS.has(entry.action)) continue;
      if (!recordedMatchEntryKeys.has(`${entry.importBatchId}:${entry.importCandidateId}:${entry.action}`)) continue;
      const itemId = `${entry.importBatchId}:${entry.importCandidateId}`;
      if (staleCandidateIds.has(entry.importCandidateId)) {
        staleEntries.push({ ...entry, message: FRIENDLY_STALE_MESSAGE });
      } else if (openIds.has(itemId)) {
        failedEntries.push({ ...entry, message: commitFailureMessageByCandidateId.get(entry.importCandidateId) || FRIENDLY_SAVE_FAILURE });
      } else {
        resolvedEntries.push(entry);
      }
    }

    return {
      resolved: resolvedEntries,
      failed: failedEntries,
      stale: staleEntries,
      resolvedCount: resolvedEntries.length,
      failedCount: failedEntries.length,
      staleCount: staleEntries.length,
      snapshot,
    };
  };

  // "Skip All For Now" (Part 9) - defers every currently open review one at
  // a time via the exact same deferReview primitive individual "Leave for
  // later" already uses. Zero authoritative mutation by construction:
  // deferReview never creates a Debt/BalanceSnapshot/PaymentEvent or
  // touches a PlanVersion (see resolveImportCandidateMatch's "unsure" path).
  const skipAllOpenReviews = async (workspaceId) => {
    assertInteractive();
    const before = await getReviewSnapshot(workspaceId);
    const deferredEntries = [];
    const failedEntries = [];
    for (const item of before.openItems) {
      try {
        await deferReview(workspaceId, item.importBatchId, item.importCandidateId);
        deferredEntries.push(item);
      } catch (error) {
        failedEntries.push({ item, message: getUserSafeTrackToZeroError(error).message });
      }
    }
    const snapshot = await getReviewSnapshot(workspaceId);
    return { deferredCount: deferredEntries.length, failedCount: failedEntries.length, failed: failedEntries, snapshot };
  };

  const previewScenario = async (workspaceId, { extraMonthlyPayment = 100 } = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const scenarioVersion = {
      ...snapshot.activeContext.version,
      extraMonthlyPayment: Number(snapshot.activeContext.version.extraMonthlyPayment || 0) + Number(extraMonthlyPayment || 0),
    };
    const scenarioProjection = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: scenarioVersion, startMonth: month, startYear: year }).projection;
    return calculateWhatIfComparison({ baselineRows: snapshot.projection, scenarioRows: scenarioProjection });
  };

  const previewReforecast = async (workspaceId, overrides = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.version) return null;
    const { month, year } = parseAsOf(asOf);
    const proposedVersion = {
      ...snapshot.activeContext.version,
      ...overrides,
      id: `${snapshot.activeContext.version.id}-preview`,
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      createdBecause: "reforecast",
    };
    const proposed = buildProjectionWithWarnings({ debts: snapshot.debts, planVersion: proposedVersion, startMonth: month, startYear: year });
    return {
      priorVersion: snapshot.activeContext.version,
      proposedVersion,
      oldProjectedZeroDate: snapshot.projectedZeroDate,
      proposedZeroDate: proposed.projection.at(-1)?.month || "",
      warnings: proposed.warnings,
      projection: proposed.projection,
    };
  };

  const applyReforecast = async (workspaceId, overrides = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot reforecast payoff plans.");
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    if (!snapshot.activeContext?.plan || !snapshot.activeContext?.version) throw new Error("No active plan to reforecast");
    // UX-4.1 fix: a reforecast is a fresh snapshot of the plan's basis, not
    // just its payment/strategy - re-derive startingDebtSnapshot from the
    // debts that are eligible RIGHT NOW (the same rule createDraftPlan uses),
    // so a debt added since the last activation/reforecast actually joins
    // the plan instead of silently staying excluded forever. Previously this
    // spread the OLD version's frozen snapshot forward unchanged, so "just
    // reforecast to include it" was a false promise - a newly added debt
    // never actually joined the payoff queue no matter how many times you
    // reforecasted.
    const included = snapshot.debts.filter((debt) => debt.includedInCorePayoffPlan !== false && debt.status === "active");
    const nextVersion = {
      ...snapshot.activeContext.version,
      startingDebtSnapshot: included.map(createStartingDebtSnapshotItem),
      ...overrides,
      id: id("version"),
      versionNumber: Number(snapshot.activeContext.version.versionNumber || 1) + 1,
      asOf,
      createdAt: asOf,
      createdBy: actorId,
      createdBecause: "reforecast",
    };
    const context = await repository.reforecastActivePlan({
      workspaceId,
      planId: snapshot.activeContext.plan.id,
      priorVersionId: snapshot.activeContext.version.id,
      nextVersion,
      actorId,
      appliedAt: asOf,
    });
    const debts = await repository.listDebts(workspaceId);
    const { month, year } = parseAsOf(asOf);
    for (const checkpoint of buildExpectedCheckpoints({ debts, planVersion: context.version, startMonth: month, startYear: year }).slice(0, 36)) {
      await repository.createExpectedCheckpoint(checkpoint);
    }
    return context;
  };

  // ── UX-4: Plan Hub preview helpers ────────────────────────────────────
  // Every preview below is read-only (Part 20/28) - none of them touch
  // Workspace.activePlanId, PayoffPlan.activeVersionId, write a
  // PlanVersion, mutate a Debt, or create a PaymentEvent/BalanceSnapshot.
  // They all funnel through this ONE internal helper so My Plan/Snowball/
  // Avalanche/What If/Finish By can never silently drift from each other
  // or from buildProjectionWithWarnings, the one trusted simulation
  // wrapper (Part 46/62 - no financial math in JSX). Not persisting
  // startingDebtSnapshot on planVersionLike is deliberate: with none given,
  // getEligiblePlanDebts/getIncludedDebts fall back to "active AND
  // includedInCorePayoffPlan" - exactly the live inclusion rule these
  // ad-hoc previews want, without fabricating a frozen snapshot no draft/
  // active plan actually owns.
  const buildPlanPreviewFromDebts = ({ debts, planVersionLike, startMonth, startYear, customTargetOrder = [], maxMonths }) => {
    const { projection, warnings } = buildProjectionWithWarnings({ debts, planVersion: planVersionLike, startMonth, startYear, customTargetOrder, ...(maxMonths ? { maxMonths } : {}) });
    const debtBalance = (debt) => Number(debt.currentBalance || 0);
    const eligibleForDisplay = getEligiblePlanDebts(debts, planVersionLike).filter((debt) => debtBalance(debt) > 0);
    const payoffOrder = planVersionLike.strategy === "custom"
      ? [...eligibleForDisplay].sort((a, b) => {
          const rankA = customTargetOrder.indexOf(a.id);
          const rankB = customTargetOrder.indexOf(b.id);
          const ra = rankA === -1 ? Infinity : rankA;
          const rb = rankB === -1 ? Infinity : rankB;
          return ra !== rb ? ra - rb : debtBalance(a) - debtBalance(b);
        })
      : sortDebtsForStrategy(eligibleForDisplay, planVersionLike.strategy);
    const startingTotalBalance = eligibleForDisplay.reduce((sum, debt) => sum + debtBalance(debt), 0);
    return {
      strategy: planVersionLike.strategy,
      extraMonthlyPayment: Number(planVersionLike.extraMonthlyPayment || 0),
      payoffOrder,
      startingTotalBalance,
      monthsToZero: projection.length,
      projectedZeroDate: projection.at(-1)?.month || "",
      estimatedInterest: projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0),
      warnings,
      projection,
    };
  };

  // Snowball vs Avalanche side-by-side (Part 15/16/18) - both previews run
  // against the SAME live debts/extra-payment baseline as the active plan
  // (or a $0-extra baseline when there's no active plan yet), so the
  // comparison is apples-to-apples and never independently recalculated by
  // the UI.
  const compareStrategies = async (workspaceId) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    const { month, year } = parseAsOf(asOf);
    const baseVersion = snapshot.activeContext?.version || null;
    const extraMonthlyPayment = Number(baseVersion?.extraMonthlyPayment || 0);
    const buildFor = (strategy) => buildPlanPreviewFromDebts({
      debts: snapshot.debts,
      planVersionLike: { strategy, extraMonthlyPayment },
      startMonth: month,
      startYear: year,
    });
    return {
      activeStrategy: baseVersion?.strategy || null,
      snowball: buildFor("snowball"),
      avalanche: buildFor("avalanche"),
    };
  };

  // What If - one-time lump sum (Part 25). A hypothetical payment is never
  // a PaymentEvent - it only ever reduces the SIMULATED starting balance of
  // the chosen debt for this one preview, never the live Debt record.
  const previewOneTimePayment = async (workspaceId, { amount = 0, targetDebtId = "" } = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    const { month, year } = parseAsOf(asOf);
    const lump = Math.max(0, Number(amount) || 0);
    const target = targetDebtId ? snapshot.debts.find((debt) => debt.id === targetDebtId) : snapshot.targetDebt;
    if (!lump || !target) return null;
    const baseVersion = snapshot.activeContext?.version || null;
    const strategy = baseVersion?.strategy || "avalanche";
    const extraMonthlyPayment = Number(baseVersion?.extraMonthlyPayment || 0);
    const adjustedDebts = snapshot.debts.map((debt) =>
      debt.id === target.id ? { ...debt, currentBalance: Math.max(0, Number(debt.currentBalance || 0) - lump) } : debt);
    const baseline = buildPlanPreviewFromDebts({ debts: snapshot.debts, planVersionLike: { strategy, extraMonthlyPayment }, startMonth: month, startYear: year });
    const withLumpSum = buildPlanPreviewFromDebts({ debts: adjustedDebts, planVersionLike: { strategy, extraMonthlyPayment }, startMonth: month, startYear: year });
    return { amount: lump, targetDebtId: target.id, targetDebtName: target.name, baseline, withLumpSum };
  };

  // What If - custom target debt (Part 26). Never presented as Snowball or
  // Avalanche - "custom" is a preview-only pseudo-strategy payoffEngine.js
  // understands (see orderPayoffTargets) but PLAN_STRATEGIES never accepts,
  // so it structurally can never be persisted as an activatable strategy.
  // extraMonthlyPayment is optional - when omitted this defaults to the
  // active plan's own extra (or 0 with none), exactly as before. When given
  // (e.g. What If's "Add money every month" mode scoped to one debt), the
  // preview honestly reflects a NEW hypothetical payment amount, not just a
  // reordering at the existing one - still zero-write, still never
  // presented as Snowball/Avalanche.
  const previewCustomTarget = async (workspaceId, { targetDebtId, extraMonthlyPayment: extraOverride } = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    const { month, year } = parseAsOf(asOf);
    const target = snapshot.debts.find((debt) => debt.id === targetDebtId);
    if (!target) return null;
    const baseVersion = snapshot.activeContext?.version || null;
    const extraMonthlyPayment = extraOverride != null ? Number(extraOverride) || 0 : Number(baseVersion?.extraMonthlyPayment || 0);
    const baseline = buildPlanPreviewFromDebts({ debts: snapshot.debts, planVersionLike: { strategy: baseVersion?.strategy || "avalanche", extraMonthlyPayment }, startMonth: month, startYear: year });
    const custom = buildPlanPreviewFromDebts({ debts: snapshot.debts, planVersionLike: { strategy: "custom", extraMonthlyPayment }, startMonth: month, startYear: year, customTargetOrder: [target.id] });
    return { targetDebtId: target.id, targetDebtName: target.name, baseline, custom };
  };

  const monthDiff = (fromMonthKey, toMonthKey) => {
    const [fromYear, fromMonth] = String(fromMonthKey).split("-").map(Number);
    const [toYear, toMonth] = String(toMonthKey).split("-").map(Number);
    if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) return NaN;
    return (toYear - fromYear) * 12 + (toMonth - fromMonth);
  };

  // Finish By (Part 29-31). Binary-searches the smallest additional
  // monthly extra that reaches $0 by targetMonth, reusing the exact same
  // buildProjectionWithWarnings/payoffSimulate primitives every other
  // preview uses - a new SEARCH on top of the trusted engine, not new
  // payoff math (Part 32/46). Never shames an infeasible target: reports
  // the nearest feasible date at the current payment level instead.
  const previewGoalDate = async (workspaceId, { targetMonth, targetDebtId = "" } = {}) => {
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    const { month, year } = parseAsOf(asOf);
    const baseVersion = snapshot.activeContext?.version || null;
    const strategy = baseVersion?.strategy || "avalanche";
    const currentExtra = Number(baseVersion?.extraMonthlyPayment || 0);
    const scopedDebts = targetDebtId ? snapshot.debts.filter((debt) => debt.id === targetDebtId) : snapshot.debts;
    const targetLabel = targetDebtId ? (scopedDebts[0]?.name || "That debt") : "Your included debts";
    if (targetDebtId && !scopedDebts.length) {
      return { valid: false, reason: "That debt could not be found in this workspace.", targetMonth, targetLabel };
    }
    const monthsAvailable = monthDiff(monthKeyFromDate(asOf), targetMonth);
    if (!Number.isFinite(monthsAvailable) || monthsAvailable <= 0) {
      return { valid: false, reason: "Choose a target date in the future.", targetMonth, targetLabel };
    }
    const searchCapMonths = Math.min(monthsAvailable, 240);
    // payoffSimulate pushes one row per simulated month regardless of
    // whether the debt actually reached $0 - it only stops early once every
    // account is paid off, otherwise it runs out the clock at maxMonths. So
    // a preview capped at searchCapMonths always reports
    // monthsToZero === searchCapMonths when the target ISN'T reached, which
    // would otherwise look identical to "reached zero exactly on time."
    // Disambiguate by checking whether the last simulated month's remaining
    // balance is actually ~0; only then is monthsToZero real, else Infinity
    // (never reached within the window) so callers can't mistake a
    // truncated simulation for a feasible payoff.
    const monthsToZeroAt = (extra) => {
      const preview = buildPlanPreviewFromDebts({
        debts: scopedDebts,
        planVersionLike: { strategy, extraMonthlyPayment: extra },
        startMonth: month,
        startYear: year,
        maxMonths: searchCapMonths,
      });
      if (!preview.projection.length) return 0;
      const reachedZero = Number(preview.projection.at(-1)?.remaining_debt || 0) <= 0.01;
      return reachedZero ? preview.monthsToZero : Infinity;
    };
    const projectedZeroDateAt = (extra) => buildPlanPreviewFromDebts({
      debts: scopedDebts,
      planVersionLike: { strategy, extraMonthlyPayment: extra },
      startMonth: month,
      startYear: year,
    }).projectedZeroDate;

    const baselineMonths = monthsToZeroAt(currentExtra);
    if (baselineMonths <= monthsAvailable) {
      return {
        valid: true, feasible: true, targetMonth, targetLabel,
        currentMonthlyExtra: currentExtra, requiredMonthlyExtra: currentExtra, additionalNeeded: 0,
        projectedZeroDate: projectedZeroDateAt(currentExtra),
      };
    }

    let lo = currentExtra;
    let hi = Math.max(currentExtra, 100);
    let hiMonths = monthsToZeroAt(hi);
    let guard = 0;
    while (hiMonths > monthsAvailable && guard < 40 && hi < 5_000_000) {
      hi *= 2;
      hiMonths = monthsToZeroAt(hi);
      guard += 1;
    }
    if (hiMonths > monthsAvailable) {
      return {
        valid: true, feasible: false, targetMonth, targetLabel,
        currentMonthlyExtra: currentExtra,
        nearestFeasibleZeroDate: projectedZeroDateAt(currentExtra),
        reason: "That date isn't projected to be achievable with a reasonable payment increase.",
      };
    }
    for (let iteration = 0; iteration < 30 && hi - lo > 1; iteration++) {
      const mid = Math.round((lo + hi) / 2);
      const midMonths = monthsToZeroAt(mid);
      if (midMonths <= monthsAvailable) hi = mid; else lo = mid;
    }
    return {
      valid: true, feasible: true, targetMonth, targetLabel,
      currentMonthlyExtra: currentExtra, requiredMonthlyExtra: hi,
      additionalNeeded: Math.max(0, hi - currentExtra),
      projectedZeroDate: projectedZeroDateAt(hi),
    };
  };

  // UX-4 Part 39: a lightweight, consumer-facing Plan History - NOT the
  // full UX-7 milestone/retention/celebration engine (explicitly deferred).
  // Just the immutable PlanVersion record already created by
  // createDraftPlan/applyReforecast/applyScenario, newest first, so a user
  // can see that N was preserved when N+1 was activated.
  const listPlanHistory = async (workspaceId) => {
    await getWorkspaceContext(workspaceId);
    const activeContext = await getActivePlanContext(workspaceId);
    if (!activeContext?.plan) return [];
    const versions = await repository.listPlanVersions(workspaceId, activeContext.plan.id);
    return [...versions].sort((a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0));
  };

  // ── UX-4: Saved Scenarios ─────────────────────────────────────────────
  // A SavedScenario never enters the Workspace.activePlanId ->
  // PayoffPlan.activeVersionId -> PlanVersion pointer chain on its own
  // (Part 5/39) - only applyScenario, via the exact same applyReforecast
  // primitive any other reforecast already uses, can promote it, and only
  // on the user's explicit confirmation.
  const listWorkspaceScenarios = async (workspaceId) => {
    await getWorkspaceContext(workspaceId);
    const scenarios = await repository.listScenarios?.(workspaceId) || [];
    return scenarios.filter((scenario) => scenario.status !== "archived");
  };

  const saveScenario = async (workspaceId, { name, type, inputs = {} } = {}) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot save payoff scenarios.");
    if (!SCENARIO_TYPES.includes(type)) throw new Error("Unsupported scenario type.");
    const trimmedName = String(name || "").trim();
    if (!trimmedName) throw new Error("A name is required to save a scenario.");
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    return repository.saveScenario({
      id: id("scenario"),
      workspaceId,
      name: trimmedName,
      type,
      status: "active",
      basePlanId: snapshot.activeContext?.plan?.id || "",
      basePlanVersionId: snapshot.activeContext?.version?.id || "",
      inputs,
      createdAt: asOf,
      createdBy: actorId,
    });
  };

  const archiveScenario = async (workspaceId, scenarioId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot delete payoff scenarios.");
    const existing = await repository.getScenario(workspaceId, scenarioId);
    if (!existing) throw new Error("Scenario not found in this workspace.");
    return repository.saveScenario({ ...existing, status: "archived", updatedAt: asOf, updatedBy: actorId });
  };

  // Recomputes the scenario's preview fresh every time (Part 34 - cheap to
  // recompute, never trust a persisted-and-possibly-stale projection) and
  // reports whether the workspace's active PlanVersion has moved on since
  // the scenario was saved (Part 37) - never silently presents an old
  // scenario's numbers as if they reflected current reality.
  const getScenarioPreview = async (workspaceId, scenarioId) => {
    await getWorkspaceContext(workspaceId);
    const scenario = await repository.getScenario(workspaceId, scenarioId);
    if (!scenario) throw new Error("Scenario not found in this workspace.");
    const snapshot = await getWorkspaceSnapshot(workspaceId);
    const currentVersionId = snapshot.activeContext?.version?.id || "";
    const isStale = !!scenario.basePlanVersionId && scenario.basePlanVersionId !== currentVersionId;
    let preview = null;
    if (scenario.type === "recurring_extra") preview = await previewReforecast(workspaceId, { extraMonthlyPayment: Number(scenario.inputs.extraMonthlyPayment || 0) });
    else if (scenario.type === "one_time") preview = await previewOneTimePayment(workspaceId, scenario.inputs);
    else if (scenario.type === "custom_target") preview = await previewCustomTarget(workspaceId, scenario.inputs);
    else if (scenario.type === "goal_date") preview = await previewGoalDate(workspaceId, scenario.inputs);
    else if (scenario.type === "strategy_comparison") preview = await compareStrategies(workspaceId);
    return { scenario, isStale, preview };
  };

  // Applying is always an explicit, separate action from saving/previewing
  // (Part 21/38) and only ever mutates the active plan through the
  // existing applyReforecast primitive - reforecastActivePlan's own
  // priorVersionId check (fetched fresh here, not from scenario-save time)
  // already refuses to apply over a plan that has since moved on
  // (Part 42/66), so no separate staleness gate is needed at write time.
  // one_time/custom_target scenarios are preview-only by design (Part 17 -
  // "custom" is never a valid PLAN_STRATEGIES value, and a lump sum is
  // never a PaymentEvent just because it was previewed) and are refused
  // here with a clear, honest reason rather than silently doing nothing.
  const applyScenario = async (workspaceId, scenarioId) => {
    assertInteractive();
    const { membership } = await getWorkspaceContext(workspaceId);
    if (!hasPermission(membership, "managePlans")) throw new Error("Your role cannot apply payoff scenarios.");
    const scenario = await repository.getScenario(workspaceId, scenarioId);
    if (!scenario) throw new Error("Scenario not found in this workspace.");
    if (scenario.type === "recurring_extra") {
      return applyReforecast(workspaceId, { extraMonthlyPayment: Number(scenario.inputs.extraMonthlyPayment || 0) });
    }
    if (scenario.type === "strategy_comparison") {
      if (!scenario.inputs.strategy) throw new Error("This scenario doesn't specify which strategy to apply.");
      return applyReforecast(workspaceId, { strategy: scenario.inputs.strategy });
    }
    if (scenario.type === "goal_date") {
      const fresh = await previewGoalDate(workspaceId, scenario.inputs);
      if (!fresh?.feasible) throw new Error("This date is no longer projected to be achievable - open it again to see current options.");
      return applyReforecast(workspaceId, { extraMonthlyPayment: fresh.requiredMonthlyExtra });
    }
    throw new Error("This kind of scenario is a preview only and can't be applied directly - it doesn't change your active plan.");
  };

  return {
    mode,
    actorId,
    getWorkspaces,
    getUserWorkspaces,
    bootstrapOwnerWorkspace,
    createMemberInvite,
    listMemberInvites,
    getJoinInvitePreview,
    acceptMemberInvite,
    cancelMemberInvite,
    getWorkspaceContext,
    getWorkspaceSnapshot,
    getActivePlanContext,
    renameWorkspace,
    connectWorkspacePersonToMember,
    createNewDebt,
    updateDebt,
    recordPayment,
    recordBalanceSnapshot,
    createImportBatch,
    // Read-only resume support (UX-5 Part 51): lets the UI reload an
    // already-created, still-open ImportBatch (e.g. after navigating away
    // mid-review) without re-deriving it from getReviewSnapshot's flattened
    // items. Never mutates anything. Workspace membership is verified the
    // same way every other read here is (Part 59 - no forged workspaceId
    // can read another workspace's batch).
    getImportBatch: async (workspaceId, batchId) => {
      await getWorkspaceContext(workspaceId);
      return repository.getImportBatch(workspaceId, batchId);
    },
    decideImportCandidate,
    resolveImportCandidateMatch,
    commitImportBatch,
    resolveAsExistingDebt,
    resolveAsNewDebt,
    deferReview,
    resolveMissingInformation,
    resolveBalance,
    resolveApr,
    resolveMinimumPayment,
    resolveDueDate,
    resolveOwner,
    listWorkspacePersons,
    createImportedPerson,
    confirmAlias,
    mergeWorkspacePersons,
    resolveBusinessScope,
    resolveDebtClassification,
    dismissDuplicate,
    addHistoricalSnapshot,
    getReviewSnapshot,
    saveReviewSession,
    skipAllOpenReviews,
    previewDraftPlan,
    createDraftPlan,
    activatePlan,
    previewScenario,
    previewReforecast,
    applyReforecast,
    compareStrategies,
    previewOneTimePayment,
    previewCustomTarget,
    previewGoalDate,
    listPlanHistory,
    listWorkspaceScenarios,
    saveScenario,
    archiveScenario,
    getScenarioPreview,
    applyScenario,
    getCurrentPeriod: () => monthKeyFromDate(asOf),
  };
};
