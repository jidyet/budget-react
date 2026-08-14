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
