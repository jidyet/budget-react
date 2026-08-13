export const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

export const requireEnum = (value, allowed, field) => {
  if (!allowed.includes(value)) throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  return value;
};

export const requireString = (value, field) => {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
};

export const optionalString = (value) => String(value || "").trim();

export const requireMoney = (value, field, { allowZero = true } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${field} must be a finite number`);
  if (numeric < 0 || (!allowZero && numeric === 0)) throw new Error(`${field} must be ${allowZero ? "non-negative" : "positive"}`);
  return numeric;
};

export const optionalMoney = (value, field) => {
  if (value === undefined || value === null || value === "") return null;
  return requireMoney(value, field);
};

export const requireTimestamp = (value, field) => {
  const text = typeof value === "string" ? value : value instanceof Date ? value.toISOString() : "";
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp`);
  return text;
};

export const optionalTimestamp = (value) => {
  if (!value) return null;
  return requireTimestamp(value, "timestamp");
};

export const normalizeAprDecimal = (value, field = "apr") => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${field} must be non-negative`);
  return numeric > 1 ? numeric / 100 : numeric;
};

export const deepFreezeClone = (value) => Object.freeze(structuredClone(value));

