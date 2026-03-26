/**
 * Centralized app models and shared enums for the budget app.
 */

/** @typedef {'solo' | 'household'} WorkspaceMode */
/** @typedef {'owner' | 'admin' | 'member' | 'viewer'} HouseholdRole */
/** @typedef {'overview' | 'bills' | 'payoff' | 'insights' | 'upload' | 'history' | 'settings'} AppPage */

/**
 * @typedef {Object} BudgetUser
 * @property {string} uid
 * @property {string=} email
 * @property {boolean=} isLocal
 */

/**
 * @typedef {Object} HouseholdProfile
 * @property {Object|null} activeHousehold
 * @property {Array<Object>} memberships
 */

/**
 * @typedef {Object} AccountModel
 * @property {string|number} id
 * @property {string} name
 * @property {string=} owner
 * @property {string=} bank
 * @property {string=} category
 */

/**
 * @typedef {Object} PaymentRecord
 * @property {number} paid_v
 * @property {number} min_due_v
 * @property {number} cur_bal
 * @property {boolean} is_paid
 */

/**
 * @typedef {Object} IncomeEntry
 * @property {string} src
 * @property {number} amt
 */

/**
 * @typedef {Object} PayoffPlanModel
 * @property {string} id
 * @property {string} name
 * @property {string} owner
 * @property {'avalanche'|'snowball'|'custom'} strategy
 * @property {number} monthly_extra
 * @property {Array<Object>} items
 */

export const WORKSPACE_MODES = Object.freeze({
  SOLO: 'solo',
  HOUSEHOLD: 'household',
});

export const HOUSEHOLD_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
});

export const APP_PAGES = Object.freeze({
  OVERVIEW: 'overview',
  ACCOUNTS: 'bills',
  PAYOFF: 'payoff',
  INSIGHTS: 'insights',
  UPLOAD: 'upload',
  HISTORY: 'history',
  SETTINGS: 'settings',
});
