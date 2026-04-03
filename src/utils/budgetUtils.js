export const CURRENCY_OPTIONS = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "EUR" },
  { code: "GBP", label: "British Pound", symbol: "GBP" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CAD" },
  { code: "AUD", label: "Australian Dollar", symbol: "AUD" },
  { code: "NGN", label: "Nigerian Naira", symbol: "NGN" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KES" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "GHS" },
  { code: "ZAR", label: "South African Rand", symbol: "ZAR" },
  { code: "INR", label: "Indian Rupee", symbol: "INR" },
];

let activeCurrencyCode = "USD";

export const normalizeCurrencyCode = (value) => {
  const nextCode = String(value || "").trim().toUpperCase();
  return CURRENCY_OPTIONS.some((option) => option.code === nextCode) ? nextCode : "USD";
};

export const setActiveCurrencyCode = (value) => {
  activeCurrencyCode = normalizeCurrencyCode(value);
  return activeCurrencyCode;
};

export const getActiveCurrencyCode = () => activeCurrencyCode;

export const getCurrencyLabel = (code) =>
  CURRENCY_OPTIONS.find((option) => option.code === normalizeCurrencyCode(code))?.label || "US Dollar";

export const getCurrencySymbol = (code = activeCurrencyCode) =>
  CURRENCY_OPTIONS.find((option) => option.code === normalizeCurrencyCode(code))?.symbol || normalizeCurrencyCode(code);

export const moneyFieldLabel = (label, currencyCode = activeCurrencyCode) =>
  `${label} (${getCurrencySymbol(currencyCode)})`;

export const fx = (v, currencyCode = activeCurrencyCode) => {
  if (v == null) return "-";
  const safeCurrencyCode = normalizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(v) || 0);
  } catch {
    return `${safeCurrencyCode} ${Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
};

export const fx0 = (v, currencyCode = activeCurrencyCode) => {
  if (v == null) return "-";
  const safeCurrencyCode = normalizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(v) || 0);
  } catch {
    return `${safeCurrencyCode} ${Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
};

export const pct = (v) => (v ? `${(v * 100).toFixed(2)}%` : null);

export const TODAY = new Date();

export const daysLeft = (dueDay, month, year) => {
  if (!dueDay) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  const d = Math.min(dueDay, daysInMonth);
  const target = new Date(year, month - 1, d);
  if (isNaN(target.getTime())) return null;
  if (
    target < TODAY &&
    year === TODAY.getFullYear() &&
    month === TODAY.getMonth() + 1
  ) {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const nd = Math.min(dueDay, new Date(ny, nm, 0).getDate());
    const next = new Date(ny, nm - 1, nd);
    if (isNaN(next.getTime())) return null;
    return Math.round((next - TODAY) / (1000 * 60 * 60 * 24));
  }
  const result = Math.round((target - TODAY) / (1000 * 60 * 60 * 24));
  return isNaN(result) ? null : result;
};

export function accountViewModel(a) {
  const org = String(a.bank || a.name || "Account").trim();
  const typeMatch = String(a.name || "").match(/\(([^)]+)\)/);
  const type = (typeMatch?.[1] || a.category || "Account").replace(/\s+/g, " ").trim();
  const owner = String(a.owner || "").trim();
  const title = org;
  const subtitle = owner ? `${type} - ${owner}` : type;
  const compact = `${org} (${type})${owner ? ` (${owner})` : ""}`;
  return { org, type, owner, title, subtitle, compact };
}

// --- Constants ---
export const AUTH_TIMEOUT_MS = 4500;

/**
 * Storage precedence rule (Phase 2d):
 * - Local users  (user.isLocal || isLocalUser) → localStorage exclusively
 * - Cloud users  (signed-in Firebase uid)      → Firestore exclusively
 *
 * There is no dual-write or conflict-merge path. If a user switches from
 * local → cloud, localStorage data is left as-is and not migrated automatically.
 * Migration must be triggered explicitly via the "Migrate legacy accounts" action
 * (migrateLegacyAccounts). Firestore always takes precedence for cloud users;
 * localStorage is never read when a cloud uid is active.
 */
export const STORAGE_PRECEDENCE = /** @type {const} */ ({ LOCAL: "localStorage", CLOUD: "firestore" });

/** Income sources injected automatically — excluded from user-facing income lists.
 *  New entries use "_boa" / "_eagleview" prefix. Old stored entries ("BOA"/"EAGLEVIEW")
 *  are also treated as system sources for backward compatibility. */
export const SYSTEM_INCOME_SOURCES = ["_boa", "_eagleview"];

/** Returns true for any system-managed income source (current prefix OR legacy name). */
export const isSystemIncomeSource = (src) =>
  typeof src === "string" && (src.startsWith("_") || ["BOA", "EAGLEVIEW"].includes(src.toUpperCase()));

// --- Financial helpers ---

export const normalizeAprDecimal = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
};

export const getBalanceBase = (account) =>
  Number(
    account?.base_bal_v ??
    (Number(account?.cur_bal || 0) + Number(account?.paid_v || 0) - Number(account?.purch_v || 0))
  );

export const normalizeIncomeEntries = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => ({ src: String(x?.src || "").trim(), amt: Number(x?.amt || 0) }))
    .filter((x) => x.src.length > 0);
};

export const normalizeMonthInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const month = Number(match[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}`;
};

export const defaultRecord = (a) => {
  if (a == null) {
    return { paid_v: 0, planned_v: 0, min_due_v: 0, base_bal_v: 0, cur_bal: 0, is_paid: false, purch_v: 0, apr_v: 0 };
  }
  return {
    paid_v: 0,
    planned_v: 0,
    min_due_v: a.budgeted_min,
    base_bal_v: a.starting_bal,
    cur_bal: a.starting_bal,
    is_paid: false,
    purch_v: 0,
    apr_v: a.apr,
  };
};

// --- Month key helpers ---
/** "YYYY-MM" formatter — mirrors firebase.js getMonthKey (no Firebase dep here) */
export const toMonthKey = (month, year) => `${year}-${String(month).padStart(2, "0")}`;

export const compareMonthKeys = (a, b) => {
  if (!a || !b) return 0;
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return ay !== by ? ay - by : am - bm;
};

// --- Calendar / pay-period helpers ---
export const getObservedHolidayDate = (year, monthIndex, day) => {
  const date = new Date(year, monthIndex, day);
  const wd = date.getDay();
  if (wd === 6) date.setDate(day - 1);
  if (wd === 0) date.setDate(day + 1);
  return date;
};

export const getNthWeekdayOfMonth = (year, monthIndex, weekday, nth) => {
  const date = new Date(year, monthIndex, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return date;
};

export const getLastWeekdayOfMonth = (year, monthIndex, weekday) => {
  const date = new Date(year, monthIndex + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
};

export const getBankHolidays = (year) => [
  { name: "New Year's Day",        date: getObservedHolidayDate(year, 0, 1) },
  { name: "Martin Luther King Jr. Day", date: getNthWeekdayOfMonth(year, 0, 1, 3) },
  { name: "Presidents Day",        date: getNthWeekdayOfMonth(year, 1, 1, 3) },
  { name: "Memorial Day",          date: getLastWeekdayOfMonth(year, 4, 1) },
  { name: "Juneteenth",            date: getObservedHolidayDate(year, 5, 19) },
  { name: "Independence Day",      date: getObservedHolidayDate(year, 6, 4) },
  { name: "Labor Day",             date: getNthWeekdayOfMonth(year, 8, 1, 1) },
  { name: "Columbus Day",          date: getNthWeekdayOfMonth(year, 9, 1, 2) },
  { name: "Veterans Day",          date: getObservedHolidayDate(year, 10, 11) },
  { name: "Thanksgiving Day",      date: getNthWeekdayOfMonth(year, 10, 4, 4) },
  { name: "Christmas Day",         date: getObservedHolidayDate(year, 11, 25) },
].map((h) => ({ ...h, key: h.date.toISOString().slice(0, 10) }))
 .sort((a, b) => a.date - b.date);

export const getFridaysInMonth = (month, year) => {
  const fridays = [];
  const cursor = new Date(year, month - 1, 1);
  while (cursor.getMonth() === month - 1) {
    if (cursor.getDay() === 5) fridays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return fridays;
};

export const getFirstFridayOfYear = (year) => {
  const date = new Date(year, 0, 1);
  while (date.getDay() !== 5) date.setDate(date.getDate() + 1);
  return date;
};

export const getStartOfWeek = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
};

export const getPayWeekHolidayCount = (payDate, holidays) => {
  const weekStart = new Date(payDate);
  weekStart.setDate(payDate.getDate() - 4);
  return holidays.filter((h) => h.date >= weekStart && h.date <= payDate).length;
};

// --- APR / promo helpers ---
/** Full promo APR metadata for an account in a given month/year. */
export const getPromoMeta = (account, month, year) => {
  const mk = (m, y) => `${y}-${String(m).padStart(2, "0")}`;
  const manualApr    = account?.apr_v;
  const baseApr      = normalizeAprDecimal(account?.apr ?? 0);
  const promoApr     = normalizeAprDecimal(account?.promo_apr ?? 0);
  const aprAfterPromo = normalizeAprDecimal(account?.apr_after_promo ?? account?.apr ?? 0);
  const promoUntil   = normalizeMonthInput(account?.promo_until);
  const promoActive  = !!promoUntil && compareMonthKeys(mk(month, year), promoUntil) <= 0;
  if (manualApr !== undefined && manualApr !== null && manualApr !== "") {
    return { effectiveApr: normalizeAprDecimal(manualApr), baseApr, promoApr, aprAfterPromo, promoUntil, promoActive, usingManualApr: true };
  }
  return {
    effectiveApr: promoUntil ? (promoActive ? promoApr : aprAfterPromo) : baseApr,
    baseApr, promoApr, aprAfterPromo, promoUntil, promoActive, usingManualApr: false,
  };
};

export const getEffectiveApr = (account, month, year) =>
  getPromoMeta(account, month, year).effectiveApr;

export const getComputedBalance = (account) =>
  Math.max(0, getBalanceBase(account) - Number(account?.paid_v || 0) + Number(account?.purch_v || 0));

/** Status badge descriptor for a bill. Requires selMonth/selYear from render context. */
export const getBadge = (a, selMonth, selYear) => {
  if (a.is_paid)                            return { type: "paid",    label: "Paid",       cls: "" };
  if (a.d_left != null && a.d_left < 0)     return { type: "overdue", label: `Overdue by ${Math.abs(a.d_left)}d`, cls: "bill-overdue" };
  if (a.d_left != null && a.d_left === 0)   return { type: "today",   label: "Due TODAY",  cls: "bill-today" };
  if (a.d_left != null && a.d_left === 1)   return { type: "soon",    label: "Due Tomorrow", cls: "" };
  if (a.d_left != null && a.d_left <= 3)    return { type: "soon",    label: `Due in ${a.d_left} days`, cls: "" };
  if (a.d_left != null && a.d_left <= 7)    return { type: "soon",    label: `${a.d_left} days left`, cls: "" };
  if (a.d_left != null) {
    const daysInMonth = new Date(selYear, selMonth, 0).getDate();
    const displayDay = Math.min(Number(a.due_day) || 1, daysInMonth);
    return { type: "normal", label: `Due ${displayDay < 10 ? "0" + displayDay : displayDay}/${String(selMonth).padStart(2, "0")}`, cls: "" };
  }
  return { type: "normal", label: "No due date", cls: "" };
};
