export const WORKSPACE_TYPES = Object.freeze(["personal", "household"]);
export const WORKSPACE_STATUSES = Object.freeze(["active", "archived"]);
export const MEMBER_ROLES = Object.freeze(["owner", "admin", "contributor", "viewer"]);
export const DEBT_STATUSES = Object.freeze(["active", "paid_off", "archived"]);
export const APR_STATUSES = Object.freeze(["known", "unknown", "no_interest", "promotional"]);
export const PLAN_STATUSES = Object.freeze(["draft", "active", "completed", "archived"]);
export const PLAN_STRATEGIES = Object.freeze(["snowball", "avalanche"]);
export const VERSION_REASONS = Object.freeze(["activation", "reforecast", "strategy_change", "debt_added", "balance_correction"]);
export const EVENT_SOURCES = Object.freeze(["manual", "import", "future_bank_sync"]);
export const MIGRATION_STATES = Object.freeze(["legacy", "eligible", "migration_preview", "migrated", "rollback_allowed", "v2_native"]);
export const IMPORT_BATCH_STATUSES = Object.freeze(["uploaded", "parsing", "review_required", "approved", "committing", "committed", "failed", "cancelled"]);
export const IMPORT_CANDIDATE_DECISIONS = Object.freeze(["pending_review", "confirmed", "excluded", "duplicate", "needs_information"]);
// "member": owned by one verified workspace member (Debt.ownerId is that member's uid).
// "person": owned by a Workspace-scoped financial identity (DATA-HH1
//   WorkspacePerson) who may not have a TrackToZero account at all
//   (Debt.ownerId is that person's id). Deliberately distinct from "member" -
//   a person is financial-data evidence, never proof of an authenticated
//   account, WorkspaceMembership, or permission to access the workspace.
// "joint": owned by the household as a whole - no single member (Debt.ownerId is empty).
// "unassigned": ownership not yet decided - never a default that implies false certainty.
export const OWNER_TYPES = Object.freeze(["member", "person", "joint", "unassigned"]);
// Provenance for a WorkspacePerson (DATA-HH1) - never mixed with Auth/
// WorkspaceMembership status. "authenticated_member" is never persisted as
// its own WorkspacePerson document (an active WorkspaceMembership already
// IS that identity); it exists only as a classification value returned by
// the matching engine and owner-display resolution.
export const PERSON_KINDS = Object.freeze(["imported_person", "authenticated_member"]);
export const PERSON_STATUSES = Object.freeze(["active", "merged"]);
// "confirmed": currentBalance reflects a real observation (manual entry, a
// recorded BalanceSnapshot, or a successfully-parsed import) - a value of 0
// here is a genuine claim that the debt is paid off.
// "unresolved": the balance could not be confidently captured (e.g. a failed
// or partial import) - a value of 0 here means "unknown", NOT "paid off",
// and must never be presented or calculated as if it were confirmed.
export const BALANCE_STATUSES = Object.freeze(["confirmed", "unresolved"]);
// UX-4: a SavedScenario is a persisted, non-authoritative "what if" a user
// chose to keep - it never controls execution on its own (see
// resolveActivePlanContextAsync's pointer chain, which a scenario is never
// part of). "custom_target" previews a specific debt prioritized first
// without pretending it's Snowball/Avalanche (payoffEngine.js's "custom"
// pseudo-strategy is preview-only and is never a PLAN_STRATEGIES value).
export const SCENARIO_TYPES = Object.freeze(["recurring_extra", "one_time", "custom_target", "goal_date", "strategy_comparison"]);
export const SCENARIO_STATUSES = Object.freeze(["active", "archived"]);

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze({
    view: true,
    manageMembers: true,
    manageDebts: true,
    recordObservations: true,
    managePlans: true,
    destructiveWorkspaceActions: true,
  }),
  admin: Object.freeze({
    view: true,
    manageMembers: true,
    manageDebts: true,
    recordObservations: true,
    managePlans: true,
    destructiveWorkspaceActions: false,
  }),
  contributor: Object.freeze({
    view: true,
    manageMembers: false,
    manageDebts: false,
    recordObservations: true,
    managePlans: false,
    destructiveWorkspaceActions: false,
  }),
  viewer: Object.freeze({
    view: true,
    manageMembers: false,
    manageDebts: false,
    recordObservations: false,
    managePlans: false,
    destructiveWorkspaceActions: false,
  }),
});
